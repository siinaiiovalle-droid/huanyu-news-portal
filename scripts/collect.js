/**
 * 内容采集脚本 —— npm run collect
 *
 *新版行为（与后台"采集审核池"同一套流水线）：
 *   抓取 RSS / Atom → 写入待审池 data/inbox.json → 综合评分 → 自动审核
 *   → 达标的按规则自动发布到前台，其余留待人工在后台复核。
 *
 * 源配置：data/sources.json（也可在后台「采集源管理」维护）
 *   { "name": "人民网·财经", "channel": "finance", "url": "https://...",
 *     "enabled": true, "limit": 5, "tags": ["财经"], "weight": 1 }
 *
 * 自动审核规则见 data/pipeline.json（后台「自动化规则」可视化配置）：
 *   敏感词 / 时效 / 标题与正文字数 / 准入分值 / 自动发布分值 / 每轮发布上限 / 热点词加权
 *
 * 参数：
 *   --limit=3        覆盖所有源的单源条数上限
 *   --draft          本次只入池、不自动发布（全部留给人工复核）
 *   --publish        本次允许自动发布（默认跟随后台配置）
 */
const pipeline = require('../server/lib/pipeline');

async function main() {
  const args = process.argv.slice(2);
  const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').slice(8)) || 0;
  const noPublish = args.includes('--draft');
  const forcePublish = args.includes('--publish');

  const sources = pipeline.listSources().filter((s) => s.enabled !== false);
  if (!sources.length) {
    console.log('没有启用的采集源。请在后台「采集源管理」新增，或编辑 data/sources.json 把 enabled 设为 true。');
    return;
  }

  const run = await pipeline.runCollect({
    trigger: 'cli',
    limit,
    by: 'collector',
    autoPublish: noPublish ? false : (forcePublish ? true : undefined)
  });

  console.log(`\n【采集完成】抓取 ${run.fetched} 条，入库 ${run.added} 条`
    + `（重复 ${run.duplicated}、自动驳回 ${run.rejected}），自动发布 ${run.autoPublished} 条`);
  (run.perSource || []).forEach((p) => {
    console.log(`  · ${p.name}：${p.error ? `失败（${p.error}）` : `抓取 ${p.fetched} / 入库 ${p.added}`}`);
  });

  const s = pipeline.stats();
  console.log(`\n待审池：待审 ${s.inbox.pending} 条 / 已通过待发 ${s.inbox.approved} 条 / 已驳回 ${s.inbox.rejected} 条`);
  console.log('人工复核入口：后台 http://localhost:3000/admin.html → 采集审核池');
  console.log(`耗时 ${run.durationMs}ms`);
}

main().catch((e) => {
  console.error('采集失败：', e.message);
  process.exit(1);
});
