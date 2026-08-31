// PostToolUse hook: tracked markdown is the read path. Every .md git tracks is a file
// Grep can hit and a subagent can be told to read; every .md git ignores costs nothing.
// So the budget counts exactly `git ls-files '*.md'` -- no exclusion list to rot, and
// gitignoring a directory is itself the fix.
//
// It is a ratchet, not a limit. The baseline is whatever the repo measured first; it
// lowers itself whenever the repo gets lighter and never raises itself. Over budget, the
// two legal moves are UNLINK (drop the doc from its entry doc, or gitignore it and
// `git rm -r --cached`) or DELETE. Raising the baseline is a user decision, never an
// agent's -- widening a tolerance to turn a gate green is forbidden.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

let payload;
try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

const tool = payload?.tool_name;
const written = payload?.tool_input?.file_path ?? null;
const command = payload?.tool_input?.command ?? '';
// A doc write can change the count; so can git (rm/add/mv). Nothing else can.
const touchesDocs = (written && /\.(md|markdown)$/i.test(written))
  || ((tool === 'Bash' || tool === 'PowerShell') && /\bgit\b/.test(command));
if (!touchesDocs) process.exit(0);

const cwd = payload?.cwd || process.cwd();
const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

let root, files;
try {
  root = git('rev-parse', '--show-toplevel').trim();
  files = git('ls-files', '-z', '--', '*.md', '*.markdown').split('\0').filter(Boolean);
} catch { process.exit(0); }   // not a git repo, or no git: nothing to hold

let total = 0;
const sizes = [];
for (const rel of files) {
  try {
    const n = readFileSync(join(root, rel), 'utf8').split(/\r?\n/).length;
    total += n;
    sizes.push([n, rel]);
  } catch {}
}

const budgetFile = join(root, '.claude', 'doc-budget.json');
const write = (lines, why) => {
  mkdirSync(dirname(budgetFile), { recursive: true });
  writeFileSync(budgetFile, JSON.stringify({
    trackedMarkdownLines: lines,
    files: files.length,
    measured: new Date().toISOString().slice(0, 10),
    note: 'Ratchet: may only go down. Agents never raise this -- only the user does, in writing.'
  }, null, 2) + '\n');
  process.stderr.write(`doc-budget: ${why} -> ${lines} lines across ${files.length} tracked .md\n`);
};

if (!existsSync(budgetFile)) { write(total, 'baseline seeded from this repo'); process.exit(0); }

let baseline;
try { baseline = JSON.parse(readFileSync(budgetFile, 'utf8')).trackedMarkdownLines; } catch { baseline = null; }
if (typeof baseline !== 'number') { write(total, 'baseline unreadable, reseeded'); process.exit(0); }

if (total < baseline) { write(total, 'repo got lighter, ratchet tightened'); process.exit(0); }
if (total <= baseline) process.exit(0);

const top = sizes.sort((a, b) => b[0] - a[0]).slice(0, 5).map(([n, f]) => `  ${n} lines  ${f}`);
process.stderr.write(
  `doc-budget: tracked markdown is ${total} lines, budget ${baseline} (over by ${total - baseline}).\n` +
  `The read path may not grow. Two legal moves:\n` +
  `  1. UNLINK  - drop a doc from its module entry doc, or gitignore it and \`git rm -r --cached <path>\`. Needs no permission.\n` +
  `  2. DELETE  - needs the user's permission.\n` +
  `Raising the budget is the user's decision, not yours. Do not edit .claude/doc-budget.json to go green.\n` +
  `Heaviest tracked docs:\n${top.join('\n')}\n`
);
process.exit(2);
