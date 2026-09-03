// PreToolUse: a ticket the dispatch prompt names must actually carry its three fields, and the
// dispatch must name the model that will do the work.
// It checks that a field is FILLED, never that it is RIGHT -- that stays the review round's
// job. It also cannot see a route C dispatch that names no ticket at all; writing the ticket
// at /slice station (1) is prose, held by the gate there and by the reviewer.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sweep } from './adr-index.mjs';

let payload;
try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch {
  process.stderr.write('ticket-fields: the hook payload is not JSON; a gate that cannot read its input does not pass it.\n');
  process.exit(2);
}
if (payload?.tool_name !== 'Agent') process.exit(0);

const cwd = payload?.cwd || process.cwd();

// The ADR write-time hook only ever sees one Write/Edit. An ADR that arrived by Bash
// heredoc, a rename that stranded an applies-to, a duplicated id, a retirement claimed
// from one side only -- none of them pass through it. They all do damage at exactly this
// moment, when an agent is about to be handed a decision that no longer holds, so the
// full sweep runs here rather than at the keyhole.
let root = cwd;
try { root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
const { problems, warnings } = sweep(root);
if (problems.length) {
  process.stderr.write(
    `adr-sweep: ${problems.length} problem(s) in the decision record. An agent dispatched now ` +
    `would be handed a decision that cannot be found, or two that contradict.\n` +
    problems.map((p) => `  - ${p}`).join('\n') + '\n' +
    (warnings.length ? `${warnings.map((w) => `  (warning) ${w}`).join('\n')}\n` : '') +
    `Fix the record, or move the ADR to docs/adr/retired/. Do not dispatch around it.\n`
  );
  process.exit(2);
}
if (warnings.length) process.stderr.write(`adr-sweep: ${warnings.map((w) => `\n  (warning) ${w}`).join('')}\n`);

// --- Model posts (workflow.md, "Who does what") ---------------------------------------------
// A tier that is never dispatched is not a policy, it is decoration; a tier dispatched by
// accident is a bill. Both are settled at this one moment, and prose in a rules file that no
// subagent ever reads has been losing the argument. Measured: a dispatch carrying
// "model": "opus" at an implementation ticket passed this hook without a word.
const REQUIRES_EXPLICIT_MODEL = new Set(['general-purpose', 'claude']);
const subagentType = String(payload?.tool_input?.subagent_type ?? '');
const model = String(payload?.tool_input?.model ?? '').toLowerCase();
if (!model && (subagentType === '' || REQUIRES_EXPLICIT_MODEL.has(subagentType))) {
  process.stderr.write(
    'model-post: this dispatch names no `model`. workflow.md gives every post one -- implementer ' +
    'and reviewer sonnet, root cause and plan review opus, log triage and produced-thing quoting ' +
    'haiku. An unnamed model is whichever one the harness happens to default to, which is how a ' +
    'tier ends up at zero usage while the bill lands on another.\n'
  );
  process.exit(2);
}

// The leading `[A-Za-z]:` and the `~` are not decoration. A Windows absolute path carries a
// drive colon, and a temp or profile dir can carry an 8.3 short name (`RUNNER~1`); neither is a
// word character, so the old class started matching *after* them and handed back a path with its
// head bitten off -- `1\AppData\...\ticket.md`. That path then resolved against cwd, which
// silently produced the right file whenever the drives happened to agree, and a "ticket does not
// exist" rejection whenever they did not.
// Every post is named (workflow.md, "Who does what"). A general-purpose dispatch either names the
// ticket it implements or reviews -- at docs/issues/<slug>/, nowhere else -- or opens with the post
// it holds. Measured: a ticket parked at .scratch/t/ticket.md, and an opus "implement the binding
// feature" prompt with no ticket at all, both walked through this gate without a word.
const DECLARED_POST = /^(ROOT CAUSE \(second red\)|PLAN REVIEW|LOG TRIAGE|QUOTE|WALK|PROTOTYPE PAGE|READ-ONLY|REVIEW \(route C\))\s*:/m;
const prompt = payload?.tool_input?.prompt ?? '';
const strayTicket = prompt.match(/(?:[A-Za-z]:)?[\w./\\~-]*[/\\][\w-]+[/\\]ticket\.md/g)?.find((m) => !/docs[/\\]issues[/\\]/.test(m));
if (strayTicket && (subagentType === '' || REQUIRES_EXPLICIT_MODEL.has(subagentType))) {
  process.stderr.write(`ticket-fields: the dispatch names ${strayTicket}, which is not under docs/issues/<slug>/. Tickets live there and nowhere else, because that is the only path this gate reads.\n`);
  process.exit(2);
}
const named = prompt.match(/(?:[A-Za-z]:)?[\w./\\~-]*docs[/\\]issues[/\\][\w./\\-]+\.md/);
if (!named) {
  if ((subagentType === '' || REQUIRES_EXPLICIT_MODEL.has(subagentType)) && !DECLARED_POST.test(prompt)) {
    process.stderr.write('ticket-fields: this general-purpose dispatch names no docs/issues/<slug>/ticket.md and declares no post. Open the prompt with the post it holds -- "LOG TRIAGE:", "QUOTE:", "WALK:", "PROTOTYPE PAGE:", "READ-ONLY:", "PLAN REVIEW:", "ROOT CAUSE (second red):", "REVIEW (route C):" -- or name the ticket. An unnamed dispatch is the one nobody budgeted.\n');
    process.exit(2);
  }
  process.exit(0);
}

// Opus and Fable have posts, and none of them names a ticket file: architecture, the second-red
// root cause, plan review. The two that legitimately read a ticket declare themselves, so that an
// expensive dispatch is a decision someone typed rather than a habit nobody noticed.
const DECLARED_EXPENSIVE_POST = /ROOT CAUSE \(second red\)|PLAN REVIEW/;
if (/^(opus|fable)/.test(model) && !DECLARED_EXPENSIVE_POST.test(payload?.tool_input?.prompt ?? '')) {
  process.stderr.write(
    `model-post: ${model} is dispatched at a ticket (${named[0]}). Tickets are implemented and ` +
    `reviewed by sonnet. Opus takes architecture, the second-red root cause and plan review; if ` +
    `this is one of the latter two, open the prompt with "ROOT CAUSE (second red):" or ` +
    `"PLAN REVIEW:" so the expensive dispatch is on the record.\n`
  );
  process.exit(2);
}

let body;
try { body = readFileSync(resolve(payload?.cwd || process.cwd(), named[0]), 'utf8'); }
catch {
  process.stderr.write(`ticket-fields: the dispatch names ${named[0]}, which does not exist. A relative path resolves against the session cwd, not the agent's working directory -- name the ticket by absolute path, or dispatch from the repo root.\n`);
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
// Whether the done-checks AGREE is still not machine-checkable. What is checkable is whether
// anyone was made to look. Tickets are written per slice and deleted on completion, so this
// gate has no legacy backlog to go red on -- the objection that keeps the contract pages
// ungated does not apply here.
check('contradiction check', '## Contradiction check', () => true);

if (!missing.length) process.exit(0);

process.stderr.write(
  `ticket-fields: ${named[0]} is not dispatchable.\n${missing.map(m => `  - ${m}`).join('\n')}\n` +
  `Four sections, all filled, before an agent is dispatched (workflow.md, Spec before dispatch):\n` +
  `the three fields, plus '## Contradiction check' -- which two done-checks could contradict\n` +
  `each other, and what input would show it. \"None, and here is why\" is a filled answer.\n` +
  `A field the ticket cannot answer is escalated to the user -- never filled in.\n`
);
process.exit(2);
