# Workflow

## Who does what

Main chat holds direction, irreversible decisions and final accept, and does its own read-only scans — a grep is cheaper than a dispatch and keeps the judgement that made the scan worth running. It never stages with `git add -A` while a dispatch is in flight: the tree is shared, so a blanket stage commits an agent's half-written work under main chat's message.

Every post is named; a tier that is never dispatched is decoration.

| post | model | what it does |
|---|---|---|
| implementer | sonnet | writes the ticket's code. Never reviews its own diff |
| reviewer | sonnet | the three verdicts below. Never the implementer, never the same agent |
| acceptance walker | sonnet | walks the acceptance steps in the real app |
| root cause | opus | only on the second red of a route C ticket, and on a Gate A question |
| plan review | opus | fresh eyes on a spec or ticket list, once |
| log triage | haiku | long output in (CI log, migration output, a failing suite, a `git log` range), ≤20 lines out: what failed, the first real error, the file and line. Dispatched instead of pasting the log anywhere |
| produced-thing quoter | haiku | reads the artefact the change produced and quotes back the parts the ticket claims it changed |

- Spawn subagents with the Agent tool and an explicit `model` — held by `ticket-fields`, which also blocks opus or fable at a ticket. Implementer and reviewer are different agents.
- **Every dispatch is named.** A general-purpose dispatch either names its ticket (`docs/issues/<slug>/…md`, absolute path, nowhere else) or opens with its post in capitals: `LOG TRIAGE:`, `QUOTE:`, `WALK:`, `PROTOTYPE PAGE:`, `READ-ONLY:`, `PLAN REVIEW:`, `ROOT CAUSE (second red):`, `REVIEW (route C):`. Held by `ticket-fields`.
- A re-dispatch is a new Agent call, never a message to the agent that failed: the context that produced the failure is part of the failure.
- Escalate a tier only after two rounds with no progress on the same problem, never because a task feels important.
- Main chat writes code only on /slice routes A/B.

## Gate A (architecture consensus)

/skeleton, and every 大-route wish the current constitution or module map does not cover, passes Gate A before any spec, ticket or code:

1. Orientation, read-only: what the repo already has, plus a market sweep (reuse-first §2) — which mature products do this job, what to copy, what to avoid.
2. Grilling produces the architecture set: `CONSTITUTION.md` (≤20 lines — goals, non-goals, who it serves, its final commercial form), the module map with data and decision ownership, the stack — chosen for that final form, not for day one — and the considered-and-rejected list.
3. The user signs the set. Unsigned = no spec, no tickets, no code. The first ticket after signing is a tracer slice through the signed architecture; a throwaway architecture "to validate" is never it.

The agent argues with evidence before the signature and executes after it; it hard-blocks only on technical impossibility, with evidence and an alternative. Changing anything signed is a constitution amendment: back through Gate A, then recompute the affected spec and tickets — never drift it from inside a ticket.

## Premise check (the first question of any interview that leads to building)

Grilling converges on the plan it is given; nothing in it asks whether that plan should exist. So /skeleton station one, /slice station ① of a route C slice, and the 大 route each open with one AskUserQuestion — 2–4 options, one plain line each, one marked recommended:

- header: the outcome, restated in one sentence the user would sign;
- the user's plan as stated;
- up to two alternatives that reach the same outcome with less building (by hand, an existing tool, a narrower cut), each naming what it gives up;
- when one exists: the cheapest experiment that would show the premise is wrong;
- **mandatory when the user has stated a final form (paying users, more than one tenant, hosted) and the plan as stated does not reach it: the version that reaches it**, naming what it costs more. The plan as stated is then never the recommended option — a plan that must be rebuilt to reach its own end is the throwaway architecture Gate A forbids. A tracer is a thin slice through the signed architecture, never a smaller architecture.

The final form is asked, never inferred (/skeleton tree question 2). Facts the options need are the agent's job, never the user's. The recommendation may be the user's own plan. No genuinely smaller alternative found → say so in one line and start the interview. The user's pick is what gets grilled; the options not picked go into the ADR as considered-and-rejected. Not for route A/B, not for a ticket that was in the list when the user approved it.

## Plan review (fresh eyes before the user approves)

A spec, and the ticket list that follows it, get one review by an Opus agent that has not seen the conversation — fresh context, given the spec (or list), `CONTEXT.md`, `BOARD.md`, and read-only access to the repo and whatever data it can reach. Brief, verbatim:

> List every number this plan leans on — a saving, a ratio, a limit, a rate — and for each, the cheapest thing that would show it is wrong. Run the ones you can and say what came back. Then the simplest alternative that yields the same outcome, including not building it. **At least one claim must rest on something you read or ran yourself, not on this document.** Ten lines maximum.

Its output is shown to the user as a note before they approve — never a veto, never a re-review, one round only. The planner does not review its own plan.

## Spec before dispatch

Main chat writes the ticket at /slice station ①, one per slice, at `docs/issues/<slug>/ticket.md` (a slice cut into several tickets numbers them `NN-<name>.md` from `01`). Four sections, all filled, held by the `ticket-fields` gate; `N/A + one reason` counts as filled; a field the ticket cannot answer is escalated, never filled:

- **What** — the contract, with a literal JSON example.
- **How we know it's done** — checks that are runnable or would fail a test, each spelling out the gate command verbatim, including which test files it runs.
- **Shared files touched** — pasted, never typed. Every name that stops existing or changes meaning in this slice (table, column, function, file path, constant) gets one search across the whole repo, unscoped by directory and by file type, and the hit list is the field. Search the name that changes, not the thing that owns it: a name in a SQL function body, a doc or a comment is a dependency no language-aware search returns.
- **Contradiction check** — which two done-checks could contradict each other, and what input would show it. The gate checks that fields are filled, not that they agree; a writer who cannot answer this is holding an escalation, not a ticket.

Every number on a ticket is produced by a command, never typed — counts, totals, "nothing references X".

Dispatch prompt = ticket path + `agent-brief.md` verbatim + `container-contract.md` verbatim + the contract pages the ticket names + the ADR index rows for the paths the ticket touches (`node "{{PLUGIN_ROOT}}/hooks/adr-index.mjs" <path…>`, pasted as printed, including when it prints nothing). Nothing else: an agent is never told to go and find which ADRs apply, and never handed a body that governs something it is not touching.

## A boundary escalation is not a menu

An implementer that returns `blocked-upstream` because a file sits at the project's line cap, or because the work needs a module boundary the ticket did not settle, has done its job. A line cap is an alarm, never an order, and the reply is a boundary decision, not a menu of ways to silence it (carving out the smallest function, registering the file as known-oversized). Main chat dispatches one `READ-ONLY:` Sonnet post with the question *what may this file contain, where does every function go, which of them touch money* — and turns its table into a route C module-boundary ticket, scheduled **before** the ticket that tripped the alarm. The completion report's volume line names any file above 80% of the cap, so the alarm is seen at a slice's close, never mid-ticket.

## Gate and review

1. Machine gate first: typecheck + depcruise + build (whichever the project actually has) + **only the test files the change affects** + **the project's one end-to-end smoke, on every B/C ticket, backend tickets included** — integration bugs (the server will not boot, a screen shows `[object Object]`) surface only there. A project without a one-command smoke gets it as its next ticket. Red = not delivered; return to implementer, no review.
   **The second red changes the kind of work, not just the agent.** red #1 → a **new** implementer agent. red #2 → **stop implementing.** Route C: one `ROOT CAUSE (second red):` Opus dispatch, fresh context, read-only, given the ticket, both rounds' reports and the diff, asked for three lines and nothing else: which layer is wrong (constitution / ADR / contract / ticket / implementation), the one change that unblocks it, what it costs. Main chat takes those lines to the user as a decision, not a symptom. Routes A/B: say which check is failing, in one line, and ask — a copy tweak that went red twice does not need an architect. There is no red #3.
   **Read what the change produces, before the user does.** When a ticket changes something a person or a model will read, a `QUOTE:` subagent reads the real produced thing — not the diff, not the tests — and quotes back the parts the ticket claims it changed; a quote that does not match the claim is red, and so is a claim the produced thing makes that nothing checked. When the produced thing is a screen whose behaviour changed, a `WALK:` subagent walks the acceptance steps with `playwright-cli` before the report reaches the user: prompt = the steps verbatim + the app URL + "run `playwright-cli --help` and read the SKILL.md it names; snapshot first, click by ref"; each step gets ✅/❌ plus a screenshot path, the first ❌ is red (return to implementer, no review; the two-round stop applies). The walker is never the implementer. Route A — style, copy, spacing — gets the machine gate and the user's own eyes; no walk for a string. A project behind a login saves `playwright-cli state-save auth.json` once by hand; the walker loads it. The walk proves reachable, text present, no error — the user still judges whether it feels right.
2. Routes A/B: machine gate green → done. **A/B is the default.** A behaviour change is route B unless it lands in the route C list.
3. Route C is exactly four things — schema/migration, module boundary, money flow, permission/tenant isolation. Nothing else earns a ticket plus an independent review.
   Route C gate: one independent Sonnet review of the diff against the ticket's done-checks. **Three verdicts** (the full wording the reviewer is given is `agent-brief.md`):
   `ship`.
   `reject` = an implementation slip — a done-check fails, machine gate red, a container-contract violation, or code and tests beyond what the done-checks require (a branch, a field, an abstraction, a test no done-check names). It must quote the done-check it fails or exceeds, word for word; style, taste, naming are notes, never rejects. It routes to a new implementer, appended to the ticket under `## Rejected` (the dispatch prompt does not change, so the record is how the next round learns what failed).
   `blocked-upstream` = the ticket is what is wrong — the done-checks contradict each other; a done-check is ambiguous enough that two readings both pass; the ticket contradicts the constitution, an ADR or a contract page; a file the work needs is missing from `## Shared files touched`; or **the diff carries a defect in one of the four route C classes that no done-check names** — never a note, because "no done-check requires it" is the sentence that ships a cross-tenant leak. It routes to main chat and from there to the user, appended under `## Blocked`; no re-dispatch follows it.
   On the four classes the reviewer spends part of its round attacking the thing the ticket claims to protect — one attempt, inside the single review: where the ticket claims a lock, pick it; where it claims isolation, read the other tenant's row. Reading a diff answers "does this match the ticket"; only trying to break it answers "does this hold".
4. At most one re-review. Still disputed → Fable decides.
5. Trust machine output and `git diff`, not the worker's prose.
6. **`git diff --name-only` against the ticket's `## Shared files touched`, every ticket, main chat, no dispatch.** A file in the diff that the field did not name is `blocked-upstream`: the ticket was written against a wrong picture of the code. One command, no agent, so it applies on route B too. It catches the undeclared edit; the detour *around* a shared file stays with `agent-brief.md` and the reviewer.

## Test suite shape

Tests are code someone maintains; more of them is not more safety.

- A test names what it protects: data correctness, money arithmetic, tenant isolation, module boundaries, API contract shape. Anything else is not written; screen behaviour gets the one e2e smoke, not unit tests.
- Delete: a test asserting a screen string equals a literal; duplicates of one behaviour that differ only in fixture. Machine-wide edits (a rename, a parameter added at N call sites) earn no new tests.
- A limit in prose is not a limit: any ratio or cap (line count, test ratio, size) is held by a gate in the repo — one frozen number that may only go down — or it is not stated. Trim while already rewriting that layer, never as a refactor round of its own.

## Tickets and parallel work

- Work bigger than one ticket (the 大 route): Premise check → main chat writes `docs/issues/<slug>/spec.md` → Plan review → main chat cuts the spec vertically (schema → API → screen → test) into the four-section tickets above → the user approves the list → sequential Sonnet dispatch.
- **Work sequentially.** Parallel worktrees only when two tickets touch no file in common *and* each is over half a day; agents stalling on notifications that never arrive is the largest time sink measured.
- **Before sizing a ticket whose blast radius is unknown, main chat makes the change throwaway, runs the suite once, and reverts.** Minutes, no dispatch, no ticket; it replaces the most expensive kind of guess.
- **A change that flips a behaviour globally lands in two tickets: the structure it needs, dormant, then the flip.** The dormant half changes nothing, so the existing suite green is its proof.
- Merge one line at a time; run the **full** test suite on main after each merge — the only place the whole suite runs.
- After dispatching, say what is running and **do not promise a time**. The user may start the next slice or wait; overlapping is an option, never an obligation.

## Needs user approval before starting

DB schema/migrations, payments or paid APIs, anything public-facing, deleting real data, core architecture changes, contradictory requirements.

## Reporting

Completion report = acceptance steps the user can do by hand (open which screen, click what, see what), each carrying the walker's ✅ and screenshot path when the step opens a screen, **plus one plain line of volume**: lines of code and of tests this slice added, the module's new total, and any file above 80% of the project's line cap. A slice that settled a Gate A or route C decision names the ADR id it wrote and the paths it governs; no other slice reports a doc, because no other slice writes one. File lists and endpoints go in git log, not the report.
Subagent reports: conclusion + `file:line` + what was skipped. Never paste whole files.
