// 一次性恢复脚本：从 git 历史 62258d3 取基线，与当前 data/news.json 按标题去重合并
// 用法: node scripts/restore-news.js <gitCommit>
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const commit = process.argv[2];
if (!commit) { console.error('用法: node scripts/restore-news.js <commit>'); process.exit(1); }

const DATA = path.join(__dirname, '..', 'data', 'news.json');

function clean(s) { return s.toString('utf8').replace(/\uFEFF/g, ''); }

// 1. 从 git 取基线
const raw = execFileSync('git', ['show', `${commit}:data/news.json`], { maxBuffer: 256 * 1024 * 1024 });
const baseline = JSON.parse(clean(raw));
console.log(`基线 ${commit} 篇数:`, baseline.length);

// 2. 读当前（幸存的新稿）
const current = JSON.parse(clean(fs.readFileSync(DATA, 'utf8')));
console.log('当前文件篇数:', current.length);

// 3. 备份当前
fs.writeFileSync(DATA + '.bak-' + Date.now(), clean(fs.readFileSync(DATA, 'utf8')));
console.log('已备份当前文件');

// 4. 合并：基线在前（旧→新），新稿按标题去重后追加
const seen = new Set(baseline.map(a => (a.title || '').trim()));
let added = 0;
for (const a of current) {
  const t = (a.title || '').trim();
  if (t && !seen.has(t)) { seen.add(t); baseline.push(a); added++; }
}
console.log(`合并完成：全站 ${baseline.length} 篇（基线 ${baseline.length - added} + 新稿 ${added}）`);

// 5. 原子写回：先写临时文件再 rename（防磁盘满时空数组回写）
const tmp = DATA + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(baseline, null, 2), 'utf8');
fs.renameSync(tmp, DATA);
console.log('已写回 data/news.json');
