// PostToolUse hook: rule files (CLAUDE.md / AGENTS.md + files they @-import) must stay under LIMIT lines in total.
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { homedir } from 'node:os';

const LIMIT = 500;
let payload;
try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

const written = payload?.tool_input?.file_path ?? null;
const forceCheck = payload?.tool_name === 'Bash' || payload?.tool_name === 'PowerShell';
if (!written && !forceCheck) process.exit(0);
if (written && !/\.md$/i.test(written) && !forceCheck) process.exit(0);
const cwd = payload?.cwd || process.cwd();

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
  if (!files.includes(real)) process.exit(0);
}

let total = 0;
const details = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).length;
  total += lines;
  details.push(`  ${file}  ${lines} lines`);
}
if (total > LIMIT) {
  process.stderr.write(`load-budget: rule files total ${total} lines, limit ${LIMIT}.\n${details.join('\n')}`);
  process.exit(2);
}
