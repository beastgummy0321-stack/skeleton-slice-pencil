import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const hook = join(dirname(fileURLToPath(import.meta.url)), 'adr-index.mjs');
const root = mkdtempSync(join(tmpdir(), 'adr-index-test-'));
const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'ignore' });

const adr = (name, body) => {
  const path = join(root, 'docs', 'adr', name);
  writeFileSync(path, body);
  return path;
};
const onWrite = (path) => spawnSync(process.execPath, [hook, '--hook'], {
  input: JSON.stringify({ cwd: root, tool_name: 'Write', tool_input: { file_path: path } }),
  encoding: 'utf8',
});
const cli = (...args) => spawnSync(process.execPath, [hook, ...args], { cwd: root, encoding: 'utf8' });
const expect = (r, code, name) => { if (r.status !== code) throw new Error(`${name}: expected ${code}, got ${r.status}: ${r.stderr}${r.stdout}`); };
const contains = (haystack, needle, name) => { if (!haystack.includes(needle)) throw new Error(`${name}: expected to find "${needle}" in:\n${haystack}`); };
const absent = (haystack, needle, name) => { if (haystack.includes(needle)) throw new Error(`${name}: did not expect "${needle}" in:\n${haystack}`); };

const good = `---
id: 0042
decision: Work the user waits for runs on the queue, not in the request
applies-to: [app/queue/, app/schedule/]
status: in-force
---

The body may be as long as it likes; nothing reads it unless the filter names it.
${Array.from({ length: 300 }, () => 'narrative').join('\n')}
`;

try {
  git('init', '-q');
  mkdirSync(join(root, 'docs', 'adr', 'retired'), { recursive: true });
  mkdirSync(join(root, 'app', 'queue'), { recursive: true });
  mkdirSync(join(root, 'app', 'schedule'), { recursive: true });

  // proven red: the shape the repo writes today -- a title and prose, no frontmatter
  const bare = adr('0042-queue.md', '# Work the user waits for runs on the queue\n\nTicket 05-1.\n');
  expect(onWrite(bare), 2, 'an ADR without frontmatter is red');
  contains(onWrite(bare).stderr, 'no frontmatter block', 'the red gate says what is missing');

  // restored: the same ADR with frontmatter passes, and its 300-line body costs nothing
  expect(onWrite(adr('0042-queue.md', good)), 0, 'frontmatter makes it green, however long the body');

  // the loaded surface is what is capped -- a decision line that would bloat every prompt
  const longDecision = good.replace('Work the user waits for runs on the queue, not in the request', 'x'.repeat(121));
  expect(onWrite(adr('0043-long.md', longDecision)), 2, 'a decision line over 120 chars is red');
  contains(onWrite(adr('0043-long.md', longDecision)).stderr, 'loaded into every dispatch prompt', 'the message names the reason');
  rmSync(join(root, 'docs', 'adr', '0043-long.md'));

  // a decision that governs a path nobody has: the index would point at nothing
  expect(onWrite(adr('0044-ghost.md', good.replace('app/queue/', 'app/nowhere/'))), 2, 'applies-to must resolve');
  // ...unless it is retired, whose paths are allowed to be gone
  expect(onWrite(adr('0044-ghost.md', good.replace('app/queue/', 'app/nowhere/').replace('status: in-force', 'status: superseded-by: 0046'))), 0, 'a superseded ADR may name deleted paths');

  // non-ADR markdown is none of this hook's business
  writeFileSync(join(root, 'CONTEXT.md'), '# no frontmatter here\n');
  expect(onWrite(join(root, 'CONTEXT.md')), 0, 'markdown outside docs/adr is untouched');
  writeFileSync(join(root, 'docs', 'adr', 'retired', '0001-old.md'), '# retired, unindexed\n');
  expect(onWrite(join(root, 'docs', 'adr', 'retired', '0001-old.md')), 0, 'retired ADRs are not indexed');

  // the index is computed, never stored: filter by the path the ticket touches
  adr('0050-storage.md', good.replace('id: 0042', 'id: 0050')
    .replace('Work the user waits for runs on the queue, not in the request', 'One bucket, and the org id is the first folder')
    .replace('[app/queue/, app/schedule/]', '[app/storage/]'));
  mkdirSync(join(root, 'app', 'storage'), { recursive: true });

  const all = cli();
  expect(all, 0, 'CLI lists in-force ADRs');
  contains(all.stdout, '0042', 'unfiltered list has the queue ADR');
  contains(all.stdout, '0050', 'unfiltered list has the storage ADR');

  const queueOnly = cli('app/queue/');
  contains(queueOnly.stdout, '0042', 'filtering by app/queue/ keeps its ADR');
  absent(queueOnly.stdout, '0050', 'filtering by app/queue/ drops the storage ADR');

  const nested = cli('app/queue/worker.py');
  contains(nested.stdout, '0042', 'a file inside the governed dir matches it');

  const none = cli('app/unrelated/');
  contains(none.stdout, 'no ADR governs', 'an unmatched filter says so instead of listing everything');

  // superseded ADRs stay out of the default view but remain reachable
  absent(cli().stdout, '0044', 'superseded ADRs are not in the default index');
  contains(cli('--all').stdout, 'superseded-by: 0046', '--all shows them');

  // an unindexable ADR is reported, not silently skipped -- this is the retrofit checklist
  adr('0009-legacy.md', '# 舊的中文 ADR，沒有前置資料\n');
  contains(cli().stdout, '0009-legacy.md', 'ADRs with no frontmatter are listed as invisible');

  process.stdout.write('adr-index self-test passed\n');
} finally { rmSync(root, { recursive: true, force: true }); }
