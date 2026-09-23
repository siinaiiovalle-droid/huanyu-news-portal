/**
 * 中文标题关键词提炼（服务端与脚本共用）
 *   1) 采集入库 —— 生成稿件标签；
 *   2) 配图检索 —— 生成与内容相关的图片检索词、以及判断"这张图是不是这条新闻"的校验词；
 *   3) 自动审核 —— 命中热点词的内容加分。
 *
 * 两条踩过的坑：
 *   · 中文标题没有空格，按"停用字"硬切会把实体切碎（"中国选手李冰洁" → "国选手李冰洁"），
 *     所以切分只用多字停用词 + 新闻动词，单字虚词只用于校验词过滤；
 *   · 检索词必须保留标题的原始语义。早期实现提炼不出实体就退化成频道兜底词，
 *     出现过"亚运会夺金"配到 2021 年无关旧图的情况 —— 图是高清的，但和新闻没关系。
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

/** 多字停用词：用于切分；单字只用来过滤校验词，避免把"中国""胡塞武装"这类实体切碎 */
const STOP_MULTI = STOPWORDS.filter((w) => w.length >= 2);
const STOP_SINGLE = new Set(STOPWORDS.filter((w) => w.length === 1));

/** 新闻动词/事件词：把无空格的长标题切成实体片段（仅供标签生成，不参与检索词） */
const CUT_WORDS = [
  '获得', '夺得', '摘得', '拿下', '赢得', '斩获', '包揽', '卫冕', '夺冠', '晋级', '取胜', '击败', '战胜', '收获',
  '回应', '透露', '通报', '呼吁', '提醒', '建议',
  '举办', '开幕', '闭幕', '登场', '开赛', '收官', '落幕',
  '试飞', '发射', '升空', '启程', '抵达', '通车', '开通', '开工', '竣工', '投用', '上线', '上市',
  '增长', '下降', '上涨', '下跌', '突破', '创下', '达到', '超过', '签约', '中标', '收购', '投资', '减持',
  '携手', '助力', '赋能', '打造', '探索', '聚焦'
];

/** 频道视觉兜底词：只在标题本身太短/太抽象时才用，避免把"金融 交易 市场"混进航天新闻 */
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

/** 切出候选实体片段（供标签生成使用） */
function segments(title = '') {
  const parts = stripNoise(title).split(/\s+/).filter(Boolean);
  const out = [];
  parts.forEach((p) => {
    let seg = p;
    STOP_MULTI.forEach((w) => { seg = seg.split(w).join(' '); });
    CUT_WORDS.forEach((w) => { seg = seg.split(w).join(' '); });
    seg.split(' ').filter(Boolean).forEach((s) => {
      if (/[\u4e00-\u9fa5]/.test(s) && s.length >= 2 && s.length <= 8) out.push(s);
      else if (/[A-Za-z]/.test(s) && s.length >= 2 && s.length <= 12) out.push(s);
      else if (/^\d+$/.test(s) && s.length >= 4) out.push(s);
      else if (s.length > 8) { out.push(s.slice(0, 6), s.slice(-6)); }
    });
  });
  return out;
}

/** 取标题核心词（保序去重；过短数字串无意义） */
function keywordsFromTitle(title, limit = 3) {
  const seen = [];
  segments(title).forEach((s) => { if (!seen.includes(s)) seen.push(s); });
  return seen.filter((s) => !(/^\d+$/.test(s) && s.length < 4)).slice(0, limit);
}

/**
 * 生成图片检索词。
 * 关键：直接用清洗后的标题原文。Bing 对完整中文标题的理解远好于我们手工切出来的碎片，
 * 检索不到时由 queryVariants 逐级截短兜底，实在不行才退到频道视觉词。
 */
function buildQuery({ title = '', channel = '', tags = [], fallback = '' } = {}) {
  const plain = stripNoise(title).slice(0, 30).trim();
  const visual = CHANNEL_VISUAL[channel] || '';
  if (plain.length >= 6) return plain;
  if (plain) return visual ? `${plain} ${visual}` : plain;
  const core = [...keywordsFromTitle(title, 2), ...(tags || [])].filter(Boolean);
  if (core.length) return [...new Set(core)].slice(0, 3).join(' ');
  return fallback || visual || '新闻 事件';
}

/**
 * 相关性校验词：标题的连续 3 字片段（n-gram）。
 * 不做切词就不会切错实体；候选图的标题/来源页里只要出现其中任一片段，
 * 就说明它和这条新闻说得上话。含虚词的片段（"的报道"之类）直接丢掉。
 */
function buildTerms(text = '', limit = 24) {
  const s = stripNoise(String(text || '')).replace(/\s+/g, '');
  const out = [];
  for (let i = 0; i + 3 <= s.length && out.length < limit; i += 1) {
    const g = s.slice(i, i + 3);
    if (!/[\u4e00-\u9fa5]/.test(g)) continue;
    if ([...g].some((ch) => STOP_SINGLE.has(ch))) continue;
    if (!out.includes(g)) out.push(g);
  }
  return out;
}

module.exports = {
  STOPWORDS, CUT_WORDS, CHANNEL_VISUAL, STOP_MULTI, STOP_SINGLE,
  stripNoise, segments, keywordsFromTitle, buildTerms, buildQuery
};
