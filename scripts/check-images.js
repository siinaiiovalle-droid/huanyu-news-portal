#!/usr/bin/env node
/**
 * 发布前配图体检 —— npm run check:images
 *
 * 为什么需要它：数据里写了封面路径 ≠ 图片真的在本机。误删、回滚、迁移都可能让
 * public/img/news/ 里的文件消失，页面上就是一张破图。本脚本以「磁盘上的文件」为准，
 * 逐篇检查每个图位（封面 / 正文图 / 视频海报），把声称有图却没文件的稿件抓出来。
 *
 *   node scripts/check-images.js                    只体检，列出问题稿件
 *   node scripts/check-images.js --fix              顺手把缺的图下载回来（默认最多 30 篇）
 *   node scripts/check-images.js --fix --limit=80   本次最多补 80 篇
 *   node scripts/check-images.js --budget=600       本次补图总时间上限（秒，快模式默认 180，完整模式 900）
 *   node scripts/check-images.js --timeout=20       单篇补图超时（秒，快模式默认 12，完整模式 45）
 *   node scripts/check-images.js --mode=full        完整模式：封面 + 正文图（默认 fast 只补封面）
 *   node scripts/check-images.js --slots=2          每篇最多补几个图位
 *   node scripts/check-images.js --status=published 只检查指定状态的稿件（逗号分隔）
 *   node scripts/check-images.js --ids=xx,yy        只看这几篇
 *   node scripts/check-images.js --json             只输出 JSON 摘要
 *   node scripts/check-images.js --strict           还有没解决的问题就以退出码 1 结束
 *
 * 铁律：图片永远不能挡住发布。所以默认走快模式 —— 只补封面、优先用原文自带的图，
 * 单篇硬超时、整体有时间预算，到点立刻停手；没补上的稿件文字照常上线（前台走占位图），
 * 那张图留给下一次同步 / 后台配图队列继续补。每补完一篇就落盘，中途被打断也不丢已下的图。
 *
 * 运行报告：scripts/data/last-image-check.json（已 gitignore）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPORT_FILE = path.join(__dirname, 'data', 'last-image-check.json');
const image = require('../server/lib/image-service');
const svc = require('../server/lib/news-service');

/* ------------------------------- 参数 ------------------------------- */

const argv = process.argv.slice(2);
const hasFlag = (n) => argv.indexOf('--' + n) >= 0;
const flagValue = (n, d = '') => {
  const hit = argv.find((a) => a.indexOf('--' + n + '=') === 0);
  return hit === undefined ? d : hit.slice(n.length + 3);
};

const MODE = flagValue('mode', 'fast').toLowerCase() === 'full' ? 'full' : 'fast';
const DEFAULTS = MODE === 'fast'
  // 快模式（同步前默认）：只补封面、优先用原文自带的图，让新闻先上线要紧
  ? { budgetSec: 180, timeoutSec: 12, maxSlots: 1 }
  // 完整模式：封面 + 正文图都补，走图库检索，慢一些
  : { budgetSec: 900, timeoutSec: 45, maxSlots: 2 };

const OPT = {
  fix: hasFlag('fix'),
  clean: hasFlag('clean'),
  json: hasFlag('json'),
  strict: hasFlag('strict'),
  mode: MODE,
  limit: Math.max(1, Number(flagValue('limit', process.env.SYNC_IMAGE_LIMIT || 30)) || 30),
  budgetMs: (Math.max(1, Number(flagValue('budget', DEFAULTS.budgetSec)) || DEFAULTS.budgetSec)) * 1000,
  timeoutMs: (Math.max(1, Number(flagValue('timeout', DEFAULTS.timeoutSec)) || DEFAULTS.timeoutSec)) * 1000,
  maxSlots: Math.max(1, Number(flagValue('slots', DEFAULTS.maxSlots)) || DEFAULTS.maxSlots),
  status: flagValue('status', ''),
  ids: flagValue('ids', '').split(',').map((s) => s.trim()).filter(Boolean)
};

/** 时间到期就直接返回兜底结果，不等它 —— 图片永远不能把发布流程拖住 */
function withTimeout(promise, ms, fallback) {
  const limit = Number(ms) || 0;
  if (limit <= 0) return promise;
  let timer = null;
  const guard = new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), limit); });
  return Promise.race([promise, guard]).finally(() => { if (timer) clearTimeout(timer); });
}

function log(msg = '') {
  if (!OPT.json) console.log(msg);
}

function settings() {
  try {
    return require('../server/lib/pipeline').getSettings();
  } catch {
    return {};
  }
}

/** 本地服务是不是还在跑：它在跑的话，我们写回的封面可能被它缓存里的旧数据覆盖 */
function serviceAlive() {
  return new Promise((resolve) => {
    const sock = require('net').connect({ port: 3000, host: '127.0.0.1' });
    const done = (v) => { sock.destroy(); resolve(v); };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.setTimeout(800, () => done(false));
  });
}

/** 一句话描述这篇稿件缺什么 */
function describe(row) {
  const parts = row.slots.map((s) => {
    const why = s.state === 'missing' ? '文件不在本机'
      : s.state === 'external' ? '仍是外链未本地化'
        : '未配图';
    return `${s.slot}（${why}）`;
  });
  return `${row.title} → ${parts.join('、')}`;
}

/* ------------------------------- 主流程 ------------------------------- */

async function main() {
  const statuses = OPT.status ? OPT.status.split(',').map((s) => s.trim()).filter(Boolean) : null;
  // 先把指向不存在文件的引用清掉：不联网、秒级完成，保证推上线的不是破图地址
  const cleaned = OPT.clean ? image.cleanBrokenReferences({ statuses }) : { cleared: 0, items: [] };
  if (cleaned.cleared) log(`· 已清理 ${cleaned.cleared} 个指向缺失文件的图片引用（这些位置上头条时被换占位图）`);
  const before = image.audit({ statuses });
  const scoped = OPT.ids.length ? before.list.filter((a) => OPT.ids.includes(a.id)) : before.list;

  log(`===== 发布前配图体检 ${new Date().toLocaleString('zh-CN', { hour12: false })} =====`);
  log(`检查稿件 ${before.checked} 篇，配图齐全 ${before.ready} 篇，有问题的 ${scoped.length} 篇`);
  log(`图位统计：已落盘 ${before.states.ok} 个，文件缺失 ${before.states.missing} 个，`
    + `外链 ${before.states.external} 个，未配图 ${before.states.empty} 个`);
  if (scoped.length) {
    log('问题清单（前 20 篇）：');
    scoped.slice(0, 20).forEach((row) => log('  - ' + describe(row)));
    if (scoped.length > 20) log(`  … 其余 ${scoped.length - 20} 篇见报告文件`);
  }

  const report = {
    at: new Date().toISOString(),
    scope: { status: OPT.status || 'all', ids: OPT.ids, limit: OPT.limit },
    cleaned: { cleared: cleaned.cleared, items: cleaned.items.slice(0, 50) },
    before: {
      checked: before.checked, ready: before.ready, problems: before.problems,
      states: before.states, scopedProblems: scoped.length
    },
    fix: null
  };

  if (OPT.fix && scoped.length) {
    const cfg = settings();
    if (await serviceAlive()) {
      log('· 注意：本机服务（3000）正在运行，它缓存着旧数据，本脚本写回的封面可能被它覆盖回去 —— 建议同步前停掉服务');
    }
    const targets = scoped.slice(0, OPT.limit);
    const deadlineAt = Date.now() + OPT.budgetMs;
    const fast = OPT.mode === 'fast';
    log(`\n开始补图：${targets.length} 篇，${fast ? '快模式（只补封面；有原文链接的用原文图，没有才检索图库）' : '完整模式（封面 + 正文图）'}，`
      + `单篇上限 ${Math.round(OPT.timeoutMs / 1000)} 秒，总时间上限 ${Math.round(OPT.budgetMs / 1000)} 秒`);
    log('· 到点就停手：没配到图的稿件照常发布（前台走占位图），图片留给下一轮继续补');
    image.beginBatch();

    let filled = 0;
    let failed = 0;
    let handled = 0;
    let stoppedBy = '';
    const failures = [];
    for (let i = 0; i < targets.length; i += 1) {
      const left = deadlineAt - Date.now();
      if (left <= 0) {
        stoppedBy = '总时间到';
        log(`· ${stoppedBy}，剩下 ${targets.length - i} 篇留到下次（想多补点就加 --budget=秒数）`);
        break;
      }
      const row = targets[i];
      const article = svc.news.findById(row.id);
      if (!article) continue;
      // 有原文链接的优先走"原文图"这条又准又快的路；没有线索的才允许检索图库（更慢，但没有别的办法）
      const useFast = fast && !!(article.sourceUrl || article.sourceImage);
      const perMs = Math.min(useFast ? OPT.timeoutMs : Math.max(OPT.timeoutMs, 30000), left);
      let r;
      try {
        r = await withTimeout(
          image.ensureArticleImages(article, {
            proxy: cfg.proxy || '',
            maxSlots: OPT.maxSlots,
            fast: useFast,
            budgetMs: perMs
          }),
          perMs + 1500,
          { filled: 0, failed: 1, details: [{ slot: '封面', ok: false, why: `单篇超时（${Math.round(perMs / 1000)} 秒），留到下次补图` }] }
        );
      } catch (e) {
        r = { filled: 0, failed: 1, details: [{ slot: '', ok: false, why: e.message }] };
      }
      // 每篇立刻落盘：就算中途被中断，已经下载好的图也不会丢
      svc.news.flush();
      handled += 1;
      filled += r.filled || 0;
      failed += r.failed || 0;
      (r.details || []).filter((d) => !d.ok).forEach((d) => failures.push({ id: row.id, title: row.title, slot: d.slot, why: d.why }));
      const slotSummary = (r.details || []).map((d) => `${d.slot}${d.ok ? '✔' : '✘'}`).join(' ');
      const state = r.failed > 0 ? '部分失败' : (r.filled > 0 ? '完成  ' : '无需补');
      log(`[${String(i + 1).padStart(3)}/${targets.length}] ${state} ${row.title} ${slotSummary}`);
    }

    const after = image.audit({ statuses });
    report.fix = {
      mode: OPT.mode,
      requested: targets.length,
      handled,
      filled,
      failed,
      stoppedEarly: handled < targets.length,
      stoppedBy: stoppedBy || (handled < targets.length ? '未知' : ''),
      remaining: after.problems,
      failures: failures.slice(0, 50)
    };
    log(`\n补图结束：处理 ${handled} 篇，补齐 ${filled} 个图位，失败 ${failed} 个`);
    log(`复查：仍有 ${after.problems} 篇稿件的图没落盘（补图前 ${before.problems} 篇）`);
    log('· 这些稿件的文字内容不受影响，该发布照发布，缺的那张图下一轮再补');
    if (failures.length) {
      log('失败原因（前 10 条）：');
      failures.slice(0, 10).forEach((f) => log(`  - ${f.title} [${f.slot}] ${f.why}`));
    }
    report.after = {
      checked: after.checked, ready: after.ready, problems: after.problems, states: after.states
    };
  } else if (scoped.length) {
    log('\n（带 --fix 可在时间预算内把缺的图下载回来；上面这些稿件的文字不受影响）');
  }

  try {
    fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + '\n', 'utf8');
  } catch { /* 写报告失败不影响体检结果 */ }

  if (OPT.json) console.log(JSON.stringify(report, null, 2));

  if (OPT.strict && scoped.length && (!report.fix || report.fix.remaining > 0)) {
    console.error('! 仍有问题稿件：' + scoped.length + ' 篇');
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('配图体检失败：', err);
  process.exit(1);
});
