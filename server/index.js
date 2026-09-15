/**
 * 寰宇新闻网 —— 服务入口
 *   PC 门户：http://localhost:3000
 *   广场栏目：http://localhost:3000/square.html（社交媒体式信息流）
 *   运营后台：http://localhost:3000/admin.html
 *   开放 API：http://localhost:3000/api/v1/...（供 App / 小程序 / 合作方调用）
 */
const path = require('path');
const { App, readBody } = require('./lib/http');
const { getSite } = require('./lib/config');
const portal = require('./lib/portal');
const svc = require('./lib/news-service');
const social = require('./lib/social-service');
const auth = require('./lib/auth');

const PORT = Number(process.env.PORT || 3000);
const app = new App({ staticDir: path.resolve(__dirname, '../public') });

/* ------------------------------ 通用工具 ------------------------------ */

function ok(res, data) {
  res.json({ code: 0, message: 'ok', data });
}

function fail(res, message, status = 400, code = 1) {
  res.json({ code, message, data: null }, status);
}

function int(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function clientId(req) {
  return String(req.query.uid || req.headers['x-client-id'] || 'anonymous').slice(0, 64);
}

/** SVG 占位图：离线环境下保证页面不出现破图 */
function placeholderSvg({ w = 800, h = 450, text = '寰宇新闻网', theme = 'blue' }) {
  const themes = {
    blue: ['#0f2f5f', '#1a5fa8', '#7fb6ea'],
    teal: ['#0c3b3a', '#0f766e', '#5eead4'],
    green: ['#14331d', '#166534', '#86efac'],
    amber: ['#3a2a08', '#b45309', '#fcd34d'],
    rose: ['#3a0b1d', '#be123c', '#fda4af'],
    purple: ['#25104a', '#6d28d9', '#c4b5fd'],
    slate: ['#1e293b', '#334155', '#94a3b8'],
    sky: ['#082f49', '#0369a1', '#7dd3fc'],
    indigo: ['#1e1b4b', '#4338ca', '#a5b4fc'],
    gold: ['#3a2f0b', '#a16207', '#fde68a'],
    orange: ['#3b1b06', '#c2410c', '#fdba74'],
    violet: ['#2a1055', '#7c3aed', '#d8b4fe'],
    cyan: ['#083344', '#0e7490', '#67e8f9']
  };
  const [c1, c2, c3] = themes[theme] || themes.blue;
  const size = Math.max(16, Math.min(64, Math.round(w / 14)));
  const label = String(text).slice(0, 18);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/><stop offset="60%" stop-color="${c2}"/><stop offset="100%" stop-color="${c3}"/>
    </linearGradient>
    <pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M0 40 L40 0" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <rect width="${w}" height="${h}" fill="url(#p)"/>
  <text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="middle"
    font-family="'Microsoft YaHei',system-ui,sans-serif" font-size="${size}" font-weight="700" fill="rgba(255,255,255,0.92)">${svc.escapeHtml(label)}</text>
  <text x="${w / 2}" y="${h / 2 + size * 1.3}" text-anchor="middle"
    font-family="system-ui,sans-serif" font-size="${Math.round(size * 0.42)}" fill="rgba(255,255,255,0.55)">HUANYU NEWS</text>
</svg>`;
}

/* ------------------------------ 站点与内容 API ------------------------------ */

app.get('/api/v1/site', (req, res) => ok(res, { ...getSite(), channels: portal.getChannels() }));

app.get('/api/v1/channels', (req, res) => ok(res, portal.getChannels()));

app.get('/api/v1/home', (req, res) => ok(res, portal.getHome()));

app.get('/api/v1/news', (req, res) => {
  const { channel, tag, keyword, page, pageSize, sort } = req.query;
  const size = int(pageSize, getSite().pageSize || 20);
  const pool = svc.sortPool(svc.listArticles({ channel, tag, keyword }), sort || 'new');
  ok(res, svc.paginate(pool, int(page, 1), size));
});

app.get('/api/v1/news/:id', (req, res) => {
  const article = svc.getArticle(req.params.id);
  if (!article) return fail(res, '稿件不存在', 404);
  svc.incrStat(req.params.id, 'views', 1);
  ok(res, { article, related: portal.getRelated(article, 6) });
});

app.get('/api/v1/news/:id/related', (req, res) => {
  const article = svc.news.findById(req.params.id);
  if (!article) return fail(res, '稿件不存在', 404);
  ok(res, portal.getRelated(article, int(req.query.size, 6)));
});

app.get('/api/v1/channel/:id', (req, res) => {
  const view = portal.getChannelView(req.params.id, {
    page: int(req.query.page, 1),
    pageSize: int(req.query.pageSize, getSite().pageSize || 20),
    sort: req.query.sort || 'new'
  });
  if (!view) return fail(res, '频道不存在', 404);
  ok(res, view);
});

app.get('/api/v1/video', (req, res) =>
  ok(res, portal.getVideoView({ page: int(req.query.page, 1), pageSize: int(req.query.pageSize, 12) }))
);

app.get('/api/v1/rank', (req, res) => {
  const type = req.query.type || 'hot';
  const size = int(req.query.size, 0) || undefined;
  const map = {
    hot: () => portal.getHotRank(size),
    blast: () => portal.getBlastRank(size),
    focus: () => portal.getFocus(size).map(svc.omitContent),
    headline: () => portal.getHeadlines(size || 8).map(svc.omitContent),
    tag: () => portal.getHotTags(size || 12)
  };
  if (!map[type]) return fail(res, '不支持的榜单类型');
  ok(res, { type, list: map[type]() });
});

app.get('/api/v1/tags', (req, res) => ok(res, portal.getHotTags(int(req.query.size, 12))));

app.get('/api/v1/search', (req, res) =>
  ok(res, portal.search(req.query.q || req.query.keyword || '', { page: int(req.query.page, 1), pageSize: int(req.query.pageSize, 20) }))
);

/* ------------------------------ 广场（社交媒体信息流） ------------------------------ */
/* 注意：以下固定路径必须注册在 /api/v1/square/:id 之前，否则会被当成动态 id 匹配走 */

app.get('/api/v1/square/trends', (req, res) =>
  ok(res, social.getTrends({ topicsSize: int(req.query.topics, 8), authorsSize: int(req.query.authors, 5), newsSize: int(req.query.news, 5) }))
);

app.get('/api/v1/square/topics', (req, res) => ok(res, social.getTopics(int(req.query.size, 20))));

app.get('/api/v1/square/assets', (req, res) => ok(res, social.getAssets(int(req.query.size, 12))));

app.get('/api/v1/square/mine', (req, res) => ok(res, social.getMySummary(clientId(req))));

app.post('/api/v1/square/follow', async (req, res) => {
  const body = await readBody(req);
  const result = social.toggleFollow(body.uid || clientId(req), body.handle);
  if (!result) return fail(res, '缺少要关注的账号');
  ok(res, result);
});

/** 信息流：sort = recommend | latest | hot | following，支持按话题 / 账号过滤 */
app.get('/api/v1/square', (req, res) =>
  ok(res, social.listFeed({
    sort: req.query.sort || 'recommend',
    cursor: int(req.query.cursor, 0),
    pageSize: int(req.query.pageSize, 12),
    uid: clientId(req),
    topic: req.query.topic || '',
    handle: req.query.handle || ''
  }))
);

app.post('/api/v1/square', async (req, res) => {
  const body = await readBody(req);
  try {
    ok(res, social.createPost({
      uid: body.uid || clientId(req),
      name: body.name,
      handle: body.handle,
      verified: body.verified,
      content: body.content,
      images: body.images,
      quoteId: body.quoteId
    }));
  } catch (e) {
    fail(res, e.message);
  }
});

app.get('/api/v1/square/:id', (req, res) => {
  const detail = social.getPost(req.params.id, { uid: clientId(req) });
  if (!detail) return fail(res, '动态不存在', 404);
  ok(res, detail);
});

app.post('/api/v1/square/replies/:id/like', (req, res) => {
  const reply = social.likeReply(req.params.id);
  if (!reply) return fail(res, '回复不存在', 404);
  ok(res, reply);
});

app.post('/api/v1/square/:id/replies', async (req, res) => {
  const body = await readBody(req);
  try {
    ok(res, social.addReply({
      postId: req.params.id,
      uid: body.uid || clientId(req),
      name: body.name,
      handle: body.handle,
      content: body.content
    }));
  } catch (e) {
    fail(res, e.message);
  }
});

/** 点赞 / 收藏 / 转发（重复调用即取消） */
['like', 'bookmark', 'repost'].forEach((type) => {
  app.post(`/api/v1/square/:id/${type}`, async (req, res) => {
    const body = await readBody(req);
    const uid = body.uid || clientId(req);
    const result = type === 'repost'
      ? social.toggleRepost({ postId: req.params.id, uid, name: body.name, handle: body.handle })
      : social.toggleReaction({ postId: req.params.id, uid, type });
    if (!result) return fail(res, '动态不存在', 404);
    ok(res, result);
  });
});

/* ------------------------------ 互动：评论 / 点赞 / 收藏 ------------------------------ */

app.get('/api/v1/comments', (req, res) => {
  const articleId = req.query.articleId || req.query.id;
  if (!articleId) return fail(res, '缺少 articleId');
  ok(res, svc.listComments(articleId, { page: int(req.query.page, 1), pageSize: int(req.query.pageSize, 20), sort: req.query.sort || 'new' }));
});

app.post('/api/v1/comments', async (req, res) => {
  const body = await readBody(req);
  if (!body.articleId) return fail(res, '缺少 articleId');
  if (!svc.news.findById(body.articleId)) return fail(res, '稿件不存在', 404);
  try {
    const comment = svc.addComment({ articleId: body.articleId, user: body.user, content: body.content });
    ok(res, comment);
  } catch (e) {
    fail(res, e.message);
  }
});

app.post('/api/v1/comments/:id/like', (req, res) => {
  const c = svc.likeComment(req.params.id);
  if (!c) return fail(res, '评论不存在', 404);
  ok(res, c);
});

app.post('/api/v1/interact', async (req, res) => {
  const body = await readBody(req);
  const { articleId, type } = body;
  if (!articleId || !svc.news.findById(articleId)) return fail(res, '稿件不存在', 404);
  if (!['like', 'fav', 'share'].includes(type)) return fail(res, '不支持的互动类型');
  if (type === 'share') {
    svc.incrStat(articleId, 'shares', 1);
    return ok(res, { active: true });
  }
  const result = svc.toggleInteraction({ articleId, userId: body.uid || clientId(req), type });
  const article = svc.news.findById(articleId);
  ok(res, { ...result, stats: article.stats });
});

/* ------------------------------ App / 小程序联动 ------------------------------ */

app.get('/api/v1/feed', (req, res) =>
  ok(res, portal.getFeed({
    channel: req.query.channel || '',
    cursor: int(req.query.cursor, 0),
    pageSize: int(req.query.pageSize, 20),
    sort: req.query.sort || 'recommend',
    userId: clientId(req)
  }))
);

app.get('/api/v1/sync', (req, res) =>
  ok(res, portal.getSync({ since: req.query.since || '', channel: req.query.channel || '', limit: int(req.query.limit, 100) }))
);

app.get('/api/v1/placeholder', (req, res) => {
  const svg = placeholderSvg({
    w: Math.min(2000, int(req.query.w, 800)),
    h: Math.min(2000, int(req.query.h, 450)),
    text: req.query.text || '寰宇新闻网',
    theme: req.query.theme || 'blue'
  });
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(svg);
});

/* ------------------------------ 运营后台 ------------------------------ */

app.post('/api/v1/admin/login', async (req, res) => {
  const body = await readBody(req);
  const acc = auth.verify(body.username, body.password);
  if (!acc) return fail(res, '账号或密码错误', 401, 'UNAUTHORIZED');
  ok(res, { token: auth.issueToken(acc), user: { name: acc.name, role: acc.role, username: acc.username } });
});

app.post('/api/v1/admin/logout', (req, res) => {
  const user = auth.parseAuth(req);
  if (user) auth.destroy(user.token);
  ok(res, true);
});

app.get('/api/v1/admin/me', (req, res) => {
  const user = auth.parseAuth(req);
  if (!user) return fail(res, '未登录或登录已过期', 401, 'UNAUTHORIZED');
  ok(res, { name: user.name, role: user.role, username: user.username });
});

app.get('/api/v1/admin/stats', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const all = svc.news.all();
  const day = 86400000;
  ok(res, {
    total: all.length,
    published: all.filter((a) => a.status === 'published').length,
    drafts: all.filter((a) => a.status !== 'published' && a.status !== 'deleted').length,
    todayNew: all.filter((a) => Date.now() - Date.parse(a.createdAt) < day).length,
    views: all.reduce((s, a) => s + (a.stats?.views || 0), 0),
    comments: svc.comments.all().length,
    channels: portal.getChannels().map((c) => ({
      id: c.id,
      name: c.name,
      count: all.filter((a) => a.channel === c.id && a.status === 'published').length
    })),
    hot: portal.getHotRank(8),
    blast: portal.getBlastRank(8),
    lastRefresh: new Date().toISOString()
  });
});

app.get('/api/v1/admin/news', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const pool = svc.sortPool(
    svc.listArticles({
      channel: req.query.channel,
      keyword: req.query.keyword,
      includeDrafts: true
    }).filter((a) => a.status !== 'deleted'),
    req.query.sort || 'new'
  );
  ok(res, svc.paginate(pool, int(req.query.page, 1), int(req.query.pageSize, 20)));
});

app.post('/api/v1/admin/news', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = await readBody(req);
  if (!body.title) return fail(res, '标题不能为空');
  const article = svc.createArticle(body);
  ok(res, article);
});

app.get('/api/v1/admin/news/:id', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const article = svc.news.findById(req.params.id);
  if (!article) return fail(res, '稿件不存在', 404);
  ok(res, article);
});

app.put('/api/v1/admin/news/:id', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = await readBody(req);
  const article = svc.updateArticle(req.params.id, body);
  if (!article) return fail(res, '稿件不存在', 404);
  ok(res, article);
});

app.delete('/api/v1/admin/news/:id', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  ok(res, svc.removeArticle(req.params.id));
});

app.post('/api/v1/admin/news/:id/publish', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const article = svc.updateArticle(req.params.id, { status: 'published', publishedAt: new Date().toISOString() });
  if (!article) return fail(res, '稿件不存在', 404);
  ok(res, article);
});

/** 一键刷新运营位（头条/热点/爆款/焦点） */
app.post('/api/v1/admin/refresh-ranks', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  ok(res, portal.refreshRanks());
});

/** 站点配置维护（品牌名、导航、运营位数量等） */
app.get('/api/v1/admin/site', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  ok(res, getSite());
});

app.put('/api/v1/admin/site', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = await readBody(req);
  const { site } = require('./lib/config');
  ok(res, site.patch(body));
});

/* ------------------------------ 页面别名 ------------------------------ */

app.get('/channel', (req, res) => {
  res.statusCode = 302;
  res.setHeader('Location', `/channel.html?id=${encodeURIComponent(req.query.id || 'china')}`);
  res.end();
});

app.get('/square', (req, res) => {
  res.statusCode = 302;
  res.setHeader('Location', '/square.html');
  res.end();
});

app.get('/admin', (req, res) => {
  res.statusCode = 302;
  res.setHeader('Location', '/admin.html');
  res.end();
});

/* ------------------------------ 启动 ------------------------------ */

async function bootstrap() {
  const server = await app.listen(PORT);
  const s = getSite();
  console.log(`\n  ${s.siteName} 已启动`);
  console.log(`  门户首页 ： http://localhost:${PORT}/`);
  console.log(`  广场栏目 ： http://localhost:${PORT}/square.html`);
  console.log(`  视频频道 ： http://localhost:${PORT}/video.html`);
  console.log(`  运营后台 ： http://localhost:${PORT}/admin.html`);
  console.log(`  开放 API ： http://localhost:${PORT}/api/v1/home\n`);
  return server;
}

if (require.main === module) {
  bootstrap();
}

module.exports = { app, bootstrap, placeholderSvg };
