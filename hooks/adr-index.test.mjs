import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { sweep, overlaps } from './adr-index.mjs';

const hook = join(dirname(fileURLToPath(import.meta.url)), 'adr-index.mjs');
const root = mkdtempSync(join(tmpdir(), 'adr-index-test-'));
const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'ignore' });

const adr = (name, body) => {
  const path = join(root, 'docs', 'adr', name);
  mkdirSync(dirname(path), { recursive: true });
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
const problems = () => sweep(root).problems;
const warnings = () => sweep(root).warnings;
const nProblems = (fragment, n, name) => {
  const hit = problems().filter((p) => p.includes(fragment));
  if (hit.length !== n) throw new Error(`${name}: expected ${n} problem(s) containing "${fragment}", got ${hit.length}:\n${problems().join('\n')}`);
};
const oneProblem = (fragment, name) => nProblems(fragment, 1, name);
const noProblems = (name) => { if (problems().length) throw new Error(`${name}: expected a clean sweep, got:\n${problems().join('\n')}`); };

const good = `---
id: 0042
decision: Work the user waits for runs on the queue, not in the request
applies-to: [app/queue/, app/schedule/]
supersedes: none
status: in-force
---

The body may be as long as it likes; nothing reads it unless the filter names it.
${Array.from({ length: 300 }, () => 'narrative').join('\n')}
`;
const variant = (id, decision, applies, extra = {}) => `---
id: ${id}
decision: ${decision}
applies-to: [${applies}]
supersedes: ${extra.supersedes ?? 'none'}
status: ${extra.status ?? 'in-force'}
---

body
`;

try {
  git('init', '-q');
  mkdirSync(join(root, 'docs', 'adr', 'retired'), { recursive: true });
  mkdirSync(join(root, 'docs', 'contracts'), { recursive: true });
  for (const d of ['queue', 'schedule', 'llm', 'storage']) mkdirSync(join(root, 'app', d), { recursive: true });

  // ---- write-time gate: proven red, then restored ------------------------------
  const bare = adr('0042-queue.md', '# Work the user waits for runs on the queue\n\nTicket 05-1.\n');
  expect(onWrite(bare), 2, 'an ADR without frontmatter is red');
  contains(onWrite(bare).stderr, 'no frontmatter block', 'the red gate says what is missing');
  expect(onWrite(adr('0042-queue.md', good)), 0, 'frontmatter makes it green, however long the body');

  // supersedes is asked of every ADR; `none` is a legal answer, absence is not
  const noSup = good.replace('supersedes: none\n', '');
  expect(onWrite(adr('0042-queue.md', noSup)), 2, 'a missing supersedes is red');
  const r = onWrite(adr('0042-queue.md', noSup));
  contains(r.stderr, '`supersedes:`', 'the red gate names the field');
  adr('0040-approval.md', variant('0040', 'Approval is the money brake', 'app/queue/'));
  contains(onWrite(adr('0042-queue.md', noSup)).stderr, '0040  Approval is the money brake',
    'the gate hands over the in-force decisions on the same paths, so the answer is not a guess');
  adr('0042-queue.md', good);
  noProblems('two complementary ADRs on one path are not a problem');

  // the loaded surface is what is capped -- the body is not
  const longDecision = good.replace('Work the user waits for runs on the queue, not in the request', 'x'.repeat(121));
  expect(onWrite(adr('0043-long.md', longDecision)), 2, 'a decision line over 120 chars is red');
  contains(onWrite(adr('0043-long.md', longDecision)).stderr, 'loaded into every dispatch prompt', 'the message names the reason');
  rmSync(join(root, 'docs', 'adr', '0043-long.md'));

  expect(onWrite(adr('0044-ghost.md', good.replace('app/queue/', 'app/nowhere/'))), 2, 'applies-to must resolve');
  rmSync(join(root, 'docs', 'adr', '0044-ghost.md'));

  writeFileSync(join(root, 'CONTEXT.md'), '# no frontmatter here\n');
  expect(onWrite(join(root, 'CONTEXT.md')), 0, 'markdown outside docs/adr is untouched');
  writeFileSync(join(root, 'docs', 'adr', 'retired', '0001-old.md'), '# retired, unindexed\n');
  expect(onWrite(join(root, 'docs', 'adr', 'retired', '0001-old.md')), 0, 'retired ADRs are not indexed');
  noProblems('a retired ADR is out of the sweep too');

  // an unreadable path used to pass silently; failing open is the wrong default
  expect(onWrite(join(root, 'docs', 'adr', 'does-not-exist.md')), 2, 'a gate that cannot read its file is red, not green');

  // ---- S1: written through Bash, never through Write/Edit ----------------------
  writeFileSync(join(root, 'docs', 'adr', '0050-bash.md'), '# no frontmatter at all\n');
  oneProblem('0050-bash.md', 'the sweep catches an ADR the write-time hook never saw');
  rmSync(join(root, 'docs', 'adr', '0050-bash.md'));
  noProblems('removing it clears the sweep');

  // ---- S2: a rename strands an applies-to, and nobody rewrites the ADR ---------
  execFileSync('cmd', ['/c', 'move', join(root, 'app', 'queue'), join(root, 'app', 'jobs')], { stdio: 'ignore' });
  nProblems('do not exist', 2, 'the sweep catches every ADR stranded by the rename, none of them touched');
  execFileSync('cmd', ['/c', 'move', join(root, 'app', 'jobs'), join(root, 'app', 'queue')], { stdio: 'ignore' });
  noProblems('restoring the path clears it');

  // ---- S4: the same id twice ---------------------------------------------------
  adr('0042-duplicate.md', variant('0042', 'Something else entirely', 'app/llm/'));
  oneProblem('already used by', 'a duplicated id is a sweep problem');
  rmSync(join(root, 'docs', 'adr', '0042-duplicate.md'));

  // ---- S8: filed one folder deeper --------------------------------------------
  adr(join('2026', '0054-nested.md'), variant('0054', 'Nested', 'app/llm/'));
  oneProblem('filed in a subfolder', 'a nested ADR is reported instead of vanishing');
  rmSync(join(root, 'docs', 'adr', '2026'), { recursive: true });

  // ---- retirement is a link with two ends -------------------------------------
  adr('0055-old.md', variant('0055', 'The old way', 'app/llm/'));
  adr('0056-new.md', variant('0056', 'The new way', 'app/llm/', { supersedes: '[0055]' }));
  oneProblem('still reads `status: in-force`', 'claiming to supersede does not by itself retire the old ADR');
  adr('0055-old.md', variant('0055', 'The old way', 'app/llm/', { status: 'superseded-by: 0056' }));
  noProblems('both ends agreeing is clean');
  adr('0056-new.md', variant('0056', 'The new way', 'app/llm/'));
  oneProblem('does not list 0055', 'dropping the claim from the new side is caught from the old side');
  adr('0056-new.md', variant('0056', 'The new way', 'app/llm/', { supersedes: '[0055]' }));
  adr('0057-orphan.md', variant('0057', 'Orphan', 'app/llm/', { status: 'superseded-by: 9999' }));
  oneProblem('does not exist', 'retired by an ADR nobody can read');
  rmSync(join(root, 'docs', 'adr', '0057-orphan.md'));

  // ---- S7: a contract page citing a dead id -----------------------------------
  writeFileSync(join(root, 'docs', 'contracts', 'queue.md'), '# queue\n\n## decisions in force\n\n- 0042\n- 0099\n');
  oneProblem('cites ADR 0099', 'a dangling citation on a contract page is caught');
  writeFileSync(join(root, 'docs', 'contracts', 'queue.md'), '# queue\n\n## decisions in force\n\n- 0042\n');
  noProblems('a live citation is fine');
  writeFileSync(join(root, 'docs', 'contracts', 'queue.md'), '# queue\n\n## decisions in force\n\n- 0042\n- 0055\n');
  if (!warnings().some((w) => w.includes('0055'))) throw new Error('citing a superseded ADR should warn');
  writeFileSync(join(root, 'docs', 'contracts', 'queue.md'), '# queue\n\n## decisions in force\n\n- 0042\n');

  // ---- S6: the matcher is segment-wise ----------------------------------------
  if (overlaps(['app/l'], ['app/llm/gateway.py'])) throw new Error('app/l must not match app/llm/');
  if (!overlaps(['app/queue/'], ['app/queue/worker.py'])) throw new Error('a dir must match a file inside it');
  mkdirSync(join(root, 'app', 'l'), { recursive: true });
  adr('0058-short.md', variant('0058', 'Short path', 'app/l'));
  absent(cli('app/llm/gateway.py').stdout, '0058', 'app/l does not drag itself into app/llm/ dispatches');
  contains(cli('app/l').stdout, '0058', 'it still matches its own path');
  rmSync(join(root, 'docs', 'adr', '0058-short.md'));
  rmSync(join(root, 'app', 'l'), { recursive: true });

  // ---- S5: over-broad applies-to warns, never blocks ---------------------------
  for (const id of ['0060', '0061', '0062']) adr(`${id}-x.md`, variant(id, `Decision ${id}`, 'app/storage/'));
  adr('0063-broad.md', variant('0063', 'Everything must be typed', 'app/'));
  noProblems('an over-broad applies-to is never a blocker');
  if (!warnings().some((w) => w.includes('0063'))) throw new Error('an over-broad applies-to should warn');
  rmSync(join(root, 'docs', 'adr', '0063-broad.md'));

  // ---- the index itself still works -------------------------------------------
  const queueOnly = cli('app/queue/');
  contains(queueOnly.stdout, '0042', 'filtering by app/queue/ keeps its ADR');
  absent(queueOnly.stdout, '0060', 'filtering by app/queue/ drops the storage ADRs');
  contains(cli('app/queue/worker.py').stdout, '0042', 'a file inside the governed dir matches it');
  contains(cli('app/unrelated/').stdout, 'no ADR governs', 'an unmatched filter says so');
  absent(cli().stdout, '0055  ', 'a superseded ADR is out of the default index');
  contains(cli('--all', 'app/llm/').stdout, 'superseded-by: 0056', '--all reaches it');

  process.stdout.write('adr-index self-test passed\n');
} finally { rmSync(root, { recursive: true, force: true }); }
