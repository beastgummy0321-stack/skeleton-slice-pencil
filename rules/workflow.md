# Workflow

## Who does what

Main chat holds direction, irreversible decisions and final accept, and **does its own read-only
scans** — at 1M context a grep returning twenty lines costs nothing, while dispatching it costs a
round-trip and loses the judgement that made the scan worth running. Sonnet implements and
reviews; Opus takes architecture and hard root cause; Haiku takes long logs.

- Spawn subagents with the Agent tool and an explicit `model`. Implementer and reviewer must be different agents.
- Escalate a tier only after two rounds with no progress on the same problem — never because a task "feels important".
- Main chat writes code only on /slice routes A/B (style/copy, or a behaviour change that touches no schema, no module entry point, and no money or permission path).

## Premise check (before the first interview round)

Grilling converges on the plan it is given; nothing in it asks whether that plan should exist. So the first question of any interview that leads to building — /skeleton station one, /slice station ① of a route C slice, the 大 route before /to-spec, a bare /grill-with-docs on a build idea — is the premise, asked in the user's communication contract (one AskUserQuestion, 2–4 options, one plain line each, one marked recommended):

- header: the outcome, restated in one sentence the user would sign;
- option: the user's plan as stated;
- options: up to two alternatives that reach the **same outcome** with less building — by hand, an existing tool, a narrower cut — each naming in one line what it gives up;
- option, when one exists: the cheapest experiment that would show the premise is wrong.

Facts the options need (what the code does, what current products do) are the agent's job, never the user's. The recommendation may be the user's own plan. No genuinely smaller alternative found → say so in one line and start the interview; never invent one to have something to say. The user's pick is what gets grilled; the options not picked go into the ADR as considered-and-rejected, so they are not re-proposed next month. Not for route A/B, not for a ticket inside an already-approved list.

## Plan review (fresh eyes before the user approves)

A /to-spec output, and the ticket list that follows it, get one review by an agent that has not seen the conversation — Opus, fresh context, given only the spec (or list), `CONTEXT.md` and `BOARD.md`. Brief, verbatim:

> Make the strongest case that this is the wrong thing to build, or the wrong shape. Give the simplest alternative that yields the same user outcome, including not building it. Quote the ADR or user statement each claim rests on. Ten lines maximum.

Its output is shown to the user as a note before they approve — never a veto, never a re-review, one round only. The planner does not review its own plan, for the same reason the implementer does not review its own diff: thirty rounds of sharpening a plan leave no room to say the plan is wrong.

## Spec before dispatch (route C only)

Ticket = 3 fields: **what** (contract with a literal JSON example), **how we know it's done** (checks that are runnable or would fail a test, **each spelling out the gate command verbatim, including which test files it runs**), **shared files touched**. `N/A + one reason` counts as filled.
Dispatch prompt = ticket path + `container-contract.md` verbatim. Nothing else.

## Gate and review

1. Machine gate first: typecheck + depcruise + doc-budget + build (whichever the project actually has) + **only the test files the change affects** — not the whole suite — + **the project's one end-to-end smoke, on every B/C ticket, backend tickets included**: start the app, walk the one path. Integration bugs (the server will not boot, a screen shows `[object Object]`, a job freezes every tenant) surface only there; a gate that skips it finds them all at once after the last ticket lands. A project without that smoke, or whose smoke cannot run from one command, gets it as its next ticket. Red = not delivered; return to implementer, no review.
   **Two red rounds on the same ticket and the loop stops**: report which done-check is failing and let the user decide whether the ticket or the approach changes. No third automatic retry.
   **Walk the acceptance steps before the user does.** When the completion report's acceptance steps open a screen — any route, copy changes included — a Haiku subagent walks them with `playwright-cli` before the report reaches the user: each step gets ✅/❌ plus a screenshot path; the first ❌ is a red gate (return to implementer, no review; the two-round stop applies). Dispatch prompt = the acceptance steps verbatim + the app URL + this line: "run `playwright-cli --help` and read the SKILL.md it names; snapshot first, click by ref". The walker is never the implementer. A project behind a login saves `playwright-cli state-save auth.json` once by hand; the walker loads it. The walk proves reachable, text present, no error — the user still judges whether it feels right. Per the preamble, this check counts only after it has been seen red once on a real project.
2. Routes A/B: machine gate green → done. **A/B is the default.** A behaviour change is route B unless it lands in the route C list below.
3. Route C is exactly four things — schema/migration, module boundary, money flow, permission/tenant isolation. Nothing else earns a ticket plus an independent review; copy changes and ordinary behaviour fixes do not.
   Route C gate: one independent Sonnet review of the diff against the ticket's done-checks.
   **A reject is allowed only for: a done-check fails, machine gate red, a container-contract violation, or code and tests beyond what the done-checks require** (the ceiling — a branch, a field, an abstraction, a test no done-check names), and it must **quote the done-check it fails or exceeds, word for word**. If you cannot quote one, it is a note and the ticket ships. Style, taste, naming, "could be simpler" = a note, never a reject.
   A reject is appended to the ticket file under `## Rejected` — the quoted done-check plus the evidence — before re-dispatch; the dispatch prompt itself does not change, so the record is the only way the next round learns what failed.
4. At most one re-review. Still disputed → Fable decides.
5. Trust machine output and `git diff`, not the worker's prose.

## Test suite shape

Tests are code someone maintains; more of them is not more safety.

- Delete: a test asserting a screen string equals a literal; duplicates of one behaviour that differ only in fixture.
- Keep: data correctness, money arithmetic, tenant isolation, module boundaries, API contract shape.
- The test-to-production line ratio is held by a **gate in the repo** — one frozen number that may only go down — not by a number written here. A limit in prose is not a limit. Trim while already rewriting that layer, never as a refactor round of its own.

## Tickets and parallel work

- Work bigger than one ticket: /to-spec → /to-tickets, slice vertically (schema → API → screen → test), user approves the list, then dispatch. /to-tickets writes Matt's ticket shape (what to build, blocked by, acceptance criteria); before dispatch each ticket is reshaped into the 3-field ticket above, gate command verbatim included. A ticket missing a field is not dispatched.
- **Work sequentially. Parallel worktrees are the exception**, earned only when two tickets touch no file in common *and* each is over half a day. Measured: parallel coordination is the largest time sink in practice — agents stall waiting for notifications that never arrive.
- Merge one line at a time; run the **full** test suite on main after each merge — that is the only place the whole suite runs.
- After dispatching, say what is running and **do not promise a time** — nobody can predict an agent run. The user may start the next slice or wait; overlapping is an option, never an obligation.

## Needs user approval before starting

DB schema/migrations, payments or paid APIs, anything public-facing, deleting real data, core architecture changes, contradictory requirements.

## Reporting

Completion report = acceptance steps the user can do by hand (open which screen, click what, see what), each carrying the walker's ✅ and screenshot path when the step opens a screen, **plus one plain line of volume**: how many lines of code and of tests this slice added, and the module's new total. A line count is not jargon, and a report that hides it hides the growth. A slice that added a tracked doc names, in the same line, which doc it retired. File lists and endpoints go in git log, not the report.
Subagent reports: conclusion + `file:line` + what was skipped. Never paste whole files.
