/**
 * 图片检索 / 下载 / 归一化 / 去重的公共能力
 *
 * 新闻配图（scripts/fetch-images.js）与商城配图（scripts/fetch-mall-images.js）共用一套：
 * Bing 检索大图 → 下载校验 → Pillow 统一裁切 → dHash 与全站已有配图比对去重。
 *
 * 之所以抽出来：商城也要"真实高清实拍图"，若再抄一份，两边的门槛、去重、
 * 指纹库很容易走岔，最后出现"新闻图与商品图撞图"或"某一边分辨率偷偷降级"。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const NORMALIZER = path.join(__dirname, 'normalize_image.py');
const FINGERPRINT_FILE = path.join(__dirname, '..', 'data', 'image-fingerprints.json');
// 临时区放系统临时目录：重复图移进去等系统清理，不在工作区内删文件
const TMP_DIR = path.join(os.tmpdir(), 'hynews-images-tmp');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SIZE_FILTERS = ['+filterui:imagesize-large', '+filterui:imagesize-wallpaper'];

/** 感知哈希汉明距离阈值：小于等于该值即判定为同一张图（取值 0~64） */
const DUP_THRESHOLD = 6;

/** 新闻横图的默认高清门槛（降两档后仍保底 1000x560） */
const NEWS_TIERS = [[1400, 780], [1280, 720], [1000, 560]];

/* ------------------------------ 工具 ------------------------------ */

async function fetchWithTimeout(url, options = {}, ms = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------- 配图去重（感知哈希） ---------------------------- */

/** 已用配图指纹表：文件名 -> dHash，存于 scripts/data/image-fingerprints.json */
let fingerprints = {};

function loadFingerprints() {
  if (fs.existsSync(FINGERPRINT_FILE)) {
    try { fingerprints = JSON.parse(fs.readFileSync(FINGERPRINT_FILE, 'utf8')); } catch { fingerprints = {}; }
  }
  return fingerprints;
}

function saveFingerprints() {
  fs.mkdirSync(path.dirname(FINGERPRINT_FILE), { recursive: true });
  fs.writeFileSync(FINGERPRINT_FILE, JSON.stringify(fingerprints, null, 2) + '\n', 'utf8');
}

/** 两个十六进制 dHash 的汉明距离 */
function hammingHex(a, b) {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

/** 批量计算 dHash：一次 python 调用算一批，避免逐张启动进程 */
function dhashBatch(files) {
  const out = [];
  for (let i = 0; i < files.length; i += 40) {
    const chunk = files.slice(i, i + 40);
    const r = spawnSync('python', [NORMALIZER, '--dhash', ...chunk], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (r.status !== 0) { chunk.forEach(() => out.push(null)); continue; }
    String(r.stdout).trim().split(/\s*\n\s*/)
      .forEach((h) => out.push(/^[0-9a-f]{16}$/i.test(h) ? h.toLowerCase() : null));
  }
  return out;
}

/** 为已有配图补齐指纹：首次运行时建立全站指纹库，之后只补新图 */
function ensureFingerprints(dir) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => /\.jpg$/i.test(f));
  const missing = files.filter((f) => !fingerprints[f]);
  if (!missing.length) return;
  console.log(`建立配图去重指纹：新增 ${missing.length} 张（已有 ${files.length - missing.length} 张）…`);
  const hashes = dhashBatch(missing.map((f) => path.join(dir, f)));
  missing.forEach((f, i) => { if (hashes[i]) fingerprints[f] = hashes[i]; });
  saveFingerprints();
}

/** 找出与给定指纹重复的图片；selfKey 用于排除自身（--force 重下同一图位时不算重复） */
function findDuplicate(hash, selfKey) {
  if (!hash) return null;
  for (const [file, h] of Object.entries(fingerprints)) {
    if (file === selfKey || !h) continue;
    if (hammingHex(h, hash) <= DUP_THRESHOLD) return file;
  }
  return null;
}

/* ---------------------------- Bing 图片检索 ---------------------------- */

/** 从 Bing 图片搜索取候选原图直链 */
async function searchCandidates(query, filter, count = 18) {
  const url = 'https://www.bing.com/images/search?q=' + encodeURIComponent(query)
    + '&qft=' + filter + '&form=IRFLTR&first=1';
  let html = '';
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' }
    });
    html = await res.text();
  } catch {
    return [];
  }
  const out = [];
  const re = /m="(\{[^"]+?\})"/g;
  let match;
  while ((match = re.exec(html)) && out.length < count) {
    const raw = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!obj.murl || out.some((x) => x.url === obj.murl)) continue;
    out.push({ url: obj.murl, page: obj.purl || '', title: String(obj.t || '').slice(0, 60) });
  }
  return out;
}

/** 关键词逐级放宽：整串 -> 前两词 -> 首词 */
function queryVariants(query) {
  const words = String(query).split(/\s+/).filter(Boolean);
  const list = [query];
  if (words.length > 2) list.push(words.slice(0, 2).join(' '));
  if (words.length > 1) list.push(words[0]);
  return [...new Set(list)];
}

/* ------------------------------ 尺寸解析（无依赖） ------------------------------ */

function readSize(buf) {
  if (buf.length > 24 && buf.toString('latin1', 0, 2) === '\xFF\xD8') return jpegSize(buf);
  if (buf.length > 24 && buf.toString('latin1', 1, 4) === 'PNG') {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length > 16 && buf.toString('latin1', 0, 3) === 'GIF') {
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  }
  if (buf.length > 32 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const kind = buf.toString('latin1', 12, 16);
    if (kind === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
    if (kind === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return { w: (bits & 0x3FFF) + 1, h: ((bits >> 14) & 0x3FFF) + 1 };
    }
    const start = buf.indexOf(Buffer.from([0x9D, 0x01, 0x2A]));
    if (start > 0 && start + 7 < buf.length) {
      return { w: buf.readUInt16LE(start + 3) & 0x3FFF, h: buf.readUInt16LE(start + 5) & 0x3FFF };
    }
  }
  return null;
}

function jpegSize(buf) {
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xFF) { offset += 1; continue; }
    const marker = buf[offset + 1];
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { offset += 2; continue; }
    const len = buf.readUInt16BE(offset + 2);
    const isSof = marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;
    if (isSof) return { h: buf.readUInt16BE(offset + 5), w: buf.readUInt16BE(offset + 7) };
    offset += 2 + len;
  }
  return null;
}

/* ------------------------------ 下载与归一化 ------------------------------ */

/**
 * 下载单张候选图并校验。
 * minRatio / maxRatio 控制比例区间：新闻要横图（≥1.2），商品图允许竖图但不要长条。
 */
async function downloadCandidate(candidate, opts = {}) {
  const {
    minW = 1400, minH = 780, minRatio = 1.2, maxRatio = 3.2, minBytes = 60 * 1024
  } = opts;
  let res;
  try {
    res = await fetchWithTimeout(candidate.url, { headers: { 'User-Agent': UA, Referer: 'https://www.bing.com/' } }, 20000);
  } catch (err) {
    return { ok: false, why: '网络 ' + err.name };
  }
  if (!res.ok) return { ok: false, why: 'HTTP ' + res.status };
  const type = String(res.headers.get('content-type') || '');
  if (!type.startsWith('image/')) return { ok: false, why: '非图片 ' + type.slice(0, 24) };

  let buf;
  try {
    buf = Buffer.from(await res.arrayBuffer());
  } catch {
    return { ok: false, why: '读取失败' };
  }
  if (buf.length < minBytes) return { ok: false, why: '体积过小 ' + Math.round(buf.length / 1024) + 'KB' };

  const size = readSize(buf);
  if (!size) return { ok: false, why: '无法解析尺寸' };
  if (size.w < minW || size.h < minH) return { ok: false, why: `分辨率不足 ${size.w}x${size.h}` };
  const ratio = size.w / size.h;
  if (ratio < minRatio || ratio > maxRatio) return { ok: false, why: `比例不合适 ${size.w}x${size.h}` };
  return { ok: true, buf, size, type };
}

/** 调用 Pillow 统一裁切输出，并返回成品图的感知哈希（用于去重） */
function normalize(srcFile, dstFile, width, height, quality = 86) {
  const r = spawnSync('python', [NORMALIZER, srcFile, dstFile, String(width), String(height), String(quality)], {
    encoding: 'utf8'
  });
  if (r.status !== 0) {
    return { ok: false, why: (r.stderr || r.error && r.error.message || 'Pillow 处理失败').trim().slice(0, 120) };
  }
  const line = String(r.stdout).trim().split('\n').pop().trim();
  return { ok: true, hash: /^[0-9a-f]{16}$/i.test(line) ? line.toLowerCase() : null };
}

/* ------------------------------ 主入口 ------------------------------ */

/**
 * 处理一个图片位：检索 → 下载 → 归一化 → 去重校验。
 * 高清门槛按 tiers 逐档降级；关键词逐级放宽：整串 → 前两词 → 首词 → 视觉兜底词。
 */
async function resolveImage(opts) {
  const {
    query, visual = '', dstFile, force = false,
    outW = 1600, outH = 900, quality = 86,
    tiers = NEWS_TIERS, minRatio = 1.2, maxRatio = 3.2
  } = opts;

  const selfKey = path.basename(dstFile);
  if (!force && fs.existsSync(dstFile) && fs.statSync(dstFile).size > 20000) {
    return { ok: true, cached: true, query };
  }

  let dupRejected = 0;
  const reasons = [];

  const variants = [...new Set([
    ...queryVariants(query),
    ...(visual ? [visual, `${visual} 高清 摄影`] : [])
  ])];

  for (const [minW, minH] of tiers) {
    const tried = new Set();
    for (const variant of variants) {
      for (const filter of SIZE_FILTERS) {
        const candidates = (await searchCandidates(variant, filter)).filter((c) => !tried.has(c.url));
        candidates.forEach((c) => tried.add(c.url));
        if (!candidates.length) continue;

        for (const candidate of candidates) {
          const got = await downloadCandidate(candidate, { minW, minH, minRatio, maxRatio });
          if (!got.ok) { reasons.push(got.why); continue; }
          const tmpFile = path.join(TMP_DIR, 'src-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));
          fs.writeFileSync(tmpFile, got.buf);
          const done = normalize(tmpFile, dstFile, outW, outH, quality);
          fs.unlinkSync(tmpFile);
          if (!done.ok) { reasons.push(done.why); continue; }

          // 与全站已有配图比对，重复则丢弃换下一张
          const dup = findDuplicate(done.hash, selfKey);
          if (dup) {
            dupRejected += 1;
            reasons.push(`与已有配图重复（${dup}）`);
            if (fs.existsSync(dstFile)) {
              try {
                fs.renameSync(dstFile, path.join(TMP_DIR, 'rej-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + path.extname(dstFile)));
              } catch { /* 移不走就留着，不影响流程 */ }
            }
            continue;
          }

          if (done.hash) { fingerprints[selfKey] = done.hash; saveFingerprints(); }
          return {
            ok: true, cached: false, query,
            hit: variant,
            size: `${got.size.w}x${got.size.h}`,
            from: candidate.url,
            page: candidate.page,
            hash: done.hash,
            dupRejected
          };
        }
        // 这一档关键词已经试过一批候选，够用就换下一个关键词
        if (reasons.length >= 8) break;
      }
    }
  }
  return { ok: false, why: reasons.slice(0, 3).join(' / ') || '全部候选不可用', query, dupRejected };
}

module.exports = {
  UA,
  TMP_DIR,
  NORMALIZER,
  NEWS_TIERS,
  DUP_THRESHOLD,
  loadFingerprints,
  saveFingerprints,
  ensureFingerprints,
  findDuplicate,
  hammingHex,
  dhashBatch,
  searchCandidates,
  queryVariants,
  readSize,
  downloadCandidate,
  normalize,
  resolveImage,
  get fingerprints() { return fingerprints; }
};
