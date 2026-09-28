/**
 * 商城 / 本地生活配图抓取器（零第三方依赖，Node 18+ 即可运行）
 *
 *   用法：
 *     node tools/fetch_assets.js              # 全量补图（商城 10 商品 x3 张 + 生活 8 团单 x1 张）
 *     node tools/fetch_assets.js --only=shop  # 只补商城
 *     node tools/fetch_assets.js --only=life  # 只补本地生活
 *     node tools/fetch_assets.js --limit=6    # 只处理前 N 个位（调试用）
 *
 * 行为约定：
 *   1. 图片源为 Bing 图片搜索（本机网络环境下唯一可达），逐级放宽：大图优先 → 不限尺寸；
 *   2. 位图先落临时文件，通过尺寸门槛 + dHash 去重后才写回 assets/ 目标路径；
 *   3. 任何一位失败都保留原图，不会留下破图；
 *   4. 输出统一为渐进式 JPEG（商城 1200x1200 方图 / 生活 1200x900 横图），文件名不变，App 代码无需改动。
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SHOP_DIR = path.join(ROOT, 'assets', 'shop');
const LIFE_DIR = path.join(ROOT, 'assets', 'life');
const PY = process.env.HUANYU_PY || 'python';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MIN_BYTES = 24 * 1024;
const DUP_DISTANCE = 6;
const FILTERS = ['+filterui:imagesize-large', ''];
const RETRY = 2;

// 商城：每个商品 3 张（主图 / 细节 / 场景），英文检索词更容易命中干净的电商实拍图
const PRODUCTS = [
  {
    id: 'p1',
    queries: [
      'white cotton crew neck t-shirt product photo',
      'plain cotton t-shirt flat lay clothing',
      'cotton t-shirt detail fabric photo',
    ],
  },
  {
    id: 'p2',
    queries: [
      'wireless bluetooth earbuds charging case product photo',
      'true wireless earbuds review photo',
      'earbuds close up product shot',
      'headphones earbuds product photography isolated',
      'bluetooth earphone white background photo',
      '蓝牙耳机 充电仓 实拍 高清',
      '真无线耳机 产品图',
      'earbuds charging case top view photo',
      'bluetooth headset product photography',
    ],
  },
  {
    id: 'p3',
    queries: [
      'drip coffee bags coffee product photo',
      'coffee beans roasted arabica photo',
      'pour over coffee cup photo',
    ],
  },
  {
    id: 'p4',
    queries: [
      'fitness tracker smart band product photo',
      'smart watch sport band wrist photo',
      'activity tracker screen photo',
    ],
  },
  {
    id: 'p5',
    queries: [
      'hardcover book cover stack photo',
      'hardcover yearbook annual collection book photo',
      'book stack table photo',
    ],
  },
  {
    id: 'p6',
    queries: [
      'leather tote bag handbag product photo',
      'leather briefcase bag photo',
      'leather bag interior detail photo',
      'brown leather handbag product photography',
      'leather tote bag white background photo',
    ],
  },
  {
    id: 'p7',
    queries: [
      'portable juicer blender cup product photo',
      'personal blender portable smoothie bottle photo',
      'portable blender parts photo',
      'portable blender juicer white background',
      'usb rechargeable juicer cup photo',
    ],
  },
  {
    id: 'p8',
    queries: [
      'snack gift box assorted photo',
      'snack box packaging photo',
      'seaweed snack cocoa gift set photo',
      'gift hamper snacks box photo',
      'assorted cookie snack package photo',
    ],
  },
  {
    id: 'p9',
    queries: [
      'carbon plate running shoes product photo',
      'running sneaker side view photo',
      'running shoes sole close up photo',
      'running shoes product photography white background',
      'sneaker pair studio photo',
    ],
  },
  {
    id: 'p10',
    queries: [
      'monitor arm desk mount product photo',
      'single monitor desk stand bracket photo',
      'monitor arm workspace setup photo',
      'monitor mount vesa arm photography',
      'dual monitor arm desk bracket photo',
      '显示器支架 悬臂 实拍 高清',
      '电脑显示器 升降支架 产品图',
    ],
  },
];

// 本地生活：每个团单 1 张主图
const DEALS = [
  { id: 'd1', queries: ['beef noodle bowl restaurant photo', '兰州牛肉面 实拍', 'ramen noodle shop photo'] },
  { id: 'd2', queries: ['pour over coffee barista cafe photo', '手冲咖啡 咖啡馆 实拍', 'single origin coffee cafe photo'] },
  { id: 'd3', queries: ['courier delivery rider motorcycle city photo', '外卖骑手 同城配送 实拍', 'express delivery courier photo'] },
  { id: 'd4', queries: ['hotel king size bed room interior photo', '酒店 大床房 实拍', 'hotel room interior design photo'] },
  { id: 'd5', queries: ['cinema theater screen seats photo', '电影院 影厅 实拍', 'movie theater auditorium photo'] },
  { id: 'd6', queries: ['hair salon interior stylist photo', '美发店 理发店 实拍', 'hairdresser salon photo'] },
  { id: 'd7', queries: ['air conditioner cleaning service technician photo', '空调清洗 师傅 实拍', 'ac unit cleaning photo'] },
  { id: 'd8', queries: ['wetland park scenery boardwalk photo', '西溪湿地 风景 实拍', 'nature wetland lake scenery photo'] },
];

/* ------------------------------ 参数 ------------------------------ */

const argv = process.argv.slice(2);
const argOf = (name, d = '') => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : d;
};
const ONLY = argOf('only', 'all');
const LIMIT = parseInt(argOf('limit', '0'), 10) || 0;
// --files=p2_2,p6_2：只补指定位（失败项定向重试用）
const FILES = argOf('files', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => (s.endsWith('.jpg') ? s : `${s}.jpg`));

/* ------------------------------ 工具 ------------------------------ */

async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const timer = new AbortController();
  const id = setTimeout(() => timer.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: timer.signal });
  } finally {
    clearTimeout(id);
  }
}

async function searchCandidates(query, filter, count = 20) {
  const url =
    'https://www.bing.com/images/search?q=' +
    encodeURIComponent(query) +
    '&qft=' +
    encodeURIComponent(filter) +
    '&form=IRFLTR&first=1';
  let html = '';
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
    });
    if (!res.ok) return [];
    html = await res.text();
  } catch {
    return [];
  }
  const out = [];
  const re = /m="(\{[^"]+?\})"/g;
  let m;
  while ((m = re.exec(html)) && out.length < count) {
    const raw = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!obj.murl || out.some((x) => x.url === obj.murl)) continue;
    out.push({ url: obj.murl });
  }
  return out;
}

function readSize(buf) {
  if (buf.length > 24 && buf.subarray(0, 2).toString('latin1') === '\xFF\xD8') return jpegSize(buf);
  if (buf.length > 24 && buf.subarray(1, 4).toString('latin1') === 'PNG') {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length > 32 && buf.subarray(0, 4).toString('latin1') === 'RIFF') {
    const vp8 = buf.subarray(12, 16).toString('latin1');
    if (vp8 === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
    if (vp8 === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (vp8 === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

function jpegSize(buf) {
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const len = buf.readUInt16BE(offset + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { h: buf.readUInt16BE(offset + 5), w: buf.readUInt16BE(offset + 7) };
    offset += 2 + len;
  }
  return null;
}

async function download(url) {
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, Referer: 'https://www.bing.com/' } }, 25000);
  if (!res.ok) return { ok: false, why: 'HTTP ' + res.status };
  const type = String(res.headers.get('content-type') || '');
  if (!type.startsWith('image/')) return { ok: false, why: '非图片 ' + type.slice(0, 20) };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < MIN_BYTES) return { ok: false, why: '体积过小 ' + Math.round(buf.length / 1024) + 'KB' };
  const size = readSize(buf);
  if (!size || size.w < 2 || size.h < 2) return { ok: false, why: '无法解析尺寸' };
  return { ok: true, buf, size };
}

function hammingHex(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    d += (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1) + ((x >> 3) & 1);
  }
  return d;
}

function normalize(src, dst, w, h) {
  const r = spawnSync(PY, [path.join(__dirname, 'normalize_image.py'), src, dst, String(w), String(h), '88'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (r.status !== 0) return { ok: false, why: (r.stderr || 'python 失败').trim().slice(0, 60) };
  const hash = String(r.stdout || '').trim().split(/\s+/).pop();
  return { ok: true, hash };
}

/* ------------------------------ 主流程 ------------------------------ */

function buildTasks() {
  const tasks = [];
  if (ONLY !== 'life') {
    for (const p of PRODUCTS) {
      p.queries.forEach((q, i) => {
        tasks.push({
          file: `${p.id}_${i + 1}.jpg`,
          dir: SHOP_DIR,
          w: 1200,
          h: 1200,
          ladder: [1300, 1100, 900, 760],
          queries: [q],
        });
      });
    }
  }
  if (ONLY !== 'shop') {
    for (const d of DEALS) {
      tasks.push({
        file: `${d.id}.jpg`,
        dir: LIFE_DIR,
        w: 1200,
        h: 900,
        ladder: [1400, 1200, 1000],
        queries: d.queries,
      });
    }
  }
  const picked = FILES.length ? tasks.filter((t) => FILES.includes(t.file)) : tasks;
  return LIMIT ? picked.slice(0, LIMIT) : picked;
}

async function handle(task, state) {
  const target = path.join(task.dir, task.file);
  const tmp = path.join(os.tmpdir(), 'huanyu_raw_' + task.file);
  const reasons = [];

  for (let pass = 0; pass < task.ladder.length; pass += 1) {
    const needW = task.ladder[pass];
    const needH = Math.round((needW * task.h) / task.w);
    for (const query of task.queries) {
      for (const filter of FILTERS) {
        const candidates = await searchCandidates(query, filter);
        for (const cand of candidates) {
          if (state.usedUrls.has(cand.url)) continue;
          let got;
          try {
            got = await download(cand.url);
          } catch (err) {
            for (let r = 0; r < RETRY && !got; r += 1) {
              try {
                got = await download(cand.url);
              } catch {
                /* 继续重试 */
              }
            }
          }
          if (!got || !got.ok) {
            if (got && got.why) reasons.push(got.why);
            continue;
          }
          if (got.size.w < needW || got.size.h < needH) {
            reasons.push(`尺寸不足 ${got.size.w}x${got.size.h}`);
            continue;
          }
          fs.writeFileSync(tmp, got.buf);
          const done = normalize(tmp, target, task.w, task.h);
          if (!done.ok) {
            reasons.push(done.why);
            continue;
          }
          const dup = state.findDuplicate(done.hash);
          if (dup) {
            reasons.push(`与 ${dup} 重复`);
            continue;
          }
          state.usedUrls.add(cand.url);
          state.hashes[task.file] = done.hash;
          try {
            fs.unlinkSync(tmp);
          } catch {
            /* 忽略清理失败 */
          }
          return { ok: true, size: got.size, from: query };
        }
      }
    }
  }
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* 忽略清理失败 */
  }
  return { ok: false, why: reasons.slice(0, 4).join(' / ') || '无候选' };
}

(async () => {
  const tasks = buildTasks();
  const state = {
    hashes: {},
    usedUrls: new Set(),
    findDuplicate(hash) {
      if (!hash) return null;
      for (const [file, h] of Object.entries(this.hashes)) {
        if (h && hammingHex(h, hash) <= DUP_DISTANCE) return file;
      }
      return null;
    },
  };

  fs.mkdirSync(SHOP_DIR, { recursive: true });
  fs.mkdirSync(LIFE_DIR, { recursive: true });

  console.log(`开始补图：${tasks.length} 个位（only=${ONLY}）…\n`);
  let ok = 0;
  const failed = [];
  for (const task of tasks) {
    const started = Date.now();
    const r = await handle(task, state);
    const sec = ((Date.now() - started) / 1000).toFixed(1);
    if (r.ok) {
      ok += 1;
      console.log(`  ✅ ${task.file.padEnd(11)} 来源 ${r.size.w}x${r.size.h}  ${sec}s  ← ${r.from}`);
    } else {
      failed.push({ file: task.file, why: r.why });
      console.log(`  ⬜ ${task.file.padEnd(11)} 保留原图（${r.why}）  ${sec}s`);
    }
  }
  console.log(`\n完成：成功 ${ok} / ${tasks.length}`);
  if (failed.length) {
    console.log('未替换（沿用旧图）：');
    for (const f of failed) console.log(`  - ${f.file}: ${f.why}`);
  }
})();
