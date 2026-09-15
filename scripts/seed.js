/**
 * 初始化演示数据 —— 首次部署或重置环境时执行：npm run seed
 * 会写入：8 大频道 40+ 篇图文/视频稿件、头条/热点/爆款/焦点运营位、示例评论、后台账号
 */
const path = require('path');
const fs = require('fs');
const { DATA_DIR, nowISO } = require('../server/lib/store');
const svc = require('../server/lib/news-service');
const { createAccount, accounts } = require('../server/lib/auth');
const { getSite } = require('../server/lib/config');
const ARTICLES = require('./data/seed-articles');
const COMMENTS = require('./data/seed-comments');

const HOUR = 3600 * 1000;

/**
 * 配图索引：由 npm run fetch:images 生成，按标题记录每篇稿件的高清配图。
 * 命中时用本地高清图替换稿件里的占位图，保证重跑 seed 也不会退回占位图。
 */
const PHOTO_INDEX_FILE = path.join(__dirname, 'data', 'photo-index.json');
const PHOTO_INDEX = fs.existsSync(PHOTO_INDEX_FILE)
  ? JSON.parse(fs.readFileSync(PHOTO_INDEX_FILE, 'utf8'))
  : {};

function applyPhotos(source, doc) {
  const hit = PHOTO_INDEX[source.title];
  if (!hit || !hit.cover) return doc;
  let figure = -1;
  const content = (doc.content || []).map((block) => {
    if (block.type === 'image') {
      figure += 1;
      return hit.figures[figure] ? { ...block, src: hit.figures[figure] } : block;
    }
    if (block.type === 'video' && block.poster) return { ...block, poster: hit.cover };
    return block;
  });
  return {
    ...doc,
    cover: hit.cover,
    content,
    video: doc.video && doc.video.poster ? { ...doc.video, poster: hit.cover } : doc.video
  };
}

function reset() {
  ['news', 'comments', 'interactions', 'daily-stats', 'posts', 'profiles'].forEach((name) => {
    const file = path.join(DATA_DIR, `${name}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
  const admins = path.join(DATA_DIR, 'admins.json');
  if (fs.existsSync(admins)) fs.unlinkSync(admins);
  console.log('已清理旧数据文件');
}

function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--keep')) reset();

  // 重新加载仓库（清空文件后需要新建实例）
  const newsStore = new (require('../server/lib/store').Store)('news', []);
  const commentStore = new (require('../server/lib/store').Store)('comments', []);

  const now = Date.now();
  const created = [];

  ARTICLES.forEach((raw, index) => {
    const publishedAt = new Date(now - (raw.hoursAgo ?? index * 2 + 1) * HOUR).toISOString();
    const flags = {
      headline: Boolean(raw.headline),
      headlineOrder: raw.headlineOrder || 0,
      focus: Boolean(raw.focus),
      hot: false,
      blast: false,
      top: Boolean(raw.top),
      recommend: raw.recommend || 0
    };
    const doc = applyPhotos(raw, {
      ...svc.normalize({ ...raw, publishedAt, flags, source: raw.source || getSite().siteName }),
      id: `n_${String(index + 1).padStart(3, '0')}${Math.random().toString(36).slice(2, 6)}`,
      createdAt: publishedAt,
      updatedAt: publishedAt
    });
    const stats = {
      views: raw.views ?? 800 + Math.round(Math.random() * 40000),
      likes: raw.likes ?? 50 + Math.round(Math.random() * 3500),
      comments: 0,
      shares: 30 + Math.round(Math.random() * 1500),
      favs: 20 + Math.round(Math.random() * 800),
      deltaViews: Math.round(Math.random() * 9000),
      deltaLikes: Math.round(Math.random() * 600)
    };
    newsStore.insert({ ...doc, stats });
    created.push({ ...doc, stats });
  });

  // 示例评论
  created.slice(0, 6).forEach((a, i) => {
    const list = COMMENTS[i % COMMENTS.length];
    list.forEach((c, j) => {
      commentStore.insert({
        id: `c_seed${i}_${j}`,
        articleId: a.id,
        user: c.user,
        content: c.content,
        likes: Math.round(Math.random() * 320),
        status: 'published',
        createdAt: new Date(now - (j + 1) * 37 * 60000).toISOString()
      });
    });
    const comments = commentStore.find((c) => c.articleId === a.id).length;
    newsStore.update(a.id, { stats: { ...a.stats, comments } });
  });

  // 后台账号
  if (!accounts.findOne((x) => x.username === 'admin')) {
    createAccount({ username: 'admin', password: 'admin888', name: '总编辑', role: 'admin' });
  }
  accounts.flush();
  newsStore.flush();
  commentStore.flush();

  console.log(`\n种子数据写入完成：`);
  console.log(`  稿件总数：${newsStore.all().length}`);
  console.log(`  评论条数：${commentStore.all().length}`);
  const byChannel = {};
  newsStore.all().forEach((a) => { byChannel[a.channel] = (byChannel[a.channel] || 0) + 1; });
  console.log(`  频道分布：${Object.entries(byChannel).map(([k, v]) => `${k}:${v}`).join('  ')}`);
  console.log(`  头条稿：${newsStore.all().filter((a) => a.flags.headline).length} 篇`);
  console.log(`  焦点稿：${newsStore.all().filter((a) => a.flags.focus).length} 篇`);

  // 广场动态：独立进程执行，避免与稿件仓库的内存缓存互相干扰
  try {
    require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'seed-posts.js'), '--force'], {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit'
    });
  } catch (e) {
    console.error(`广场动态初始化失败：${e.message}（可单独执行 npm run seed:posts -- --force 重试）`);
  }

  console.log(`\n后台地址：http://localhost:3000/admin.html`);
  console.log(`后台账号：admin / admin888\n`);
  console.log('提示：执行 npm run rank 可刷新头条/热点/爆款运营位。\n');
}

main();
