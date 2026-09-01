import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const hook = join(dirname(fileURLToPath(import.meta.url)), 'ticket-fields.mjs');
const root = mkdtempSync(join(tmpdir(), 'ticket-fields-test-'));
const rel = 'docs/issues/T1-tracer/ticket.md';

const write = (body) => writeFileSync(join(root, rel), body);
const run = (prompt) => spawnSync(process.execPath, [hook], {
  input: JSON.stringify({ cwd: root, tool_name: 'Agent', tool_input: { prompt } }),
  encoding: 'utf8',
});
const expect = (r, code, name) => {
  if (r.status !== code) throw new Error(`${name}: expected ${code}, got ${r.status}: ${r.stderr}`);
};

const FULL = [
  '# T1 — tracer',
  '',
  '## What',
  '```json',
  '{ "coordinates": { "angle": "Q&A" } }',
  '```',
  '',
  "## How we know it's done",
  '1. `uv run pytest app/tests/test_schedule.py -q`',
  '',
  '## Shared files touched',
  '`app/schedule/creative.py`',
  '',
].join('\n');

try {
  mkdirSync(join(root, 'docs/issues/T1-tracer'), { recursive: true });

  // the gate only judges a dispatch that names a ticket
  expect(run('do the thing'), 0, 'no ticket named: passes through');
  expect(run(`read ${rel}`), 2, 'named ticket that does not exist');

  write(FULL);
  expect(run(`Ticket: ${rel}\n<container-contract verbatim>`), 0, 'three filled fields dispatch');
  expect(run(`Ticket: ${join(root, rel)}`), 0, 'absolute ticket path also resolves');

  // prove red, one field at a time
  write(FULL.replace('`app/schedule/creative.py`', ''));
  expect(run(rel), 2, 'empty "Shared files touched" is red');

  write(FULL.replace('1. `uv run pytest app/tests/test_schedule.py -q`', '1. it works'));
  expect(run(rel), 2, 'done-check with no gate command in backticks is red');

  write(FULL.replace('```json\n{ "coordinates": { "angle": "Q&A" } }\n```', 'we add coordinates'));
  expect(run(rel), 2, 'What with no literal example is red');

  write(FULL.replace('```json\n{ "coordinates": { "angle": "Q&A" } }\n```', 'N/A — no data crosses the boundary'));
  expect(run(rel), 0, '`N/A + one reason` counts as filled');

  write(FULL.replace('## Shared files touched\n`app/schedule/creative.py`', ''));
  expect(run(rel), 2, 'absent heading is red');

  // The decision record is swept here, not at the keyhole: an ADR that never passed
  // through a Write/Edit still stops the dispatch it would have poisoned.
  write(FULL);
  expect(run(`Ticket: ${rel}`), 0, 'a repo with no docs/adr sweeps clean');

  mkdirSync(join(root, 'docs/adr'), { recursive: true });
  mkdirSync(join(root, 'app/queue'), { recursive: true });
  const adr = (name, body) => writeFileSync(join(root, 'docs/adr', name), body);
  const ok = (id, extra = '') => [
    '---', `id: ${id}`, `decision: Decision ${id}`, 'applies-to: [app/queue/]',
    'supersedes: none', 'status: in-force', '---', '', 'body', '',
  ].join('\n').replace('supersedes: none', extra || 'supersedes: none');

  adr('0042-queue.md', ok('0042'));
  expect(run(`Ticket: ${rel}`), 0, 'a clean decision record dispatches');

  // proven red: the Bash-written ADR the write-time hook never sees
  adr('0050-bash.md', '# written with a heredoc, no frontmatter\n');
  const blocked = run(`Ticket: ${rel}`);
  expect(blocked, 2, 'an unindexable ADR blocks the dispatch');
  if (!blocked.stderr.includes('0050-bash.md')) throw new Error(`the block must name the ADR:\n${blocked.stderr}`);
  rmSync(join(root, 'docs/adr/0050-bash.md'));
  expect(run(`Ticket: ${rel}`), 0, 'removing it restores dispatch');

  // proven red: a rename strands an applies-to that nobody rewrote
  rmSync(join(root, 'app/queue'), { recursive: true });
  expect(run(`Ticket: ${rel}`), 2, 'a stranded applies-to blocks the dispatch');
  mkdirSync(join(root, 'app/queue'), { recursive: true });
  expect(run(`Ticket: ${rel}`), 0, 'restoring the path restores dispatch');

  // proven red: a retirement claimed from one side only
  adr('0055-old.md', ok('0055'));
  adr('0056-new.md', ok('0056', 'supersedes: [0055]'));
  expect(run(`Ticket: ${rel}`), 2, 'a half-linked retirement blocks the dispatch');
  adr('0055-old.md', ok('0055').replace('status: in-force', 'status: superseded-by: 0056'));
  expect(run(`Ticket: ${rel}`), 0, 'both ends agreeing dispatches');

  // a dispatch naming no ticket is swept too -- the ADRs are read either way
  adr('0057-broken.md', 'no frontmatter\n');
  expect(run('just go and refactor something'), 2, 'the sweep does not depend on a ticket being named');

  console.log('ticket-fields: all checks passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
