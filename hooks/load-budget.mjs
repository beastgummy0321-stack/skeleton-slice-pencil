// PostToolUse hook：規範檔預算、內嵌規則漂移與票檔大小閘。
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname, isAbsolute, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const LIMIT = 500;
const WORDS = ['應該', '盡量', '視情況', '最好', '可以考慮', '酌情', '如有需要', '適當時', '依情況', '建議先', '或許', '也許'];
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let payload;
try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

const written = payload?.tool_input?.file_path ?? null;
const forceCheck = payload?.tool_name === 'Bash' || payload?.tool_name === 'PowerShell';
if (!written && !forceCheck) process.exit(0);
if (written && !/\.md$/i.test(written) && !forceCheck) process.exit(0);
const cwd = payload?.cwd || process.cwd();
const block = (message) => { process.stderr.write(message); process.exit(2); };

function embeddedRules() {
  const codeRules = readFileSync(join(pluginRoot, 'rules', 'code-rules.md'), 'utf8');
  const section = (title) => {
    const start = codeRules.indexOf(title);
    const end = codeRules.indexOf('\n## ', start + title.length);
    return codeRules.slice(start, end === -1 ? undefined : end).trim();
  };
  return `${section('## 三、')}\n\n${section('## 六、')}\n\n${readFileSync(join(pluginRoot, 'rules', 'container-contract.md'), 'utf8').trim()}`;
}

if (written && /[\\/]\.scratch[\\/][^\\/]+[\\/]issues[\\/][^\\/]+\.md$/i.test(written) && existsSync(written)) {
  const content = readFileSync(written, 'utf8').replace(/(?:\r?\n)+$/, '');
  const lines = content ? content.split(/\r?\n/).length : 0;
  if (lines > 150) block('票太大，回 /to-tickets 重切');
}

const roots = [join(homedir(), '.claude', 'CLAUDE.md')];
for (const name of ['CLAUDE.md', 'AGENTS.md']) {
  const path = join(cwd, name);
  if (existsSync(path)) roots.push(path);
}
const files = [];
const addFile = (path) => { try { const real = realpathSync(path); if (!files.includes(real)) files.push(real); } catch {} };
for (const root of roots) {
  if (!existsSync(root)) continue;
  addFile(root);
  for (const line of readFileSync(root, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*@(\S+\.md)\s*$/);
    if (!match) continue;
    let target = match[1].replace(/^~/, homedir());
    if (!isAbsolute(target)) target = join(dirname(root), target);
    if (existsSync(target)) addFile(target);
  }
}
if (!forceCheck) {
  let real; try { real = realpathSync(written); } catch { process.exit(0); }
  if (!files.includes(real) && !/AGENTS\.md$/i.test(written)) process.exit(0);
}

const expected = embeddedRules();
const problems = [];
let total = 0;
const details = [];
for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  const marker = /<!-- skeleton-slice:rules:begin -->\r?\n([\s\S]*?)\r?\n<!-- skeleton-slice:rules:end -->/;
  const match = raw.match(marker);
  if (match && match[1].trim() !== expected) problems.push(`閘門 B 違規：${file} 的 skeleton-slice 內嵌規則已漂移。`);
  const counted = raw.replace(marker, '');
  const lines = counted.split(/\r?\n/);
  total += lines.length;
  details.push(`  ${file}  ${lines.length} 行`);
  for (const [index, line] of lines.entries()) {
    if (line.includes('勸導詞')) continue;
    for (const word of WORDS) if (line.includes(word)) problems.push(`閘門 B 違規：${file}:${index + 1} 出現勸導詞「${word}」——改寫成可判定的禁令句。\n  ${line.trim()}`);
  }
}
if (total > LIMIT) problems.push(`閘門 A 違規：規範檔合計 ${total} 行，超過上限 ${LIMIT} 行。\n${details.join('\n')}`);
if (problems.length) block(`規範檔閘門擋下（load-budget.mjs）：\n${problems.join('\n')}`);
