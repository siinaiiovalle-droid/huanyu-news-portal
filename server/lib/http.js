/**
 * 极简 HTTP 框架（零第三方依赖）
 * 提供：路由匹配、请求体解析、JSON 响应、静态资源服务、CORS
 */
const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

/** 把 "/api/news/:id" 编译为正则 */
function compile(pattern) {
  const keys = [];
  const source = pattern
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }
      if (seg === '*') {
        keys.push('wildcard');
        return '(.*)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp('^' + source + '/?$'), keys };
}

class App {
  constructor(options = {}) {
    this.routes = [];
    this.staticDir = options.staticDir ? path.resolve(options.staticDir) : null;
    this.middlewares = [];
  }

  use(fn) {
    this.middlewares.push(fn);
    return this;
  }

  route(method, pattern, handler) {
    const { regex, keys } = compile(pattern);
    this.routes.push({ method: method.toUpperCase(), regex, keys, handler });
    return this;
  }

  get(p, h) { return this.route('GET', p, h); }
  post(p, h) { return this.route('POST', p, h); }
  put(p, h) { return this.route('PUT', p, h); }
  patch(p, h) { return this.route('PATCH', p, h); }
  delete(p, h) { return this.route('DELETE', p, h); }

  listen(port = 3000, host = '0.0.0.0') {
    const server = http.createServer((req, res) => this.handle(req, res));
    return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
  }

  async handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    req.pathname = decodeURIComponent(url.pathname);
    req.query = Object.fromEntries(url.searchParams.entries());

    decorateResponse(res);

    // CORS：便于 App / 小程序 / 管理后台跨域联调
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.status(204).end();

    try {
      await this.dispatch(this.middlewares, req, res, true);
      if (res.writableEnded) return;

      for (const route of this.routes) {
        if (route.method !== req.method) continue;
        const m = route.regex.exec(req.pathname);
        if (!m) continue;
        req.params = {};
        route.keys.forEach((k, i) => {
          req.params[k] = decodeURIComponent(m[i + 1] || '');
        });
        await route.handler(req, res);
        if (!res.writableEnded) return;
        return;
      }

      // 未匹配 API -> 静态资源
      if (await this.tryStatic(req, res)) return;

      // SPA/未知路径兜底
      if (req.pathname.startsWith('/api/')) return res.json({ error: 'Not Found', path: req.pathname }, 404);
      return res.html('<h1>404</h1><p>页面不存在</p>', 404);
    } catch (err) {
      console.error('[server error]', err);
      if (!res.writableEnded) {
        res.json({ error: 'Internal Server Error', message: err.message }, 500);
      }
    }
  }

  async dispatch(list, req, res) {
    for (const fn of list) {
      await fn(req, res);
      if (res.writableEnded) break;
    }
  }

  async tryStatic(req, res) {
    if (!this.staticDir) return false;
    let rel = req.pathname.replace(/^\/+/, '');
    if (!rel) rel = 'index.html';
    const filePath = path.join(this.staticDir, rel);
    // 防目录穿越
    if (!filePath.startsWith(this.staticDir)) return false;
    try {
      const stat = await fsp.stat(filePath);
      if (stat.isDirectory()) return false;
      res.setHeader('Content-Type', MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-cache');
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(filePath).pipe(res);
      await new Promise((ok) => res.on('finish', ok));
      return true;
    } catch {
      return false;
    }
  }
}

function decorateResponse(res) {
  res.json = (data, status = 200) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  };
  res.html = (html, status = 200) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  };
  res.text = (text, status = 200) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(text);
  };
}

/** 解析 JSON / 表单请求体 */
async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  const type = req.headers['content-type'] || '';
  if (type.includes('application/json')) {
    try { return JSON.parse(raw); } catch { throw new Error('请求体不是合法 JSON'); }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
  try { return JSON.parse(raw); } catch { return { _raw: raw }; }
}

module.exports = { App, readBody, MIME };
