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

  console.log('ticket-fields: all checks passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
