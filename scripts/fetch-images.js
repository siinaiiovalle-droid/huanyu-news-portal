/**
 * 为门户稿件批量获取高清配图
 *
 *   node scripts/fetch-images.js              # 补齐缺失的配图
 *   node scripts/fetch-images.js --force      # 全部重新下载
 *   node scripts/fetch-images.js --only=高铁   # 只处理标题含「高铁」的稿件
 *   node scripts/fetch-images.js --apply      # 下载完成后回写 data/news.json
 *
 * 逻辑：
 *   1. 按稿件标题 / 标签 / 图片说明生成中文检索词（优先人工映射表，其次按标题
 *      自动提炼核心词 + 频道视觉兜底词），去图库检索大尺寸原图；
 *   2. 逐张下载并校验（真实图片格式、分辨率优先 1400x780 以上、比例正常）；
 *   3. 用 Pillow 统一裁切为 1600x900 的渐进式 JPEG，存到 public/img/news/；
 *   4. 裁切后计算感知哈希（dHash），与 scripts/data/image-fingerprints.json 中
 *      已有的全部配图比对，重复的直接丢弃换下一张 —— 保证全站不出现重复配图；
 *   5. 把「稿件 -> 本地图片」的对应关系写入 scripts/data/photo-index.json，
 *      由 seed 与本站数据共用，保证重跑 npm run seed 依然是高清配图。
 */
const fs = require('fs');
const path = require('path');
const { buildQuery } = require('./lib/keywords');
const imageSearch = require('./lib/image-search');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'news.json');
const OUT_DIR = path.join(ROOT, 'public', 'img', 'news');
// 临时目录放系统临时区：重复图移入这里等系统清理，不在工作区内删除文件
const TMP_DIR = imageSearch.TMP_DIR;
const INDEX_FILE = path.join(__dirname, 'data', 'photo-index.json');
const LAST_RUN_FILE = path.join(__dirname, 'data', 'last-image-run.json');

const OUT_W = 1600;
const OUT_H = 900;
const QUALITY = 86;
/** 原图比例下限：新闻配图要横图，商城配图另有自己的比例区间 */
const MIN_SRC_RATIO = 1.2;

/** 每个频道补一个"看得见"的兜底词，避免纯抽象标签搜不到图 */
const CHANNEL_VISUAL = {
  china: '城市 街景', world: '国际 城市', finance: '金融 市场', tech: '科技 数码',
  sports: '体育 竞技', ent: '舞台 演出', auto: '汽车', culture: '文化 传统',
  health: '健康 生活', video: '影像 镜头'
};

/** 封面关键词（按标题前缀匹配，先命中先使用） */
const COVER_KEYWORDS = {
  '纪录片片段：数据中心': '数据中心 机房 服务器 机柜',
  '直播回放：城市马拉松': '城市马拉松 跑者 冲刺',
  '一分钟读懂：新能源车快充': '新能源汽车 充电桩 充电',
  '现场直击：国产大型邮轮': '大型邮轮 内部 甲板',
  '秋冬饮食指南': '蔬菜 水果 营养餐 餐桌',
  '睡眠门诊数据发布': '睡眠 卧室 夜晚 安静',
  '全民健身新趋势': '公园 晨跑 市民 健身',
  '秋冬流感高发期来临': '疫苗接种 医护人员 注射',
  '古籍数字化成果开放': '古籍 线装书 特写',
  '城市阅读空间扩容': '书店 阅读 夜晚 灯光',
  '非遗工坊走进城市商圈': '非遗 传统手工艺 工坊',
  '博物馆热持续升温': '博物馆 展厅 参观',
  '汽车出口再创新高': '汽车 出口 港口 滚装船',
  '二手车市场透明度提升': '二手车 汽车 交易市场',
  '智能驾驶进入': '自动驾驶 测试车 传感器',
  '充电 10 分钟续航': '电动汽车 充电站 快充',
  '剧集市场回归内容本位': '影视剧 拍摄 剧组 摄像机',
  '国风综艺出海': '汉服 国风 舞台 表演',
  '音乐节与文旅深度融合': '音乐节 舞台 观众 灯光',
  '国产动画电影票房破纪录': '动画电影 制作 特效',
  '游泳世界杯落幕': '游泳比赛 泳池 竞技',
  '国家队世预赛客场取胜': '足球比赛 球场 球员',
  '职业联赛收官战': '足球场 观众 看台',
  '城市马拉松报名人数创新高': '马拉松 起跑 跑者 人群',
  '开源社区年度报告': '程序员 写代码 电脑屏幕',
  '低空经济加速落地': '无人机 配送 物流 送货',
  '端侧 AI 手机出货': '智能手机 使用 特写',
  '液冷服务器出货量翻倍': '服务器 机柜 数据中心',
  '国产大模型推理成本': '数据中心 服务器 机柜 蓝色灯光',
  '黄金价格再创新高': '黄金 金条 投资',
  '人民币汇率双向波动': '人民币 外汇 汇率 钞票',
  '消费市场暖意渐浓': '购物中心 商场 人群 逛街',
  '外贸数据超预期': '港口 集装箱 吊机',
  'A 股三季报收官': '证券市场 交易 屏幕 数据',
  '海外中餐加速': '中餐 餐厅 菜品',
  '深空探测再传捷报': '运载火箭 发射 升空',
  '全球粮价连续三个月回落': '小麦 麦田 丰收',
  '国际航班持续恢复': '民航客机 机场 起飞',
  '全球气候峰会闭幕': '港口 货轮 航运',
  '国产大邮轮完成第二次': '大型邮轮 海上航行',
  '寒潮预警升级': '寒潮 降雪 城市 冬天',
  '城市体检报告发布': '老旧小区 改造 社区',
  '县域电商新样本': '农产品 冷链 物流 货车',
  '城市夜间经济回暖': '城市夜景 夜市 灯光',
  '全国高铁网再扩容': '复兴号 高铁 列车 城市'
};

/** 正文配图关键词（按图片说明前缀匹配） */
const FIGURE_KEYWORDS = {
  '清晨的公园步道': '公园 步道 晨跑 跑步',
  '扫描与校勘环节': '古籍 扫描 文献 数字化',
  '学员在非遗传承人': '扎染 手工 非遗',
  '展厅内观众驻足': '博物馆 展厅 观众',
  '海外工厂本地员工': '汽车 工厂 总装 生产线',
  '测试车辆在城市道路': '自动驾驶 测试车 传感器',
  '新能源汽车在快充桩': '电动车 充电桩 充电',
  '节目中展示的传统服饰': '汉服 传统服饰 器物',
  '制作团队在虚拟拍摄棚': '虚拟拍摄 摄影棚 绿幕',
  '梯队球员在教练': '青少年 足球 训练',
  '清晨阳光下，跑者': '马拉松 起跑 跑者',
  '开发者协作项目中': '程序员 团队 代码 协作',
  '用户在无网络环境': '手机 翻译 应用',
  '液冷机柜内部结构': '服务器 机柜 内部 线缆',
  '数据中心机柜指示灯': '数据中心 服务器 机柜 灯光',
  '演出与展会带动': '商业街 人流 消费',
  '港口集装箱作业': '港口 集装箱 吊机',
  '交易大厅内大屏': '股票 行情 显示屏 红色',
  '菜单结构本地化后': '中餐馆 门店 用餐',
  '运载火箭发射升空': '运载火箭 发射 尾焰',
  '主产区收割进度': '联合收割机 麦田 收割',
  '试点港口将建设': '港口 码头 船舶 加油',
  '邮轮靠泊期间': '邮轮 靠泊 港口',
  '改造后的社区公共空间': '社区 无障碍 坡道',
  '夜市摊位与商圈': '夜市 摊位 小吃',
  '新线路穿城而过': '高铁 线路 城市 列车'
};

/* ------------------------------ 工具 ------------------------------ */
/* 检索 / 下载 / 裁切 / 去重的公共实现在 scripts/lib/image-search.js（商城配图共用同一套） */

/** 新闻配图：要求横图（比例 ≥1.2），门槛 1400x780 → 1280x720 → 1000x560 逐档降级 */
async function resolveImage({ query, visual, dstFile, force }) {
  return imageSearch.resolveImage({
    query, visual, dstFile, force,
    outW: OUT_W, outH: OUT_H, quality: QUALITY,
    tiers: imageSearch.NEWS_TIERS, minRatio: MIN_SRC_RATIO
  });
}

/* ------------------------------ 主流程 ------------------------------ */

function slug(index, channel, kind) {
  return `${String(index + 1).padStart(2, '0')}-${channel}-${kind}`;
}

/**
 * 人工映射表检索词：标题 / 图片说明按子串命中映射表（先命中先使用），
 * 未命中则回退到按标题/标签/频道自动生成的检索词。
 */
function pickKeyword(map, text, fallback) {
  if (!text) return fallback;
  for (const [prefix, kw] of Object.entries(map)) {
    if (text.includes(prefix)) return kw;
  }
  return fallback;
}

/**
 * 稳定的文件名前缀。
 * 不能用数组下标命名：新稿件是 unshift 到数组开头的，下标会整体后移，
 * 导致新稿件套用旧文件名（旧文件已存在 → 直接复用 → 配图与内容不符）。
 * 规则：
 *   - photo-index.json 里已登记的稿件，沿用原文件名（重跑 seed 也不会丢图）；
 *   - 新稿件用 article.id 命名，与数组顺序无关。
 */
function prefixFor(article, index, i) {
  const hit = index[article.title];
  const known = hit && (hit.cover || (hit.figures || []).find(Boolean));
  if (known) {
    const m = /\/img\/news\/(.+)-(cover|fig\d+)\.jpg$/.exec(known);
    if (m) return m[1];
  }
  const safeId = String(article.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return safeId ? `a-${safeId}` : slug(i, article.channel, 'x');
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const apply = args.includes('--apply');
  const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);

  const articles = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true });

  const index = fs.existsSync(INDEX_FILE) ? JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')) : {};

  // 载入全站配图指纹，用于"不出现重复配图"
  imageSearch.loadFingerprints();
  imageSearch.ensureFingerprints(OUT_DIR);

  const jobs = [];

  articles.forEach((article, i) => {
    if (only && !article.title.includes(only)) return;
    const tags = (article.tags || []).filter(Boolean);
    const fallback = [tags[0], tags[1], CHANNEL_VISUAL[article.channel] || ''].filter(Boolean).join(' ');

    const prefix = prefixFor(article, index, i);
    const coverFile = `${prefix}-cover`;
    jobs.push({
      article, i, slot: 'cover',
      link: `/img/news/${coverFile}.jpg`,
      dstFile: path.join(OUT_DIR, `${coverFile}.jpg`),
      visual: CHANNEL_VISUAL[article.channel] || '',
      query: pickKeyword(
        COVER_KEYWORDS, article.title,
        buildQuery({ title: article.title, channel: article.channel, tags, fallback: fallback || article.title })
      )
    });

    (article.content || []).filter((b) => b.type === 'image').forEach((block, k) => {
      const figFile = `${prefix}-fig${k + 1}`;
      const caption = block.caption || '';
      jobs.push({
        article, i, slot: `figure:${k}`,
        link: `/img/news/${figFile}.jpg`,
        dstFile: path.join(OUT_DIR, `${figFile}.jpg`),
        visual: CHANNEL_VISUAL[article.channel] || '',
        query: pickKeyword(
          FIGURE_KEYWORDS, caption,
          buildQuery({ title: caption || article.title, channel: article.channel, tags, fallback: fallback || article.title })
        )
      });
    });
  });

  console.log(`待处理图片位：${jobs.length} 个（并发 4，缺失才下载）\n`);

  const results = [];
  let cursor = 0;
  async function worker(id) {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const r = await resolveImage({ query: job.query, visual: job.visual, dstFile: job.dstFile, force });
      results.push({ ...job, ...r });
      const flag = r.ok ? (r.cached ? '已存在' : '完成  ') : '失败  ';
      console.log(`[${String(results.length).padStart(3)}/${jobs.length}] ${flag} ${job.slot.padEnd(9)} ${job.query}`);
      if (!r.ok) console.log(`         └ ${r.why}`);
    }
  }
  await Promise.all([worker(1), worker(2), worker(3), worker(4)]);

  /* 回写索引与站点数据 */
  let okCount = 0;
  results.forEach((r) => {
    if (!r.ok) return;
    okCount += 1;
    const key = r.article.title;
    if (!index[key]) index[key] = { cover: '', figures: [] };
    if (r.slot === 'cover') index[key].cover = r.link;
    else index[key].figures[Number(r.slot.split(':')[1])] = r.link;
  });
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2) + '\n', 'utf8');

  if (apply) {
    const patched = articles.map((article) => {
      const hit = index[article.title];
      if (!hit || !hit.cover) return article;
      let k = -1;
      const content = (article.content || []).map((block) => {
        if (block.type === 'image') {
          k += 1;
          const link = hit.figures[k];
          return link ? { ...block, src: link } : block;
        }
        // 正文里的视频块同样用本稿封面做海报图，避免残留占位图
        if (block.type === 'video' && block.poster) {
          return { ...block, poster: hit.cover };
        }
        return block;
      });
      const video = article.video && article.video.poster
        ? { ...article.video, poster: hit.cover }
        : article.video;
      return { ...article, cover: hit.cover, content, video };
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify(patched, null, 2) + '\n', 'utf8');
  }

  const failed = results.filter((r) => !r.ok);
  const downloaded = results.filter((r) => r.ok && !r.cached).length;
  const cached = results.filter((r) => r.ok && r.cached).length;
  const dupRejected = results.reduce((n, r) => n + (r.dupRejected || 0), 0);

  console.log(`\n成功 ${okCount} / ${jobs.length}（新下载 ${downloaded}，已存在 ${cached}）`
    + `${apply ? '，已回写 data/news.json' : '（未回写，加 --apply 生效）'}`);
  console.log(`重复配图拦截 ${dupRejected} 次，全站指纹库共 ${Object.keys(imageSearch.fingerprints).length} 张`);
  if (failed.length) {
    console.log('失败清单：');
    failed.forEach((r) => console.log(`  - ${r.article.title} [${r.slot}] ${r.why}`));
  }

  // 供每日更新简报（scripts/daily.js）读取
  fs.mkdirSync(path.dirname(LAST_RUN_FILE), { recursive: true });
  fs.writeFileSync(LAST_RUN_FILE, JSON.stringify({
    at: new Date().toISOString(),
    total: jobs.length, ok: okCount, downloaded, cached, dupRejected,
    failed: failed.map((r) => ({ title: r.article.title, slot: r.slot, why: r.why }))
  }, null, 2) + '\n', 'utf8');

  try { fs.rmdirSync(TMP_DIR); } catch { /* 非空则保留 */ }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
