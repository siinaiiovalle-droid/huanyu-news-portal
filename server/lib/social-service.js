/**
 * 广场数据访问层 —— 社交媒体式信息流（对标 Twitter）
 *   能力：发帖 / 转发 / 点赞 / 收藏 / 回复 / 关注关系 / 话题趋势 / 配图素材库
 * 说明：
 *   - 动态存放在独立的 posts 仓库，与稿件仓库 news 解耦，但可以引用稿件（quote / repost）；
 *   - 互动关系复用 interactions 仓库，回复复用 comments 仓库（articleId 字段即动态 id），
 *     这样 App 端后续可以直接复用同一套接口与数据；
 *   - 上层 API 只依赖本模块暴露的方法，后续替换为 MySQL / MongoDB 无需改动路由层。
 */
const fs = require('fs');
const path = require('path');
const { Store, genId, nowISO } = require('./store');
const svc = require('./news-service');
const { getChannelName } = require('./config');

const posts = new Store('posts', []);
const profiles = new Store('profiles', []);

const HOUR = 3600 * 1000;
const MAX_LEN = 280;
const MAX_IMAGES = 4;
const IMG_DIR = path.resolve(__dirname, '../../public/img/news');

/* ----------------------------- 工具 ----------------------------- */

function defaultStats() {
  return { likes: 0, reposts: 0, replies: 0, views: 0, bookmarks: 0 };
}

function hoursAgo(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 999;
  return Math.max(0.05, (Date.now() - t) / HOUR);
}

/** 信息流热度：互动加权 + 时间衰减，与新闻热度算法同构，便于后续统一推荐排序 */
function feedScore(post, at) {
  const s = { ...defaultStats(), ...(post.stats || {}) };
  const base = (s.likes || 0) * 3 + (s.reposts || 0) * 6 + (s.replies || 0) * 9 + (s.bookmarks || 0) * 4 + (s.views || 0) * 0.1;
  const boost = (post.author && post.author.verified ? 1.25 : 1) * (post.pinned ? 1.8 : 1);
  return ((base + 6) / Math.pow(hoursAgo(at || post.createdAt) + 1.5, 1.15)) * boost;
}

/** 从正文中提取话题标签，支持 #话题# 与 #话题 两种写法 */
function parseTopics(content, extraTags = []) {
  const topics = new Set(
    (Array.isArray(extraTags) ? extraTags : [])
      .map((t) => String(t).replace(/^#|#$/g, '').trim())
      .filter(Boolean)
  );
  const re = /#([^#\s]{1,20})#?/g;
  let m = re.exec(content);
  while (m) {
    const t = m[1].trim();
    if (t) topics.add(t);
    m = re.exec(content);
  }
  return [...topics].slice(0, 5);
}

/** 只接受站内素材库的图片地址，避免被写入任意外链；同一条动态内自动去重 */
function safeImages(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .filter((u) => {
      if (typeof u !== 'string' || !/^\/img\/[A-Za-z0-9\-_./]+$/.test(u)) return false;
      if (seen.has(u)) return false;
      seen.add(u);
      return true;
    })
    .slice(0, MAX_IMAGES);
}

/** 素材库里还没有被任何动态用过的图（发帖选图与自动补图都从这里取） */
function freeAssets() {
  let files = [];
  try {
    files = fs.readdirSync(IMG_DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  } catch {
    return [];
  }
  const used = usedImages();
  return files.map((f) => `/img/news/${f}`).filter((u) => !used.has(u));
}

/** 已被其他动态占用的配图，保证同一张图在广场里只出现一次（excludeId 用于豁免自身） */
function usedImages(excludeId = '') {
  const used = new Set();
  posts.all().forEach((p) => {
    if (excludeId && p.id === excludeId) return;
    (p.images || []).forEach((u) => used.add(u));
  });
  return used;
}

/**
 * 为一条动态挑选配图：已被别的动态用过的图不再分配，改为从素材库补一张空闲的。
 * 这样即便两个用户同时选到同一张，最终落库也是互不重复的两张。
 */
function assignImages(wanted = [], excludeId = '') {
  const picked = safeImages(wanted);
  const used = usedImages(excludeId);
  const fresh = picked.filter((u) => !used.has(u));
  let need = picked.length - fresh.length;
  if (!need) return fresh;

  const free = freeAssets().filter((u) => !fresh.includes(u));
  while (need > 0 && free.length) {
    fresh.push(free.splice(Math.floor(Math.random() * free.length), 1)[0]);
    need -= 1;
  }
  return fresh;
}

function normalizeAuthor(input = {}) {
  const uid = String(input.uid || 'anonymous').slice(0, 64);
  const name = String(input.name || '匿名网友').trim().slice(0, 24) || '匿名网友';
  return {
    uid,
    name,
    handle: String(input.handle || '').replace(/^@/, '').slice(0, 32),
    verified: Boolean(input.verified),
    bio: String(input.bio || '').slice(0, 80),
    color: String(input.color || '')
  };
}

/** 引用新闻稿件（形成"动态 + 新闻卡片"的复合帖，和推特引用推文同构） */
function resolveQuote(articleId) {
  if (!articleId) return null;
  const a = svc.news.findById(articleId);
  if (!a || a.status === 'deleted') return null;
  return {
    id: a.id,
    title: a.title,
    summary: a.summary || '',
    cover: a.cover || '',
    channel: a.channel,
    channelName: getChannelName(a.channel),
    source: a.source || ''
  };
}

function normalizePost(input = {}) {
  const content = String(input.content || '').trim().slice(0, MAX_LEN);
  const images = safeImages(input.images);
  const quote = input.quote || resolveQuote(input.quoteId);
  return {
    id: input.id || genId('p_'),
    author: normalizeAuthor(input.author),
    content,
    images,
    quote,
    topics: parseTopics(content, input.topics),
    repostOf: input.repostOf || '',
    pinned: Boolean(input.pinned),
    status: input.status || 'published',
    stats: { ...defaultStats(), ...(input.stats || {}) },
    createdAt: input.createdAt || nowISO(),
    updatedAt: nowISO()
  };
}

/* ----------------------------- 用户资料与关注 ----------------------------- */

function profileOf(uid) {
  const key = String(uid || 'anonymous').slice(0, 64);
  let doc = profiles.findById(key);
  if (!doc) doc = profiles.insert({ id: key, uid: key, following: [], createdAt: nowISO() });
  if (!Array.isArray(doc.following)) doc = profiles.update(key, { following: [] });
  return doc;
}

function toggleFollow(uid, handle) {
  const target = String(handle || '').replace(/^@/, '').trim();
  if (!target) return null;
  const doc = profileOf(uid);
  const following = doc.following.slice();
  const idx = following.indexOf(target);
  if (idx === -1) following.push(target);
  else following.splice(idx, 1);
  const next = profiles.update(doc.id, { following });
  return { active: idx === -1, following: next.following };
}

/** 当前用户在广场里的数据概览（左侧栏展示），同时回传关注列表供前端标记关注状态 */
function getMySummary(uid) {
  const key = String(uid || 'anonymous');
  const mine = posts.all().filter((p) => p.author && p.author.uid === key && p.status !== 'deleted');
  const followingList = profileOf(uid).following || [];
  return {
    posts: mine.filter((p) => !p.repostOf).length,
    reposts: mine.filter((p) => p.repostOf).length,
    likes: mine.reduce((sum, p) => sum + ((p.stats && p.stats.likes) || 0), 0),
    replies: mine.reduce((sum, p) => sum + ((p.stats && p.stats.replies) || 0), 0),
    following: followingList.length,
    followingList
  };
}

/* ----------------------------- 信息流 ----------------------------- */

/**
 * 把仓库里的原始记录展开成信息流条目：
 * 转发记录不单独成帖，而是还原为"某某转发了原帖"，和推特的时间线一致。
 */
/**
 * 信息流条目：同一原帖只占一个位置，转发不再各自展开一份。
 * 否则原帖 + N 条转发会让同一组配图反复出现（实测同一画面最多连刷到 6 次），
 * 这里按"某某、某某等 N 人转发"聚合，既保留转发关系又不刷重复画面。
 */
function feedItems() {
  const groups = new Map();
  posts.all().forEach((p) => {
    if (p.status === 'deleted') return;
    const baseId = p.repostOf || p.id;
    const base = p.repostOf ? posts.findById(p.repostOf) : p;
    if (!base || base.status === 'deleted') return;

    const reposter = p.repostOf && p.author
      ? { uid: p.author.uid, name: p.author.name, handle: p.author.handle }
      : null;

    const item = groups.get(baseId) || {
      post: base,
      at: p.createdAt,
      reposter: null,
      reposters: [],
      repostCount: 0
    };

    // 取组内最新动作时间：老帖刚被转发时也能正常浮到前面
    if (Date.parse(p.createdAt) > Date.parse(item.at)) item.at = p.createdAt;
    if (reposter) {
      item.reposters.push(reposter);
      item.repostCount = item.reposters.length;
      if (!item.reposter) item.reposter = reposter;
    }
    groups.set(baseId, item);
  });
  return [...groups.values()];
}

/** 我转发过的原帖 id 集合：转发记录不在 interactions 里，需要单独还原按钮状态 */
function repostedIds(uid) {
  const set = new Set();
  posts.all().forEach((p) => {
    if (p.repostOf && p.status !== 'deleted' && p.author && p.author.uid === uid) set.add(p.repostOf);
  });
  return set;
}

/** 合并点赞/收藏与转发状态，保证前端刷新后按钮高亮一致 */
function interactionsOf(uid, ids) {
  const map = svc.userInteractions(uid, ids);
  const mine = repostedIds(uid);
  ids.forEach((id) => {
    if (!mine.has(id)) return;
    map[id] = { ...(map[id] || {}), repost: true };
  });
  return map;
}

function listFeed({ sort = 'recommend', cursor = 0, pageSize = 12, uid = 'anonymous', topic = '', handle = '' } = {}) {
  let items = feedItems();

  if (topic) items = items.filter((x) => (x.post.topics || []).includes(topic));
  if (handle) items = items.filter((x) => x.post.author && x.post.author.handle === handle);

  const needFollow = sort === 'following' && !(profileOf(uid).following || []).length;
  if (needFollow) {
    return { list: [], cursor: 0, nextCursor: 0, hasMore: false, total: 0, needFollow: true, interactions: {} };
  }
  if (sort === 'following') {
    const following = profileOf(uid).following || [];
    items = items.filter((x) => x.post.author && following.includes(x.post.author.handle));
  }

  if (sort === 'latest') items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  else if (sort === 'following') items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  else items.sort((a, b) => feedScore(b.post, b.at) - feedScore(a.post, a.at));

  const start = Math.max(0, Number(cursor) || 0);
  const size = Math.min(50, Math.max(1, Number(pageSize) || 12));
  const slice = items.slice(start, start + size);

  const list = slice.map((x) => ({
    ...x.post,
    score: Number(feedScore(x.post, x.at).toFixed(1)),
    repostedBy: x.reposter,
    reposters: x.reposters || [],
    repostCount: x.repostCount || 0,
    feedAt: x.at
  }));

  return {
    list,
    cursor: start,
    nextCursor: start + slice.length,
    hasMore: start + slice.length < items.length,
    total: items.length,
    needFollow: false,
    interactions: interactionsOf(uid, list.map((p) => p.id))
  };
}

function getPost(id, { uid = 'anonymous', withReplies = true } = {}) {
  const post = posts.findById(id);
  if (!post || post.status === 'deleted') return null;
  post.stats = { ...defaultStats(), ...(post.stats || {}) };
  post.stats.views = (post.stats.views || 0) + 1;
  posts.update(id, { stats: post.stats });
  return {
    post,
    replies: withReplies ? listReplies(id) : [],
    interactions: interactionsOf(uid, [id])[id] || {}
  };
}

/* ----------------------------- 写操作 ----------------------------- */

function createPost(payload = {}) {
  const content = String(payload.content || '').trim();
  // 同一张图不允许出现在两条动态里，冲突时自动改派一张还没被占用的
  const images = assignImages(payload.images);
  const quote = resolveQuote(payload.quoteId);
  if (!content && !images.length && !quote) throw new Error('写点什么，或者配一张图再发布');
  if (content.length > MAX_LEN) throw new Error(`正文不能超过 ${MAX_LEN} 字`);

  const doc = normalizePost({
    author: {
      uid: payload.uid,
      name: payload.name,
      handle: payload.handle,
      verified: Boolean(payload.verified),
      bio: payload.bio
    },
    content,
    images,
    quote
  });
  posts.insert(doc);
  return doc;
}

function removePost(id) {
  const post = posts.findById(id);
  if (!post) return false;
  posts.update(id, { status: 'deleted' });
  return true;
}

/** 点赞 / 收藏：复用 interactions 仓库，便于 App 端统一同步 */
function toggleReaction({ postId, uid = 'anonymous', type = 'like' }) {
  const post = posts.findById(postId);
  const key = { like: 'likes', bookmark: 'bookmarks' }[type];
  if (!post || !key) return null;

  const existing = svc.interactions.findOne((i) => i.articleId === postId && i.userId === uid && i.type === type);
  const stats = { ...defaultStats(), ...(post.stats || {}) };

  if (existing) {
    svc.interactions.remove(existing.id);
    stats[key] = Math.max(0, (stats[key] || 0) - 1);
    posts.update(postId, { stats });
    return { active: false, stats };
  }
  svc.interactions.insert({ id: genId('i_'), articleId: postId, userId: uid, type, createdAt: nowISO() });
  stats[key] = (stats[key] || 0) + 1;
  posts.update(postId, { stats });
  return { active: true, stats };
}

/**
 * 转发：在信息流里生成一条"转发记录"（复刻推特行为——转发出现在关注者的时间线，不复制原文）。
 * 重复转发即取消。
 */
function toggleRepost({ postId, uid = 'anonymous', name = '匿名网友', handle = '' }) {
  const target = posts.findById(postId);
  if (!target || target.status === 'deleted') return null;

  // 转发一条转发帖时，始终指向最初的原帖，避免出现层层套娃
  const baseId = target.repostOf || target.id;
  const base = posts.findById(baseId);
  if (!base) return null;

  const mine = posts.findOne((p) => p.repostOf === baseId && p.author && p.author.uid === uid);
  const stats = { ...defaultStats(), ...(base.stats || {}) };

  if (mine) {
    posts.remove(mine.id);
    stats.reposts = Math.max(0, (stats.reposts || 0) - 1);
    posts.update(baseId, { stats });
    return { active: false, stats };
  }

  const repost = normalizePost({
    author: { uid, name, handle },
    content: '',
    repostOf: baseId
  });
  posts.insert(repost);
  stats.reposts = (stats.reposts || 0) + 1;
  posts.update(baseId, { stats });
  return { active: true, stats };
}

/* ----------------------------- 回复（复用评论仓库） ----------------------------- */

function listReplies(postId, { limit = 50 } = {}) {
  return svc.comments
    .all()
    .filter((c) => c.articleId === postId && c.status !== 'deleted')
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(0, limit);
}

function addReply({ postId, uid = 'anonymous', name = '匿名网友', handle = '', content }) {
  const post = posts.findById(postId);
  if (!post) throw new Error('动态不存在');
  const text = String(content || '').trim();
  if (!text) throw new Error('回复内容不能为空');
  if (text.length > 500) throw new Error('回复不能超过 500 字');

  const reply = svc.comments.insert({
    id: genId('c_'),
    articleId: postId,
    uid: String(uid).slice(0, 64),
    user: String(name || '匿名网友').slice(0, 24),
    handle: String(handle || '').replace(/^@/, '').slice(0, 32),
    content: text,
    likes: 0,
    status: 'published',
    createdAt: nowISO()
  });

  const stats = { ...defaultStats(), ...(post.stats || {}) };
  stats.replies = (stats.replies || 0) + 1;
  posts.update(postId, { stats });
  return { reply, stats };
}

function likeReply(replyId) {
  const c = svc.comments.findById(replyId);
  if (!c) return null;
  return svc.comments.update(replyId, { likes: (c.likes || 0) + 1 });
}

/* ----------------------------- 右侧栏：趋势 / 推荐关注 / 图库 ----------------------------- */

function getTopics(size = 8) {
  const counter = new Map();
  feedItems().forEach((x) => {
    (x.post.topics || []).forEach((t) => {
      const prev = counter.get(t) || { name: t, posts: 0, heat: 0 };
      prev.posts += 1;
      prev.heat += feedScore(x.post, x.at);
      counter.set(t, prev);
    });
  });
  return [...counter.values()]
    .sort((a, b) => b.heat - a.heat)
    .slice(0, size)
    .map((t) => ({ name: t.name, posts: t.posts, heat: Number(t.heat.toFixed(1)) }));
}

/** 按发帖量与获赞量推荐账号，引导新用户关注 */
function getSuggestedAuthors(size = 5) {
  const map = new Map();
  posts.all().forEach((p) => {
    const a = p.author;
    if (!a || !a.handle || p.status === 'deleted') return;
    const prev = map.get(a.handle) || { ...a, posts: 0, likes: 0 };
    prev.posts += 1;
    prev.likes += (p.stats && p.stats.likes) || 0;
    map.set(a.handle, prev);
  });
  return [...map.values()].sort((x, y) => y.likes - x.likes || y.posts - x.posts).slice(0, size);
}

function getTrends({ topicsSize = 8, authorsSize = 5, newsSize = 5 } = {}) {
  return {
    topics: getTopics(topicsSize),
    authors: getSuggestedAuthors(authorsSize),
    news: svc
      .listArticles()
      .sort((a, b) => svc.hotScore(b) - svc.hotScore(a))
      .slice(0, newsSize)
      .map(svc.omitContent)
  };
}

/** 配图素材库：直接复用已下载的站内高清图；已被其他动态用过的不再出现，从源头上选不出重复图 */
function getAssets(size = 12) {
  const n = Math.max(1, Number(size) || 12);
  let files = [];
  try {
    files = fs.readdirSync(IMG_DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => `/img/news/${f}`);
  } catch {
    return [];
  }
  const free = freeAssets();
  const pool = (free.length >= n ? free : files).slice();
  const picked = [];
  while (picked.length < n && pool.length) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return picked;
}

module.exports = {
  posts, profiles,
  defaultStats, feedScore, parseTopics, normalizePost, normalizeAuthor, resolveQuote,
  listFeed, getPost, createPost, removePost,
  toggleReaction, toggleRepost, toggleFollow, profileOf, getMySummary,
  listReplies, addReply, likeReply,
  getTopics, getSuggestedAuthors, getTrends, getAssets,
  usedImages, freeAssets, assignImages
};
