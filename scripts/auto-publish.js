/**
 * 自动审核与发布 —— npm run pipeline
 *
 * 用途：把"待审池 data/inbox.json"里的内容按规则跑一遍，
 *      达标的自动发布到前台，其余留待人工在后台复核；同时处理到点的定时发布。
 *
 * 流程：
 *   1. 采集（按 data/sources.json 的启用源）
 *   2. 自动审核（评分 + 敏感词 + 时效 + 去重）
 *   3. 达标自动发布，低分自动驳回，其余留待人工
 *   4. 到点发布定时内容、刷新榜单
 *
 * 参数：
 *   --limit=3        覆盖单源采集条数
 *   --no-publish     只采集与审核，不自动发布
 *   --review-only    不采集，仅对池中待审内容重跑审核
 */
const pipeline = require('../server/lib/pipeline');

function line(text) { console.log(text); }

async function main() {
  const args = process.argv.slice(2);
  const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').slice(8)) || 0;
  const noPublish = args.includes('--no-publish');
  const reviewOnly = args.includes('--review-only');
  const t0 = Date.now();

  line(`===== 内容流水线 ${new Date().toLocaleString()} =====`);
  const before = pipeline.stats();
  line(`开始前：待审 ${before.inbox.pending} 条 / 已发布稿件 ${before.news.published} 篇`);

  if (reviewOnly) {
    const r = pipeline.autoReviewPending({ by: 'cli' });
    line(`\n[审核] 检查 ${r.checked} 条 → 自动发布 ${r.autoPublished} 条，`
      + `自动驳回 ${r.rejected} 条，留待人工 ${r.pendingReview} 条`);
  } else {
    const run = await pipeline.runCollect({
      trigger: 'cli',
      limit,
      by: 'collector',
      autoPublish: noPublish ? false : undefined
    });
    line(`\n[采集] 抓取 ${run.fetched} 条 → 入库 ${run.added} 条（重复 ${run.duplicated}、`
      + `自动驳回 ${run.rejected}）→ 自动发布 ${run.autoPublished} 条`);
    (run.perSource || []).forEach((p) => {
      line(`  · ${p.name}：${p.error ? `失败（${p.error}）` : `抓取 ${p.fetched} / 入库 ${p.added}`}`);
    });
  }

  const due = pipeline.publishDue({ by: 'cli' });
  if (due.published) line(`\n[定时] 到点发布 ${due.published} 条`);

  const after = pipeline.stats();
  line('\n===== 本次简报 =====');
  line(`待审池：待审 ${after.inbox.pending} 条 / 已通过待发 ${after.inbox.approved} 条 / 已驳回 ${after.inbox.rejected} 条`);
  line(`稿件库：已发布 ${after.news.published} 篇 / 草稿 ${after.news.drafts} 篇 / 定时 ${after.news.scheduled} 篇`);
  line(`耗时：${((Date.now() - t0) / 1000).toFixed(1)}s`);
  line('\n提示：数据在 data/*.json 中，重启服务（npm start）后前台生效；'
    + '也可在后台「采集审核池」直接人工复核发布。');
}

main().catch((e) => {
  console.error('流水线执行失败：', e.message);
  process.exit(1);
});
