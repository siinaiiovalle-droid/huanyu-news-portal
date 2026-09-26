#!/usr/bin/env node
/**
 * 静态导出：把动态站点预渲染成可直接托管在 GitHub Pages 的纯静态包（输出 gh-pages/）
 *
 * 1. 临时起本地服务，把页面用到的每个 GET 请求跑一遍，响应落成 api/v1/**.json；
 * 2. 拷贝 public/ 并把资源路径改成相对路径，放在任意子目录都能打开；
 * 3. 注入 static-shim.js：运行时接口请求改道到静态 JSON，写操作本地模拟。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'gh-pages');
const PORT = Number(process.env.STATIC_PORT || 4799);
const BASE = `http://127.0.0.1:${PORT}`;
const DROP = new Set(['uid', 'token', '_', 't', 'ts']);
// 页面清单：toRelative 靠它把 /xxx.html 改成 ./xxx.html（缺一个，导航到该页就会 404）
const PAGES = ['index', 'channel', 'article', 'video', 'search', 'square', 'admin', 'mall', 'ai'];

function request(urlStr, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr, BASE);
    const req = http.request(
      { host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: body ? { 'Content-Type': 'application/json' } : {} },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { text += c; });
        res.on('end', () => resolve({ status: res.statusCode || 0, text }));
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getJson(url) {
  try { return JSON.parse((await request(url)).text); } catch { return null; }
}

/** 接口统一信封 {code,message,data}，这里只取业务数据 */
async function getData(url) {
  const j = await getJson(url);
  if (!j) return null;
  return j && typeof j === 'object' && 'data' in j ? j.data : j;
}

async function postJson(url, body) {
  try { return JSON.parse((await request(url, 'POST', body)).text); } catch { return null; }
}

/** 查询值 → 文件名安全片段。中文必须编码后保留（否则「新品」「热销」都塌缩成 --，两个标签共用一份快照） */
function sanitize(v) {
  return encodeURIComponent(String(v)).replace(/%/g, '_');
}

/** 请求 URL → 静态文件路径（必须与 static-shim.js 的算法保持一致） */
function fileFor(urlStr) {
  const u = new URL(urlStr, BASE);
  const p = u.pathname;
  const i = p.indexOf('/api/v1/');
  if (i < 0) return null;
  const rest = p.slice(i + '/api/v1/'.length).replace(/\/+$/, '');
  const q = {};
  u.searchParams.forEach((v, k) => { if (!DROP.has(k) && v !== '' && v != null) q[k] = v; });
  const keys = Object.keys(q).sort();
  const suffix = keys.length ? '__' + keys.map((k) => `${k}-${sanitize(q[k])}`).join('_').replace(/[^A-Za-z0-9_\-]/g, '-') : '';
  return 'api/v1/' + rest + suffix + '.json';
}

async function collectUrls() {
  const urls = [];
  const seen = new Set();
  const push = (u) => { const f = fileFor(u); if (f && !seen.has(f)) { seen.add(f); urls.push(u); } };

  [
    '/api/v1/site', '/api/v1/channels', '/api/v1/home', '/api/v1/feed', '/api/v1/sync?limit=100',
    '/api/v1/news?page=1&pageSize=6&sort=new', '/api/v1/news?page=1&pageSize=12&sort=hot',
    '/api/v1/news?pageSize=6&sort=new', // 视频页侧栏（参数顺序不同，快照名也不同，别漏）
    '/api/v1/news?page=1&pageSize=20&sort=new',
    '/api/v1/rank?type=hot&size=10', '/api/v1/rank?type=blast&size=10',
    '/api/v1/rank?type=focus&size=10', '/api/v1/rank?type=headline&size=10',
    '/api/v1/tags?size=12', '/api/v1/square/assets?size=12', '/api/v1/square/assets?size=21',
    '/api/v1/square/topics?size=12', '/api/v1/square/topics?size=20',
    '/api/v1/square/trends', '/api/v1/square/mine', '/api/v1/search?q=&page=1&pageSize=20'
  ].forEach(push);

  // 无参数版本：页面传了没预渲染的参数时，shim 会回退到它
  ['/api/v1/news', '/api/v1/video', '/api/v1/ai', '/api/v1/rank', '/api/v1/tags', '/api/v1/search',
    '/api/v1/square', '/api/v1/comments', '/api/v1/square/assets', '/api/v1/square/topics'].forEach(push);

  for (let p = 1; p <= 3; p += 1) push(`/api/v1/video?page=${p}&pageSize=12`);
  // AI 瞭望台：赛道、时间线、热词全靠这一个接口，缺了整页就是空壳
  for (let p = 1; p <= 3; p += 1) push(`/api/v1/ai?page=${p}&pageSize=12`);

  const channels = (await getData('/api/v1/channels')) || [];
  channels.forEach((c) => {
    push(`/api/v1/channel/${c.id}`);
    // 首页各频道区块（不预渲染的话静态版会回退成"全站最新"，频道内容就串了）
    push(`/api/v1/news?channel=${c.id}&pageSize=6`);
    ['new', 'hot'].forEach((sort) => {
      for (let p = 1; p <= 3; p += 1) push(`/api/v1/channel/${c.id}?page=${p}&pageSize=20&sort=${sort}`);
    });
  });

  const articles = [];
  for (let p = 1; p <= 10; p += 1) {
    const r = await getData(`/api/v1/news?page=${p}&pageSize=20&sort=new`);
    const list = (r && (r.list || r.items)) || [];
    if (!list.length) break;
    articles.push(...list);
  }
  articles.forEach((a) => {
    if (!a || !a.id) return;
    push(`/api/v1/news/${a.id}`);
    push(`/api/v1/comments?articleId=${a.id}&page=1&pageSize=10&sort=new`);
  });

  for (const sort of ['recommend', 'latest', 'hot', 'following']) {
    let cursor = 0;
    for (let i = 0; i < 12; i += 1) {
      const url = `/api/v1/square?sort=${sort}&pageSize=10&cursor=${cursor}`;
      push(url);
      const r = await getData(url);
      if (!r || !r.hasMore || !r.nextCursor) break;
      cursor = r.nextCursor;
    }
  }

  /* ---------------------------- 商城（寰宇严选） ---------------------------- */
  // 不预渲染的话 mall.html 在静态版上没有任何数据快照，页面只能是个空壳。
  push('/api/v1/mall/home'); // 聚合首页：类目浮层 / 榜单 / 秒杀 / 服务承诺全靠它
  push('/api/v1/mall/orders'); // 「我的订单」的空列表兜底
  push('/api/v1/mall/products'); // 无参数兜底：shim 找不到精确组合时会逐级放宽到它
  const mallHome = await getData('/api/v1/mall/home');
  if (mallHome) {
    (mallHome.categories || []).forEach((c) => {
      if (!c || !c.id) return;
      // 24 件选品 × pageSize 12，最多 3 页足够；sort / keyword 由 shim 放宽匹配，无需枚举
      for (let p = 1; p <= 3; p += 1) push(`/api/v1/mall/products?category=${c.id}&page=${p}&pageSize=12`);
    });
  }
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'mall.json'), 'utf8'));
    const goods = Array.isArray(raw) ? raw : (raw.items || raw.list || []);
    goods.forEach((p) => { if (p && p.id) push(`/api/v1/mall/${p.id}`); });
    // 标签导航与 public/js/mall.js 的 TAGS 同源，这里按库里实际出现的 tag 全量铺
    Array.from(new Set(goods.map((p) => p && p.tag).filter(Boolean))).forEach((t) => {
      for (let p = 1; p <= 3; p += 1) push(`/api/v1/mall/products?tag=${encodeURIComponent(t)}&page=${p}&pageSize=12`);
    });
  } catch { /* 商品库缺失则跳过详情与标签页 */ }

  let posts = [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'posts.json'), 'utf8'));
    posts = Array.isArray(raw) ? raw : (raw.items || raw.list || []);
  } catch { posts = []; }
  posts.forEach((p) => { if (p && p.id) push(`/api/v1/square/${p.id}`); });

  const login = await postJson('/api/v1/admin/login', { username: 'admin', password: 'admin888' });
  const token = login && login.data && login.data.token;
  if (token) {
    const auth = (u) => `${u}${u.includes('?') ? '&' : '?'}token=${token}`;
    ['/api/v1/admin/me', '/api/v1/admin/stats', '/api/v1/admin/site',
      '/api/v1/admin/pipeline', '/api/v1/admin/pipeline/settings',
      '/api/v1/admin/sources', '/api/v1/admin/runs?limit=20',
      '/api/v1/admin/images', '/api/v1/admin/images/duplicates',
      '/api/v1/admin/posts?page=1&pageSize=20', '/api/v1/admin/comments?page=1&pageSize=20'
    ].forEach((u) => push(auth(u)));

    // 采集审核池：前端请求带 sort（score/time），必须按真实参数组合预渲染，
    // 否则静态版会找不到快照、整页空白（曾经就是这么坏的）。
    ['', 'pending', 'approved', 'published', 'rejected'].forEach((status) => {
      ['score', 'time'].forEach((sort) => {
        push(auth(`/api/v1/admin/inbox?page=1&pageSize=20&status=${status}&sort=${sort}`));
      });
    });

    // 稿件管理：状态 × 来源
    ['', 'published', 'draft', 'scheduled'].forEach((status) => {
      ['', 'manual', 'pipeline'].forEach((origin) => {
        push(auth(`/api/v1/admin/news?page=1&pageSize=20${status ? `&status=${status}` : ''}${origin ? `&origin=${origin}` : ''}`));
      });
    });

    // 图库管理：使用状态筛选
    ['all', 'used', 'orphan'].forEach((usage) => {
      push(auth(`/api/v1/admin/images?keyword=&usage=${usage}&page=1&pageSize=24`));
    });
  } else {
    console.warn('! 后台令牌获取失败，后台页将只有登录界面');
  }

  return { urls, articles, posts };
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/** 绝对路径 → 相对路径，保证部署到仓库子目录也能打开 */
function toRelative(text) {
  let s = text;
  s = s.replace(/(["'`])\/(css|js|img|fonts)\//g, '$1./$2/');
  s = s.replace(/(["'`])\/api\/v1\//g, '$1./api/v1/');
  PAGES.forEach((p) => { s = s.replace(new RegExp(`(["'\`])/${p}\\.html`, 'g'), (m, q) => `${q}./${p}.html`); });
  s = s.replace(/(href|action)=["']\/["']/g, '$1="./"');
  // 注意：这里不能再给接口 URL 追加 .json —— 后缀由 static-shim.js 在运行时统一补，
  // 否则会拼成 ./api/v1/site.json.json 而 404（带参数的接口本来就补不了，会造成只有一半接口可用）。
  return s;
}

/** 与 static-shim.js 的 svgPlaceholder 保持一致：静态包里没有占位图服务，直接内联成 SVG */
function svgDataUri(w, h, text) {
  const W = Math.max(1, Number(w) || 800);
  const H = Math.max(1, Number(h) || 450);
  const label = (text || '寰宇新闻网').slice(0, 24).replace(/[<>&]/g, '');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#e8eef6"/><stop offset="1" stop-color="#cfd9e6"/></linearGradient></defs>' +
    '<rect width="100%" height="100%" fill="url(#g)"/>' +
    '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" ' +
    'font-family="Microsoft YaHei,PingFang SC,sans-serif" font-size="' + Math.round(Math.min(W, H) / 12) + '" fill="#7b8794">' +
    label + '</text></svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** HTML 里写死的占位图请求：由解析器直接发起，shim 拦不住，构建时就替换掉 */
function inlinePlaceholders(html) {
  return html.replace(/(["'])(\.\/)?api\/v1\/placeholder\?([^"']*)\1/g, (m, q, _p, qs) => {
    const params = new URLSearchParams(String(qs).replace(/&amp;/g, '&'));
    return q + svgDataUri(params.get('w'), params.get('h'), params.get('text')) + q;
  });
}

function rewriteTree(dir) {
  for (const name of fs.readdirSync(dir)) {
    const f = path.join(dir, name);
    if (fs.statSync(f).isDirectory()) { rewriteTree(f); continue; }
    if (!/\.(html|js|json)$/i.test(name)) continue;
    const before = fs.readFileSync(f, 'utf8');
    let after = toRelative(before);
    if (/\.html$/i.test(name)) after = inlinePlaceholders(after);
    if (after !== before) fs.writeFileSync(f, after, 'utf8');
  }
}

function injectShim(dir) {
  const tag = '<script src="./static-shim.js"></script>';
  for (const name of fs.readdirSync(dir)) {
    if (!/\.html$/i.test(name)) continue;
    const f = path.join(dir, name);
    let html = fs.readFileSync(f, 'utf8');
    if (html.indexOf('static-shim.js') >= 0) continue;
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}\n  ${tag}`) : tag + html;
    fs.writeFileSync(f, html, 'utf8');
  }
}

function articleText(a) {
  const blocks = Array.isArray(a.content) ? a.content : [];
  return blocks.map((b) => (b && (b.text || b.caption || b.alt) ? String(b.text || b.caption || b.alt) : '')).join(' ').slice(0, 4000);
}

function pruneStale(keep) {
  const apiDir = path.join(OUT, 'api');
  if (!fs.existsSync(apiDir)) return;
  (function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const f = path.join(dir, name);
      if (fs.statSync(f).isDirectory()) { walk(f); continue; }
      const rel = path.relative(OUT, f).split(path.sep).join('/');
      if (!keep.has(rel)) fs.unlinkSync(f);
    }
  })(apiDir);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  console.log('启动临时服务…');
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore'
  });

  let ready = false;
  for (let i = 0; i < 40 && !ready; i += 1) {
    await new Promise((r) => setTimeout(r, 300));
    try { ready = (await request('/api/v1/site')).status === 200; } catch { /* 还没起来 */ }
  }
  if (!ready) { child.kill(); throw new Error(`本地服务未能在 ${PORT} 端口启动`); }

  const { urls, articles, posts } = await collectUrls();
  console.log(`预渲染 ${urls.length} 个接口…`);

  const written = new Set();
  let ok = 0;
  for (const u of urls) {
    const rel = fileFor(u);
    if (!rel) continue;
    try {
      const r = await request(u);
      if (r.status !== 200) continue;
      const dest = path.join(OUT, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, r.text, 'utf8');
      written.add(rel);
      ok += 1;
    } catch { /* 跳过失败项 */ }
  }

  const searchList = articles.map((a) => ({
    id: a.id, title: a.title || '', summary: a.summary || '', tags: a.tags || [],
    channel: a.channel || '', publishedAt: a.publishedAt || a.createdAt || '',
    cover: a.cover || '', text: articleText(a)
  }));
  fs.writeFileSync(path.join(OUT, 'search-index.json'), JSON.stringify({ total: searchList.length, list: searchList }), 'utf8');

  const postsIndex = {};
  posts.forEach((p) => {
    if (!p || !p.id) return;
    postsIndex[p.id] = { stats: p.stats || { likes: 0, reposts: 0, replies: 0, views: 0, comments: 0 } };
  });
  fs.writeFileSync(path.join(OUT, 'posts-index.json'), JSON.stringify(postsIndex), 'utf8');

  child.kill();

  pruneStale(written);

  console.log('拷贝站点资源…');
  copyDir(path.join(ROOT, 'public'), OUT);
  fs.copyFileSync(path.join(__dirname, 'static-shim.js'), path.join(OUT, 'static-shim.js'));

  rewriteTree(OUT);
  injectShim(OUT);
  // 避免 Jekyll 忽略下划线开头的文件
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '', 'utf8');

  const imgCount = (() => {
    try { return fs.readdirSync(path.join(OUT, 'img')).length; } catch { return 0; }
  })();
  fs.writeFileSync(path.join(OUT, 'README.md'), [
    '# 寰宇新闻网 · GitHub Pages 静态版',
    '',
    '由 `npm run build:static` 自动生成，请勿手改（下次构建会覆盖）。',
    '',
    `- 页面：index / channel / article / video / search / square / admin / mall`,
    `- 数据：${articles.length} 篇稿件、${posts.length} 条广场动态，预渲染为 api/v1/**.json（${ok} 个文件）`,
    `- 图片：${imgCount} 个素材文件随包发布`,
    '- 交互：发帖、点赞、评论、后台登录为本地模拟，存在浏览器 localStorage，不回写服务器',
    '',
    '## 发布（需先 gh auth login）',
    '',
    '```powershell',
    'powershell -ExecutionPolicy Bypass -File ..\\scripts\\publish-gh-pages.ps1 -Repo <仓库名>',
    '```',
    '',
    '脚本会自动建仓库、推送并在 Settings → Pages 里开启 main / root，',
    '随后访问 `https://<用户名>.github.io/<仓库名>/`（首次构建约 1-3 分钟）。',
    '',
    '手动发布也可：在本目录 `git init -b main && git add -A && git commit -m "静态站点"`，',
    '推送后到仓库 Settings → Pages → Source 选 `main` / `/root`。',
    ''
  ].join('\n'), 'utf8');

  const size = (() => {
    let total = 0;
    (function walk(d) {
      for (const n of fs.readdirSync(d)) {
        const f = path.join(d, n);
        if (fs.statSync(f).isDirectory()) walk(f);
        else total += fs.statSync(f).size;
      }
    })(OUT);
    return total;
  })();

  console.log(`完成：gh-pages/ 共 ${ok} 个接口快照，${(size / 1048576).toFixed(1)}MB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
