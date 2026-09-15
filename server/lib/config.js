/**
 * 站点基础配置 —— 修改这里即可完成品牌改名、频道增删、运营位数量调整
 */
const { ConfigStore } = require('./store');

/** 频道定义：id 与 App 端共用，勿随意变更 */
const CHANNELS = [
  { id: 'headline', name: '头条', show: false, desc: '全网最值得关注的头条资讯' },
  // 广场：社交媒体式信息流栏目（对标 Twitter），数据来自 posts 仓库而非稿件仓库，
  // 因此 isSocial 标记为 true，前台导航指向独立的 square.html
  { id: 'square', name: '广场', desc: '用户动态、热点讨论与实时信息流', isSocial: true },
  { id: 'china', name: '国内', desc: '国内要闻与社会民生' },
  { id: 'world', name: '国际', desc: '全球时事与外交观察' },
  { id: 'finance', name: '财经', desc: '宏观市场、产业与公司动态' },
  { id: 'tech', name: '科技', desc: '互联网、人工智能与前沿科技' },
  { id: 'sports', name: '体育', desc: '赛事报道与运动员动态' },
  { id: 'ent', name: '娱乐', desc: '影视综艺与明星资讯' },
  { id: 'auto', name: '汽车', desc: '新车、评测与出行产业' },
  { id: 'culture', name: '文化', desc: '阅读、艺术与非遗传承' },
  { id: 'health', name: '健康', desc: '医疗科普与健康生活' },
  { id: 'video', name: '视频', desc: '短视频与直播精选', isVideo: true }
];

const DEFAULT_SITE = {
  company: '寰宇传媒信息技术股份有限公司',
  siteName: '寰宇新闻网',
  shortName: '寰宇新闻',
  domain: 'http://localhost:3000',
  slogan: '洞察世界 · 传递真相 · 连接未来',
  logoText: '寰宇',
  nav: CHANNELS.filter((c) => c.show !== false).map((c) => c.id),
  icp: '京ICP备XXXXXXXX号',
  copyright: '寰宇传媒信息技术股份有限公司',
  hotSize: 10,
  blastSize: 10,
  focusSize: 6,
  homeChannelSize: 5,
  pageSize: 20
};

const site = new ConfigStore('site', DEFAULT_SITE);

/** 始终返回完整合并后的配置（兼容新增字段） */
function getSite() {
  const data = { ...DEFAULT_SITE, ...site.all() };
  if (!Array.isArray(data.nav) || !data.nav.length) data.nav = DEFAULT_SITE.nav;
  return data;
}

function getChannel(id) {
  return CHANNELS.find((c) => c.id === id) || null;
}

function getChannelName(id) {
  const c = getChannel(id);
  return c ? c.name : id;
}

module.exports = { CHANNELS, DEFAULT_SITE, site, getSite, getChannel, getChannelName };
