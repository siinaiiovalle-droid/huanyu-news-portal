/**
 * 图片服务 —— 新闻配图的「下载 → 高清校验 → 统一裁切 → 全站去重 → 绑定稿件 → 图库管理」
 *
 * 三条硬性要求与实现方式：
 *   1) 内容对应：检索词由 server/lib/keywords.js 的 buildQuery 按「标题 + 标签 + 频道视觉词」生成；
 *      若采集源提供了原文配图（RSS media:content / enclosure / 正文首图），优先本地化这张图，
 *      因为它天然与内容一致。
 *   2) 不重复：每张成品图用 Pillow 计算 dHash 感知指纹，与全站指纹库比对，
 *      汉明距离 ≤ 6 即判定为同一张图，直接丢弃换下一张。
 *   3) 高清：下载门槛分档递减 1400x780 → 1280x720 → 1000x560（原文图放宽到 900x500），
 *      成品统一裁切为 1600x900 渐进式 JPEG，页面缩略图不会参差不齐。
 *
 * 数据落盘：
 *   public/img/news/*.jpg                  成品配图（稿件引用的是这里的本地路径）
 *   scripts/data/image-fingerprints.json   全站指纹库（文件名 -> dHash），与 scripts/fetch-images.js 共用
 *   scripts/data/image-library.json        图片元数据（检索词 / 来源 / 尺寸 / 入库时间），用于后台溯源
 *
 * 依赖：系统需有 python + Pillow（脚本 scripts/lib/normalize_image.py）；缺失时自动降级为
 * 「仅下载不裁切」，并在结果里给出提示，不会让采集流程整体失败。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const feed = require('./feed-parser');
const svc = require('./news-service');
const { buildQuery, buildTerms, CHANNEL_VISUAL } = require('./keywords');

const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(ROOT, 'public', 'img', 'news');
const TMP_DIR = path.join(ROOT, '.tmp-images');
const NORMALIZER = path.join(ROOT, 'scripts', 'lib', 'normalize_image.py');
const CARD_MAKER = path.join(ROOT, 'scripts', 'lib', 'make_card.py');
const CHANNEL_LABELS = {
  china: '国内', world: '国际', finance: '财经', tech: '科技', sports: '体育',
  entertainment: '娱乐', auto: '汽车', culture: '文化', health: '健康',
  video: '视频', square: '广场', headline: '头条'
};
const FINGERPRINT_FILE = path.join(ROOT, 'scripts', 'data', 'image-fingerprints.json');
const LIBRARY_FILE = path.join(ROOT, 'scripts', 'data', 'image-library.json');
const DATA_DIR = path.join(ROOT, 'data');

const OUT_W = 1600;
const OUT_H = 900;
const QUALITY = 86;

/** 图库检索的高清门槛（三档递减，尽量保证 1600x900 不虚） */
const TIERS = [[1280, 720], [1000, 560], [800, 450]];
/** 原文配图门槛：内容相关性最高，分辨率可以放宽一档 */
const ORIGIN_TIERS = [[1000, 560], [800, 450], [640, 360]];
const MIN_RATIO = 1.2;
const MIN_ORIGIN_RATIO = 1.0;
const MIN_BYTES = 30 * 1024;
/** 感知哈希汉明距离阈值：≤ 该值判定为同一张图 */
const DUP_THRESHOLD = 6;

const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SIZE_FILTERS = ['+filterui:imagesize-large', '+filterui:imagesize-wallpaper'];

/**
 * 本轮已占用但指纹还没落盘的照片哈希。
 * 采集时多路并发下配图，若不先占位，两条内容可能同时选中同一张图。
 */
const pendingHashes = new Set();

/** 每轮批量配图开始时调用，清掉上一轮的占位 */
function beginBatch() {
  pendingHashes.clear();
}

/* ------------------------------ 基础读写 ------------------------------ */

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8').trim();
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

let fingerprints = null;
let library = null;
let pythonBin = undefined;

function loadFingerprints() {
  if (!fingerprints) fingerprints = readJSON(FINGERPRINT_FILE, {});
  return fingerprints;
}

function saveFingerprints() { writeJSON(FINGERPRINT_FILE, loadFingerprints()); }

function loadLibrary() {
  if (!library) library = readJSON(LIBRARY_FILE, {});
  return library;
}

function saveLibrary() { writeJSON(LIBRARY_FILE, loadLibrary()); }

/** 探测可用的 python（需要 Pillow）；结果缓存，找不到返回空串 */
function python() {
  if (pythonBin !== undefined) return pythonBin;
  for (const bin of ['python', 'python3']) {
    const r = spawnSync(bin, ['-c', 'import PIL'], { encoding: 'utf8' });
    if (r.status === 0) { pythonBin = bin; return pythonBin; }
  }
  pythonBin = '';
  return pythonBin;
}

/* ------------------------------ 指纹与去重 ------------------------------ */

/** 两个十六进制 dHash 的汉明距离 */
function hammingHex(a, b) {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

/** 批量计算 dHash（一次 python 调用算一批，避免逐张启动进程） */
function hashFiles(files) {
  const out = [];
  const bin = python();
  if (!bin) return files.map(() => null);
  for (let i = 0; i < files.length; i += 40) {
    const chunk = files.slice(i, i + 40);
    const r = spawnSync(bin, [NORMALIZER, '--dhash', ...chunk], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (r.status !== 0) { chunk.forEach(() => out.push(null)); continue; }
    String(r.stdout || '').trim().split(/\s*\n\s*/)
      .forEach((h) => out.push(/^[0-9a-f]{16}$/i.test(h) ? h.toLowerCase() : null));
  }
  return out;
}

/** 为目录下缺指纹的图片补齐（首次运行建立全站指纹库） */
function ensureFingerprints() {
  const map = loadFingerprints();
  if (!fs.existsSync(OUT_DIR)) return 0;
  const files = fs.readdirSync(OUT_DIR).filter((f) => /\.jpg$/i.test(f));
  const missing = files.filter((f) => !map[f]);
  if (!missing.length) return 0;
  const hashes = hashFiles(missing.map((f) => path.join(OUT_DIR, f)));
  let n = 0;
  missing.forEach((f, i) => { if (hashes[i]) { map[f] = hashes[i]; n += 1; } });
  saveFingerprints();
  return n;
}

/** 是否为本地生成的品牌配图卡（这类图不参与照片去重比对） */
function isCard(file) {
  const meta = loadLibrary()[file];
  return !!(meta && meta.kind === 'card');
}

/** 找出与给定指纹重复的图片；selfFile 用于排除自身 */
function findDuplicate(hash, selfFile = '') {
  if (!hash) return null;
  if (pendingHashes.has(hash)) return '本轮并发占用的同款图';
  const map = loadFingerprints();
  for (const [file, h] of Object.entries(map)) {
    if (file === selfFile || !h) continue;
    if (isCard(file)) continue; // 品牌卡是生成的兜底图，不参与"照片重复"比对
    if (hammingHex(h, hash) <= DUP_THRESHOLD) return file;
  }
  return null;
}

/** 全站重复配图对（后台「一键检测重复」用） */
function duplicatePairs() {
  ensureFingerprints();
  const rows = Object.entries(loadFingerprints()).filter(([, h]) => h);
  const pairs = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const d = hammingHex(rows[i][1], rows[j][1]);
      if (d <= DUP_THRESHOLD) pairs.push({ a: rows[i][0], b: rows[j][0], distance: d });
    }
  }
  return pairs;
}

/* ------------------------------ 图片尺寸解析（无依赖） ------------------------------ */

function readSize(buf) {
  if (buf.length > 24 && buf.toString('latin1', 0, 2) === '\xFF\xD8') return jpegSize(buf);
  if (buf.length > 24 && buf.toString('latin1', 1, 4) === 'PNG') {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length > 16 && buf.toString('latin1', 0, 3) === 'GIF') {
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  }
  if (buf.length > 32 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const kind = buf.toString('latin1', 12, 16);
    if (kind === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
    if (kind === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return { w: (bits & 0x3FFF) + 1, h: ((bits >> 14) & 0x3FFF) + 1 };
    }
    const start = buf.indexOf(Buffer.from([0x9D, 0x01, 0x2A]));
    if (start > 0 && start + 7 < buf.length) {
      return { w: buf.readUInt16LE(start + 3) & 0x3FFF, h: buf.readUInt16LE(start + 5) & 0x3FFF };
    }
  }
  return null;
}

function jpegSize(buf) {
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xFF) { offset += 1; continue; }
    const marker = buf[offset + 1];
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { offset += 2; continue; }
    const len = buf.readUInt16BE(offset + 2);
    const isSof = marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;
    if (isSof) return { h: buf.readUInt16BE(offset + 5), w: buf.readUInt16BE(offset + 7) };
    offset += 2 + len;
  }
  return null;
}

/* ------------------------------ 下载与归一化 ------------------------------ */

/** 下载一张图并做高清 / 比例 / 体积校验 */
async function downloadImage(url, { proxy = '', minW, minH, minRatio = MIN_RATIO, timeout = 20000 } = {}) {
  let res;
  try {
    res = await feed.httpGetBuffer(url, {
      timeout,
      proxy,
      headers: { 'User-Agent': WEB_UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8', Referer: 'https://www.bing.com/' }
    });
  } catch (e) {
    return { ok: false, why: `网络 ${e.message}` };
  }
  const type = String(res.headers['content-type'] || '');
  const buf = res.body;
  if (!buf || !buf.length) return { ok: false, why: '空响应' };
  if (!type.startsWith('image/') && !readSize(buf)) return { ok: false, why: `非图片 ${type.slice(0, 24)}` };
  if (buf.length < MIN_BYTES) return { ok: false, why: `体积过小 ${Math.round(buf.length / 1024)}KB` };
  const size = readSize(buf);
  if (!size) return { ok: false, why: '无法解析尺寸' };
  if (size.w < minW || size.h < minH) return { ok: false, why: `分辨率不足 ${size.w}x${size.h}` };
  if (size.w / size.h < minRatio) return { ok: false, why: `比例过窄 ${size.w}x${size.h}` };
  return { ok: true, buf, size };
}

/** 调用 Pillow 统一裁切为 1600x900 渐进式 JPEG，返回成品指纹 */
function normalizeBuffer(buf, dstFile) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(dstFile), { recursive: true });
  const tmp = path.join(TMP_DIR, `src-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  fs.writeFileSync(tmp, buf);
  const bin = python();
  if (!bin) {
    // 无 Pillow：直接落地原图，保证有图可用（尺寸可能不统一）
    fs.copyFileSync(tmp, dstFile);
    fs.unlinkSync(tmp);
    return { ok: true, hash: null, degraded: true };
  }
  const r = spawnSync(bin, [NORMALIZER, tmp, dstFile, String(OUT_W), String(OUT_H), String(QUALITY)], { encoding: 'utf8' });
  try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  if (r.status !== 0) {
    return { ok: false, why: String(r.stderr || (r.error && r.error.message) || 'Pillow 处理失败').trim().slice(0, 140) };
  }
  const line = String(r.stdout || '').trim().split('\n').pop().trim();
  return { ok: true, hash: /^[0-9a-f]{16}$/i.test(line) ? line.toLowerCase() : null };
}

/** 从 Bing 图片取候选原图直链 */
async function searchCandidates(query, filter, { proxy = '', count = 12 } = {}) {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&qft=${filter}&form=IRFLTR&first=1`;
  let html = '';
  try {
    html = await feed.httpGetText(url, {
      timeout: 15000,
      proxy,
      headers: { 'User-Agent': WEB_UA, 'Accept-Language': 'zh-CN,zh;q=0.9' }
    });
  } catch {
    return [];
  }
  const out = [];
  const re = /m="(\{[^"]+?\})"/g;
  let match;
  while ((match = re.exec(html)) && out.length < count) {
    const raw = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    let obj;
    try { obj = JSON.parse(raw); } catch { continue; }
    if (!obj.murl || out.some((x) => x.url === obj.murl)) continue;
    out.push({ url: obj.murl, page: obj.purl || '', title: String(obj.t || '').slice(0, 60) });
  }
  return out;
}

/** 关键词逐级放宽：整串 → 前两词 → 首词 */
function queryVariants(query) {
  const words = String(query || '').split(/\s+/).filter(Boolean);
  const list = [query];
  if (words.length > 2) list.push(words.slice(0, 2).join(' '));
  if (words.length > 1) list.push(words[0]);
  // 检索词是整句标题（无空格）时逐级截短，给 Bing 更多命中机会
  if (words.length === 1 && words[0].length > 12) list.push(words[0].slice(0, 12), words[0].slice(0, 8));
  return [...new Set(list.filter(Boolean))];
}

/**
 * 候选图相关性校验：Bing 返回的是"网页上出现过的图"，不校验就会配出一张
 * 高清但八竿子打不着的图（实测用 2021 年的旧图配 2026 年的赛事）。
 * 判据很朴素 —— 图的标题/来源页里必须出现这条新闻的实体词。
 */
function filterRelevant(candidates, terms) {
  if (!terms || !terms.length) return candidates;
  return candidates.filter((c) => {
    let text = `${c.title || ''} ${c.page || ''}`;
    try { text += ` ${decodeURIComponent(String(c.page || ''))}`; } catch { /* ignore */ }
    text = text.toLowerCase();
    return terms.some((t) => text.indexOf(String(t).toLowerCase()) >= 0);
  });
}

/** 原文地址里的"当天"特征（如 /2026/09-16/、/n1/2025/0605/），用来滤掉模板图和往期推荐图 */
function dateTokens(pageUrl) {
  const m = /\/(20\d{2})[/-]?(\d{2})[/-]?(\d{2})[./]/.exec(String(pageUrl || ''));
  if (!m) return [];
  const [, y, mm, dd] = m;
  return [`${y}${mm}${dd}`, `${y}/${mm}-${dd}`, `${y}/${mm}/${dd}`, `${y}-${mm}-${dd}`, `${mm}-${dd}`];
}

const BODY_KEYS = ['class="content_desc"', 'class="content"', 'id="content"', 'class="article"', 'class="rm_txt_con"', 'class="box_con"', 'class="art_content"'];
const VOID_SRC = /logo|icon|avatar|blank|spacer|1x1|pixel|qrcode|erweima|weixin|weibo|share|\/ad|ad_|banner|arrow|btn|button/i;

/**
 * 原文页候选配图（按可靠度排序）：
 *   1) og:image / twitter:image —— 最准；
 *   2) 正文区里 URL 带"当天日期"的图 —— 新闻站的正文图多按 /2026/09-16/ 这类路径存放；
 *   3) 正文区第一张合格图。
 * 整页乱搜容易混进 logo、导航图和往期推荐图，所以找不到正文容器就不猜。
 */
async function listPageImages(pageUrl, { proxy = '', timeout = 12000, limit = 4, ogOnly = false } = {}) {
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return [];
  let html = '';
  try {
    html = await feed.httpGetText(pageUrl, {
      timeout,
      proxy,
      headers: { 'User-Agent': WEB_UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'zh-CN,zh;q=0.9' }
    });
  } catch {
    return [];
  }
  const head = html.slice(0, 200000);
  const patterns = [
    /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+(?:property|name)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']twitter:image["']/i
  ];
  const out = [];
  for (const re of patterns) {
    const m = re.exec(head);
    if (!m) continue;
    const url = feed.decodeEntities(m[1]).trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (/logo|icon|avatar|default|blank|placeholder|share-?logo/i.test(url)) continue;
    out.push(url);
    break;
  }
  if (ogOnly || out.length >= limit) return out.slice(0, limit);

  const key = BODY_KEYS.find((k) => head.indexOf(k) >= 0);
  if (!key) return out; // 认不出正文区就别乱猜，宁可换别的途径取图
  const at = head.indexOf(key);
  const region = head.slice(at, at + 30000);
  const tokens = dateTokens(pageUrl);
  const seen = new Set(out);
  const all = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(region))) {
    let src = feed.decodeEntities(m[1]).trim();
    if (!src || src.startsWith('data:')) continue;
    if (/\.(gif|svg)(\?|$)/i.test(src)) continue;
    if (VOID_SRC.test(src)) continue;
    if (!/^https?:\/\//i.test(src)) {
      try { src = new URL(src, pageUrl).toString(); } catch { continue; }
    }
    if (!/^https?:\/\//i.test(src) || seen.has(src)) continue;
    seen.add(src);
    all.push(src);
  }
  const dated = all.filter((u) => tokens.some((t) => u.indexOf(t) >= 0));
  return [...new Set([...out, ...dated, ...all])].slice(0, limit);
}

/** 抓原文页面的 og:image / twitter:image —— 比图库检索精准得多，且天然对应内容 */
async function fetchOgImage(pageUrl, { proxy = '', timeout = 12000 } = {}) {
  const list = await listPageImages(pageUrl, { proxy, timeout, limit: 1, ogOnly: true });
  return list[0] || '';
}

/** 并行竞速下载候选：谁先拿到合格且不重复的图就用谁（默认 4 路并发） */
async function raceCandidates(candidates, { proxy, dstFile, selfFile, minW, minH, concurrency = 4, deadline = 0 }) {
  const queue = candidates.slice();
  const reasons = [];
  let winner = null;
  let dupRejected = 0;

  const worker = async () => {
    while (queue.length && !winner) {
      if (deadline && Date.now() > deadline) return;
      const candidate = queue.shift();
      const got = await downloadImage(candidate.url, { proxy, minW, minH });
      if (winner) return;
      if (!got.ok) { reasons.push(got.why); continue; }
      const done = normalizeBuffer(got.buf, dstFile);
      if (winner) return;
      if (!done.ok) { reasons.push(done.why); continue; }
      const dup = findDuplicate(done.hash, selfFile);
      if (dup) { dupRejected += 1; reasons.push(`与已用配图重复（${dup}）`); continue; }
      if (winner) return;
      pendingHashes.add(done.hash);
      winner = { ...candidate, hash: done.hash, size: `${got.size.w}x${got.size.h}` };
      return;
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return { winner, reasons, dupRejected };
}

/* ------------------------------ 取图核心 ------------------------------ */

/**
 * 取一张「内容对应且全站唯一」的图并落盘，顺序按相关性递减：
 *   1) 采集源给的原文配图直链（最相关）
 *   2) 原文页面 og:image / twitter:image（次相关，几乎总能在新闻页拿到）
 *   3) 图库关键词检索（按「标题 + 频道视觉词」检索，多档高清门槛逐级放宽）
 * 每一步都做 dHash 去重，重复即丢弃换下一张，因此全站不会出现两张一样的配图。
 */
async function resolveImage({ query = '', visual = '', preferUrl = '', pageUrl = '', dstFile, selfFile, proxy = '', fast = false, budgetMs = 0 }) {
  const self = selfFile || path.basename(dstFile);
  const rejectReasons = [];
  let dupRejected = 0;
  // 单张图的等待上限，默认 45s；批量配图时会调小，免得几张慢图拖垮整轮采集
  const deadline = Date.now() + (Number(budgetMs) || 45000);

  const tryOrigin = async (url, label) => {
    for (const [minW, minH] of ORIGIN_TIERS) {
      const got = await downloadImage(url, { proxy, minW, minH, minRatio: MIN_ORIGIN_RATIO, timeout: 15000 });
      if (!got.ok) { rejectReasons.push(`${label}：${got.why}`); return null; }
      const done = normalizeBuffer(got.buf, dstFile);
      if (!done.ok) { rejectReasons.push(`${label}：${done.why}`); return null; }
      const dup = findDuplicate(done.hash, self);
      if (!dup) {
        pendingHashes.add(done.hash);
        return { ok: true, hash: done.hash, from: url, kind: 'origin', size: `${got.size.w}x${got.size.h}`, dupRejected };
      }
      dupRejected += 1;
      rejectReasons.push(`${label}已被其它稿件使用（${dup}）`);
      return null;
    }
    return null;
  };

  if (preferUrl) {
    const hit = await tryOrigin(preferUrl, '原文配图');
    if (hit) return hit;
  }

  if (pageUrl) {
    const list = await listPageImages(pageUrl, { proxy });
    for (const url of list) {
      if (url === preferUrl) continue;
      const hit = await tryOrigin(url, '原文页配图');
      if (hit) return hit;
    }
  }

  // 快速模式只走"原文直链 + 原文页"这两条又准又快的路，不做图库检索：
  // 检索动辄 60s 以上、失败率高，还经常配出一张与内容无关的图，
  // 只适合用户在后台明确点「补图」时慢慢跑。
  if (fast) {
    return {
      ok: false,
      why: '原文没有可用配图（' + (rejectReasons.slice(0, 2).join(' / ') || '原文页未找到合格图片') + '）',
      dupRejected
    };
  }

  const terms = buildTerms(query);
  let irrelevant = 0;

  const runSearch = async (variantList, { requireTerms = true, kind = 'search' } = {}) => {
    for (const [minW, minH] of TIERS) {
      const tried = new Set();
      for (const variant of variantList) {
        for (const filter of SIZE_FILTERS) {
          if (Date.now() > deadline) {
            return { timedOut: true, why: `超时未找到合格配图（${rejectReasons.slice(0, 2).join(' / ')}）` };
          }
          if (tried.size >= 90) break;
          const candidates = (await searchCandidates(variant, filter, { proxy })).filter((c) => !tried.has(c.url));
          candidates.forEach((c) => tried.add(c.url));
          if (!candidates.length) continue;
          // 内容一致性优先：候选图的标题/来源页必须对得上这条新闻的实体词，
          // 对不上就换下一个检索词，不落一张"高清但无关"的图
          const usable = (requireTerms && terms.length) ? filterRelevant(candidates, terms) : candidates;
          if (!usable.length) { irrelevant += candidates.length; continue; }
          const { winner, reasons, dupRejected: dup } = await raceCandidates(usable, {
            proxy, dstFile, selfFile: self, minW, minH, deadline
          });
          dupRejected += dup;
          rejectReasons.push(...reasons);
          if (winner) {
            return {
              ok: true,
              hash: winner.hash,
              from: winner.url,
              page: winner.page,
              kind,
              hit: variant,
              size: winner.size,
              dupRejected
            };
          }
        }
      }
    }
    return null;
  };

  const found = await runSearch(queryVariants(query));
  if (found && found.ok) return found;
  if (found && found.timedOut) return { ok: false, why: found.why, dupRejected };
  // 内容词确实检索不到对应画面（不少突发稿当天没有图）时，退到频道视觉词：
  // 至少是"体育赛场""金融交易"这一级的相关画面，并在图库里标记为 channel，方便人工替换
  if (visual) {
    const fallback = await runSearch([visual], { requireTerms: false, kind: 'channel' });
    if (fallback && fallback.ok) return fallback;
  }
  const tail = irrelevant ? `（${irrelevant} 张候选与内容不匹配）` : '';
  return { ok: false, why: (rejectReasons.slice(0, 3).join(' / ') || '没有可用候选图') + tail, dupRejected };
}

/* ------------------------------ 稿件配图 ------------------------------ */

function safeName(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '') || Date.now().toString(36);
}

function recordLibrary(file, meta) {
  const map = loadLibrary();
  map[file] = { ...(map[file] || {}), ...meta, at: new Date().toISOString() };
  saveLibrary();
}

function dropFingerprint(file) {
  const map = loadFingerprints();
  if (map[file]) { delete map[file]; saveFingerprints(); }
}

function writeFingerprint(file, hash) {
  if (!hash) return;
  const map = loadFingerprints();
  map[file] = hash;
  saveFingerprints();
}

/**
 * 判断一个图位上的图有没有真的落盘。
 * 数据里写了路径 ≠ 图在本机：误删、回退、迁移都可能让 public/img/news/ 里的文件消失，
 * 这时前台就是一张破图。所以「图片已下载」必须以磁盘上的文件为准。
 *   ok       —— public/img/news/ 下确有文件，且不是空文件
 *   missing  —— 记的是站内路径，但本机没有这个文件
 *   external —— 记的还是外链 URL（没本地化）
 *   empty    —— 这个图位还没配图
 */
function imageState(url) {
  if (!url || typeof url !== 'string' || !url.trim()) return 'empty';
  if (url.indexOf('/img/news/') !== 0) return 'external';
  const name = path.basename(url.split('?')[0]);
  const full = path.join(OUT_DIR, name);
  try {
    if (fs.existsSync(full) && fs.statSync(full).size >= 1024) return 'ok';
  } catch { /* 忽略读取异常，按没图处理 */ }
  return 'missing';
}

/** 图位是否可用（已落盘） */
function hasLocalImage(url) {
  return imageState(url) === 'ok';
}

/** 一篇稿件身上所有需要被展示的图位 */
function articleSlots(article) {
  const slots = [{ slot: '封面', url: article.cover, key: 'cover' }];
  (article.content || []).forEach((block, i) => {
    if (block.type === 'image') slots.push({ slot: `正文图${i + 1}`, url: block.src, key: `content.${i}.src` });
    // 视频块的海报图：没配就不算问题，配了却读不到才需要修
    if (block.type === 'video' && block.poster) slots.push({ slot: `视频海报${i + 1}`, url: block.poster, key: `content.${i}.poster`, optional: true });
  });
  if (article.video && article.video.poster) {
    slots.push({ slot: '视频海报', url: article.video.poster, key: 'video.poster', optional: true });
  }
  return slots;
}

/** 这篇稿件的图是否都落盘了（缺图或引用了不存在的本地文件都算没通过） */
function needsImages(article) {
  return articleSlots(article).some((s) => {
    const state = imageState(s.url);
    if (s.optional) return state === 'missing' || state === 'external';
    return state !== 'ok';
  });
}

/**
 * 发布前配图体检：逐篇检查每个图位在磁盘上是否真的有文件。
 * 记住 —— 巡检的依据是文件本身，不是数据里的非空字符串。
 */
function audit({ statuses = null } = {}) {
  const pool = svc.news.all().filter((a) => a.status !== 'deleted' && (!statuses || statuses.includes(a.status)));
  const list = [];
  const counters = { ok: 0, missing: 0, external: 0, empty: 0 };
  let ready = 0;

  pool.forEach((a) => {
    const slots = articleSlots(a).map((s) => ({ ...s, state: imageState(s.url) }));
    slots.forEach((s) => { counters[s.state] = (counters[s.state] || 0) + 1; });
    const broken = slots.filter((s) => s.state !== 'ok' && !(s.optional && s.state === 'empty'));
    if (!broken.length) { ready += 1; return; }
    list.push({ id: a.id, title: a.title, channel: a.channel, status: a.status, slots: broken });
  });

  return {
    at: new Date().toISOString(),
    checked: pool.length,
    ready,
    problems: list.length,
    states: counters,
    list
  };
}

/**
 * 清理「记了本地路径但文件不在机器上」的引用。
 * 这一步完全不联网，秒级跑完 —— 目的只有一个：别把破图地址推上线。
 * 真正的补图是后面的事（可能要下载几十张），不该在它上面等。
 */
function cleanBrokenReferences({ statuses = null } = {}) {
  const items = [];
  svc.news.all().forEach((a) => {
    if (a.status === 'deleted') return;
    if (statuses && !statuses.includes(a.status)) return;
    const patch = {};
    const content = (a.content || []).map((b) => ({ ...b }));
    const bad = (url) => imageState(url) === 'missing' || imageState(url) === 'external';

    if (bad(a.cover)) {
      patch.cover = '';
      items.push({ id: a.id, title: a.title, slot: '封面', url: a.cover });
    }
    content.forEach((b, i) => {
      if (b.type === 'image' && bad(b.src)) {
        items.push({ id: a.id, title: a.title, slot: `正文图${i + 1}`, url: b.src });
        b.src = '';
      }
      if (b.type === 'video' && b.poster && bad(b.poster)) {
        items.push({ id: a.id, title: a.title, slot: `视频海报${i + 1}`, url: b.poster });
        b.poster = '';
      }
    });
    if (Object.keys(patch).length === 0 && JSON.stringify(content) === JSON.stringify(a.content || [])) return;
    patch.content = content;
    svc.news.update(a.id, patch);
  });
  svc.news.flush();
  return { cleared: items.length, items };
}

/**
 * 为一篇稿件补齐封面 / 正文图。
 * force=true 时重下（用于后台「换一张图」）。
 * 封面 / 正文图的本地文件缺失或被换成外链时同样会补，避免破图上线。
 */
async function ensureArticleImages(
  article,
  { proxy = '', force = false, sourceImage = '', query = '', maxSlots = 2, fast = false, budgetMs = 0 } = {}
) {
  if (!article || !article.id) return { filled: 0, failed: 0, details: [] };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const details = [];
  const base = `a-${safeName(article.id)}`;
  const visual = CHANNEL_VISUAL[article.channel] || '';
  const coverQuery = () => query || buildQuery({ title: article.title, channel: article.channel, tags: article.tags });
  const content = (article.content || []).map((b) => ({ ...b }));
  let next = article;

  /* 封面 */
  const coverMissing = imageState(next.cover) === 'missing' || imageState(next.cover) === 'external';
  if (force || !hasLocalImage(next.cover)) {
    // 数据里有路径但文件没了：先把这条引用删掉，下载成功会写上新文件名；失败也不会留个破图地址
    if (coverMissing) next = svc.news.update(article.id, { cover: '' }) || next;
    const file = `${base}-cover.jpg`;
    const prevHash = loadFingerprints()[file] || '';
    if (force) dropFingerprint(file);
    const r = await resolveImage({
      query: coverQuery(),
      visual,
      preferUrl: sourceImage,
      pageUrl: next.sourceUrl || '',
      dstFile: path.join(OUT_DIR, file),
      selfFile: file,
      proxy,
      fast,
      budgetMs
    });
    if (r.ok) {
      writeFingerprint(file, r.hash);
      recordLibrary(file, {
        articleId: article.id, title: article.title, slot: 'cover',
        query: coverQuery(), from: r.from, kind: r.kind, size: r.size
      });
      next = svc.news.update(article.id, { cover: `/img/news/${file}` }) || next;
      details.push({ slot: 'cover', ok: true, file });
    } else {
      // 换图失败时恢复原指纹，避免旧图失去保护被别的稿件占用
      if (force && prevHash) writeFingerprint(file, prevHash);
      details.push({ slot: 'cover', ok: false, why: r.why });
    }
  }

  /* 正文图片位（src 为空表示还没配图） */
  if (maxSlots > 1) {
    for (let i = 0; i < content.length; i += 1) {
      const block = content[i];
      if (block.type !== 'image') continue;
      // 正文图同理：文件丢了就不是"配过图"，这次补回来
      if (!force && hasLocalImage(block.src)) continue;
      if (details.filter((d) => d.ok).length >= maxSlots) break;
      const file = `${base}-fig${i + 1}.jpg`;
      if (force) dropFingerprint(file);
      const q = buildQuery({ title: block.caption || article.title, channel: article.channel, tags: article.tags });
      const r = await resolveImage({ query: q, visual, dstFile: path.join(OUT_DIR, file), selfFile: file, proxy, fast, budgetMs });
      if (r.ok) {
        writeFingerprint(file, r.hash);
        recordLibrary(file, { articleId: article.id, title: article.title, slot: `figure:${i}`, query: q, from: r.from, kind: r.kind, size: r.size });
        content[i] = { ...block, src: `/img/news/${file}` };
        details.push({ slot: `figure:${i}`, ok: true, file });
      } else {
        details.push({ slot: `figure:${i}`, ok: false, why: r.why });
      }
    }
    const srcMap = content.map((b) => b.src || '');
    const changed = content.some((b, i) => b.src !== ((article.content || [])[i] || {}).src);
    if (changed) {
      const patch = { content };
      const video = next.video && next.video.poster ? { ...next.video, poster: next.cover || `/img/news/${base}-cover.jpg` } : next.video;
      if (srcMap.some(Boolean) && video) patch.video = video;
      next = svc.news.update(article.id, patch) || next;
    }
  }

  svc.news.flush();
  return {
    filled: details.filter((d) => d.ok).length,
    failed: details.filter((d) => !d.ok).length,
    details
  };
}

/**
 * 为「待审池」条目下载封面 —— 稿件还没创建，所以文件名用 i-<待审id>-cover.jpg。
 * 审核通过发布时这篇文件会被直接沿用为稿件封面（不重复下载、不重复占图）。
 */
async function ensureInboxImages(item, { proxy = '', force = false, query = '', fast = true, budgetMs = 0 } = {}) {
  if (!item || !item.id) return { ok: false, why: '待审条目不存在' };
  if (item.cover && !force) return { ok: false, skipped: true, why: '已有配图' };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = `i-${safeName(item.id)}-cover.jpg`;
  const prevHash = loadFingerprints()[file] || '';
  if (force) dropFingerprint(file);
  const q = query || buildQuery({ title: item.title, channel: item.channel, tags: item.tags });
  const r = await resolveImage({
    query: q,
    visual: CHANNEL_VISUAL[item.channel] || '',
    preferUrl: item.sourceImage || '',
    pageUrl: item.sourceUrl || '',
    dstFile: path.join(OUT_DIR, file),
    selfFile: file,
    proxy,
    fast,
    budgetMs
  });
  if (!r.ok) {
    // 换图失败时恢复原指纹，避免旧图失去保护被别的条目占用
    if (force && prevHash) writeFingerprint(file, prevHash);
    return { ok: false, why: r.why };
  }
  writeFingerprint(file, r.hash);
  recordLibrary(file, {
    inboxId: item.id, title: item.title, slot: 'cover',
    query: q, from: r.from, kind: r.kind, size: r.size
  });
  return { ok: true, file, url: `/img/news/${file}`, from: r.from, kind: r.kind, size: r.size, query: q };
}

/** 批量补齐：扫描缺图稿件，逐篇配图（默认只补封面 + 1 张正文图） */
async function fillMissing({ limit = 8, ids = [], proxy = '', force = false, maxSlots = 2, deadlineAt = 0 } = {}) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  ensureFingerprints();
  let pool = svc.news.all().filter((a) => a.status !== 'deleted');
  if (ids.length) pool = pool.filter((a) => ids.includes(a.id));
  else pool = pool.filter((a) => force || needsImages(a));
  pool = pool.slice(0, Math.max(1, Number(limit) || 8));

  const results = [];
  for (const article of pool) {
    // 高峰推送前常常要批量补图，留了时间上限就不会把整个流程拖住
    if (deadlineAt && Date.now() > deadlineAt) break;
    const r = await ensureArticleImages(article, { proxy, force, maxSlots });
    results.push({ id: article.id, title: article.title, ...r });
  }
  svc.news.flush();
  return {
    checked: pool.length,
    handled: results.length,
    filled: results.reduce((n, r) => n + r.filled, 0),
    failed: results.reduce((n, r) => n + r.failed, 0),
    stoppedEarly: results.length < pool.length,
    articles: results
  };
}

/* ------------------------------ 图库管理 ------------------------------ */

/** 全站引用关系：/img/news/xxx.jpg -> [{id,title,slot}]，覆盖稿件、动态、用户资料 */
function usageMap() {
  const map = new Map();
  const push = (url, ref) => {
    if (!url || typeof url !== 'string' || !url.includes('/img/news/')) return;
    const file = url.split('/img/news/').pop().split('?')[0];
    if (!file) return;
    if (!map.has(file)) map.set(file, []);
    map.get(file).push(ref);
  };

  svc.news.all().forEach((a) => {
    if (a.status === 'deleted') return;
    const ref = { id: a.id, title: a.title, slot: '封面' };
    push(a.cover, ref);
    (a.content || []).forEach((b, i) => {
      if (b.type === 'image') push(b.src, { id: a.id, title: a.title, slot: `正文图${i + 1}` });
      if (b.type === 'video') push(b.poster, { id: a.id, title: a.title, slot: '视频海报' });
    });
    if (a.video && a.video.poster) push(a.video.poster, { id: a.id, title: a.title, slot: '视频海报' });
  });

  // 其它集合（广场动态、用户资料、待审池等）里出现的同目录图片一并算作"已使用"，避免误删
  [['posts.json', '广场动态'], ['profiles.json', '用户资料'], ['site.json', '站点配置'], ['inbox.json', '待审池']].forEach(([name, label]) => {
    const raw = readJSON(path.join(DATA_DIR, name), null);
    if (!raw) return;
    const found = JSON.stringify(raw).match(/\/img\/news\/[^"'\\\s]+\.jpg/g) || [];
    [...new Set(found)].forEach((url) => push(url, { id: '', title: `${label}引用`, slot: label }));
  });

  return map;
}

/** 缺图稿件：封面/正文图为空，或记了本地路径但文件不在机器上都算 */
function missingArticles() {
  return svc.news.all()
    .filter((a) => a.status !== 'deleted')
    .map((a) => {
      const slots = articleSlots(a)
        .filter((s) => !s.optional && s.url)
        .filter((s) => imageState(s.url) !== 'ok')
        .map((s) => s.slot);
      (a.content || []).forEach((b, i) => {
        if (b.type === 'image' && !b.src) slots.push(`正文图${i + 1}`);
      });
      const list = [...new Set(slots)];
      return list.length ? { id: a.id, title: a.title, channel: a.channel, status: a.status, publishedAt: a.publishedAt, missing: list } : null;
    })
    .filter(Boolean);
}

function stats() {
  const files = fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR).filter((f) => /\.jpg$/i.test(f)) : [];
  const usage = usageMap();
  const map = loadFingerprints();
  let bytes = 0;
  files.forEach((f) => { try { bytes += fs.statSync(path.join(OUT_DIR, f)).size; } catch { /* ignore */ } });
  const used = files.filter((f) => usage.has(f)).length;
  const noHash = files.filter((f) => !map[f]).length;
  return {
    total: files.length,
    used,
    orphan: files.length - used,
    bytes,
    noHash,
    missingArticles: missingArticles().length,
    // 引用了本地图片但文件不在机器上的稿件数：这类内容是前台破图的直接来源
    brokenReferences: audit().problems,
    dupPairs: duplicatePairs().length,
    dir: '/img/news/'
  };
}

function listImages({ keyword = '', usage = 'all', page = 1, pageSize = 24 } = {}) {
  ensureFingerprints();
  const map = loadFingerprints();
  const lib = loadLibrary();
  const uses = usageMap();
  const dir = fs.existsSync(OUT_DIR) ? OUT_DIR : '';
  let rows = dir ? fs.readdirSync(dir).filter((f) => /\.jpg$/i.test(f)) : [];

  rows = rows.map((file) => {
    const full = path.join(OUT_DIR, file);
    let bytes = 0;
    try { bytes = fs.statSync(full).size; } catch { /* ignore */ }
    const by = uses.get(file) || [];
    const meta = lib[file] || {};
    return {
      file,
      url: `/img/news/${file}`,
      bytes,
      hash: map[file] || '',
      query: meta.query || '',
      from: meta.from || '',
      kind: meta.kind || '',
      size: meta.size || '',
      at: meta.at || '',
      articleId: meta.articleId || '',
      usedBy: by,
      used: by.length,
      orphan: by.length === 0
    };
  });

  if (usage === 'used') rows = rows.filter((r) => r.used > 0);
  if (usage === 'orphan') rows = rows.filter((r) => r.used === 0);
  if (keyword) {
    const kw = String(keyword).toLowerCase();
    rows = rows.filter((r) => r.file.toLowerCase().includes(kw)
      || r.query.toLowerCase().includes(kw)
      || r.from.toLowerCase().includes(kw)
      || r.usedBy.some((b) => String(b.title || '').toLowerCase().includes(kw)));
  }
  rows.sort((a, b) => (b.at || '').localeCompare(a.at || '') || a.file.localeCompare(b.file));

  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 24));
  const start = (p - 1) * size;
  return {
    list: rows.slice(start, start + size),
    pagination: { page: p, pageSize: size, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / size)) }
  };
}

/** 删除图片：仅允许删除没有任何稿件引用的图，防止前台破图 */
function removeImage(file) {
  const name = path.basename(String(file || ''));
  if (!/\.jpg$/i.test(name)) return { ok: false, why: '只能删除 .jpg 配图' };
  const full = path.join(OUT_DIR, name);
  if (!fs.existsSync(full)) return { ok: false, why: '文件不存在' };
  const by = usageMap().get(name) || [];
  if (by.length) return { ok: false, why: `仍被 ${by.length} 处引用（${by[0].title}）`, usedBy: by };
  fs.unlinkSync(full);
  dropFingerprint(name);
  const lib = loadLibrary();
  if (lib[name]) { delete lib[name]; saveLibrary(); }
  return { ok: true };
}

/** 重建全站指纹库（换过图或指纹文件损坏时使用） */
function rebuildFingerprints() {
  fingerprints = {};
  saveFingerprints();
  const n = ensureFingerprints();
  return { total: Object.keys(loadFingerprints()).length, computed: n };
}

module.exports = {
  OUT_DIR, FINGERPRINT_FILE, LIBRARY_FILE,
  hammingHex, findDuplicate, hashFiles, ensureFingerprints, rebuildFingerprints, duplicatePairs,
  readSize, downloadImage, searchCandidates, resolveImage, fetchOgImage, listPageImages,
  ensureArticleImages, ensureInboxImages, beginBatch, fillMissing,
  imageState, hasLocalImage, articleSlots, needsImages, audit, cleanBrokenReferences,
  listImages, missingArticles, usageMap, stats, removeImage,
  python
};
