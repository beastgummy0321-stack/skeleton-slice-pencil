import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
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
try {
  const claude = join(root, 'CLAUDE.md');
  const rules = join(root, 'rules.md');
  writeFileSync(claude, '@rules.md\n');
  writeFileSync(rules, Array.from({ length: 498 }, () => 'x').join('\n'));
  expect(run(rules), 0, '500 lines total');
  // prove red: one more line tips it over
  writeFileSync(rules, Array.from({ length: 499 }, () => 'x').join('\n'));
  expect(run(rules), 2, '501 lines total');
  expect(run(join(root, 'unrelated.md')), 0, 'unrelated md ignored');
  process.stdout.write('budget self-test passed\n');
} finally { rmSync(root, { recursive: true, force: true }); }
