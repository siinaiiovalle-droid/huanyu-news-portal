/**
 * 为「寰宇严选」商城配图下载真实高清实拍图
 *
 *   node scripts/fetch-mall-images.js                # 只下载，不回写
 *   node scripts/fetch-mall-images.js --apply        # 下载后回写 data/mall.json
 *   node scripts/fetch-mall-images.js --only=g001    # 只处理某一件商品
 *   node scripts/fetch-mall-images.js --force        # 已存在的图也重下
 *   node scripts/fetch-mall-images.js --limit=8      # 本次最多处理 8 个图片位
 *
 * 与新闻配图同源（scripts/lib/image-search.js）：Bing 检索大图 → 下载校验 →
 * Pillow 统一裁切 → dHash 与全站已有配图比对去重，所以商品图不会与新闻图撞图，
 * 同一件商品的 4 个图位也不会出现重复。
 *
 * 输出：
 *   public/img/mall/g001-cover.jpg   封面（1000x1000 正方形）
 *   public/img/mall/g001-g1.jpg      主图 / 正面实拍
 *   public/img/mall/g001-g2.jpg      细节 · 材质
 *   public/img/mall/g001-g3.jpg      场景 · 生活
 *   public/img/mall/banner-1.jpg     首页轮播（1600x900 横图）
 *
 * 兜底：任何一个图位失败都保留原来的 /api/v1/placeholder，页面绝不出现破图；
 * 服务侧（server/lib/mall-service.js）还会校验文件是否真的存在，缺了就回退占位图。
 */
const fs = require('fs');
const path = require('path');
const imageSearch = require('./lib/image-search');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'mall.json');
const OUT_DIR = path.join(ROOT, 'public', 'img', 'mall');
const BANNER_DIR = OUT_DIR;
const LAST_RUN_FILE = path.join(__dirname, 'data', 'last-mall-image-run.json');

/** 商品图统一输出 1000x1000（页面展示最大 900 宽，留足 2x 屏余量） */
const GOODS_SIZE = 1000;
const GOODS_QUALITY = 88;
/** 原图门槛逐档降级：正方形商品图源比横图少，门槛相对宽松但仍有下限 */
const GOODS_TIERS = [[1000, 1000], [800, 800], [640, 640]];
/** 比例区间：允许竖图（0.6）与常规横图（1.8），长条图与全景图一律不要 */
const GOODS_MIN_RATIO = 0.6;
const GOODS_MAX_RATIO = 1.8;

/**
 * 商品检索主词。
 * 商品标题里的「寰宇声学 / 云图 / 晨雾 / 行者 …」都是自有品牌，图库里搜不到，
 * 所以一律按品类词检索 —— 搜到的是这类商品真实存在的实拍图，而不是品牌 Logo。
 */
const GOODS_QUERIES = {
  g001: '头戴式 主动降噪耳机',
  g002: '便携式 蓝牙音箱 户外',
  g003: '家用 智能摄像头 云台',
  g004: '运动 智能手表 户外',
  g005: '精装 摄影集 图书',
  g006: '手账本 笔记本 文具',
  g007: '地球仪 夜灯 摆件',
  g008: '手绘 明信片 文创 套装',
  g009: '桌面 香薰 加湿器',
  g010: '不锈钢 真空 保温杯',
  g011: '擦手巾 毛巾 叠放',
  g012: '折叠 收纳箱 布艺',
  g013: '明前 绿茶 茶叶 罐装',
  g014: '混合 谷物 燕麦 代餐',
  g015: '冻干 水果脆 零食 罐',
  g016: '坚果 礼盒 混合 果仁',
  g017: '露营 折叠桌 铝合金 户外',
  g018: '防晒 凉感 外套 户外',
  g019: '瑜伽垫 TPE 防滑',
  g020: '通勤 双肩包 背包',
  g021: '氨基酸 洁面乳 洗面奶',
  g022: '面霜 护肤 瓶装',
  g023: '电动牙刷 声波',
  g024: '洗发水 洗护 瓶装'
};

/** 每个图位的检索词后缀：主图 / 细节 / 场景 */
const SLOT_SUFFIX = ['产品 实拍', '细节 特写 材质', '场景 使用 生活'];

/** 首页轮播：横图，与新闻配图同一档门槛 */
const BANNER_QUERIES = [
  '精选 好物 电商 平铺 摄影',
  '限时 抢购 促销 购物车',
  '快递 包裹 物流 打包 发货'
];

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const apply = args.includes('--apply');
  const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
  const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').slice(8)) || 0;

  const products = readJson(DATA_FILE, []);
  if (!Array.isArray(products) || !products.length) {
    console.log('data/mall.json 为空，先启动一次服务生成商品数据（或跑 npm run seed）');
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  imageSearch.loadFingerprints();
  imageSearch.ensureFingerprints(OUT_DIR);

  /* ---------------------------- 组装任务 ---------------------------- */

  const jobs = [];

  products.forEach((p) => {
    if (only && p.id !== only) return;
    const base = GOODS_QUERIES[p.id];
    if (!base) {
      console.log(`跳过 ${p.id}（${p.title}）：没有配置检索词`);
      return;
    }
    jobs.push({
      id: p.id, slot: 'cover', link: `/img/mall/${p.id}-cover.jpg`,
      dstFile: path.join(OUT_DIR, `${p.id}-cover.jpg`), query: base,
      outW: GOODS_SIZE, outH: GOODS_SIZE,
      tiers: GOODS_TIERS, minRatio: GOODS_MIN_RATIO, maxRatio: GOODS_MAX_RATIO
    });
    SLOT_SUFFIX.forEach((suffix, i) => {
      jobs.push({
        id: p.id, slot: `g${i + 1}`, link: `/img/mall/${p.id}-g${i + 1}.jpg`,
        dstFile: path.join(OUT_DIR, `${p.id}-g${i + 1}.jpg`), query: `${base} ${suffix}`,
        outW: GOODS_SIZE, outH: GOODS_SIZE,
        tiers: GOODS_TIERS, minRatio: GOODS_MIN_RATIO, maxRatio: GOODS_MAX_RATIO
      });
    });
  });

  if (!only) {
    BANNER_QUERIES.forEach((query, i) => {
      jobs.push({
        id: `banner-${i + 1}`, slot: 'banner', link: `/img/mall/banner-${i + 1}.jpg`,
        dstFile: path.join(BANNER_DIR, `banner-${i + 1}.jpg`), query,
        outW: 1600, outH: 900,
        tiers: imageSearch.NEWS_TIERS, minRatio: 1.2, maxRatio: 3.2
      });
    });
  }

  const todo = limit ? jobs.slice(0, limit) : jobs;
  console.log(`待处理图片位：${todo.length} 个（并发 4，已存在的自动跳过）\n`);

  /* ---------------------------- 并发下载 ---------------------------- */

  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < todo.length) {
      const job = todo[cursor++];
      const r = await imageSearch.resolveImage({
        query: job.query,
        dstFile: job.dstFile,
        force,
        outW: job.outW, outH: job.outH,
        quality: job.slot === 'banner' ? 86 : GOODS_QUALITY,
        tiers: job.tiers,
        minRatio: job.minRatio,
        maxRatio: job.maxRatio
      });
      results.push({ ...job, ...r });
      const flag = r.ok ? (r.cached ? '已存在' : '完成  ') : '失败  ';
      console.log(`[${String(results.length).padStart(3)}/${todo.length}] ${flag} ${job.id.padEnd(9)} ${job.slot.padEnd(6)} ${job.query}`);
      if (!r.ok) console.log(`         └ ${r.why}`);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);

  /* ---------------------------- 回写数据 ---------------------------- */

  const okMap = {};
  results.forEach((r) => {
    if (!r.ok) return;
    if (!okMap[r.id]) okMap[r.id] = {};
    okMap[r.id][r.slot] = r.link;
  });

  if (apply) {
    const patched = products.map((p) => {
      const hit = okMap[p.id];
      if (!hit) return p;
      const gallery = (p.gallery || []).map((old, i) => hit[`g${i + 1}`] || old);
      return { ...p, cover: hit.cover || p.cover, gallery, updatedAt: new Date().toISOString() };
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify(patched, null, 2) + '\n', 'utf8');
  }

  const okCount = results.filter((r) => r.ok).length;
  const downloaded = results.filter((r) => r.ok && !r.cached).length;
  const cached = results.filter((r) => r.ok && r.cached).length;
  const dupRejected = results.reduce((n, r) => n + (r.dupRejected || 0), 0);
  const failed = results.filter((r) => !r.ok);

  console.log(`\n成功 ${okCount} / ${todo.length}（新下载 ${downloaded}，已存在 ${cached}）`
    + `${apply ? '，已回写 data/mall.json' : '（未回写，加 --apply 生效）'}`);
  console.log(`重复配图拦截 ${dupRejected} 次，全站指纹库共 ${Object.keys(imageSearch.fingerprints).length} 张`);
  if (failed.length) {
    console.log('失败清单（这些图位保留占位图，页面不会破图）：');
    failed.forEach((r) => console.log(`  - ${r.id} [${r.slot}] ${r.why}`));
  }

  fs.mkdirSync(path.dirname(LAST_RUN_FILE), { recursive: true });
  fs.writeFileSync(LAST_RUN_FILE, JSON.stringify({
    at: new Date().toISOString(),
    total: todo.length, ok: okCount, downloaded, cached, dupRejected,
    failed: failed.map((r) => ({ id: r.id, slot: r.slot, why: r.why }))
  }, null, 2) + '\n', 'utf8');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
