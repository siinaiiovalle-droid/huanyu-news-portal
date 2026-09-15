/**
 * 广场动态初始化 —— npm run seed:posts（重建加 --force）
 * 写入内容：
 *   - 演示账号资料（官方号 / 编辑部账号 / 个人创作者）
 *   - 48 条动态：图文帖、话题帖、引用新闻的复合帖
 *   - 转发记录（复刻推特时间线的"某某转发了"）
 *   - 回复（复用评论仓库，articleId 即动态 id）
 * 配图：统一从 public/img/news 的站内高清图按栏目挑选，保证与新闻正文图片质量一致。
 */
const fs = require('fs');
const path = require('path');
const svc = require('../server/lib/news-service');
const social = require('../server/lib/social-service');
const SEED = require('./data/seed-posts');

const HOUR = 3600 * 1000;
const IMG_DIR = path.resolve(__dirname, '../public/img/news');

/** 固定种子的伪随机，保证重复执行得到的互动数据一致 */
function makeRng(seed = 20260914) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rng = makeRng();

/** 按文件名里的栏目段（NN-<channel>-cover.jpg）建立图片池，实现"配图与内容同栏目" */
function buildImagePools() {
  const pools = new Map();
  let files = [];
  try {
    files = fs.readdirSync(IMG_DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  } catch {
    return pools;
  }
  files.forEach((f) => {
    const m = /-([a-z]+)-(?:cover|fig\d+)\./i.exec(f);
    const key = m ? m[1].toLowerCase() : 'other';
    if (!pools.has(key)) pools.set(key, []);
    pools.get(key).push(`/img/news/${f}`);
  });
  return pools;
}

/** 已发过的图登记在册，保证一条动态一张、全场不重样 */
const usedImages = new Set();

function pickImages(pools, channel, count) {
  if (!count) return [];
  const pool = (pools.get(channel) || []).filter((u) => !usedImages.has(u));
  const fallback = [].concat(...[...pools.values()]).filter((u) => !usedImages.has(u));
  const source = pool.length >= count ? pool : fallback;
  const picked = [];
  const rest = source.slice();
  while (picked.length < count && rest.length) {
    picked.push(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
  }
  picked.forEach((u) => usedImages.add(u));
  return picked;
}

function findArticle(keyword) {
  if (!keyword) return null;
  return svc.news.all().find((a) => a.status === 'published' && a.title.includes(keyword)) || null;
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');

  if (social.posts.count() > 0 && !force) {
    console.log(`广场已有动态 ${social.posts.count()} 条，本次跳过。`);
    console.log('如需清空重建：node scripts/seed-posts.js --force');
    return;
  }

  if (force) {
    // 连带动态下的回复一并清理，避免留下孤儿评论
    const oldIds = social.posts.all().map((p) => p.id);
    oldIds.forEach((id) => svc.comments.find((c) => c.articleId === id).forEach((c) => svc.comments.remove(c.id)));
    social.posts.items = [];
    social.profiles.items = [];
    console.log(`已清空旧动态 ${oldIds.length} 条及其回复`);
  }

  const pools = buildImagePools();
  const authorByHandle = new Map();
  SEED.authors.forEach((raw) => {
    const author = social.normalizeAuthor({ ...raw, uid: raw.uid || `u_${raw.handle}` });
    author.color = '#0b4f9e';
    authorByHandle.set(author.handle, author);
  });

  const now = Date.now();
  const created = [];
  let quoteHits = 0;

  SEED.posts.forEach((raw) => {
    const author = authorByHandle.get(raw.author);
    if (!author) {
      console.warn(`  跳过未知作者的动态：${raw.author}`);
      return;
    }
    const createdAt = new Date(now - raw.hoursAgo * HOUR).toISOString();
    const article = findArticle(raw.quote);
    if (raw.quote && article) quoteHits += 1;

    const freshness = 1 / Math.pow(raw.hoursAgo + 2, 0.55);
    const likes = Math.round(30 + rng() * 260 + freshness * (600 + rng() * 2400));

    const doc = social.normalizePost({
      id: `p_seed_${String(created.length + 1).padStart(3, '0')}`,
      author,
      content: raw.content,
      images: raw.images ? pickImages(pools, raw.channel, Math.min(4, raw.images)) : [],
      quote: article ? social.resolveQuote(article.id) : null,
      createdAt,
      stats: {
        likes,
        views: Math.round(likes * (12 + rng() * 20) + freshness * 40000),
        bookmarks: Math.round(likes * (0.03 + rng() * 0.08)),
        reposts: 0,
        replies: 0
      }
    });
    doc.createdAt = createdAt;
    doc.updatedAt = createdAt;
    social.posts.insert(doc);
    created.push({ doc, raw, author });
  });

  // 转发记录：先写显式指定的，再给热度最高的动态补一批，让时间线有真实的"转发"层次
  let repostCount = 0;
  const addRepost = (target, handle, hoursAgo) => {
    const author = authorByHandle.get(handle);
    if (!author || author.handle === target.author.handle) return;
    const at = new Date(now - (hoursAgo ?? 0) * HOUR).toISOString();
    const repost = social.normalizePost({ author, content: '', repostOf: target.id, createdAt: at });
    repost.createdAt = at;
    repost.updatedAt = at;
    social.posts.insert(repost);
    repostCount += 1;
  };

  created.forEach(({ doc, raw }) => {
    (raw.repostedBy || []).forEach((handle, i) => addRepost(doc, handle, Math.max(0.1, raw.hoursAgo - 0.2 - i * 0.15)));
  });

  created
    .slice()
    .sort((a, b) => (b.doc.stats.likes || 0) - (a.doc.stats.likes || 0))
    .slice(0, 10)
    .forEach(({ doc, raw }, idx) => {
      const handles = SEED.authors.map((a) => a.handle).filter((h) => h !== doc.author.handle);
      const extra = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < extra; i += 1) {
        addRepost(doc, handles[Math.floor(rng() * handles.length)], Math.max(0.05, raw.hoursAgo - 0.3 - idx * 0.1 - i * 0.2));
      }
    });

  // 回复：写入评论仓库，并同步动态的回复计数
  let replyCount = 0;
  created.forEach(({ doc, raw }) => {
    (raw.replies || []).forEach(([handle, content], i) => {
      const author = authorByHandle.get(handle);
      if (!author) return;
      svc.comments.insert({
        id: `c_seed_${doc.id}_${i}`,
        articleId: doc.id,
        uid: author.uid,
        user: author.name,
        handle: author.handle,
        content,
        likes: Math.round(rng() * 180),
        status: 'published',
        createdAt: new Date(now - raw.hoursAgo * HOUR + (i + 1) * 11 * 60000).toISOString()
      });
      replyCount += 1;
    });
  });

  // 回填真实互动数：转发/回复计数与实际记录一致，点到详情不会"数字对不上"
  const repostTally = new Map();
  social.posts.all().forEach((p) => {
    if (!p.repostOf) return;
    repostTally.set(p.repostOf, (repostTally.get(p.repostOf) || 0) + 1);
  });
  const replyTally = new Map();
  svc.comments.all().forEach((c) => {
    if (!c.articleId || !c.articleId.startsWith('p_')) return;
    replyTally.set(c.articleId, (replyTally.get(c.articleId) || 0) + 1);
  });

  created.forEach(({ doc }) => {
    social.posts.update(doc.id, {
      stats: {
        ...doc.stats,
        reposts: repostTally.get(doc.id) || 0,
        replies: replyTally.get(doc.id) || 0
      }
    });
  });

  // 置顶一条官方动态，演示运营位能力
  const firstOfficial = created.find(({ doc }) => doc.author.handle === 'huanyu_flash');
  if (firstOfficial) social.posts.update(firstOfficial.doc.id, { pinned: true });

  social.posts.flush();
  social.profiles.flush();
  svc.comments.flush();

  const withImages = created.filter((c) => c.doc.images.length).length;
  console.log('\n广场数据写入完成：');
  console.log(`  账号数：${authorByHandle.size}`);
  console.log(`  动态数：${created.length} 条（含配图 ${withImages} 条，引用新闻 ${quoteHits} 条）`);
  console.log(`  转发记录：${repostCount} 条`);
  console.log(`  回复数：${replyCount} 条`);
  console.log(`  话题标签：${social.getTopics(30).length} 个`);
  console.log('\n访问广场：http://localhost:3000/square.html\n');
}

main();
