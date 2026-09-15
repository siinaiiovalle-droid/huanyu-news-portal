/**
 * 内容采集脚本 —— npm run collect
 * 用途：从 RSS / Atom 源（合作媒体、行业站、自有站点内容池）抓取稿件入库，
 *      实现"每天更新"的最低成本起步方案；正式运营建议改为编辑部手动编排 + 采编系统对接。
 *
 * 源配置：data/sources.json
 *   [
 *     { "name": "人民网·财经", "channel": "finance", "url": "https://...", "enabled": true,
 *       "status": "published", "limit": 5, "tags": ["财经"] }
 *   ]
 * 说明：
 *   - status 为 draft 时入库为草稿，需在后台人工审核后发布；为 published 时直接可见；
 *   - 默认按标题去重，重复稿件不会二次入库；
 *   - 每个源单日最多入库 limit 条（默认 5），避免一次灌入上百条冲淡首页；
 *   - 不使用 RSS 里的外链封面（易失效、且与正文未必相关），封面与正文配图位统一
 *     留空，由 npm run fetch:images 下载"高清 + 内容相关 + 不重复"的本地图补齐。
 *
 * 参数：
 *   --limit=3        覆盖所有源的单源条数上限
 *   --draft          本次入库全部为草稿
 *   --publish        本次入库全部直接发布
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../server/lib/store');
const svc = require('../server/lib/news-service');
const portal = require('../server/lib/portal');
const { keywordsFromTitle } = require('./lib/keywords');

const SOURCES_FILE = path.join(DATA_DIR, 'sources.json');

const DEFAULT_SOURCES = [
  {
    name: '示例科技源（演示用，默认关闭）',
    channel: 'tech',
    url: 'https://www.example.com/feed.xml',
    enabled: false,
    status: 'draft',
    limit: 5,
    tags: []
  }
];

function loadSources() {
  if (!fs.existsSync(SOURCES_FILE)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SOURCES_FILE, JSON.stringify(DEFAULT_SOURCES, null, 2), 'utf8');
    return DEFAULT_SOURCES;
  }
  try {
    return JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf8'));
  } catch {
    console.error('sources.json 解析失败，已忽略');
    return [];
  }
}

function decodeEntities(s = '') {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function stripHtml(s = '') {
  return decodeEntities(String(s).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

function pick(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = re.exec(block);
  return m ? decodeEntities(m[1]).trim() : '';
}

function pickImg(block) {
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(block) || /<enclosure[^>]+url=["']([^"']+)["']/i.exec(block);
  return m ? m[1] : '';
}

/**
 * 采信发布时间：只认最近 2 天内的日期。
 * 很多 RSS 源返回的是存档条目（甚至 2008 年的旧稿），若照搬会把新采稿件沉到列表底部，
 * 前端就看不到"今天更新"了 —— 因此过期日期一律按入库时间发布。
 */
function pickPublishedAt(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return new Date().toISOString();
  const ageDays = (Date.now() - t) / 86400000;
  return (ageDays >= -0.5 && ageDays <= 2) ? new Date(t).toISOString() : new Date().toISOString();
}

/** 摘要按句切段，过滤过短碎片 */
function splitParagraphs(text) {
  return String(text)
    .split(/[。！？!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 15)
    .slice(0, 8)
    .map((s) => (s.endsWith('。') ? s : `${s}。`));
}

/** 解析 RSS 2.0 / Atom，返回统一条目 */
function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  blocks.forEach((block) => {
    const title = stripHtml(pick(block, 'title'));
    if (!title || title.length < 6) return;
    const link = pick(block, 'link') || (/<link[^>]+href=["']([^"']+)["']/i.exec(block) || [])[1] || '';
    const desc = stripHtml(pick(block, 'description') || pick(block, 'summary') || pick(block, 'content'));
    const date = pick(block, 'pubDate') || pick(block, 'published') || pick(block, 'updated');
    items.push({
      title,
      link,
      summary: desc.slice(0, 110),
      paragraphs: splitParagraphs(desc),
      cover: pickImg(block),
      publishedAt: date ? new Date(date).toISOString() : new Date().toISOString()
    });
  });
  return items;
}

async function fetchSource(source) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(source.url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'HuanYuNewsBot/1.0 (+content-sync)' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return parseFeed(xml);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 组装正文：导语 → 正文配图位 → 剩余段落 → 原文出处
 * 配图位 src 留空，由 fetch-images 按标题内容补齐高清本地图。
 */
function buildContent(item) {
  const paras = item.paragraphs.length ? item.paragraphs : [item.summary || item.title];
  const blocks = [];
  paras.slice(0, 2).forEach((t) => blocks.push({ type: 'p', text: t }));
  blocks.push({ type: 'image', src: '', caption: item.title.slice(0, 24) });
  paras.slice(2).forEach((t) => blocks.push({ type: 'p', text: t }));
  if (item.link) blocks.push({ type: 'p', text: `原文链接（转载需获授权）：${item.link}` });
  return blocks;
}

async function main() {
  const args = process.argv.slice(2);
  const argLimit = Number((args.find((a) => a.startsWith('--limit=')) || '').slice(8)) || 0;
  const forceStatus = args.includes('--draft') ? 'draft' : (args.includes('--publish') ? 'published' : '');

  const sources = loadSources().filter((s) => s.enabled !== false);
  if (!sources.length) {
    console.log('没有启用的采集源。请编辑 data/sources.json，把 enabled 设为 true 后重试。');
    console.log('也可以直接在后台 http://localhost:3000/admin.html 手动录入稿件。');
    return;
  }

  const existingTitles = new Set(svc.news.all().map((a) => a.title.trim()));
  let inserted = 0;
  let skipped = 0;
  const perSource = [];

  for (const source of sources) {
    const limit = argLimit || source.limit || 5;
    let added = 0;
    try {
      console.log(`\n[采集] ${source.name} → ${source.url}`);
      const items = await fetchSource(source);
      console.log(`  解析到 ${items.length} 条（本源上限 ${limit} 条）`);
      for (const item of items) {
        if (added >= limit) break;
        if (existingTitles.has(item.title)) { skipped += 1; continue; }
        svc.createArticle({
          title: item.title,
          summary: item.summary,
          channel: source.channel || 'china',
          source: source.name,
          sourceUrl: item.link,
          cover: '', // 不用外链图：统一交给本地高清图库生成
          tags: [...new Set([...(source.tags || []), ...keywordsFromTitle(item.title, 2)])].slice(0, 5),
          status: forceStatus || (source.status === 'draft' ? 'draft' : 'published'),
          publishedAt: item.publishedAt,
          content: buildContent(item)
        });
        existingTitles.add(item.title);
        inserted += 1;
        added += 1;
      }
      perSource.push(`${source.name} +${added}`);
    } catch (e) {
      console.log(`  采集失败：${e.message}（网络受限时可忽略，改用后台人工录入）`);
      perSource.push(`${source.name} 失败`);
    }
  }

  svc.news.flush();
  console.log(`\n【采集完成】新增 ${inserted} 条，跳过重复 ${skipped} 条`);
  console.log(`  明细：${perSource.join(' | ')}`);
  if (inserted) {
    const r = portal.refreshRanks();
    console.log(`已自动刷新榜单，运营位变更 ${r.changed} 篇`);
  }
}

main();
