import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const hook = join(dirname(fileURLToPath(import.meta.url)), 'doc-budget.mjs');
const root = mkdtempSync(join(tmpdir(), 'doc-budget-test-'));
const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'ignore' });
const run = (file) => spawnSync(process.execPath, [hook], {
  input: JSON.stringify({ cwd: root, tool_name: 'Write', tool_input: { file_path: join(root, file) } }),
  encoding: 'utf8',
});
const expect = (r, code, name) => { if (r.status !== code) throw new Error(`${name}: expected ${code}, got ${r.status}: ${r.stderr}`); };
const lines = (n, ch) => Array.from({ length: n }, () => ch).join('\n');
const budget = () => JSON.parse(readFileSync(join(root, '.claude', 'doc-budget.json'), 'utf8')).trackedMarkdownLines;

try {
  git('init', '-q');
  writeFileSync(join(root, 'CONTEXT.md'), lines(100, 'x'));
  git('add', '-A');
  expect(run('CONTEXT.md'), 0, 'first run seeds the baseline');
  if (budget() !== 100) throw new Error(`seeded ${budget()}, expected 100`);

  // prove red: one more tracked doc pushes the read path past the baseline
  writeFileSync(join(root, 'notes.md'), lines(50, 'y'));
  git('add', '-A');
  expect(run('notes.md'), 2, 'a new tracked doc is over budget');

  // UNLINK is the legal fix and it works: gitignore + untrack, no deletion
  writeFileSync(join(root, '.gitignore'), 'notes.md\n');
  git('rm', '--cached', '-q', 'notes.md');
  git('add', '-A');
  expect(run('CONTEXT.md'), 0, 'untracking the doc clears the gate without deleting it');
  if (!readFileSync(join(root, 'notes.md'), 'utf8')) throw new Error('unlink must not delete the file');

  // ratchet: a lighter repo lowers the baseline, and cannot climb back
  writeFileSync(join(root, 'CONTEXT.md'), lines(40, 'x'));
  git('add', '-A');
  expect(run('CONTEXT.md'), 0, 'lighter repo passes');
  if (budget() !== 40) throw new Error(`ratchet did not tighten: ${budget()}`);
  writeFileSync(join(root, 'CONTEXT.md'), lines(60, 'x'));
  git('add', '-A');
  expect(run('CONTEXT.md'), 2, 'growing back past the tightened baseline is red');

  // untracked docs are free: they are not on the read path
  writeFileSync(join(root, 'CONTEXT.md'), lines(40, 'x'));
  git('add', '-A');
  run('CONTEXT.md');
  mkdirSync(join(root, '.scratch'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), 'notes.md\n.scratch/\n');
  writeFileSync(join(root, '.scratch', 'ticket.md'), lines(9000, 'z'));
  git('add', '-A');
  expect(run(join('.scratch', 'ticket.md')), 0, 'gitignored docs cost nothing');

  // a non-doc write never pays for the scan
  expect(spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ cwd: root, tool_name: 'Write', tool_input: { file_path: join(root, 'a.ts') } }),
    encoding: 'utf8',
  }), 0, 'non-markdown write is skipped');

  process.stdout.write('doc-budget self-test passed\n');
} finally { rmSync(root, { recursive: true, force: true }); }
