/**
 * 一次性数据修复 —— npm run fix:dates
 *
 * 背景：RSS 源（人民网等）经常在 pubDate 里给出存档旧日期，早年的采集流程直接采信了它，
 *       导致"刚刚抓到的新闻"带着 2008 年这样的发布时间入库 —— 后果有两个：
 *         1. 时效规则（超过 36 小时）把它们成批误杀，待审池里几百条"已驳回"其实是好稿；
 *         2. 侥幸发出去的稿件排在列表最底部，前台根本看不到。
 *
 * 本脚本做两件事：
 *   1. 把明显不可信的发布时间纠正为"入库时间"（原值保留在 rssPublishedAt 供溯源）；
 *   2. 用修正后的时间重新评分，把当年被时效误杀的条目恢复成"待审"，交回运营流程。
 *
 * 只动两类数据：待审池 data/inbox.json 与采集来源的稿件 data/news.json（origin=pipeline），
 * 人工录入和种子稿件的时间是编辑有意设置的，一概不碰。
 *
 * 参数：
 *   --dry    只看会改多少，不落盘
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NEWS_FILE = path.join(ROOT, 'data', 'news.json');
const TRUST_WINDOW_MS = 48 * 3600 * 1000;   // 与 pipeline.trustPublishedAt 保持一致
const FUTURE_SLACK_MS = 6 * 3600 * 1000;

const dry = process.argv.includes('--dry');

function iso(ms) { return new Date(ms).toISOString(); }

/** 判断一个时间是否可信：不是未来、且在最近 48 小时内 */
function isTrustable(t, now) {
  if (Number.isNaN(t)) return false;
  if (t > now + FUTURE_SLACK_MS) return false;
  return now - t <= TRUST_WINDOW_MS;
}

/** 修复已发布稿件：只处理采集来源（origin=pipeline），人工/种子稿件不动 */
function fixNews(now) {
  const list = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8'));
  const arr = Array.isArray(list) ? list : (list.items || []);
  let fixed = 0;
  let oldest = null;

  arr.forEach((a) => {
    // 编辑在后台手工录入时可能刻意设置时间，这类不碰；其余（采集来源 / 早期导入）按可信度纠正
    if (a.origin === 'manual') return;
    const t = Date.parse(a.publishedAt || '');
    const ref = Date.parse(a.createdAt || '') || now;  // 入库时间作为兜底
    if (isTrustable(t, now)) return;
    a.rssPublishedAt = a.publishedAt || '';
    a.publishedAt = iso(Math.min(ref, now));
    a.publishedAtAdjusted = true;
    fixed += 1;
    if (!oldest || t < oldest) oldest = t;
  });

  if (!dry) {
    const out = Array.isArray(list) ? arr : { ...list, items: arr };
    fs.writeFileSync(NEWS_FILE, JSON.stringify(out, null, 2), 'utf8');
  }
  return { total: arr.length, fixed, oldest: oldest ? new Date(oldest).toISOString() : '' };
}

/** 修复待审池并重新评分 */
function fixInbox(now) {
  // 注意：必须先写完 news.json 再 require pipeline，否则它的内存副本会把改动覆盖回去
  const pipeline = require('../server/lib/pipeline');
  const sources = pipeline.listSources();
  const cfg = pipeline.getSettings();

  const docs = pipeline.inbox.all();
  let dateFixed = 0;
  let revived = 0;
  let stillRejected = 0;
  let publishable = 0;

  docs.forEach((d) => {
    const ref = Date.parse(d.collectedAt || d.createdAt || '') || now;
    const t = Date.parse(d.publishedAt || '');
    if (!isTrustable(t, now)) {
      d.rssPublishedAt = d.publishedAt || '';
      d.publishedAt = iso(Math.min(ref, now));
      d.publishedAtAdjusted = true;
      dateFixed += 1;
    }

    // 只有"未发布"的条目需要重新判定，已发布/已驳回人工处理的保持原状
    if (d.articleId) return;

    const source = sources.find((s) => s.id === d.sourceId)
      || { name: d.sourceName, weight: 1, tags: [] };
    const item = {
      title: d.title,
      summary: d.summary,
      paragraphs: (d.content || []).filter((b) => b.type === 'p').map((b) => b.text),
      publishedAt: d.publishedAt,
      link: d.sourceUrl,
      cover: d.cover
    };
    const verdict = pipeline.evaluate(item, source, cfg, { duplicated: false });
    const patch = {
      score: verdict.score,
      metrics: verdict.metrics,
      auto: { decision: verdict.decision, reasons: verdict.reasons, checkedAt: iso(now) }
    };

    if (d.status === 'rejected' && verdict.decision !== 'reject') {
      // 当年是因为"超过时效"被误杀的，现在时间可信了，放回待审池让运营重新走一遍
      const onlyExpired = /超过时效/.test(String((d.review && d.review.comment) || ''));
      if (onlyExpired) {
        patch.status = 'pending';
        patch.review = null;
        revived += 1;
      } else {
        stillRejected += 1;
      }
    }
    if (verdict.decision === 'publish') publishable += 1;
    pipeline.inbox.update(d.id, patch);
  });

  if (!dry) pipeline.flushAll();
  return { total: docs.length, dateFixed, revived, stillRejected, publishable };
}

function main() {
  const now = Date.now();
  console.log(`===== 发布时间修复 ${new Date().toLocaleString()}${dry ? '（演练，不落盘）' : ''} =====`);

  const n = fixNews(now);
  console.log(`\n[稿件库] 共 ${n.total} 篇，采集来源中被纠正 ${n.fixed} 篇`
    + (n.oldest ? `（最早的一个原时间是 ${n.oldest.slice(0, 10)}）` : ''));

  const b = fixInbox(now);
  console.log(`[待审池] 共 ${b.total} 条，纠正时间 ${b.dateFixed} 条`);
  console.log(`         重新评分后达到自动发布线 ${b.publishable} 条，`
    + `从"超时效误杀"中恢复 ${b.revived} 条，维持驳回 ${b.stillRejected} 条`);

  console.log(dry ? '\n演练结束，未写入任何文件。' : '\n修复完成，重启服务（npm start）后生效。');
}

try {
  main();
} catch (e) {
  console.error('修复失败：', e.message);
  process.exit(1);
}
