// PostToolUse hook：規範檔閘門（load-budget.ps1 的可攜版）。
// 閘門 A：CLAUDE.md／AGENTS.md 及其 @ 匯入的 .md 合計 <= 500 行
// 閘門 B：上述檔案不得出現勸導詞
// 退出碼 2 = 擋下並把 stderr 回饋給 agent；0 = 放行
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { homedir } from 'node:os';

const LIMIT = 500;
const WORDS = ['應該','盡量','視情況','最好','可以考慮','酌情','如有需要','適當時','依情況','建議先','或許','也許'];

let payload;
try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

const written = payload?.tool_input?.file_path ?? null;
const forceCheck = payload?.tool_name === 'Bash' || payload?.tool_name === 'PowerShell';
if (!written && !forceCheck) process.exit(0);
if (written && !/\.md$/i.test(written) && !forceCheck) process.exit(0);

const cwd = payload?.cwd || process.cwd();
const roots = [join(homedir(), '.claude', 'CLAUDE.md')];
for (const n of ['CLAUDE.md', 'AGENTS.md']) {
  const p = join(cwd, n);
  if (existsSync(p)) roots.push(p);
}

const files = [];
const addFile = (p) => { try { const r = realpathSync(p); if (!files.includes(r)) files.push(r); } catch {} };
for (const r of roots) {
  if (!existsSync(r)) continue;
  addFile(r);
  for (const line of readFileSync(r, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*@(\S+\.md)\s*$/);
    if (!m) continue;
    let t = m[1].replace(/^~/, homedir());
    if (!isAbsolute(t)) t = join(dirname(r), t);
    if (existsSync(t)) addFile(t);
  }
}

if (!forceCheck) {
  let w; try { w = realpathSync(written); } catch { process.exit(0); }
  if (!files.includes(w)) process.exit(0);
}

const problems = [];
let total = 0; const detail = [];
const contents = new Map();
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split(/\r?\n/);
  contents.set(f, lines);
  total += lines.length;
  detail.push(`  ${f}  ${lines.length} 行`);
}
if (total > LIMIT) problems.push(`閘門 A 違規：規範檔合計 ${total} 行，超過上限 ${LIMIT} 行。\n${detail.join('\n')}`);

for (const [f, lines] of contents) {
  lines.forEach((line, i) => {
    if (line.includes('勸導詞')) return;
    for (const w of WORDS) if (line.includes(w))
      problems.push(`閘門 B 違規：${f}:${i + 1} 出現勸導詞「${w}」——改寫成可判定的禁令句。\n  ${line.trim()}`);
  });
}

if (problems.length) { console.error('規範檔閘門擋下（load-budget.mjs）：\n' + problems.join('\n')); process.exit(2); }
process.exit(0);
