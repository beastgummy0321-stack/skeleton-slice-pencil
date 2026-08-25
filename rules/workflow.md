# Workflow

## Model tiers (top → bottom)

| Tier | Model | Does | Does not |
|---|---|---|---|
| 1 | Fable (main chat; Opus if unavailable) | direction, irreversible decisions, freeze spec, final accept | repo-wide scans, long logs, fix/retry loops |
| 2 | Opus | architecture, cross-module integration, hard root cause | routine implementation |
| 3 | Sonnet | **implementation**; independent review on route C | change spec |
| 4 | Haiku | read-only scouting, file inventory, log summary | edit code, final accept |

- Spawn subagents with the Agent tool and an explicit `model`. Implementer and reviewer must be different agents.
- Escalate a tier only after two rounds with no progress on the same problem — never because a task "feels important".
- Main chat writes code only on /slice routes A/B (style/copy, or a behaviour change that touches no schema, no module entry point, and no money or permission path).

## Spec before dispatch (route C only)

Ticket = 3 fields: **what** (contract with a literal JSON example), **how we know it's done** (checks that are runnable or would fail a test), **shared files touched**. `N/A + one reason` counts as filled.
Dispatch prompt = ticket path + `container-contract.md` verbatim. Nothing else.

## Gate and review

1. Machine gate first: typecheck + depcruise + build (whichever the project actually has) + **only the test files the change affects** — not the whole suite. Red = not delivered; return to implementer, no review.
   Frontend behaviour change: typecheck + build + the project's one end-to-end smoke. A project without that smoke gets it as its next ticket.
2. Routes A/B: machine gate green → done. **A/B is the default.** A behaviour change is route B unless it lands in the route C list below.
3. Route C is exactly four things — schema/migration, module boundary, money flow, permission/tenant isolation. Nothing else earns a ticket plus an independent review; copy changes and ordinary behaviour fixes do not.
   Route C gate: one independent Sonnet review of the diff against the ticket's done-checks.
   **A reject is allowed only for: a done-check fails, machine gate red, or a container-contract violation.** Style, taste, naming, "could be simpler" = a note, never a reject.
4. At most one re-review. Still disputed → Fable decides.
5. Trust machine output and `git diff`, not the worker's prose.

## Test suite shape

Tests are code someone maintains; more of them is not more safety.

- Delete: a test asserting a screen string equals a literal; duplicates of one behaviour that differ only in fixture.
- Keep: data correctness, money arithmetic, tenant isolation, module boundaries, API contract shape.
- Target: test lines ≈ 0.7× production lines. Do it while already rewriting that layer — never as a refactor round of its own.
- The 800-line split rule does not apply to test files (preamble).

## Tickets and parallel work

- Work bigger than one ticket: /to-spec → /to-tickets, slice vertically (schema → API → screen → test), user approves the list, then dispatch.
- Tickets with disjoint files run in parallel, each in its own worktree (Agent tool isolation). Tickets sharing files or carrying a migration run one at a time.
- Merge one line at a time; run the **full** test suite on main after each merge — that is the only place the whole suite runs.
- Never leave the user waiting on a dispatched agent — move to the next question.

## Needs user approval before starting

DB schema/migrations, payments or paid APIs, anything public-facing, deleting real data, core architecture changes, contradictory requirements.

## Reporting

Completion report = acceptance steps the user can do by hand (open which screen, click what, see what). File lists, endpoints and test counts go in git log, not the report.
Subagent reports: conclusion + `file:line` + what was skipped. Never paste whole files.
