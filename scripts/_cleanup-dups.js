/**
 * 一次性清理脚本：删除指纹库里判定为重复的历史旧图，并清掉各处引用，
 * 随后重跑 npm run fetch:images 即可为这些图位重新配图（新图会自动去重）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FP = path.join(ROOT, 'scripts', 'data', 'image-fingerprints.json');
const IDX = path.join(ROOT, 'scripts', 'data', 'photo-index.json');
const NEWS = path.join(ROOT, 'data', 'news.json');
const OUT_DIR = path.join(ROOT, 'public', 'img', 'news');

function ham(a, b) {
  let n = 0;
  for (let i = 0; i < 16; i += 1) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    n += (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1) + ((x >> 3) & 1);
  }
  return n;
}

const fp = JSON.parse(fs.readFileSync(FP, 'utf8'));
const files = Object.keys(fp);

const groups = [];
const used = new Set();
files.forEach((f) => {
  if (used.has(f)) return;
  const g = [f];
  used.add(f);
  files.forEach((o) => {
    if (used.has(o)) return;
    if (ham(fp[f], fp[o]) <= 6) { g.push(o); used.add(o); }
  });
  if (g.length > 1) groups.push(g);
});

const drop = new Set();
groups.forEach((g) => g.slice(1).forEach((f) => drop.add(f)));

console.log(`重复组 ${groups.length} 个，需重配 ${drop.size} 张：`);
groups.forEach((g) => console.log(`  ${g.join(' | ')}`));

const base = (u) => String(u || '').replace('/img/news/', '');

drop.forEach((f) => {
  const p = path.join(OUT_DIR, f);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  delete fp[f];
});
fs.writeFileSync(FP, JSON.stringify(fp, null, 2) + '\n', 'utf8');

const idx = JSON.parse(fs.readFileSync(IDX, 'utf8'));
Object.values(idx).forEach((v) => {
  if (v.cover && drop.has(base(v.cover))) v.cover = '';
  v.figures = (v.figures || []).map((x) => (x && drop.has(base(x)) ? '' : x));
});
fs.writeFileSync(IDX, JSON.stringify(idx, null, 2) + '\n', 'utf8');

const news = JSON.parse(fs.readFileSync(NEWS, 'utf8'));
news.forEach((a) => {
  if (a.cover && drop.has(base(a.cover))) a.cover = '';
  (a.content || []).forEach((b) => {
    if (b.type === 'image' && b.src && drop.has(base(b.src))) b.src = '';
  });
  if (a.video && a.video.poster && drop.has(base(a.video.poster))) a.video.poster = '';
});
fs.writeFileSync(NEWS, JSON.stringify(news, null, 2) + '\n', 'utf8');

console.log('已删除重复文件并清空引用，请重跑 npm run fetch:images 补图。');
