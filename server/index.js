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
const mall = require('./lib/mall-service');
const pipeline = require('./lib/pipeline');
const image = require('./lib/image-service');

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

/** 填了未来时间且要发布的稿件，自动转为定时发布（到点由流水线转正式发布） */
function applySchedule(body = {}) {
  if (!body.scheduledAt) return body;
  const t = Date.parse(String(body.scheduledAt).replace(' ', 'T'));
  if (Number.isNaN(t)) return body;
  body.scheduledAt = new Date(t).toISOString();
  if (t > Date.now() && (body.status === 'published' || !body.status)) body.status = 'scheduled';
  return body;
}

/** 后台操作人（用于审核留痕） */
function actorOf(req) {
  return (req.user && (req.user.name || req.user.username)) || 'editor';
}

/* ------------------------------ 后台配图队列 ------------------------------ */

/**
 * 审核发布本身是秒级操作，配图下载却是分钟级（每张 15-60 秒）。
 * 旧实现把配图同步塞在审核请求里，批量通过 10 条要等 5~10 分钟，
 * 前端全程没有任何反馈，用户会以为"按钮点了没用"，然后反复点击。
 * 现在改为：审核结果立即返回，配图交给后台队列慢慢跑。
 */
const imageTask = { running: false, total: 0, filled: 0, failed: 0, startedAt: '', finishedAt: '', error: '' };
let imageQueue = [];        // 待审 id（发布后补图）
let articleImageQueue = []; // 稿件 id（已发布稿件的批量补图）

/** 每批处理的条数：一次吃下整个队列会让进程长时间高压（实测会把服务拖崩），按每轮上限切成小批 */
function imageChunkSize() {
  const n = Number(pipeline.getSettings().imagePerRun) || 12;
  return Math.max(1, Math.min(20, n));
}

function pendingImageCount() {
  return imageQueue.length + articleImageQueue.length;
}

/** 启动后台补图循环；已经在跑就只排队，不会开出第二个循环互相抢图 */
function startImageWorker() {
  if (imageTask.running) return false;
  imageTask.running = true;
  imageTask.startedAt = new Date().toISOString();
  imageTask.finishedAt = '';
  imageTask.error = '';
  (async () => {
    while (imageQueue.length || articleImageQueue.length) {
      const inboxBatch = imageQueue.splice(0, imageChunkSize());
      const articleBatch = articleImageQueue.splice(0, imageChunkSize());
      try {
        const r = await pipeline.ensureImages({ inboxIds: inboxBatch, articleIds: articleBatch });
        imageTask.filled += r.filled || 0;
        imageTask.failed += r.failed || 0;
        pipeline.flushAll(); // 每批落盘：万一进程中途异常，已经下好的图不会白跑
        console.log(`  [配图] 本批完成：成功 ${r.filled || 0} 张 / 失败 ${r.failed || 0} 张，剩余 ${pendingImageCount()} 条`);
      } catch (e) {
        imageTask.error = e.message;
        console.error('  [配图] 本批失败：', e.message);
      }
    }
    imageTask.running = false;
    imageTask.finishedAt = new Date().toISOString();
    console.log(`  [配图] 后台任务完成：成功 ${imageTask.filled} 张 / 失败 ${imageTask.failed} 张`);
  })();
  return true;
}

function queueImages(inboxIds = []) {
  const list = [...new Set(inboxIds.filter(Boolean))];
  if (!list.length) return null;
  imageQueue = [...new Set([...imageQueue, ...list])];
  imageTask.total += list.length;
  startImageWorker();
  return { queued: list.length, pending: pendingImageCount() };
}

/** 已发布稿件缺图时的补图队列（后台「一键补图」等批量场景） */
function queueArticleImages(articleIds = []) {
  const list = [...new Set(articleIds.filter(Boolean))];
  if (!list.length) return null;
  articleImageQueue = [...new Set([...articleImageQueue, ...list])];
  imageTask.total += list.length;
  startImageWorker();
  return { queued: list.length, pending: pendingImageCount() };
}

/**
 * 本机服务常年无人值守，进程一旦被异常拖死就只剩"后台打不开"这一个现象，无从查起。
 * 这里把所有未捕获异常与未处理拒绝写进 logs/server-error.log，并尽量让服务继续活着。
 */
function logCrash(tag, err) {
  const line = `[${new Date().toISOString()}] ${tag}: ${err && err.stack ? err.stack : err}\n`;
  console.error(line.trim());
  try {
    const fs = require('fs');
    const dir = path.resolve(__dirname, '../logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'server-error.log'), line, 'utf8');
  } catch {
    // 日志都写不了的时候，至少不能再崩一次
  }
}

process.on('uncaughtException', (e) => logCrash('uncaughtException', e));
process.on('unhandledRejection', (e) => logCrash('unhandledRejection', e));

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

/* ------------------------------ 寰宇严选（商城） ------------------------------ */
/* 注意：固定路径必须注册在 /api/v1/mall/:id 之前，否则会被动态 id 抢匹配 */

app.get('/api/v1/mall/home', (req, res) => ok(res, mall.getHome()));

app.get('/api/v1/mall/categories', (req, res) => ok(res, mall.listCategories()));

app.get('/api/v1/mall/seckill', (req, res) => ok(res, mall.getSeckill(int(req.query.size, 4))));

app.get('/api/v1/mall/orders', (req, res) => ok(res, mall.listOrders(clientId(req))));

app.post('/api/v1/mall/orders', async (req, res) => {
  const body = await readBody(req);
  try {
    ok(res, mall.createOrder({ uid: body.uid || clientId(req), items: body.items || [], receiver: body.receiver, remark: body.remark }));
  } catch (e) {
    fail(res, e.message);
  }
});

app.get('/api/v1/mall/products', (req, res) =>
  ok(res, mall.listProducts({
    category: req.query.category || '',
    keyword: req.query.keyword || req.query.q || '',
    tag: req.query.tag || '',
    sort: req.query.sort || 'recommend',
    page: int(req.query.page, 1),
    pageSize: int(req.query.pageSize, 12)
  }))
);

app.get('/api/v1/mall/:id', (req, res) => {
  const detail = mall.getProduct(req.params.id);
  if (!detail) return fail(res, '商品不存在', 404);
  ok(res, detail);
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
  let pool = svc.sortPool(
    svc.listArticles({
      channel: req.query.channel,
      keyword: req.query.keyword,
      includeDrafts: true
    }).filter((a) => a.status !== 'deleted'),
    req.query.sort || 'new'
  );
  if (req.query.status) pool = pool.filter((a) => a.status === req.query.status);
  if (req.query.origin) pool = pool.filter((a) => (a.origin || 'manual') === req.query.origin);
  ok(res, svc.paginate(pool, int(req.query.page, 1), int(req.query.pageSize, 20)));
});

app.post('/api/v1/admin/news', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = applySchedule(await readBody(req));
  if (!body.title) return fail(res, '标题不能为空');
  const article = svc.createArticle({ ...body, origin: body.origin || 'manual' });
  svc.news.flush();
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
  const body = applySchedule(await readBody(req));
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

/* ------------------------------ 内容流水线：采集 / 审核 / 自动发布 ------------------------------ */

/** 通用数组分页（待审池、动态、评论等非稿件列表） */
function paginateList(list, page = 1, pageSize = 20) {
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const start = (p - 1) * size;
  return {
    list: list.slice(start, start + size),
    pagination: { page: p, pageSize: size, total: list.length, totalPages: Math.max(1, Math.ceil(list.length / size)) }
  };
}

/** 流水线总览：待审池 / 稿件 / 采集源 / 运行状态 */
app.get('/api/v1/admin/pipeline', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  ok(res, pipeline.stats());
});

app.get('/api/v1/admin/pipeline/settings', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  ok(res, pipeline.getSettings());
});

app.put('/api/v1/admin/pipeline/settings', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = await readBody(req);
  const next = { ...body };
  ['minScore', 'autoPublishScore', 'maxPublishPerRun', 'maxAgeHours', 'minTitleLen', 'minContentLen', 'headlineTopN', 'focusTopN']
    .forEach((k) => { if (next[k] != null) next[k] = Number(next[k]); });
  ['blockKeywords', 'boostKeywords'].forEach((k) => {
    if (typeof next[k] === 'string') next[k] = next[k].split(/[,，\n]/).map((s) => s.trim()).filter(Boolean);
  });
  ok(res, pipeline.patchSettings(next));
});

/** 采集进度：前端靠它锁按钮、显示"正在下载配图 3/12" */
app.get('/api/v1/admin/pipeline/status', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  ok(res, pipeline.collectStatus());
});

/** 立即采集：可限定源与条数（内容与配图一起跑完才返回，跑完前拒绝再跑一轮） */
app.post('/api/v1/admin/pipeline/collect', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = await readBody(req);
  try {
    const run = await pipeline.runCollect({
      trigger: 'manual',
      limit: int(body.limit, 0),
      sourceIds: Array.isArray(body.sourceIds) && body.sourceIds.length ? body.sourceIds : null,
      by: actorOf(req)
    });
    ok(res, run);
  } catch (e) {
    // 上一轮还没跑完时用 409，前端据此把按钮继续锁住而不是弹一个莫名的失败
    if (/还没跑完/.test(e.message)) return fail(res, e.message, 409);
    fail(res, e.message);
  }
});

/** 给单条待审内容补图（走完整路径：原文图 → 原文页 → 图库检索，慢但尽量配上） */
app.post('/api/v1/admin/inbox/:id/image', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = await readBody(req);
  const item = pipeline.inbox.findById(req.params.id);
  if (!item) return fail(res, '内容不存在', 404);
  try {
    const r = await image.ensureInboxImages(item, {
      proxy: pipeline.getSettings().proxy || '',
      force: true,
      query: body.query || '',
      fast: false
    });
    if (!r.ok) return fail(res, r.why || '没找到合适的配图');
    pipeline.inbox.update(item.id, { cover: r.url });
    pipeline.inbox.flush();
    ok(res, { cover: r.url, from: r.from, kind: r.kind, size: r.size });
  } catch (e) {
    fail(res, e.message);
  }
});

/** 对池中待审内容按当前规则重跑一次自动审核 */
app.post('/api/v1/admin/pipeline/auto-review', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = await readBody(req);
  try {
    ok(res, await pipeline.autoReviewPending({ by: actorOf(req), publish: body.publish !== false }));
  } catch (e) {
    fail(res, e.message);
  }
});

/** 把到点的定时内容发布出去 */
app.post('/api/v1/admin/pipeline/publish-due', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  try {
    ok(res, await pipeline.publishDue({ by: actorOf(req) }));
  } catch (e) {
    fail(res, e.message);
  }
});

/** 手动跑一次"每日任务"：采集 + 审核 + 到点发布 + 刷榜 */
app.post('/api/v1/admin/pipeline/daily', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  try {
    ok(res, await pipeline.runDailyJob({ trigger: 'manual', by: actorOf(req) }));
  } catch (e) {
    fail(res, e.message);
  }
});

/* ------------------------------ 待审池 ------------------------------ */

app.get('/api/v1/admin/inbox', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  ok(res, pipeline.listInbox({
    status: req.query.status || '',
    channel: req.query.channel || '',
    source: req.query.source || '',
    keyword: req.query.keyword || '',
    sort: req.query.sort || 'score',
    page: int(req.query.page, 1),
    pageSize: int(req.query.pageSize, 20)
  }));
});

app.get('/api/v1/admin/inbox/:id', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const item = pipeline.inbox.findById(req.params.id);
  if (!item) return fail(res, '内容不存在', 404);
  ok(res, item);
});

/** 编辑待审内容（标题 / 摘要 / 频道 / 标签）后再审核 */
app.put('/api/v1/admin/inbox/:id', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const item = pipeline.inbox.findById(req.params.id);
  if (!item) return fail(res, '内容不存在', 404);
  const body = await readBody(req);
  const patch = {};
  ['title', 'summary', 'channel', 'author'].forEach((k) => { if (body[k] != null) patch[k] = body[k]; });
  if (body.tags != null) patch.tags = Array.isArray(body.tags) ? body.tags : String(body.tags).split(/[,，\s]+/).filter(Boolean);
  if (Array.isArray(body.content)) patch.content = body.content;
  pipeline.inbox.update(req.params.id, patch);
  pipeline.flushAll();
  ok(res, pipeline.inbox.findById(req.params.id));
});

/** 审核通过：publish=true 立即发布，publishAt 定时发布，publish=false 仅标记通过 */
app.post('/api/v1/admin/inbox/:id/approve', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = await readBody(req);
  try {
    const result = pipeline.approve(req.params.id, {
      by: actorOf(req),
      publish: body.publish !== false,
      publishAt: body.publishAt || '',
      patch: body.patch || null
    });
    if (!result) return fail(res, '内容不存在', 404);
    if (result.already) return fail(res, '该内容已发布过，无需重复发布');
    // 配图放后台跑（原文配图优先，其余走图库检索并全站去重），审核结果立即返回
    if (result.article) result.imagesQueued = queueImages([req.params.id]);
    ok(res, result);
  } catch (e) {
    fail(res, e.message);
  }
});

app.post('/api/v1/admin/inbox/:id/reject', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = await readBody(req);
  const row = pipeline.reject(req.params.id, { by: actorOf(req), reason: body.reason || '' });
  if (!row) return fail(res, '内容不存在', 404);
  ok(res, row);
});

/** 批量处理：approve / approve-draft / reject / delete */
app.post('/api/v1/admin/inbox/batch', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = await readBody(req);
  if (!Array.isArray(body.ids) || !body.ids.length) return fail(res, '请选择要处理的内容');
  const result = pipeline.batch(body.ids, { action: body.action || 'approve', by: actorOf(req), reason: body.reason || '' });
  // 只把真正发布成功的条目丢进配图队列；结果立即返回，不再阻塞几分钟
  if (result.articleIds && result.articleIds.length) {
    result.imagesQueued = queueImages(result.publishedIds || []);
  }
  ok(res, result);
});

/** 按筛选条件批量处理：待审池几百条时，用它"发掉最高分的 N 条"或"清掉低分的那一堆" */
app.post('/api/v1/admin/inbox/batch-by-filter', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = await readBody(req);
  const action = String(body.action || 'approve');
  try {
    const result = pipeline.batchByFilter(
      {
        status: body.status || 'pending',
        channel: body.channel || '',
        keyword: body.keyword || '',
        sort: body.sort || 'score',
        minScore: Number(body.minScore) || 0,
        maxScore: Number(body.maxScore) || 0
      },
      { action, by: actorOf(req), reason: body.reason || '', limit: int(body.limit, 20) }
    );
    if (result.publishedIds && result.publishedIds.length) {
      result.imagesQueued = queueImages(result.publishedIds);
    }
    ok(res, result);
  } catch (e) {
    fail(res, e.message);
  }
});

app.delete('/api/v1/admin/inbox/:id', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  if (!pipeline.inbox.findById(req.params.id)) return fail(res, '内容不存在', 404);
  pipeline.inbox.remove(req.params.id);
  pipeline.flushAll();
  ok(res, true);
});

/* ------------------------------ 采集源管理 ------------------------------ */

app.get('/api/v1/admin/sources', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  ok(res, pipeline.listSources());
});

app.post('/api/v1/admin/sources', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = await readBody(req);
  try {
    ok(res, pipeline.createSource(body));
  } catch (e) {
    fail(res, e.message);
  }
});

app.put('/api/v1/admin/sources/:id', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = await readBody(req);
  const row = pipeline.updateSource(req.params.id, body);
  if (!row) return fail(res, '采集源不存在', 404);
  ok(res, row);
});

app.delete('/api/v1/admin/sources/:id', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  if (!pipeline.removeSource(req.params.id)) return fail(res, '采集源不存在', 404);
  ok(res, true);
});

/** 测试源可用性（只抓不入库） */
app.post('/api/v1/admin/sources/:id/test', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  try {
    ok(res, await pipeline.testSourceById(req.params.id));
  } catch (e) {
    fail(res, e.message, 404);
  }
});

/** 单源立即采集 */
app.post('/api/v1/admin/sources/:id/collect', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = await readBody(req);
  try {
    ok(res, await pipeline.runCollect({ trigger: 'manual', sourceIds: [req.params.id], limit: int(body.limit, 0), by: actorOf(req) }));
  } catch (e) {
    if (/还没跑完/.test(e.message)) return fail(res, e.message, 409);
    fail(res, e.message);
  }
});

/* ------------------------------ 任务运行日志 ------------------------------ */

app.get('/api/v1/admin/runs', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  ok(res, pipeline.listRuns({ limit: int(req.query.limit, 20) }));
});

/* ------------------------------ 图片库（配图下载与管理） ------------------------------ */

/** 图库总览 + 分页列表：关键字、使用状态（used / orphan） */
app.get('/api/v1/admin/images', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  try {
    const list = image.listImages({
      keyword: req.query.keyword || '',
      usage: req.query.usage || 'all',
      page: int(req.query.page, 1),
      pageSize: int(req.query.pageSize, 24)
    });
    ok(res, { ...list, stats: image.stats(), missing: image.missingArticles().slice(0, 100) });
  } catch (e) {
    fail(res, e.message);
  }
});

/** 重复配图检测（感知哈希两两比对，返回重复对） */
app.get('/api/v1/admin/images/duplicates', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  try {
    const pairs = image.duplicatePairs();
    ok(res, { pairs, total: pairs.length });
  } catch (e) {
    fail(res, e.message);
  }
});

/** 为一篇稿件重新配图：可指定检索词或直接给图片直链 */
app.post('/api/v1/admin/images/fetch', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = await readBody(req);
  const article = body.articleId ? svc.news.findById(body.articleId) : null;
  if (!article) return fail(res, '稿件不存在', 404);
  try {
    const r = await image.ensureArticleImages(article, {
      proxy: pipeline.getSettings().proxy || '',
      force: true,
      sourceImage: body.url || '',
      query: body.query || '',
      maxSlots: int(body.maxSlots, 2)
    });
    svc.news.flush();
    ok(res, { article: svc.news.findById(article.id), ...r });
  } catch (e) {
    fail(res, e.message);
  }
});

/** 批量补图：缺封面的稿件自动配图 */
app.post('/api/v1/admin/images/fill', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = await readBody(req);
  const limit = int(body.limit, 8);
  const ids = Array.isArray(body.ids) ? body.ids : [];
  try {
    // 大批量补图改走后台队列：同步下几十张要挂十几分钟，中途出事还会前功尽弃
    if (!ids.length && limit > 12 && body.async !== false) {
      const queued = image.missingArticles().slice(0, limit).map((a) => a.id);
      if (!queued.length) return ok(res, { checked: 0, filled: 0, failed: 0, queued: 0 });
      const q = queueArticleImages(queued);
      return ok(res, { checked: 0, filled: 0, failed: 0, queued: q.queued, pending: q.pending });
    }
    const r = await image.fillMissing({
      limit,
      ids,
      proxy: pipeline.getSettings().proxy || '',
      force: !!body.force,
      maxSlots: int(body.maxSlots, 2)
    });
    svc.news.flush();
    ok(res, r);
  } catch (e) {
    fail(res, e.message);
  }
});

/** 补图任务进度：批量发布后据此判断"图下到哪了" */
app.get('/api/v1/admin/images/status', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  ok(res, { ...imageTask, pending: pendingImageCount() });
});

/** 删除未被任何栏目引用的图片（被引用的会被拒绝，避免前台破图） */
app.delete('/api/v1/admin/images/:file', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const r = image.removeImage(req.params.file);
  if (!r.ok) return fail(res, r.why);
  ok(res, true);
});

/** 重建全站图片指纹库 */
app.post('/api/v1/admin/images/rebuild', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  try {
    ok(res, image.rebuildFingerprints());
  } catch (e) {
    fail(res, e.message);
  }
});

/* ------------------------------ 广场与评论 ------------------------------ */

app.get('/api/v1/admin/posts', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const keyword = String(req.query.keyword || '').toLowerCase();
  let pool = social.posts.all().slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (keyword) {
    pool = pool.filter((p) => String(p.content || '').toLowerCase().includes(keyword)
      || String((p.author && p.author.name) || '').toLowerCase().includes(keyword));
  }
  ok(res, paginateList(pool, int(req.query.page, 1), int(req.query.pageSize, 20)));
});

app.post('/api/v1/admin/posts/:id/pin', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const post = social.posts.findById(req.params.id);
  if (!post) return fail(res, '动态不存在', 404);
  social.posts.update(post.id, { pinned: !post.pinned });
  social.posts.flush();
  ok(res, social.posts.findById(post.id));
});

app.delete('/api/v1/admin/posts/:id', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  if (!social.posts.findById(req.params.id)) return fail(res, '动态不存在', 404);
  social.removePost(req.params.id);
  social.posts.flush();
  ok(res, true);
});

app.get('/api/v1/admin/comments', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const keyword = String(req.query.keyword || '').toLowerCase();
  let pool = svc.comments.all().slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (keyword) {
    pool = pool.filter((c) => String(c.content || '').toLowerCase().includes(keyword) || String(c.user || '').toLowerCase().includes(keyword));
  }
  const page = paginateList(pool, int(req.query.page, 1), int(req.query.pageSize, 20));
  page.list = page.list.map((c) => {
    const article = svc.news.findById(c.articleId);
    return { ...c, articleTitle: article ? article.title : '（稿件已删除）' };
  });
  ok(res, page);
});

app.delete('/api/v1/admin/comments/:id', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  if (!svc.removeComment(req.params.id)) return fail(res, '评论不存在', 404);
  svc.comments.flush();
  ok(res, true);
});

/* ------------------------------ 账号与权限 ------------------------------ */

function safeAccount(a) {
  const { salt, password, ...rest } = a;
  return rest;
}

app.get('/api/v1/admin/accounts', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  ok(res, auth.accounts.all().map(safeAccount));
});

app.post('/api/v1/admin/accounts', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = await readBody(req);
  if (!body.username || !body.password) return fail(res, '请填写账号与密码');
  const acc = auth.createAccount({
    username: body.username,
    password: body.password,
    name: body.name || body.username,
    role: body.role || 'editor'
  });
  if (!acc) return fail(res, '账号已存在');
  auth.accounts.flush();
  ok(res, safeAccount(acc));
});

app.put('/api/v1/admin/accounts/:id', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const acc = auth.accounts.findById(req.params.id);
  if (!acc) return fail(res, '账号不存在', 404);
  const body = await readBody(req);
  const patch = {};
  if (body.name) patch.name = body.name;
  if (body.role) patch.role = body.role;
  if (body.status) patch.status = body.status;
  if (body.password) patch.password = auth.hashPassword(body.password, acc.salt);
  auth.accounts.update(acc.id, patch);
  auth.accounts.flush();
  ok(res, safeAccount(auth.accounts.findById(acc.id)));
});

app.delete('/api/v1/admin/accounts/:id', (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  if (req.params.id === req.user.userId) return fail(res, '不能删除当前登录的账号');
  if (!auth.accounts.findById(req.params.id)) return fail(res, '账号不存在', 404);
  auth.accounts.remove(req.params.id);
  auth.accounts.flush();
  ok(res, true);
});

app.post('/api/v1/admin/password', async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const body = await readBody(req);
  const acc = auth.accounts.findById(req.user.userId);
  if (!acc) return fail(res, '账号不存在', 404);
  if (auth.hashPassword(body.oldPassword || '', acc.salt) !== acc.password) return fail(res, '原密码不正确');
  if (!body.newPassword) return fail(res, '请填写新密码');
  auth.accounts.update(acc.id, { password: auth.hashPassword(body.newPassword, acc.salt) });
  auth.accounts.flush();
  ok(res, true);
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

app.get('/mall', (req, res) => {
  res.statusCode = 302;
  res.setHeader('Location', '/mall.html');
  res.end();
});

/* ------------------------------ 启动 ------------------------------ */

async function bootstrap() {
  const server = await app.listen(PORT);
  const s = getSite();
  const cfg = pipeline.getSettings();
  pipeline.startScheduler();
  console.log(`\n  ${s.siteName} 已启动`);
  console.log(`  门户首页 ： http://localhost:${PORT}/`);
  console.log(`  广场栏目 ： http://localhost:${PORT}/square.html`);
  console.log(`  视频频道 ： http://localhost:${PORT}/video.html`);
  console.log(`  寰宇严选 ： http://localhost:${PORT}/mall.html`);
  console.log(`  运营后台 ： http://localhost:${PORT}/admin.html`);
  console.log(`  开放 API ： http://localhost:${PORT}/api/v1/home`);
  console.log(`  内容流水线：${cfg.enabled
    ? `已开启，每日 ${(cfg.schedule.times || []).join(' / ')} 自动采集 → 审核 → 发布`
    : '已关闭（可在后台 自动化规则 中开启）'}\n`);
  // 被 kill（Ctrl+C / 关窗口）时先落盘，避免内存里还没写文件的改动丢掉
  const shutdown = () => { try { pipeline.flushAll(); } catch { /* ignore */ } process.exit(0); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}

if (require.main === module) {
  bootstrap();
}

module.exports = { app, bootstrap, placeholderSvg };
