#!/usr/bin/env node
/**
 * 本地 → GitHub 同步（每天定时任务跑的就是它）
 *
 * 这个项目走「本地干活、线上只读」的路子：
 *   1. 本地起服务（npm start），在 /admin.html 里采集 / 审核 / 发布，
 *      内容写进本地库 data/*.json，新配图落在 public/img/news/；
 *   2. 每天定时跑本脚本，把本地库文件与图片推到 GitHub（main 分支）；
 *   3. 顺手重建静态站并发布到 gh-pages，线上站点随即显示当天内容。
 *
 * 用法：
 *   npm run sync                 完整同步：体检配图 + 数据 + 图片 + 重建发布静态站
 *   npm run sync -- --no-site    只推数据与图片，不重建站点（更快）
 *   npm run sync -- --no-images  跳过配图检查与补图（赶时间时用）
 *   npm run sync -- --images-limit=80     本次最多补 80 篇配图（默认 30）
 *   npm run sync -- --images-budget=600   本次补图时间上限（秒，默认 180，到点停手也不影响已推送的文字）
 *   npm run sync -- --images-mode=full    连正文图一起补（默认 fast 只补封面）
 *   npm run sync -- --dry-run    只列变化，不提交不推送
 *   npm run sync -- --no-push    只做本地提交，不推远端
 *   npm run sync -- --message="补充三篇财经稿"
 *
 * 图片不能耽误新闻发布，所以顺序是：
 *   ① 推送前 —— 跑 scripts/check-images.js：检查要发布的新闻，每个引用了图片的图位
 *      是否真有文件躺在 public/img/news/ 里；指向缺失文件的引用当场清掉（不联网、秒级完成），
 *      避免把破图地址推上线；
 *   ② 文字内容照常提交并推送 —— 一张图都不等；
 *   ③ 推送后 —— 才开始下载缺的图，受时间预算约束，补到了再单独推一次「图片提交」。
 *
 * 运行报告：scripts/data/last-sync.json   （已 gitignore）
 * 运行日志：logs/sync.log                 （由 sync.bat 重定向，已 gitignore）
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PAGES_DIR = path.join(ROOT, 'gh-pages');
const LOG_DIR = path.join(ROOT, 'logs');
const LOCK_FILE = path.join(LOG_DIR, 'sync.lock');
const REPORT_FILE = path.join(__dirname, 'data', 'last-sync.json');

/** 要同步的内容：本地库 + 图片 + 站点代码 + 根目录入口脚本（gh-pages/ 已被 .gitignore 忽略，不会带进 main） */
const SYNC_PATHS = ['data', 'public', 'scripts', 'server', 'docs', '*.bat', 'README.md', 'package.json', '.gitignore'];
const BRANCH = 'main';
const PAGES_BRANCH = 'gh-pages';
const PUSH_RETRY = Math.max(1, Number(process.env.SYNC_PUSH_RETRY) || 3);

/* -------------------------------- 参数 -------------------------------- */

const argv = process.argv.slice(2);
const hasFlag = (n) => argv.indexOf('--' + n) >= 0;
const flagValue = (n, d = '') => {
  const hit = argv.find((a) => a.indexOf('--' + n + '=') === 0);
  return hit === undefined ? d : hit.slice(n.length + 3);
};
const OPT = {
  site: !hasFlag('no-site'),
  dryRun: hasFlag('dry-run'),
  push: !hasFlag('no-push'),
  images: !hasFlag('no-images'),
  imageLimit: Number(flagValue('images-limit', process.env.SYNC_IMAGE_LIMIT || 30)) || 30,
  imageBudgetSec: Number(flagValue('images-budget', process.env.SYNC_IMAGE_BUDGET || 180)) || 180,
  imageMode: flagValue('images-mode', process.env.SYNC_IMAGE_MODE || 'fast').toLowerCase() === 'full' ? 'full' : 'fast',
  message: flagValue('message')
};

/* ------------------------------- 小工具 ------------------------------- */

function log(msg = '') { console.log(msg); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function fail(msg) { throw new Error(msg); }
function now() { return new Date().toLocaleString('zh-CN', { hour12: false }); }
function short(id) { return String(id || '').slice(0, 7); }

/** 执行 git；GIT_TERMINAL_PROMPT=0 保证无人值守时不会卡在账号密码提示上 */
function git(args, cwd = ROOT) {
  const r = spawnSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat' })
  });
  return {
    ok: r.status === 0,
    out: String(r.stdout || ''),
    err: String(r.stderr || (r.error && r.error.message) || '')
  };
}

function gitOrFail(args, cwd, what) {
  const r = git(args, cwd);
  if (!r.ok) fail(what + '失败：' + (r.err || r.out).trim().split('\n').slice(0, 4).join(' | '));
  return r;
}

/* --------------------------- 单实例锁 / 前置检查 --------------------------- */

function acquireLock() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  if (fs.existsSync(LOCK_FILE)) {
    const age = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
    if (age < 2 * 3600 * 1000) {
      const info = fs.readFileSync(LOCK_FILE, 'utf8').trim();
      fail('上一次同步还没结束（' + Math.round(age / 60000) + ' 分钟前，' + info + '），本次跳过');
    }
    log('· 发现超过 2 小时的陈旧锁，忽略并继续');
  }
  fs.writeFileSync(LOCK_FILE, 'pid=' + process.pid + ' at=' + new Date().toISOString());
}
function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (e) { /* 忽略 */ }
}

function preflight() {
  gitOrFail(['rev-parse', '--is-inside-work-tree'], ROOT, '检查 git 仓库');
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).out.trim();
  if (branch !== BRANCH) fail('当前分支是 ' + branch + '，本脚本只从 ' + BRANCH + ' 分支同步，请先切回');
  if (fs.existsSync(path.join(ROOT, '.git', 'MERGE_HEAD'))) fail('仓库正处于合并冲突中，请先解决冲突再同步');
  const remote = git(['remote', 'get-url', 'origin']).out.trim();
  if (!remote) fail('没有配置 origin 远端，无法推送');
  log('· 仓库：' + ROOT);
  log('· 远端：' + remote);
  return remote;
}

/** 本地服务在跑的话，内存里的改动可能还没落盘，等它一会儿 */
async function waitForLocalService() {
  const busy = await new Promise((resolve) => {
    const sock = net.connect({ port: 3000, host: '127.0.0.1' });
    const done = (v) => { sock.destroy(); resolve(v); };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.setTimeout(800, () => done(false));
  });
  if (busy) {
    log('· 检测到本地服务在运行（3000），等 1.5 秒让内存数据落盘…');
    await sleep(1500);
  }
  return busy;
}

/* ------------------------------ 同步前配图体检 ------------------------------ */

/**
 * 每次同步必做的一件事：检查「要发布的新闻」的图片是不是真在本机。
 * 数据里写了 /img/news/xxx.jpg 不代表文件存在 —— 文件没了，推上去就是一张破图。
 *
 * 分两步，是为了不让图片拖住发布：
 *   1. 推送前（fix=false）：只体检 + 清掉指向缺失文件的引用，不联网，秒级完成；
 *   2. 推送后（fix=true）：文字已经上网了才下载缺的图，受时间预算与硬超时约束，
 *      补到了就再推一次「图片专用」提交，补不到就留给下一轮。
 */
function checkImages({ fix = true, clean = true } = {}) {
  const reportFile = path.join(__dirname, 'data', 'last-image-check.json');
  try { if (fs.existsSync(reportFile)) fs.unlinkSync(reportFile); } catch { /* 忽略 */ }

  log(fix
    ? '· 配图补缺（下载还没落地的图，受时间预算约束）…'
    : '· 发布前配图体检（检查要发布的新闻的图有没有真的下载到本地）…');
  const t0 = Date.now();
  const args = [
    path.join(ROOT, 'scripts', 'check-images.js'),
    ...(clean ? ['--clean'] : []),
    ...(fix && !OPT.dryRun ? ['--fix'] : []), // 只演练的话不下载，避免白跑网络请求
    `--limit=${OPT.imageLimit}`,
    `--budget=${OPT.imageBudgetSec}`,
    `--mode=${OPT.imageMode}`
  ];
  // 兜底硬超时：图片再慢也只能占这么久，到点杀掉脚本继续推送 —— 新闻发布的及时性优先
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: (OPT.imageBudgetSec + 45) * 1000,
    killSignal: 'SIGTERM'
  });
  String(r.stdout || '').trim().split('\n').forEach((l) => log('    ' + l));
  if (r.status !== 0 || r.error) {
    log('    ! 体检未跑完：' + (r.error ? r.error.message : String(r.stderr || '').trim().split('\n').slice(-2).join(' | ') || '未知错误'));
    log('    ! 不影响发布：文字照推，图片留给下一轮（下一次同步或后台配图队列）继续补');
  }

  let report = null;
  try {
    if (fs.existsSync(reportFile)) report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  } catch { /* 报告读不到不影响后续推送 */ }

  // 脚本被超时杀掉也没关系：文字内容照推，只是这一轮没补上图
  if (!report) return { seconds: Math.round((Date.now() - t0) / 1000), report: { timedOut: true, before: {}, fix: {} } };

  const b = report.before || {};
  const f = report.fix || {};
  log('    体检结果：检查 ' + (b.checked || 0) + ' 篇，配图齐全 ' + (b.ready || 0) + ' 篇，'
    + '有问题 ' + (b.scopedProblems || 0) + ' 篇'
    + (f.handled != null ? '；本次补图 ' + f.handled + ' 篇 / ' + (f.filled || 0) + ' 个图位，仍有 ' + (f.remaining || 0) + ' 篇待处理' : '')
    + '（用时 ' + Math.round((Date.now() - t0) / 1000) + ' 秒）');

  return { seconds: Math.round((Date.now() - t0) / 1000), report };
}

/* ------------------------------ 变更识别 ------------------------------ */

function changedFiles() {
  const r = gitOrFail(['status', '--porcelain', '--', ...SYNC_PATHS], ROOT, '读取本地改动');
  return r.out.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => ({
    code: line.slice(0, 2).trim(),
    file: line.slice(2).trim().replace(/^"(.*)"$/, '$1')
  }));
}

function describe(files) {
  const img = files.filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f.file));
  const json = files.filter((f) => f.file.indexOf('data/') === 0 && /\.json$/i.test(f.file));
  let bytes = 0;
  img.forEach((f) => {
    try { bytes += fs.statSync(path.join(ROOT, f.file)).size; } catch (e) { /* 删除的文件 */ }
  });
  log('· 待同步改动 ' + files.length + ' 个文件，其中本地库 ' + json.length + ' 个、图片 ' + img.length + ' 张（'
    + (bytes / 1048576).toFixed(1) + ' MB）');
  files.slice(0, 12).forEach((f) => log('    ' + f.code + '  ' + f.file));
  if (files.length > 12) log('    … 其余 ' + (files.length - 12) + ' 个');
  return { total: files.length, json: json.length, images: img.length, imageBytes: bytes };
}

/* ------------------------------ 提交与推送 ------------------------------ */

function commitAll(files, message, cwd = ROOT) {
  gitOrFail(['add', '-A', '--', ...SYNC_PATHS], cwd, '暂存改动');
  gitOrFail(['commit', '-m', message], cwd, '提交');
  const head = git(['rev-parse', 'HEAD'], cwd).out.trim();
  log('· 已提交 ' + short(head) + '：' + files.length + ' 个文件');
  return head;
}

/** 远端某分支指向的 commit（也是推送成功与否的唯一判据） */
function remoteHead(cwd, branch) {
  const r = git(['ls-remote', 'origin', 'refs/heads/' + branch], cwd);
  if (r.ok) {
    const m = r.out.trim().split(/\s+/)[0];
    if (m) return m;
  }
  return '';
}

/** 推送 + 以远端 commit 为准做校验；代理抖动常出现「命令报错但已推成功」 */
async function pushAndVerify(cwd, branch, label) {
  const head = git(['rev-parse', 'HEAD'], cwd).out.trim();
  for (let i = 1; i <= PUSH_RETRY; i++) {
    log('· 推送 ' + label + '（第 ' + i + '/' + PUSH_RETRY + ' 次）…');
    const r = git(['push', 'origin', branch], cwd);
    if (r.out.trim()) log('    ' + r.out.trim().split('\n').slice(-2).join('\n    '));
    if (!r.ok) log('    推送命令报错：' + (r.err.trim().split('\n').slice(-2).join(' | ') || '未知错误'));

    const remote = remoteHead(cwd, branch);
    if (remote && remote === head) {
      log('    ✔ ' + label + ' 已同步，远端 ' + short(head) + (r.ok ? '' : '（命令虽报错，但远端已是本地这个版本，属代理抖动）'));
      return { ok: true, commit: head };
    }
    if (/non-fast-forward|rejected|fetch first/i.test(r.err)) {
      log('    远端有新提交，先 rebase 再重试…');
      const rb = git(['pull', '--rebase', 'origin', branch], cwd);
      if (!rb.ok) return { ok: false, error: 'rebase 失败：' + rb.err.trim().split('\n').slice(-2).join(' | ') };
    }
    if (i < PUSH_RETRY) await sleep(15000);
  }
  return { ok: false, error: '重试 ' + PUSH_RETRY + ' 次后远端仍不是本地版本（远端 ' + short(remoteHead(cwd, branch)) + '，本地 ' + short(head) + '）' };
}

/**
 * 补图落在主推送之后：新闻文字已经上网了，图片才轮得上网络。
 * 有成果就再提一次小而干净的提交并推走；没有就什么都不做（不会多一次无意义的推送）。
 */
async function pushRemainingImages() {
  const files = changedFiles();
  if (!files.length) {
    log('· 本轮没有新增图片，无需二次提交');
    return { ok: true, changed: 0, skipped: true };
  }
  const d = describe(files);
  const msg = '发布后补图：新增配图 ' + d.images + ' 张（' + new Date().toLocaleString('zh-CN', { hour12: false }) + '）';
  const commit = commitAll(files, msg);
  const r = OPT.push ? await pushAndVerify(ROOT, BRANCH, 'main（补图）') : { ok: true, skipped: true, commit };
  return Object.assign({ changed: files.length, commit }, r);
}

/* ------------------------------ 静态站发布 ------------------------------ */

async function publishPages() {
  if (!fs.existsSync(path.join(PAGES_DIR, '.git'))) {
    log('· 跳过站点发布：gh-pages/ 不是独立 git 检出');
    return { ok: false, error: 'gh-pages 目录缺失' };
  }
  log('· 重建静态站（node scripts/build-static.js）…');
  const t0 = Date.now();
  const b = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-static.js')], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  });
  const tail = String(b.stdout || '').trim().split('\n').slice(-3).join(' | ');
  if (b.status !== 0) {
    log('    构建失败：' + (String(b.stderr || '').trim().split('\n').slice(-3).join(' | ') || tail));
    return { ok: false, error: 'build-static 失败' };
  }
  log('    构建完成，用时 ' + Math.round((Date.now() - t0) / 1000) + ' 秒：' + tail);

  const st = git(['status', '--porcelain'], PAGES_DIR).out.trim();
  if (!st) {
    log('· 静态站内容没有变化，跳过 gh-pages 推送');
    return { ok: true, changed: 0, skipped: true };
  }
  const count = st.split('\n').filter(Boolean).length;
  const msg = '静态站每日同步：' + new Date().toLocaleString('zh-CN', { hour12: false }) + '（' + count + ' 个文件变化）';
  gitOrFail(['add', '-A'], PAGES_DIR, '暂存静态站改动');
  gitOrFail(['commit', '-m', msg], PAGES_DIR, '提交静态站');
  const r = OPT.push ? await pushAndVerify(PAGES_DIR, PAGES_BRANCH, 'gh-pages') : { ok: true, skipped: true };
  return Object.assign({ changed: count }, r);
}

/* -------------------------------- 主流程 -------------------------------- */

async function main() {
  const started = Date.now();
  log('===== 本地同步到 GitHub ' + now() + ' =====');
  const remote = preflight();
  acquireLock();
  const report = { at: new Date().toISOString(), remote, branch: BRANCH, ok: true };
  try {
    const serviceAlive = await waitForLocalService();

    // 配图只做两件不拖时间的事：体检 + 清掉指向缺失文件的引用；真正下载放到推送之后
    if (OPT.images) {
      const chk = checkImages({ fix: false });
      const dr = chk.report || {};
      report.images = {
        checked: (dr.before || {}).checked || 0,
        ready: (dr.before || {}).ready || 0,
        problems: (dr.before || {}).scopedProblems || 0,
        cleaned: (dr.cleaned || {}).cleared || 0,
        handled: 0,
        filled: 0,
        remaining: (dr.before || {}).scopedProblems || 0,
        seconds: chk.seconds,
        order: 'after-push'
      };
    } else {
      log('· 跳过配图体检（--no-images）');
    }

    const files = changedFiles();
    if (!files.length) {
      log('· 本地没有待同步的改动，跳过提交');
      report.files = 0;
      report.main = { ok: true, skipped: true };
    } else {
      report.detail = describe(files);
      report.files = files.length;
      if (OPT.dryRun) {
        log('· --dry-run：只列变化，不提交不推送');
        report.main = { ok: true, skipped: true, dryRun: true };
      } else {
        const msg = OPT.message
          || '每日同步：本地库 ' + (report.detail.json) + ' 个文件、配图 ' + (report.detail.images) + ' 张'
             + (report.images && report.images.cleaned ? '（体检清掉 ' + report.images.cleaned + ' 个失效图片引用）' : '')
             + '（' + new Date().toLocaleString('zh-CN', { hour12: false }) + '）';
        report.commit = commitAll(files, msg);
        report.main = OPT.push ? await pushAndVerify(ROOT, BRANCH, 'main') : { ok: true, skipped: true, commit: report.commit };
        if (!report.main.ok) fail('main 分支推送失败：' + report.main.error);
      }
    }

    // 文字已经上线了，现在才轮到图片：主推送之后才开始下载，配额用完就到此为止
    if (OPT.images && !OPT.dryRun) {
      const chk = checkImages({ fix: true, clean: false });
      const dr = chk.report || {};
      const f = dr.fix || {};
      if (report.images) {
        report.images.handled = f.handled || 0;
        report.images.filled = f.filled || 0;
        if (f.remaining != null) report.images.remaining = f.remaining;
        report.images.seconds = (report.images.seconds || 0) + chk.seconds;
      }
      // 本机服务在跑时它缓存的是旧数据，体检写回的结果可能被它覆盖回去
      if (serviceAlive && (f.filled || 0) > 0) {
        log('    ! 本地服务正在运行且缓存了旧数据，体检写入的封面可能被它覆盖 —— 建议同步前停掉服务');
      }
      if (report.main.ok) {
        report.imagesPush = await pushRemainingImages();
        if (!report.imagesPush.ok) log('! 图片二次推送失败：' + (report.imagesPush.error || '') + '（下一次同步会带上）');
      } else {
        log('· main 推送没成功，这次补的图留在本地，下一次同步一起推');
      }
    }

    if (OPT.site && !OPT.dryRun) {
      report.pages = await publishPages();
      if (!report.pages.ok) {
        report.ok = false;
        log('! 静态站发布失败：' + report.pages.error + '（本地库已同步，线上内容稍后会跟上）');
      }
    } else {
      log('· 跳过静态站重建与发布' + (OPT.dryRun ? '（--dry-run）' : '（--no-site）'));
    }

    log('===== 同步完成，用时 ' + Math.round((Date.now() - started) / 1000) + ' 秒 =====');
  } catch (e) {
    report.ok = false;
    report.error = e.message;
    log('! 同步失败：' + e.message);
    throw e;
  } finally {
    report.durationMs = Date.now() - started;
    releaseLock();
    try {
      fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
      fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + '\n');
    } catch (e) { /* 忽略 */ }
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(1));
