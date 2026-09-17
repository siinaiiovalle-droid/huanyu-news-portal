/**
 * 每日一键更新 —— npm run daily
 *
 * 流程（顺序刻意这样排 —— 图片永远不能挡住内容上线）：
 *   1. 采集   scripts/collect.js       按 RSS 源拉取新稿件（标题去重，单源限量）
 *   2. 刷榜   scripts/refresh-ranks.js 先让内容和榜单到位，前台能看才是最要紧的
 *   3. 配图   scripts/fetch-images.js  最后才补图（最耗时的一步），超时也只影响那几张图
 *   4. 输出当日简报
 *
 * 参数透传：npm run daily -- --limit=3 / --draft
 *
 * 注意：服务端把 data/*.json 缓存在内存里，脚本跑完后需要重启服务新内容才生效，
 *      生产环境建议配合 crontab 或 npm run schedule 使用。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const NEWS_FILE = path.join(ROOT, 'data', 'news.json');
const LAST_RUN_FILE = path.join(__dirname, 'data', 'last-image-run.json');

function run(script, args = [], timeoutMs = 0) {
  const started = Date.now();
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, script), ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      ...(timeoutMs ? { timeout: timeoutMs, killSignal: 'SIGTERM' } : {})
    });
    return { ok: true, ms: Date.now() - started, out: String(out || '') };
  } catch (e) {
    return {
      ok: false,
      ms: Date.now() - started,
      out: String(e.stdout || ''),
      err: String(e.stderr || e.message || '') + (e.killed ? '（已到时间上限被中断）' : '')
    };
  }
}

function countArticles() {
  try {
    const list = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8'));
    return Array.isArray(list) ? list.length : 0;
  } catch {
    return 0;
  }
}

function tail(text, n = 8) {
  const lines = String(text).trim().split('\n');
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const passArgs = args.filter((a) => /^--(limit=|draft|publish)/.test(a));
  const t0 = Date.now();

  console.log(`===== 每日更新 ${new Date().toLocaleString()} =====`);
  const before = countArticles();

  console.log('\n[1/4] 采集并按规则自动审核发布…');
  const collect = run('collect.js', passArgs);
  console.log(tail(collect.out, 12));
  if (!collect.ok) console.log(`  !! 采集异常：${collect.err.trim().slice(0, 200)}`);

  console.log('\n[2/4] 刷新榜单（内容先到位，不等图）…');
  const rank = run('refresh-ranks.js');
  console.log(tail(rank.out, 8));
  if (!rank.ok) console.log(`  !! 刷榜异常：${rank.err.trim().slice(0, 200)}`);

  console.log('\n[3/4] 补齐高清配图（内容相关 / 全局去重，限时 20 分钟）…');
  if (fs.existsSync(LAST_RUN_FILE)) fs.unlinkSync(LAST_RUN_FILE);
  const images = run('fetch-images.js', ['--apply'], 20 * 60 * 1000);
  console.log(tail(images.out, 12));
  if (!images.ok) {
    console.log(`  !! 配图没跑完：${images.err.trim().slice(0, 200)}`);
    console.log('  · 不影响内容：文章已经发布了，缺的图留到下次（后台配图队列 / 下一次同步）继续补');
  }

  const after = countArticles();
  const img = fs.existsSync(LAST_RUN_FILE)
    ? JSON.parse(fs.readFileSync(LAST_RUN_FILE, 'utf8'))
    : null;

  console.log('\n===== 更新简报 =====');
  console.log(`新增稿件：${Math.max(0, after - before)} 篇（全站共 ${after} 篇）`);
  try {
    const pipeline = require('../server/lib/pipeline');
    const s = pipeline.stats();
    console.log(`待审池：待审 ${s.inbox.pending} 条 / 已通过待发 ${s.inbox.approved} 条 / 已驳回 ${s.inbox.rejected} 条`);
    console.log(`人工复核：后台 → 采集审核池（http://localhost:3000/admin.html）`);
  } catch (e) {
    // 待审池统计失败不影响主流程
  }
  if (img) {
    console.log(`配图处理：${img.ok}/${img.total} 个图位就绪，新下载 ${img.downloaded} 张，`
      + `复用 ${img.cached} 张，重复拦截 ${img.dupRejected} 次`);
    if (img.failed && img.failed.length) {
      console.log(`配图失败：${img.failed.length} 个图位（可重跑 npm run fetch:images 重试）`);
    }
  } else {
    console.log('配图：本次没有产出运行报告（检查 fetch-images 是否执行成功）');
  }
  console.log(`耗时：${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('\n提示：数据已写入 data/*.json，重启服务（npm start）后前台才会看到新内容。');
}

main();
