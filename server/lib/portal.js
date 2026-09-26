/**
 * 门户聚合层 —— 首页 / 频道页 / 榜单 / App 信息流 / 增量同步
 */
const svc = require('./news-service');
const { getSite, getChannel, getChannelName, CHANNELS } = require('./config');

/** 头条：人工编排优先，不足时用热度补齐 */
function getHeadlines(size = 8, excludeIds = []) {
  const pool = svc.listArticles().filter((a) => !excludeIds.includes(a.id));
  const manual = pool.filter((a) => a.flags && a.flags.headline)
    .sort((a, b) => (a.flags.headlineOrder || 0) - (b.flags.headlineOrder || 0) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  if (manual.length >= size) return manual.slice(0, size);
  const rest = pool.filter((a) => !manual.includes(a))
    .sort((a, b) => svc.hotScore(b) - svc.hotScore(a));
  return [...manual, ...rest].slice(0, size);
}

/** 热点榜 */
function getHotRank(size = null) {
  const s = getSite();
  const n = size || s.hotSize || 10;
  return svc.listArticles()
    .sort((a, b) => svc.hotScore(b) - svc.hotScore(a))
    .slice(0, n)
    .map((a, i) => ({ ...svc.omitContent(a), rank: i + 1, hotScore: Number(svc.hotScore(a).toFixed(1)) }));
}

/** 爆款榜（增速） */
function getBlastRank(size = null) {
  const s = getSite();
  const n = size || s.blastSize || 10;
  return svc.listArticles()
    .map((a) => ({ a, score: svc.blastScore(a) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, n)
    .map((x, i) => ({ ...svc.omitContent(x.a), rank: i + 1, blastScore: Number(x.score.toFixed(1)) }));
}

/** 焦点：编辑精选专题 */
function getFocus(size = null) {
  const s = getSite();
  const n = size || s.focusSize || 6;
  const marked = svc.listArticles({ flag: 'focus' });
  if (marked.length >= n) return marked.slice(0, n);
  const rest = svc.listArticles()
    .filter((a) => !marked.includes(a))
    .sort((a, b) => ((b.flags && b.flags.recommend) || 0) - ((a.flags && a.flags.recommend) || 0) || svc.hotScore(b) - svc.hotScore(a));
  return [...marked, ...rest].slice(0, n);
}

/** 视频精选 */
function getVideos(size = 8) {
  return svc.listArticles()
    .filter((a) => a.video || (a.content || []).some((b) => b.type === 'video'))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, size)
    .map((a) => {
      const item = svc.omitContent(a);
      const block = (a.content || []).find((b) => b.type === 'video');
      item.video = a.video || (block ? { src: block.src, kind: block.kind || 'mp4', poster: block.poster || a.cover, duration: block.duration || '' } : null);
      return item;
    });
}

/** 热门话题标签 */
function getHotTags(size = 12) {
  const counter = new Map();
  svc.listArticles().forEach((a) => {
    (a.tags || []).forEach((t) => {
      const key = String(t).trim();
      if (!key) return;
      const prev = counter.get(key) || { name: key, count: 0, heat: 0 };
      prev.count += 1;
      prev.heat += svc.hotScore(a);
      counter.set(key, prev);
    });
  });
  return [...counter.values()]
    .sort((a, b) => b.heat - a.heat || b.count - a.count)
    .slice(0, size)
    .map((t) => ({ name: t.name, count: t.count, heat: Number(t.heat.toFixed(1)) }));
}

function getChannels() {
  return CHANNELS.filter((c) => c.show !== false).map((c) => ({
    ...c,
    count: svc.listArticles({ channel: c.id }).length
  }));
}

/** 首页聚合 */
function getHome() {
  const s = getSite();
  const headlines = getHeadlines(9);
  const exclude = headlines.map((a) => a.id);
  const channelSize = s.homeChannelSize || 5;

  const channelBlocks = getChannels()
    .filter((c) => c.id !== 'video')
    .map((c) => {
      const items = svc.listArticles({ channel: c.id })
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
        .slice(0, channelSize + 1);
      if (!items.length) return null;
      const slim = items.map(svc.omitContent);
      return { channel: c, lead: slim[0], list: slim.slice(1, channelSize + 1) };
    })
    .filter(Boolean);

  return {
    site: s,
    generatedAt: new Date().toISOString(),
    headlines: { lead: headlines[0] ? svc.omitContent(headlines[0]) : null, list: headlines.slice(1, 6).map(svc.omitContent), slider: headlines.slice(0, 5).map(svc.omitContent) },
    latest: svc.listArticles().sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 8).map(svc.omitContent),
    hot: getHotRank(),
    blast: getBlastRank(),
    focus: getFocus().map(svc.omitContent),
    videos: getVideos(6),
    pictures: svc.listArticles()
      .filter((a) => (a.gallery || []).length || (a.content || []).filter((b) => b.type === 'image').length)
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, 6)
      .map(svc.omitContent),
    tags: getHotTags(12),
    channels: getChannels(),
    exclude: { usedIds: exclude.slice(0, 12) },
    stats: {
      total: svc.news.count((a) => a.status === 'published'),
      today: svc.news.all().filter((a) => a.status === 'published' && Date.now() - Date.parse(a.publishedAt) < 86400000).length,
      channels: getChannels().length
    }
  };
}

/** 频道页 */
function getChannelView(channelId, { page = 1, pageSize = 20, sort = 'new' } = {}) {
  const channel = getChannel(channelId);
  if (!channel) return null;
  const pool = svc.sortPool(svc.listArticles({ channel: channelId }), sort);
  const pageData = svc.paginate(pool, page, pageSize);
  return {
    channel,
    ...pageData,
    headline: getHeadlines(5).map(svc.omitContent),
    hot: getHotRank(10),
    recommend: svc.sortPool(svc.listArticles({ channel: channelId }), 'hot').slice(0, 6).map(svc.omitContent)
  };
}

/** 视频频道页 */
function getVideoView({ page = 1, pageSize = 12 } = {}) {
  const all = getVideos(200);
  const start = (Math.max(1, Number(page) || 1) - 1) * (Number(pageSize) || 12);
  return {
    channel: getChannel('video'),
    list: all.slice(start, start + (Number(pageSize) || 12)),
    hot: getHotRank(10)
  };
}

/* --------------------- AI 前沿技术瞭望台 --------------------- */

/**
 * 瞭望台的四条观察赛道。
 * 稿件本身只带 channel=ai，不额外维护赛道字段 —— 靠关键词把内容分到赛道，
 * 新增稿件无需人工归类，栏目也不会因为某个赛道暂时没稿而报错。
 */
const AI_TRACKS = [
  {
    id: 'model',
    name: '大模型与算法',
    desc: '基座模型、推理与训练范式的每一次跃迁',
    keywords: ['大模型', '基座模型', '多模态', '生成式', '推理模型', '预训练', '微调', '开源模型', '参数',
      '人工智能', '机器学习', '深度学习', '神经网络', '算法', '模型', 'llm', 'gpt', 'bert', 'nlp', 'openai', 'transformer', 'diffusion']
  },
  {
    id: 'compute',
    name: '算力与芯片',
    desc: 'GPU、HBM 与数据中心背后的硬供给',
    keywords: ['算力', '芯片', 'gpu', '显卡', '晶圆', '半导体', '数据中心', '智算', 'hbm', 'cuda', '英伟达', '光刻', '服务器']
  },
  {
    id: 'agent',
    name: '智能体与应用',
    desc: '从对话框走向真实工作流的落地现场',
    keywords: ['智能体', 'agent', '应用', '落地', '助手', 'copilot', '机器人', '具身', '编程', '办公', '客服', '自动驾驶', '数字人', '生产力']
  },
  {
    id: 'governance',
    name: '治理与产业',
    desc: '监管、资本与产业格局的走向',
    keywords: ['监管', '政策', '安全', '伦理', '合规', '标准', '版权', '治理', '产业', '融资', '估值', '上市', '法案', '备案', '开源协议']
  }
];

/** 稿件与某条赛道的匹配度：命中关键词越多越靠前；未命中返回 0 */
function aiTrackScore(a, track) {
  const text = [a.title, a.summary, (a.tags || []).join(' '), a.source].filter(Boolean).join(' ').toLowerCase();
  if (!text) return 0;
  let score = 0;
  track.keywords.forEach((k) => {
    const key = String(k).toLowerCase();
    if (!key) return;
    // 标题命中的权重高于摘要：标题才是这条稿真正讲的事
    if (String(a.title || '').toLowerCase().includes(key)) score += 2;
    else if (text.includes(key)) score += 1;
  });
  return score;
}

function dayKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** AI 前沿技术瞭望台栏目页聚合 */
function getAiView({ page = 1, pageSize = 12 } = {}) {
  const channel = getChannel('ai');
  if (!channel) return null;
  const all = svc.listArticles({ channel: 'ai' });
  const byNew = all.slice().sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
  const byHot = all.slice().sort((a, b) => svc.hotScore(b) - svc.hotScore(a));

  const tracks = AI_TRACKS
    .map((t) => ({
      id: t.id,
      name: t.name,
      desc: t.desc,
      list: all
        .map((a) => ({ a, s: aiTrackScore(a, t) }))
        .filter((x) => x.s > 0)
        .sort((x, y) => y.s - x.s || Date.parse(y.a.publishedAt || 0) - Date.parse(x.a.publishedAt || 0))
        .slice(0, 4)
        .map((x) => svc.omitContent(x.a))
    }))
    .filter((t) => t.list.length);

  const groups = new Map();
  byNew.slice(0, 30).forEach((a) => {
    const key = dayKey(a.publishedAt);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(svc.omitContent(a));
  });

  const counter = new Map();
  all.forEach((a) => (a.tags || []).forEach((t) => {
    const key = String(t).trim();
    if (!key) return;
    const prev = counter.get(key) || { name: key, count: 0, heat: 0 };
    prev.count += 1;
    prev.heat += svc.hotScore(a);
    counter.set(key, prev);
  }));

  const week = 7 * 86400000;
  return {
    channel,
    lead: byHot[0] ? svc.omitContent(byHot[0]) : null,
    tracks,
    timeline: [...groups.entries()].slice(0, 7).map(([date, items]) => ({ date, items })),
    tags: [...counter.values()].sort((a, b) => b.heat - a.heat || b.count - a.count).slice(0, 12)
      .map((t) => ({ name: t.name, count: t.count, heat: Number(t.heat.toFixed(1)) })),
    hot: byHot.slice(0, 10).map((a, i) => ({ ...svc.omitContent(a), rank: i + 1, hotScore: Number(svc.hotScore(a).toFixed(1)) })),
    ...svc.paginate(byNew, page, pageSize),
    stats: {
      total: all.length,
      today: all.filter((a) => Date.now() - Date.parse(a.publishedAt || 0) < 86400000).length,
      week: all.filter((a) => Date.now() - Date.parse(a.publishedAt || 0) < week).length,
      tracks: tracks.length,
      updatedAt: new Date().toISOString()
    }
  };
}

/** 搜索 */
function search(q, { page = 1, pageSize = 20 } = {}) {
  const keyword = String(q || '').trim();
  if (!keyword) return { keyword, list: [], pagination: { page: 1, pageSize, total: 0, totalPages: 1 }, hot: getHotRank(10) };
  const pool = svc.listArticles({ keyword });
  const scored = pool.sort((a, b) => svc.hotScore(b) - svc.hotScore(a));
  return {
    keyword,
    ...svc.paginate(scored, page, pageSize),
    hot: getHotRank(10),
    relatedTags: aggregateTags(pool, 8)
  };
}

function aggregateTags(pool, size = 8) {
  const counter = new Map();
  pool.forEach((a) => (a.tags || []).forEach((t) => counter.set(t, (counter.get(t) || 0) + 1)));
  return [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, size).map(([name, count]) => ({ name, count }));
}

/** 相关文章：同频道优先 + 标签加权 */
function getRelated(article, size = 6) {
  if (!article) return [];
  const pool = svc.listArticles().filter((a) => a.id !== article.id);
  const scored = pool.map((a) => {
    let score = 0;
    if (a.channel === article.channel) score += 5;
    (a.tags || []).forEach((t) => { if ((article.tags || []).includes(t)) score += 3; });
    if (Date.now() - Date.parse(a.publishedAt) < 172800000) score += 2;
    score += Math.min(5, svc.hotScore(a) / 50);
    return { a, score };
  }).sort((x, y) => y.score - x.score);
  return scored.slice(0, size).map((x) => svc.omitContent(x.a));
}

/* --------------------- App 联动：统一信息流与增量同步 --------------------- */

function getFeed({ channel = '', cursor = 0, pageSize = 20, userId = 'anonymous', sort = 'recommend' } = {}) {
  const pool = svc.sortPool(svc.listArticles(channel ? { channel } : {}), sort);
  const start = Math.max(0, Number(cursor) || 0);
  const size = Math.min(50, Math.max(1, Number(pageSize) || 20));
  const slice = pool.slice(start, start + size);
  return {
    cursor: start,
    nextCursor: start + slice.length,
    hasMore: start + slice.length < pool.length,
    list: slice.map((a) => svc.omitContent(a)),
    interactions: svc.userInteractions(userId, slice.map((a) => a.id))
  };
}

/** 增量同步：返回 since 之后新增/更新/删除的稿件，供 App 端拉取 */
function getSync({ since = '', channel = '', limit = 100 } = {}) {
  const sinceTs = since ? Date.parse(since) || 0 : 0;
  let pool = svc.news.all();
  if (channel) pool = pool.filter((a) => a.channel === channel);
  const changed = pool
    .filter((a) => Date.parse(a.updatedAt) >= sinceTs)
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
    .slice(0, Math.min(500, Number(limit) || 100));
  return {
    since: sinceTs ? new Date(sinceTs).toISOString() : new Date(0).toISOString(),
    serverTime: new Date().toISOString(),
    nextSince: new Date().toISOString(),
    upserts: changed.filter((a) => a.status !== 'deleted').map((a) => svc.omitContent(a)),
    deletes: changed.filter((a) => a.status === 'deleted').map((a) => a.id)
  };
}

/** 榜单刷新：清理增速窗口、按热度自动打标（每日定时任务调用） */
function refreshRanks() {
  const all = svc.news.all();
  const hot = all.slice().sort((a, b) => svc.hotScore(b) - svc.hotScore(a)).slice(0, 10).map((a) => a.id);
  const blast = all.map((a) => ({ a, s: svc.blastScore(a) })).sort((x, y) => y.s - x.s).slice(0, 10).map((x) => x.a.id);
  let changed = 0;
  all.forEach((a) => {
    const flags = { ...svc.defaultFlags(), ...(a.flags || {}) };
    const nextHot = hot.includes(a.id);
    const nextBlast = blast.includes(a.id);
    if (flags.hot !== nextHot || flags.blast !== nextBlast) changed += 1;
    flags.hot = nextHot;
    flags.blast = nextBlast;
    svc.news.update(a.id, { flags, stats: { ...svc.defaultStats(), ...(a.stats || {}), deltaViews: 0, deltaLikes: 0 } });
  });
  svc.news.flush();
  return { total: all.length, autoHot: hot.length, autoBlast: blast.length, changed, refreshedAt: new Date().toISOString() };
}

module.exports = {
  getHome, getChannelView, getVideoView, getAiView, search, getRelated,
  getHeadlines, getHotRank, getBlastRank, getFocus, getVideos, getHotTags, getChannels,
  getFeed, getSync, refreshRanks
};
