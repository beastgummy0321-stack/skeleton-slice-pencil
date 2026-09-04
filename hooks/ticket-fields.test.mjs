import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const hook = join(dirname(fileURLToPath(import.meta.url)), 'ticket-fields.mjs');
const root = mkdtempSync(join(tmpdir(), 'ticket-fields-test-'));
const rel = 'docs/issues/T1-tracer/ticket.md';

const write = (body) => writeFileSync(join(root, rel), body);
const run = (prompt, model = 'sonnet') => spawnSync(process.execPath, [hook], {
  input: JSON.stringify({ cwd: root, tool_name: 'Agent', tool_input: { prompt, model, subagent_type: 'general-purpose' } }),
  encoding: 'utf8',
});
const runNoModel = (prompt, extra = {}) => spawnSync(process.execPath, [hook], {
  input: JSON.stringify({ cwd: root, tool_name: 'Agent', tool_input: { prompt, ...extra } }),
  encoding: 'utf8',
});
const expect = (r, code, name) => {
  if (r.status !== code) throw new Error(`${name}: expected ${code}, got ${r.status}: ${r.stderr}`);
};
const contains = (haystack, needle, name) => {
  if (!haystack.includes(needle)) throw new Error(`${name}: expected "${needle}" in:\n${haystack}`);
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
  '## Contradiction check',
  'None: one done-check, one command. No pair to contradict.',
  '',
].join('\n');

try {
  mkdirSync(join(root, 'docs/issues/T1-tracer'), { recursive: true });

  // the gate only judges a dispatch that names a ticket
  // v5.7 contract: every general-purpose post is named -- a ticket under docs/issues/, or a declared post prefix.
  expect(run('do the thing'), 2, 'no ticket named, no post declared: blocked');
  expect(run('LOG TRIAGE: read ci.log'), 0, 'declared post, no ticket: passes');
  expect(run('SPIKE: is the lock held'), 0, 'any post named in capitals passes -- the list lives in workflow.md, not here');
  expect(run('Ticket: none, just look'), 2, 'a Capitalised word is not a post name');
  expect(run('implement .scratch/x/ticket.md'), 2, 'ticket outside docs/issues: blocked');
  expect(run(`read ${rel}`), 2, 'named ticket that does not exist');
  // A gate that cannot parse its input fails closed; exit 0 on garbage was how a broken payload dispatched anything.
  expect(spawnSync(process.execPath, [hook], { input: '{not json', encoding: 'utf8' }), 2, 'malformed payload: blocked');

  write(FULL);
  expect(run(`Ticket: ${rel}\n<container-contract verbatim>`), 0, 'three filled fields dispatch');
  expect(run(`Ticket: ${join(root, rel)}`), 0, 'absolute ticket path also resolves');

  // A drive colon and an 8.3 `~` are not word characters. The matcher used to start after
  // them and report a path with its head bitten off, which resolved against cwd -- right file
  // when the drives agreed, "ticket does not exist" when they did not. This only ever showed
  // up on a runner whose temp dir is C:\Users\RUNNER~1\..., never on a developer machine.
  const winish = 'C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\t\\docs\\issues\\T1\\ticket.md';
  const bitten = run(`Ticket: ${winish}`);
  expect(bitten, 2, 'a ticket path that does not exist is red');
  contains(bitten.stderr, winish, 'the whole path survives the matcher, drive letter and ~ included');

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

  // --- model posts ---------------------------------------------------------------------------
  // proven red: before this gate existed, every one of these dispatched without a word.
  rmSync(join(root, 'docs/adr/0057-broken.md'));

  // --- the board is swept here too -----------------------------------------------------------
  // proven red: a 449-line board full of sections dispatched agents for weeks.
  writeFileSync(join(root, 'BOARD.md'), '# 看板\n\n- [ ] G1 ｜ docs/issues/T1-tracer/\n\n## 仍然成立的事實\n\n三層花費相等\n');
  const journal = run(`Ticket: ${rel}`);
  expect(journal, 2, 'a board with prose on it blocks the dispatch');
  contains(journal.stderr, 'board-shape', 'the block names the board gate');
  writeFileSync(join(root, 'BOARD.md'), '# 看板\n\n- [>] G1 ｜ docs/issues/T1-tracer/ ｜ 站②\n');
  expect(run(`Ticket: ${rel}`), 0, 'a board of rows dispatches');

  // --- the contradiction check is a fourth required section ------------------------------------
  // proven red: the T1 ticket that burned three agent rounds had all three fields and no section.
  write(FULL.slice(0, FULL.indexOf('## Contradiction check')));
  const noContra = run(`Ticket: ${rel}`);
  expect(noContra, 2, 'a ticket with no contradiction check is not dispatchable');
  contains(noContra.stderr, 'Contradiction check', 'the block names the missing section');
  write(FULL);
  expect(run(`Ticket: ${rel}`), 0, 'filling it restores dispatch');

  expect(run(`Ticket: ${rel}`), 0, 'sonnet at a ticket dispatches');

  const noModel = runNoModel(`Ticket: ${rel}`);
  expect(noModel, 2, 'a dispatch with no model is blocked');
  contains(noModel.stderr, 'names no `model`', 'the block says the model is missing');

  expect(runNoModel(`Ticket: ${rel}`, { subagent_type: 'Explore' }), 0,
    'a named agent type carries its own model and is left alone');

  const opusAtTicket = run(`Ticket: ${rel}`, 'opus');
  expect(opusAtTicket, 2, 'opus at an implementation ticket is blocked');
  contains(opusAtTicket.stderr, 'implemented and', 'the block names whose job a ticket is');

  expect(run(`ROOT CAUSE (second red): read ${rel} and both rounds`, 'opus'), 0,
    "the declared second-red root cause is opus's job and dispatches");
  expect(run(`PLAN REVIEW: ${rel}`, 'opus'), 0, 'the declared plan review dispatches');
  expect(run(`Ticket: ${rel}`, 'haiku'), 0, 'haiku is not blocked at a ticket -- it has posts here');

  console.log('ticket-fields: all checks passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
