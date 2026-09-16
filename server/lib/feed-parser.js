/**
 * RSS / Atom 抓取与解析（零第三方依赖）
 * 供内容流水线（server/lib/pipeline.js）与采集脚本共用。
 *
 * 网络说明：
 *   Node 内置 fetch 不会读取 HTTPS_PROXY 环境变量，因此在需要代理的环境下采集会全部超时。
 *   这里实现了两套取数方式：
 *     · 无代理  —— 直接 http/https 请求
 *     · 有代理  —— HTTPS 走 CONNECT 隧道 + TLS，HTTP 走代理绝对地址
 *   代理来源优先级：后台配置的 proxy > 环境变量 HTTPS_PROXY / HTTP_PROXY
 */
const http = require('http');
const https = require('https');
const tls = require('tls');
const { URL } = require('url');
const { keywordsFromTitle } = require('./keywords');

const UA = 'HuanYuNewsBot/1.0 (+content-sync)';

function envProxy() {
  return process.env.HTTPS_PROXY || process.env.https_proxy
    || process.env.HTTP_PROXY || process.env.http_proxy || '';
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
    const t = date ? Date.parse(date) : NaN;
    items.push({
      title,
      link,
      summary: desc.slice(0, 110),
      paragraphs: splitParagraphs(desc),
      cover: pickImg(block),
      publishedAt: Number.isNaN(t) ? null : new Date(t).toISOString()
    });
  });
  return items;
}

/** 明文 HTTP 取数（可经代理绝对地址） */
function plainGet(u, { timeout = 12000, proxy = '' } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(u);
    const via = proxy ? new URL(proxy) : null;
    const options = via
      ? {
        host: via.hostname,
        port: Number(via.port) || 80,
        path: target.toString(),
        headers: { Host: target.host, 'User-Agent': UA }
      }
      : {
        host: target.hostname,
        port: Number(target.port) || 80,
        path: `${target.pathname}${target.search}`,
        headers: { 'User-Agent': UA }
      };
    const req = http.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.setTimeout(timeout, () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    req.end();
  });
}

/** HTTPS over HTTP 代理：先 CONNECT 建隧道，再在隧道上做 TLS */
function tunnelGet(u, { timeout = 12000, proxy = '' } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(u);
    const p = new URL(proxy);
    const port = Number(target.port) || (target.protocol === 'https:' ? 443 : 80);
    const req = http.request({
      host: p.hostname,
      port: Number(p.port) || 80,
      method: 'CONNECT',
      path: `${target.hostname}:${port}`,
      headers: { Host: `${target.hostname}:${port}` }
    });
    req.setTimeout(timeout, () => req.destroy(new Error('代理连接超时')));
    req.on('error', reject);
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`代理返回 ${res.statusCode}`));
        return;
      }
      const finish = (conn) => {
        const r = https.request({
          method: 'GET',
          host: target.hostname,
          path: `${target.pathname}${target.search}`,
          headers: { 'User-Agent': UA, Host: target.hostname },
          createConnection: () => conn
        }, (resp) => {
          let data = '';
          resp.setEncoding('utf8');
          resp.on('data', (c) => { data += c; });
          resp.on('end', () => resolve({ status: resp.statusCode, body: data }));
        });
        r.setTimeout(timeout, () => r.destroy(new Error('读取超时')));
        r.on('error', reject);
        r.end();
      };
      if (target.protocol === 'https:') {
        const secure = tls.connect({ socket, servername: target.hostname }, () => finish(secure));
        secure.on('error', reject);
      } else {
        finish(socket);
      }
    });
    req.end();
  });
}

async function httpGetText(url, { timeout = 12000, proxy = '' } = {}) {
  const useProxy = proxy || envProxy();
  const target = new URL(url);
  const res = (useProxy && target.protocol === 'https:')
    ? await tunnelGet(url, { timeout, proxy: useProxy })
    : await plainGet(url, { timeout, proxy: useProxy });
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  return res.body;
}

async function fetchFeed(url, { timeout = 12000, proxy = '' } = {}) {
  return parseFeed(await httpGetText(url, { timeout, proxy }));
}

/** 源可用性测试：返回能否抓到内容，用于后台"测试采集源" */
async function testSource(url, { timeout = 12000, proxy = '' } = {}) {
  const started = Date.now();
  try {
    const items = await fetchFeed(url, { timeout, proxy });
    return { ok: true, count: items.length, ms: Date.now() - started, sample: items[0] ? items[0].title : '' };
  } catch (e) {
    return { ok: false, count: 0, ms: Date.now() - started, error: e.message };
  }
}

/**
 * 组装正文：导语 → 正文配图位 → 剩余段落 → 原文出处
 * 配图位 src 留空，由配图脚本（npm run fetch:images）按标题内容补齐高清本地图。
 */
function buildContent(item) {
  const paras = item.paragraphs && item.paragraphs.length ? item.paragraphs : [item.summary || item.title];
  const blocks = [];
  paras.slice(0, 2).forEach((t) => blocks.push({ type: 'p', text: t }));
  blocks.push({ type: 'image', src: '', caption: String(item.title || '').slice(0, 24) });
  paras.slice(2).forEach((t) => blocks.push({ type: 'p', text: t }));
  if (item.link) blocks.push({ type: 'p', text: `原文链接（转载需获授权）：${item.link}` });
  return blocks;
}

function tagsFor(item, source) {
  return [...new Set([...(source.tags || []), ...keywordsFromTitle(item.title, 2)])].slice(0, 5);
}

module.exports = {
  fetchFeed, parseFeed, testSource, buildContent, tagsFor, stripHtml, decodeEntities, httpGetText, envProxy
};
