/**
 * 新闻数据访问层 —— 归一化 / 列表 / 详情 / 搜索 / 热度计算
 */
const { Store, genId, nowISO } = require('./store');
const { getSite, getChannelName } = require('./config');

const news = new Store('news', []);
const comments = new Store('comments', []);
const interactions = new Store('interactions', []);
const dailyStats = new Store('daily-stats', []);

const HOUR = 3600 * 1000;

/* ----------------------------- 工具函数 ----------------------------- */

function defaultStats() {
  return { views: 0, likes: 0, comments: 0, shares: 0, favs: 0, deltaViews: 0, deltaLikes: 0 };
}

function defaultFlags() {
  return { headline: false, hot: false, blast: false, focus: false, top: false, headlineOrder: 0, recommend: 0 };
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function hoursAgo(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 999;
  return Math.max(0.1, (Date.now() - t) / HOUR);
}

/** 综合热度分（含时间衰减），用于热点榜与推荐排序 */
function hotScore(a) {
  const s = a.stats || defaultStats();
  const base = (s.views || 0) + (s.likes || 0) * 6 + (s.comments || 0) * 12 + (s.shares || 0) * 10 + (s.favs || 0) * 4;
  const manual = (a.flags && a.flags.hot ? 1.15 : 1) * (a.flags && a.flags.top ? 1.2 : 1);
  return (base + 10) / Math.pow(hoursAgo(a.publishedAt) + 2, 1.35) * manual;
}

/** 爆款增速分：近 72 小时内单位时间增量 */
function blastScore(a) {
  const s = a.stats || defaultStats();
  if (hoursAgo(a.publishedAt) > 72) return 0;
  const delta = (s.deltaViews || 0) + (s.deltaLikes || 0) * 8 + (s.comments || 0) * 6 + (s.shares || 0) * 8;
  return delta / Math.pow(hoursAgo(a.publishedAt) + 2, 1.2) * (a.flags && a.flags.blast ? 1.2 : 1);
}

function normalize(input = {}) {
  const base = {
    id: input.id || genId('n_'),
    title: (input.title || '').trim(),
    subtitle: input.subtitle || '',
    summary: input.summary || '',
    channel: input.channel || 'china',
    tags: Array.isArray(input.tags) ? input.tags : String(input.tags || '').split(/[,，\s]+/).filter(Boolean),
    author: input.author || '本网记者',
    source: input.source || getSite().siteName,
    sourceUrl: input.sourceUrl || '',
    cover: input.cover || '',
    video: input.video || null,
    gallery: Array.isArray(input.gallery) ? input.gallery : [],
    content: Array.isArray(input.content) ? input.content : [],
    status: input.status || 'published',
    flags: { ...defaultFlags(), ...(input.flags || {}) },
    stats: { ...defaultStats(), ...(input.stats || {}) },
    publishedAt: input.publishedAt || nowISO(),
    createdAt: input.createdAt || nowISO(),
    updatedAt: nowISO()
  };
  if (!Array.isArray(base.content) || !base.content.length) {
    if (input.text) {
      base.content = String(input.text).split(/\n{2,}/).map((t) => ({ type: 'p', text: t.trim() })).filter((b) => b.text);
    }
    if (!base.content.length) base.content = [{ type: 'p', text: base.summary || base.title }];
  }
  if (!base.summary) {
    const first = base.content.find((b) => b.type === 'p');
    base.summary = first ? String(first.text).slice(0, 90) : '';
  }
  return base;
}

/** 结构化正文 -> HTML（PC 站直出；App 端可用结构化 content 自行渲染） */
function renderContent(article) {
  return (article.content || []).map((block) => {
    switch (block.type) {
      case 'h2':
        return `<h2>${escapeHtml(block.text)}</h2>`;
      case 'quote':
        return `<blockquote>${escapeHtml(block.text)}</blockquote>`;
      case 'list':
        return `<ul>${(block.items || []).map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
      case 'image':
        // 配图缺失（下载失败）时不输出空 img，避免出现破图
        if (!block.src) return '';
        return `<figure class="article-figure"><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.caption || article.title)}" loading="lazy">${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}</figure>`;
      case 'video': {
        const poster = block.poster ? ` poster="${escapeHtml(block.poster)}"` : '';
        if (block.kind === 'iframe') {
          return `<figure class="article-figure"><div class="video-frame"><iframe src="${escapeHtml(block.src)}" allowfullscreen frameborder="0" loading="lazy"></iframe></div>${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}</figure>`;
        }
        return `<figure class="article-figure"><video controls preload="none"${poster} src="${escapeHtml(block.src)}"></video>${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}</figure>`;
      }
      case 'embed':
        return `<div class="article-embed">${block.html || ''}</div>`;
      default:
        return `<p>${escapeHtml(block.text || '')}</p>`;
    }
  }).join('\n');
}

/** 列表场景裁剪正文以降低传输量 */
function omitContent(a) {
  const { content, ...rest } = a;
  return {
    ...rest,
    channelName: getChannelName(a.channel),
    hasVideo: Boolean(a.video || (content || []).some((b) => b.type === 'video')),
    imageCount: (content || []).filter((b) => b.type === 'image').length,
    hotScore: Number(hotScore(a).toFixed(2))
  };
}

/* ----------------------------- 查询 ----------------------------- */

function listArticles(options = {}) {
  const { channel, tag, keyword, flag, includeDrafts = false } = options;
  let pool = includeDrafts ? news.all() : news.all().filter((a) => a.status === 'published');

  if (channel && channel !== 'headline') pool = pool.filter((a) => a.channel === channel);
  if (tag) pool = pool.filter((a) => (a.tags || []).includes(tag));
  if (flag) pool = pool.filter((a) => a.flags && a.flags[flag]);
  if (keyword) {
    const kw = String(keyword).toLowerCase();
    pool = pool.filter((a) =>
      (a.title || '').toLowerCase().includes(kw) ||
      (a.summary || '').toLowerCase().includes(kw) ||
      (a.tags || []).some((t) => String(t).toLowerCase().includes(kw)) ||
      (a.content || []).some((b) => b.type === 'p' && String(b.text || '').toLowerCase().includes(kw))
    );
  }
  return pool;
}

function sortPool(pool, sort = 'new') {
  if (sort === 'hot') return pool.slice().sort((a, b) => hotScore(b) - hotScore(a));
  if (sort === 'blast') return pool.slice().sort((a, b) => blastScore(b) - blastScore(a));
  if (sort === 'recommend') {
    return pool.slice().sort((a, b) =>
      ((b.flags && b.flags.recommend) || 0) - ((a.flags && a.flags.recommend) || 0) ||
      Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
    );
  }
  return pool.slice().sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

function paginate(list, page = 1, pageSize = 20) {
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const start = (p - 1) * size;
  return {
    list: list.slice(start, start + size).map(omitContent),
    pagination: { page: p, pageSize: size, total: list.length, totalPages: Math.max(1, Math.ceil(list.length / size)) }
  };
}

function getArticle(id, { withHtml = true } = {}) {
  const a = news.findById(id);
  if (!a) return null;
  const out = omitContent(a);
  out.content = a.content || [];
  out.video = a.video || null;
  out.gallery = a.gallery || [];
  if (withHtml) out.contentHtml = renderContent(a);
  return out;
}

function createArticle(payload) {
  const doc = normalize(payload);
  news.insert(doc);
  return doc;
}

function updateArticle(id, patch) {
  const current = news.findById(id);
  if (!current) return null;
  return news.update(id, normalize({ ...current, ...patch, id }));
}

function removeArticle(id) {
  if (!news.findById(id)) return false;
  news.update(id, { status: 'deleted', deletedAt: nowISO() });
  return true;
}

function purgeArticle(id) {
  return news.remove(id);
}

function incrStat(id, key, step = 1) {
  const a = news.findById(id);
  if (!a) return null;
  const stats = { ...defaultStats(), ...(a.stats || {}) };
  stats[key] = (Number(stats[key]) || 0) + step;
  if (key === 'views') stats.deltaViews = (Number(stats.deltaViews) || 0) + step;
  if (key === 'likes') stats.deltaLikes = (Number(stats.deltaLikes) || 0) + step;
  return news.update(id, { stats });
}

/* ----------------------------- 评论 ----------------------------- */

function listComments(articleId, { page = 1, pageSize = 20, sort = 'new' } = {}) {
  const pool = comments.all().filter((c) => c.articleId === articleId && c.status !== 'deleted');
  if (sort === 'hot') pool.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  else pool.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(50, Math.max(1, Number(pageSize) || 20));
  const start = (p - 1) * size;
  return {
    list: pool.slice(start, start + size),
    pagination: { page: p, pageSize: size, total: pool.length, totalPages: Math.max(1, Math.ceil(pool.length / size)) }
  };
}

function addComment({ articleId, user = '网友', content, avatar = '' }) {
  const text = String(content || '').trim();
  if (!text) throw new Error('评论内容不能为空');
  const doc = comments.insert({
    id: genId('c_'),
    articleId,
    user: user || '网友',
    avatar,
    content: text.slice(0, 500),
    likes: 0,
    status: 'published',
    createdAt: nowISO()
  });
  incrStat(articleId, 'comments', 1);
  return doc;
}

function likeComment(id) {
  const c = comments.findById(id);
  if (!c) return null;
  return comments.update(id, { likes: (c.likes || 0) + 1 });
}

function removeComment(id) {
  return Boolean(comments.findById(id)) && comments.remove(id);
}

/* ----------------------------- 用户互动（点赞/收藏/浏览） ----------------------------- */

function toggleInteraction({ articleId, userId = 'anonymous', type = 'like' }) {
  const existing = interactions.findOne((i) => i.articleId === articleId && i.userId === userId && i.type === type);
  if (existing) {
    interactions.remove(existing.id);
    if (type === 'like') incrStat(articleId, 'likes', -1);
    if (type === 'fav') incrStat(articleId, 'favs', -1);
    return { active: false };
  }
  interactions.insert({ id: genId('i_'), articleId, userId, type, createdAt: nowISO() });
  if (type === 'like') incrStat(articleId, 'likes', 1);
  if (type === 'fav') incrStat(articleId, 'favs', 1);
  return { active: true };
}

function userInteractions(userId, ids = null) {
  if (userId === 'anonymous') return {};
  const rows = interactions.all().filter((i) => i.userId === userId && (!ids || ids.includes(i.articleId)));
  const out = {};
  rows.forEach((r) => {
    out[r.articleId] = out[r.articleId] || {};
    out[r.articleId][r.type] = true;
  });
  return out;
}

module.exports = {
  news, comments, interactions, dailyStats,
  defaultStats, defaultFlags, escapeHtml, renderContent, omitContent, normalize,
  hotScore, blastScore, listArticles, sortPool, paginate, getArticle,
  createArticle, updateArticle, removeArticle, purgeArticle, incrStat,
  listComments, addComment, likeComment, removeComment,
  toggleInteraction, userInteractions
};
