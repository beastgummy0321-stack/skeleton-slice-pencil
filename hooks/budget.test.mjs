import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const hook = join(dirname(fileURLToPath(import.meta.url)), 'load-budget.mjs');
const root = mkdtempSync(join(tmpdir(), 'budget-test-'));
// Isolate from the real ~/.claude/CLAUDE.md so the count only covers this temp dir.
const env = { ...process.env, HOME: root, USERPROFILE: root };
const run = (file) => spawnSync(process.execPath, [hook], { input: JSON.stringify({ cwd: root, tool_name: 'Write', tool_input: { file_path: file } }), encoding: 'utf8', env });
const expect = (result, code, name) => { if (result.status !== code) throw new Error(`${name}: expected ${code}, got ${result.status}: ${result.stderr}`); };
const lines = (n, ch) => Array.from({ length: n }, () => ch).join('\n');
try {
  const claude = join(root, 'CLAUDE.md');
  const rules = join(root, 'rules.md');
  writeFileSync(claude, '@rules.md\n');
  writeFileSync(rules, lines(498, 'x'));
  expect(run(rules), 0, '500 lines total');
  // prove red: one more line tips it over
  writeFileSync(rules, lines(499, 'x'));
  expect(run(rules), 2, '501 lines total');
  expect(run(join(root, 'unrelated.md')), 0, 'unrelated md ignored');

  // .claude/rules/*.md load every session too, so they spend the same budget --
  // unless they carry `paths:` frontmatter, which makes them load only for matching files.
  writeFileSync(rules, lines(300, 'x'));
  mkdirSync(join(root, '.claude', 'rules'), { recursive: true });
  writeFileSync(join(root, '.claude', 'rules', 'scoped.md'), '---\npaths:\n  - "**/*.ts"\n---\n' + lines(400, 'y'));
  expect(run(rules), 0, 'path-scoped rule does not count');
  writeFileSync(join(root, '.claude', 'rules', 'always.md'), lines(300, 'z'));
  expect(run(rules), 2, 'unscoped rule counts and tips the budget');
  expect(run(join(root, '.claude', 'rules', 'always.md')), 2, 'writing a rules file triggers the check');

  process.stdout.write('budget self-test passed\n');
} finally { rmSync(root, { recursive: true, force: true }); }
