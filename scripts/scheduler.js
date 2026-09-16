/**
 * 常驻定时任务 —— npm run schedule
 *
 * 注意：服务端启动时已内置同一套定时调度（后台「自动化规则」配置的每日时间），
 *      两者不要同时运行，否则同一份数据会被重复采集。
 *      若服务是常驻运行的（npm start），直接用内置调度即可，不必跑本脚本。
 *
 * 任务计划：
 *   每 30 分钟 —— 刷新热点榜 / 爆款榜
 *   每 2 小时  —— 采集并按规则自动审核发布（scripts/collect.js）
 *   每天       —— 按 data/pipeline.json 的 schedule.times 执行完整流水线（scripts/auto-publish.js）
 */
const { execFile } = require('child_process');
const path = require('path');
const pipeline = require('../server/lib/pipeline');

const ROOT = path.resolve(__dirname, '..');

const run = (file, label, extraArgs = []) => {
  const started = Date.now();
  execFile(process.execPath, [path.join(__dirname, file), ...extraArgs], { cwd: ROOT }, (err, stdout, stderr) => {
    const ms = Date.now() - started;
    if (err) {
      console.error(`[${new Date().toLocaleString()}] ${label} 执行失败：${stderr || err.message}`);
      return;
    }
    const firstLine = String(stdout).trim().split('\n').filter(Boolean).slice(-1)[0] || '';
    console.log(`[${new Date().toLocaleString()}] ${label} 完成（${ms}ms） ${firstLine}`);
  });
};

const cfg = pipeline.getSettings();
const times = (cfg.schedule && cfg.schedule.times) || [];

console.log('内容定时任务已启动，按 Ctrl+C 退出。');
console.log('  · 每 30 分钟刷新榜单');
console.log('  · 每 2 小时采集并自动审核发布');
console.log(`  · 每天 ${times.join(' / ') || '（未配置）'} 执行完整流水线\n`);

run('refresh-ranks.js', '榜单刷新');
setInterval(() => run('refresh-ranks.js', '榜单刷新'), 30 * 60 * 1000);
setInterval(() => run('collect.js', '内容采集'), 2 * 60 * 60 * 1000);

let lastKey = '';
setInterval(() => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const key = `${d.toISOString().slice(0, 10)} ${hhmm}`;
  if (times.includes(hhmm) && lastKey !== key) {
    lastKey = key;
    console.log('\n===== 每日流水线 =====');
    run('auto-publish.js', '采集 + 审核 + 发布');
    run('fetch-images.js', '配图补齐', ['--apply']);
  }
}, 60 * 1000);
