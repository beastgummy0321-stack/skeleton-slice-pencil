# Workflow

## Who does what

Main chat holds direction, irreversible decisions and final accept, and **does its own read-only
scans** — at 1M context a grep returning twenty lines costs nothing, while dispatching it costs a
round-trip and loses the judgement that made the scan worth running. Sonnet implements and
reviews; Opus takes architecture and hard root cause; Haiku takes long logs.

- Spawn subagents with the Agent tool and an explicit `model`. Implementer and reviewer must be different agents.
- Escalate a tier only after two rounds with no progress on the same problem — never because a task "feels important".
- Main chat writes code only on /slice routes A/B (style/copy, or a behaviour change that touches no schema, no module entry point, and no money or permission path).

## Spec before dispatch (route C only)

Ticket = 3 fields: **what** (contract with a literal JSON example), **how we know it's done** (checks that are runnable or would fail a test, **each spelling out the gate command verbatim, including which test files it runs**), **shared files touched**. `N/A + one reason` counts as filled.
Dispatch prompt = ticket path + `container-contract.md` verbatim. Nothing else.

## Gate and review

1. Machine gate first: typecheck + depcruise + build (whichever the project actually has) + **only the test files the change affects** — not the whole suite. Red = not delivered; return to implementer, no review.
   Frontend behaviour change: typecheck + build + the project's one end-to-end smoke. A project without that smoke gets it as its next ticket.
   **Two red rounds on the same ticket and the loop stops**: report which done-check is failing and let the user decide whether the ticket or the approach changes. No third automatic retry.
2. Routes A/B: machine gate green → done. **A/B is the default.** A behaviour change is route B unless it lands in the route C list below.
3. Route C is exactly four things — schema/migration, module boundary, money flow, permission/tenant isolation. Nothing else earns a ticket plus an independent review; copy changes and ordinary behaviour fixes do not.
   Route C gate: one independent Sonnet review of the diff against the ticket's done-checks.
   **A reject is allowed only for: a done-check fails, machine gate red, or a container-contract violation**, and it must **quote the done-check it fails, word for word**. If you cannot quote one, it is a note and the ticket ships. Style, taste, naming, "could be simpler" = a note, never a reject.
4. At most one re-review. Still disputed → Fable decides.
5. Trust machine output and `git diff`, not the worker's prose.

## Test suite shape

Tests are code someone maintains; more of them is not more safety.

- Delete: a test asserting a screen string equals a literal; duplicates of one behaviour that differ only in fixture.
- Keep: data correctness, money arithmetic, tenant isolation, module boundaries, API contract shape.
- The test-to-production line ratio is held by a **gate in the repo** — one frozen number that may only go down — not by a number written here. A limit in prose is not a limit. Trim while already rewriting that layer, never as a refactor round of its own.
- The 800-line split rule does not apply to test files (preamble).

## Tickets and parallel work

- Work bigger than one ticket: /to-spec → /to-tickets, slice vertically (schema → API → screen → test), user approves the list, then dispatch.
- **Work sequentially. Parallel worktrees are the exception**, earned only when two tickets touch no file in common *and* each is over half a day. Measured: parallel coordination is the largest time sink in practice — agents stall waiting for notifications that never arrive.
- Merge one line at a time; run the **full** test suite on main after each merge — that is the only place the whole suite runs.
- After dispatching, say what is running and **do not promise a time** — nobody can predict an agent run. The user may start the next slice or wait; overlapping is an option, never an obligation.

## Needs user approval before starting

DB schema/migrations, payments or paid APIs, anything public-facing, deleting real data, core architecture changes, contradictory requirements.

## Reporting

Completion report = acceptance steps the user can do by hand (open which screen, click what, see what), **plus one plain line of volume**: how many lines of code and of tests this slice added, and the module's new total. A line count is not jargon, and a report that hides it hides the growth. File lists and endpoints go in git log, not the report.
Subagent reports: conclusion + `file:line` + what was skipped. Never paste whole files.
