/**
 * 正文结构化编辑辅助函数（供种子数据与后台编辑器使用同一种数据结构）
 */
const P = (text) => ({ type: 'p', text });
const H2 = (text) => ({ type: 'h2', text });
const QUOTE = (text) => ({ type: 'quote', text });
const LIST = (items) => ({ type: 'list', items });
const FIG = (src, caption) => ({ type: 'image', src, caption });
const VIDEO = (src, caption, poster = '') => ({ type: 'video', kind: 'mp4', src, caption, poster });
const IFRAME = (src, caption) => ({ type: 'video', kind: 'iframe', src, caption });

/** 常用公开测试视频源（部署时替换为自有 CDN 地址） */
const V = {
  flower: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  bbb: 'https://www.w3schools.com/html/mov_bbb.mp4',
  sintel: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
  oceans: 'https://www.w3schools.com/html/movie.mp4'
};

/** 本地图片资源 */
const IMG = (name) => `/img/${name}.png`;

/** 生成封面（无图时使用站内占位服务，保证离线也不空白） */
const ph = (text, theme = 'blue') =>
  `/api/v1/placeholder?w=800&h=450&text=${encodeURIComponent(text)}&theme=${theme}`;

module.exports = { P, H2, QUOTE, LIST, FIG, VIDEO, IFRAME, V, IMG, ph };
