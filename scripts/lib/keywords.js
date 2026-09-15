/**
 * 从中文标题中提炼"内容核心词"，供以下两处共用：
 *   1) collect.js      —— 生成稿件标签；
 *   2) fetch-images.js —— 生成图片检索词，保证配图与内容相关。
 *
 * 思路（无第三方依赖）：
 *   清洗标点 → 按停用词切分 → 取 2~6 字的实体片段 → 拼接频道视觉兜底词。
 * 频道兜底词的作用：纯抽象标题（如"稳中向好"）也能搜到"拍得出来"的画面。
 */

const STOPWORDS = [
  '的', '了', '在', '和', '与', '对', '为', '将', '等', '是', '也', '并', '而', '被', '把', '从',
  '向', '中', '其', '这', '那', '有', '及', '以', '就', '都', '个', '更', '再', '还',
  '我们', '他们', '一个', '进行', '表示', '认为', '目前', '已经', '正在', '今天', '今年', '明日',
  '我国', '全国', '全球', '首个', '正式', '宣布', '开展', '发布', '举行', '指出', '强调', '要求',
  '记者', '报道', '获悉', '消息', '相关', '有关', '多个', '进一步', '持续', '推进', '加强',
  '提升', '实现', '完成', '启动', '开始', '全面', '深入', '积极', '不断', '以来', '目前',
  '如何', '什么', '为何', '这些', '那些', '可以', '应该', '需要', '通过', '对于', '关于'
];

/** 频道视觉兜底词：保证检索词里至少有一个"看得见"的主体 */
const CHANNEL_VISUAL = {
  china: '城市 街景',
  world: '城市 建筑 风光',
  finance: '金融 交易 市场',
  tech: '科技 数码 电子',
  sports: '体育 竞技 赛场',
  ent: '舞台 演出 表演',
  auto: '汽车 车辆',
  culture: '文化 传统 艺术',
  health: '健康 医疗 生活',
  video: '影像 镜头 摄像机'
};

function stripNoise(s = '') {
  return String(s)
    .replace(/[《》〈〉""''()（）[\]【】{}:：,，。！？!?、；;·\-—_\s]+/g, ' ')
    .trim();
}

/** 切出候选实体片段 */
function segments(title = '') {
  const parts = stripNoise(title).split(/\s+/).filter(Boolean);
  const out = [];
  parts.forEach((p) => {
    let seg = p;
    STOPWORDS.forEach((w) => { seg = seg.split(w).join(' '); });
    seg.split(' ').filter(Boolean).forEach((s) => {
      if (/[一-龥]/.test(s) && s.length >= 2 && s.length <= 6) out.push(s);
      else if (/[A-Za-z]/.test(s) && s.length >= 2) out.push(s);
    });
  });
  return out;
}

/** 取标题核心词（保序去重） */
function keywordsFromTitle(title, limit = 3) {
  const seen = [];
  segments(title).forEach((s) => { if (!seen.includes(s)) seen.push(s); });
  return seen.slice(0, limit);
}

/**
 * 生成与内容相关的图片检索词
 * 组成：标题核心词 + 标签 + 频道视觉兜底词
 */
function buildQuery({ title = '', channel = '', tags = [], fallback = '' } = {}) {
  const core = [...keywordsFromTitle(title, 3), ...(tags || []).filter(Boolean)];
  const uniq = [...new Set(core.filter(Boolean))].slice(0, 3).join(' ');
  const visual = CHANNEL_VISUAL[channel] || '';
  if (uniq && visual) return `${uniq} ${visual}`;
  return uniq || fallback || visual || '新闻 事件';
}

module.exports = { STOPWORDS, CHANNEL_VISUAL, stripNoise, keywordsFromTitle, buildQuery };
