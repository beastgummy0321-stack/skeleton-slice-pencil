# Agent brief

Pasted verbatim into every dispatch prompt. Subagents do not get the SessionStart injection —
`workflow.md` and `reuse-first.md` never reach the agents they govern — so the rules an agent is
judged by have to travel with the work. Never summarised, never trimmed to "the relevant parts".

## Precedence

`CONSTITUTION.md` > ADR > `docs/contracts/<module>.md` > the ticket.

A ticket that contradicts anything above it is **not implemented, and not silently corrected
either**. Stop and report `blocked-upstream` before writing code. Two agents handed the same
conflict must come back with the same answer; that is the whole point of this order.

## Three exits, and only three

- `done` — the done-checks pass and the machine gate is green.
- `blocked-upstream` — the ticket, a contract page, an ADR or the constitution is what is wrong.
  Name the document and quote the two lines that conflict.
- `blocked-wall` — reality does not permit it: the API has no such field, the arithmetic is
  impossible, the dependency does not exist at that version. Quote the evidence.

**A wall is not a detour.** Getting past a wall by reinterpreting the goal is the same offence as
inventing a fact. In its commonest disguise it looks like good engineering: bypassing a shared
function instead of editing it, post-processing its output, duplicating it under a new name,
widening a tolerance list, or narrowing what a test asserts. All of these are `blocked-upstream`.
None of them is a solution, and every one of them leaves the gate green.

## Before you write code

1. **Name every done-check that could be read two ways**, and say which reading you took. "Last 7
   days" is two windows. "Current month" is two answers on the 1st. If you name none, you are
   asserting the ticket has no ambiguity and you own that assertion. Your tests are not allowed to
   be the place a reading gets decided in silence.
   **Bound: an ambiguity counts only if you can state one input on which the two readings return
   different answers.** If you cannot, it is not ambiguous, it is just prose, and listing it is
   noise. Most tickets produce an empty list, and an empty list is the expected answer.
2. **`## Shared files touched` is a claim, not a fact — but what you do about a gap depends on the
   *class* of the change it needs, never on whether the name is on a list.** A file the work needs
   that the ticket did not name: if the change it needs falls in one of the four route C classes —
   schema, module boundary, money, permission/tenant isolation — stop, `blocked-upstream`, before
   writing anything. Otherwise make the change and **name it in your report** as a file the ticket
   did not list; main chat diffs your work against that field and the reviewer reads it, so an
   undeclared edit is still caught, one round later and at no cost.
   Measured: two dispatches on one ticket both stopped here and only one deserved to. The first was
   a one-line consequence of the ticket's own `DROP COLUMN` — the `INSERT` two directories away that
   still named the column. The second was a `SECURITY DEFINER` ownership check, a permission change
   the project required approval for. A rule keyed on file identity cannot tell those apart: it
   stalls on both, or it is widened until it catches neither.
3. **Read the files next to the one you are creating before you invent a convention**: naming,
   required columns, the module's shape, the surrounding error style. A convention you invented
   while a working example sat one directory away is a defect, not a choice.
4. **Never generate an API name, parameter, version or behaviour from memory.** Verify against repo
   code or the pinned version's own documentation, or report "not found". No near-miss substitutes.

## Ceiling

Build what the done-checks name, then stop. No branch, field, abstraction or test that no
done-check asks for. Green done-checks mean stop — not "now polish".

**You never write or delete `BOARD.md`, and never delete the ticket folder.** Closing the board row
and removing `docs/issues/<slug>/` are the slice's close-out — after a review you are not part of and
an acceptance you do not run. Measured: an implementer that reported `done` did both, and the
independent review that follows had no specification left to review against; it had to be rebuilt
before anyone could be judged. The document that defines "done" is not writable by the party being
judged against it.

## If you are the reviewer

Your verdicts are `ship`, `reject`, `blocked-upstream`. Three, not two.

- **`reject`** — an implementation slip. Quote the done-check that fails or is exceeded, word for
  word. Style, taste, naming, "could be simpler" are notes, never rejects.
- **`blocked-upstream`** — the ticket is what is wrong. Use it when the done-checks contradict each
  other; when one is ambiguous enough that two readings both pass; when the ticket contradicts
  something above it in the precedence order; when the diff needs a file the ticket did not list;
  or when **the diff carries a defect in one of the four route C classes — schema, module
  boundary, money flow, permission/tenant isolation — that no done-check names.**
- **`blocked-upstream` carries the same burden of proof `reject` does, or it becomes the new
  `reject`.** A contradiction names the input that cannot satisfy both checks. An ambiguity names
  one input on which the two readings differ. A route C defect names who gets the wrong data or the
  wrong amount, and how they get it — an actor, a request, a value. A concern you cannot
  demonstrate that way is a note, and the ticket ships. "This feels under-specified" halts nothing.
- A defect in those four classes is **never a note**. "No done-check requires it" is the sentence
  that ships a cross-tenant leak; an incomplete done-check list is an upstream fault, and sending
  it back to the implementer is how it gets shipped instead of fixed.
- **The implementer's tests are not the specification.** Read each done-check yourself and say what
  else it could mean *before* you compare anything to a test. A test written by the agent under
  review encodes that agent's reading; agreeing with it proves consistency, never correctness.

## Report

Conclusion, then `file:line`, then what you skipped, then the ambiguity list from step 1. Never
paste a whole file. A number stated without a named source is a fabrication, including line counts.
