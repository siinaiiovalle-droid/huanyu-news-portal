/**
 * 榜单刷新脚本 —— npm run rank
 * 作用：
 *   1. 按阅读/点赞/评论/分享综合热度重排，自动标记"热点"标记位；
 *   2. 按近 48 小时增速重排，自动标记"爆款"标记位；
 *   3. 清零增速窗口，为下一个统计周期做准备（建议每日早晚各执行一次）。
 */
const portal = require('../server/lib/portal');
const svc = require('../server/lib/news-service');

const result = portal.refreshRanks();
svc.news.flush();

console.log('【榜单刷新完成】');
console.log(`  稿件总数：${result.total}`);
console.log(`  自动热点：${result.autoHot} 篇`);
console.log(`  自动爆款：${result.autoBlast} 篇`);
console.log(`  运营位变更：${result.changed} 篇`);
console.log(`  刷新时间：${result.refreshedAt}`);

console.log('\n当前热点榜 Top 5：');
portal.getHotRank(5).forEach((a, i) => console.log(`  ${i + 1}. ${a.title}（热度 ${a.hotScore}）`));

console.log('\n当前爆款榜 Top 5：');
portal.getBlastRank(5).forEach((a, i) => console.log(`  ${i + 1}. ${a.title}（增速 ${a.blastScore}）`));
