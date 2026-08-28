// PostToolUse hook: always-loaded rule files must stay under LIMIT lines in total.
// Counted: CLAUDE.md / AGENTS.md, the files they @-import, and every .claude/rules/*.md
// without `paths:` frontmatter — those load on every session too; path-scoped ones do not.
import { readFileSync, existsSync, realpathSync, readdirSync } from 'node:fs';
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

// A rules file with `paths:` frontmatter loads only for matching files, so it is not always-loaded.
const isPathScoped = (path) => {
  const head = readFileSync(path, 'utf8').split(/\r?\n/).slice(0, 20);
  if (head[0]?.trim() !== '---') return false;
  const end = head.indexOf('---', 1);
  return head.slice(1, end < 0 ? head.length : end).some((line) => /^paths\s*:/.test(line));
};
const walkRules = (dir) => {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkRules(full);
    else if (/\.md$/i.test(entry.name) && !isPathScoped(full)) addFile(full);
  }
};
walkRules(join(homedir(), '.claude', 'rules'));
walkRules(join(cwd, '.claude', 'rules'));

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
