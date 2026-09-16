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

/** 正文里第一张图（跳过 1x1 像素、图标等明显不是配图的地址） */
function firstContentImage(block) {
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(block))) {
    const src = decodeEntities(m[1]).trim();
    if (!/^https?:\/\//i.test(src)) continue;
    if (/\.(gif|svg)(\?|$)/i.test(src)) continue;
    if (/logo|icon|avatar|blank|spacer|1x1|pixel/i.test(src)) continue;
    return src;
  }
  return '';
}

/**
 * 原文配图：优先 media:content / media:thumbnail / enclosure（RSS 里最可靠的原文直链），
 * 其次正文第一张 <img>。入池时只记地址，发布前会把它下载到本地再使用，避免外链破图。
 */
function pickSourceImage(block) {
  const media = /<media:content[^>]+url=["']([^"']+)["'][^>]*>/i.exec(block)
    || /<media:thumbnail[^>]+url=["']([^"']+)["'][^>]*>/i.exec(block);
  if (media && /^https?:\/\//i.test(decodeEntities(media[1]))) return decodeEntities(media[1]);

  const enc = /<enclosure[^>]*>/i.exec(block);
  if (enc) {
    const url = (/url=["']([^"']+)["']/i.exec(enc[0]) || [])[1] || '';
    const type = (/type=["']([^"']+)["']/i.exec(enc[0]) || [])[1] || '';
    if (url && /^https?:\/\//i.test(url) && (type.startsWith('image/') || /\.(jpe?g|png|webp)(\?|$)/i.test(url))) {
      return url;
    }
  }
  return firstContentImage(block);
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
      // 原文配图直链：发布前会本地化下载，用来保证"配图与内容一致"
      image: pickSourceImage(block),
      publishedAt: Number.isNaN(t) ? null : new Date(t).toISOString()
    });
  });
  return items;
}

/** 明文 HTTP 取数（可经代理绝对地址） */
function plainGet(u, { timeout = 12000, proxy = '', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(u);
    const via = proxy ? new URL(proxy) : null;
    const base = { 'User-Agent': UA, ...headers };
    const options = via
      ? { host: via.hostname, port: Number(via.port) || 80, path: target.toString(), headers: { ...base, Host: target.host } }
      : {
        host: target.hostname,
        port: Number(target.port) || 80,
        path: `${target.pathname}${target.search}`,
        headers: base
      };
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(timeout, () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    req.end();
  });
}

/** HTTPS over HTTP 代理：先 CONNECT 建隧道，再在隧道上做 TLS */
function tunnelGet(u, { timeout = 12000, proxy = '', headers = {} } = {}) {
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
      // 隧道建好后的 socket 错误必须自己兜住，否则会冒泡成进程级未捕获异常
      socket.on('error', reject);
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
          headers: { 'User-Agent': UA, ...headers, Host: target.hostname },
          createConnection: () => conn
        }, (resp) => {
          const chunks = [];
          resp.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
          resp.on('end', () => resolve({ status: resp.statusCode, headers: resp.headers, body: Buffer.concat(chunks) }));
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

/**
 * 通用 GET（自动跟随 3xx 跳转），返回二进制。
 * 图片下载 / 图库检索都走这里，因此同样支持代理。
 */
async function httpGetBuffer(url, { timeout = 12000, proxy = '', headers = {}, maxRedirects = 5 } = {}) {
  const useProxy = proxy || envProxy();
  let current = url;
  for (let i = 0; i <= maxRedirects; i += 1) {
    const target = new URL(current);
    const res = (useProxy && target.protocol === 'https:')
      ? await tunnelGet(current, { timeout, proxy: useProxy, headers })
      : await plainGet(current, { timeout, proxy: useProxy, headers });
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.location) {
      const next = new URL(res.headers.location, current).toString();
      if (!/^https?:/i.test(next)) throw new Error('重定向到不支持的地址');
      current = next;
      continue;
    }
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
    return { status: res.status, headers: res.headers, body: res.body };
  }
  throw new Error('重定向次数过多');
}

async function httpGetText(url, opts = {}) {
  const res = await httpGetBuffer(url, opts);
  return res.body.toString('utf8');
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
  fetchFeed, parseFeed, testSource, buildContent, tagsFor,
  stripHtml, decodeEntities, httpGetText, httpGetBuffer, envProxy, pickSourceImage
};
