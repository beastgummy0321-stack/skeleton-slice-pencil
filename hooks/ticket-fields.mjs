// PreToolUse: a ticket the dispatch prompt names must actually carry its three fields.
// It checks that a field is FILLED, never that it is RIGHT -- that stays the review round's
// job. It also cannot see a route C dispatch that names no ticket at all; writing the ticket
// at /slice station (1) is prose, held by the gate there and by the reviewer.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let payload;
try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
if (payload?.tool_name !== 'Agent') process.exit(0);

const named = (payload?.tool_input?.prompt ?? '').match(/[\w./\\-]*docs[/\\]issues[/\\][\w./\\-]+\.md/);
if (!named) process.exit(0);          // no ticket named: nothing this gate can judge

let body;
try { body = readFileSync(resolve(payload?.cwd || process.cwd(), named[0]), 'utf8'); }
catch {
  process.stderr.write(`ticket-fields: the dispatch names ${named[0]}, which does not exist.\n`);
  process.exit(2);
}

// A section is its heading plus everything up to the next `##`.
const section = (word) => {
  const m = body.match(new RegExp(`^##\\s*${word}.*$`, 'im'));
  if (!m) return null;
  const rest = body.slice(m.index + m[0].length);
  const end = rest.search(/^##\s/m);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
};

const missing = [];
const check = (word, label, ok, why) => {
  const s = section(word);
  if (s === null) missing.push(`${label} — heading absent`);
  else if (!s) missing.push(`${label} — empty`);
  else if (!ok(s)) missing.push(`${label} — ${why}`);
};

// workflow.md names each field's own bar; nothing here invents one.
check('(what|contract)', '## What',
  s => /```/.test(s) || /^N\/A\b/im.test(s), 'no literal example and no `N/A + one reason`');
check("how we know", "## How we know it's done",
  s => /`[^`\n]+`/.test(s), 'no gate command in backticks');
check('shared files', '## Shared files touched', () => true);

if (!missing.length) process.exit(0);

process.stderr.write(
  `ticket-fields: ${named[0]} is not dispatchable.\n${missing.map(m => `  - ${m}`).join('\n')}\n` +
  `Three fields, all filled, before an agent is dispatched (workflow.md, Spec before dispatch).\n` +
  `A field the ticket cannot answer is escalated to the user -- never filled in.\n`
);
process.exit(2);
