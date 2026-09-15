/**
 * 广场配图去重 —— 保证同一张图在广场里只被一条动态使用。
 *
 * 背景：素材库此前是随机发牌，同一张高清图可能被多条动态同时引用，
 *       信息流里刷几屏就会看到重复画面，观感很差。
 *
 * 做法：按发布时间顺序扫描全部动态，图片第一次出现归原作者所有，
 *       之后再撞车的动态，从"还没被占用的素材"里重新发一张。
 *
 * 用法：npm run square:dedupe
 */
const social = require('../server/lib/social-service');

/** 洗牌，避免每次都从素材库同一段取图 */
function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function main() {
  const all = social.posts.all().slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const owner = new Map();
  let free = shuffle(social.freeAssets());
  let replaced = 0;
  let touched = 0;
  let dropped = 0;

  all.forEach((post) => {
    const images = post.images || [];
    if (!images.length) return;

    const next = [];
    const seen = new Set();
    let dirty = false;

    images.forEach((url) => {
      if (seen.has(url)) {
        dropped += 1;
        dirty = true;
        return;
      }
      seen.add(url);

      if (!owner.has(url)) {
        owner.set(url, post.id);
        next.push(url);
        return;
      }

      if (!free.length) free = shuffle(social.freeAssets());
      const alt = free.shift();
      if (!alt) {
        // 素材确实被用光了，宁可少一张也不要重复
        dropped += 1;
        dirty = true;
        return;
      }
      owner.set(alt, post.id);
      next.push(alt);
      replaced += 1;
      dirty = true;
    });

    if (dirty) {
      social.posts.update(post.id, { images: next });
      touched += 1;
    }
  });

  social.posts.flush();

  const left = social.usedImages().size;
  const refs = social.posts.all().reduce((sum, p) => sum + (p.images || []).length, 0);
  console.log('\n广场配图去重完成：');
  console.log(`  动态总数：${all.length} 条`);
  console.log(`  换掉重复图：${replaced} 张（涉及 ${touched} 条动态）`);
  console.log(`  因素材耗尽丢弃：${dropped} 张`);
  console.log(`  去重后：图片引用 ${refs} 个 / 唯一图片 ${left} 张`);
  console.log(left === refs ? '  校验：一图一帖，无重复 ✔' : `  校验：仍有 ${refs - left} 处重复，请重跑`);
}

main();
