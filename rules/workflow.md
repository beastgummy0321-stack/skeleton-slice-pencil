# Workflow

## Who does what

Main chat holds direction, irreversible decisions and final accept, and **does its own read-only
scans** — at 1M context a grep returning twenty lines costs nothing, while dispatching it costs a
round-trip and loses the judgement that made the scan worth running.

Every post is named, because a tier that is never dispatched is not a policy, it is decoration —
measured: Haiku's usage was zero for as long as its only line here read "takes long logs".

| post | model | what it does |
|---|---|---|
| implementer | sonnet | writes the ticket's code. Never reviews its own diff |
| reviewer | sonnet | the three verdicts below. Never the implementer, never the same agent |
| acceptance walker | sonnet | walks the acceptance steps in the real app |
| root cause | opus | dispatched only on the second red (see Gate and review) and on a Gate A question |
| plan review | opus | fresh eyes on a spec or ticket list, once |
| log triage | haiku | a run of output too long to paste — CI log, migration output, a failing suite, a `git log` range — in, ≤20 lines out: what failed, the first real error, the file and line. Dispatched instead of pasting the log anywhere |
| produced-thing quoter | haiku | reads the artefact the change produced and quotes back the parts the ticket claims it changed |

- Spawn subagents with the Agent tool and an explicit `model` — held by the `ticket-fields` hook, which blocks a dispatch with no model and blocks opus or fable on a ticket. Implementer and reviewer must be different agents.
- **A re-dispatch is a new Agent call, never a message to the agent that failed.** The context that produced the failure is part of the failure.
- Escalate a tier only after two rounds with no progress on the same problem — never because a task "feels important".
- Main chat writes code only on /slice routes A/B (style/copy, or a behaviour change that touches no schema, no module entry point, and no money or permission path).

## Gate A (architecture consensus)

/skeleton, and every 大-route wish the current constitution or module map does not cover, passes Gate A before any spec, ticket or code:

1. Orientation, read-only: what the repo already has, plus a market sweep (reuse-first §2) — which mature products do this job, what to copy, what to avoid.
2. Grilling produces the architecture set: `CONSTITUTION.md` (≤20 lines — goals, non-goals, who it serves, its final commercial form), the module map with data and decision ownership (which component owns each judgment call), the stack — chosen for that final form, not for day one — and the considered-and-rejected list.
3. The user signs the set. Unsigned = no spec, no tickets, no code. The first ticket after signing is a tracer slice through the signed architecture; a throwaway architecture "to validate" is never it.

The agent argues with evidence before the signature and executes after it; it hard-blocks only on technical impossibility, with evidence and an alternative. Changing anything signed is a constitution amendment: back through Gate A, then recompute the affected spec and tickets — never drift it from inside a ticket.

## Premise check (before the first interview round)

Grilling converges on the plan it is given; nothing in it asks whether that plan should exist. So the first question of any interview that leads to building — /skeleton station one, /slice station ① of a route C slice, the 大 route before /to-spec, a bare /grill-with-docs on a build idea — is the premise, asked in the user's communication contract (one AskUserQuestion, 2–4 options, one plain line each, one marked recommended):

- header: the outcome, restated in one sentence the user would sign;
- option: the user's plan as stated;
- options: up to two alternatives that reach the **same outcome** with less building — by hand, an existing tool, a narrower cut — each naming in one line what it gives up;
- option, when one exists: the cheapest experiment that would show the premise is wrong.

Facts the options need (what the code does, what current products do) are the agent's job, never the user's. The recommendation may be the user's own plan. No genuinely smaller alternative found → say so in one line and start the interview; never invent one to have something to say. The user's pick is what gets grilled; the options not picked go into the ADR as considered-and-rejected, so they are not re-proposed next month. Not for route A/B, not for a ticket that was in the list when the user approved it — a ticket added to that list afterwards did not get approved with it and gets its own.

## Plan review (fresh eyes before the user approves)

A /to-spec output, and the ticket list that follows it, get one review by an agent that has not seen the conversation — Opus, fresh context, given the spec (or list), `CONTEXT.md`, `BOARD.md`, and **read-only access to the repo and whatever data it can reach**. An agent handed only prose can only find defects in prose. Brief, verbatim:

> List every number this plan leans on — a saving, a ratio, a limit, a rate — and for each, the cheapest thing that would show it is wrong. Run the ones you can and say what came back. Then the simplest alternative that yields the same outcome, including not building it. **At least one claim must rest on something you read or ran yourself, not on this document.** Ten lines maximum.

Its output is shown to the user as a note before they approve — never a veto, never a re-review, one round only. The planner does not review its own plan, for the same reason the implementer does not review its own diff: thirty rounds of sharpening a plan leave no room to say the plan is wrong.

## Spec before dispatch

The ticket file is written by the main chat at /slice station ①, one per slice, at `docs/issues/<slug>/ticket.md`; the 大 route's `/to-tickets` output is rewritten into this shape, at this path, before any dispatch. Ticket = 3 fields: **what** (contract with a literal JSON example), **how we know it's done** (checks that are runnable or would fail a test, **each spelling out the gate command verbatim, including which test files it runs**), **shared files touched**. `N/A + one reason` counts as filled; a field the ticket cannot answer is escalated, never filled. A ticket missing a field is not dispatched — held by the `ticket-fields` gate.
**The gate checks that a field is filled; nothing yet checks that the fields agree with each other**, so the writer answers one question in writing, on the ticket, under `## Contradiction check`, before it is dispatched: *which two done-checks could contradict each other, and what input would show it?* Measured: a ticket demanding both `sum(split(total, n)) == total` and `len(set(split(total, n))) == 1` over the matrix `(100,3), (99,3), (10,4), (1,1)` passed every gate this plugin has and burned three agent rounds proving that 3 does not divide 100. A writer who cannot answer the question is looking at an escalation, not at a ticket.
Dispatch prompt = ticket path + `agent-brief.md` verbatim + `container-contract.md` verbatim + the ADR index rows for the paths the ticket touches — `node "{{PLUGIN_ROOT}}/hooks/adr-index.mjs" <path…>`, pasted as it prints, including when it prints nothing. Nothing else: an agent is never told to go and find which ADRs apply, and never handed a body that governs something it is not touching.

## Retiring a decision

Retiring an ADR, or deleting a module, is a one-directional move that leaves every inbound pointer dangling — and a dangling pointer reads as present-tense fact to whoever opens the file next, months later, usually an agent. So it is a procedure, not a `git mv`:

1. `grep -rn "ADR 00NN\|<each path being deleted>" --include=*.md .` — before anything moves.
2. Every hit is fixed in the **same commit**: restate the rule inside the document that needs it, or say in that paragraph that the thing is gone. A rule worth keeping gets restated where it is used; a rule not worth restating was not binding.
3. Only then `git mv docs/adr/NNNN-*.md docs/adr/retired/`, and set the `supersedes`/`status` pair.

A bulk retirement (a rebuild that voids a dozen ADRs at once) does step 1 **once for the whole set** before it moves the first file. That is the case the sweep exists to catch, because it is the case where the cost is invisible: eighteen ADRs retired in one commit produced roughly twenty dangling citations, and nothing went red for a day.

Deleting a module is the same shape with paths instead of ids: the vocabulary file is the one that rots hardest, because it is written in the present tense about what exists.

## Gate and review

1. Machine gate first: typecheck + depcruise + build (whichever the project actually has) + **only the test files the change affects** — not the whole suite — + **the project's one end-to-end smoke, on every B/C ticket, backend tickets included**: start the app, walk the one path. Integration bugs (the server will not boot, a screen shows `[object Object]`, a job freezes every tenant) surface only there; a gate that skips it finds them all at once after the last ticket lands. A project without that smoke, or whose smoke cannot run from one command, gets it as its next ticket. Red = not delivered; return to implementer, no review.
   **The second red changes the kind of work, not just the agent.** Bounding the number of rounds without changing what happens in them buys nothing: measured, a fresh implementer with clean context, handed the same ticket plus a `## Rejected` paragraph, reproduced the first round word for word and cost 59,834 tokens to do it. So:
   red #1 → a **new** implementer agent (never the one that failed);
   red #2 → **stop implementing.** On route C: dispatch one root-cause agent — Opus, fresh context, read-only — given the ticket, both rounds' reports and the diff, and asked for three lines and nothing else: which layer is wrong (constitution / ADR / contract / ticket / implementation), the one change that unblocks it, and what that change costs. Main chat takes those three lines to the user as a decision, not a symptom.
   **On routes A/B the second red does not summon Opus** — the user is sitting right there, main chat has the diff and the failing line, and a copy tweak that went red twice does not need an architect. Say which check is failing, in one line, and ask. Reserve the root-cause dispatch for the four route C classes, where the cost of guessing is a migration or a money bug.
   There is no red #3.
   **Read what the change produces, before the user does.** When a ticket changes something a person or a model will read, a subagent reads the real thing the change produces — not the diff, not the tests — and quotes back the parts the ticket claims it changed. A quote that does not match the claim is a red gate, and so is a claim the produced thing makes that nothing checked: green gates prove a change is consistent with its ticket, never that what it produced is true. **The walk is for a screen whose behaviour changed, never for a string.** Route A — style, copy, spacing, with no behaviour touched — gets the machine gate and the user's own eyes; dispatching a browser agent to confirm that a word changed costs more than reading the word. Where the produced thing is a screen whose behaviour changed, the subagent walks the acceptance steps with `playwright-cli` before the report reaches the user: each step gets ✅/❌ plus a screenshot path; the first ❌ is a red gate (return to implementer, no review; the two-round stop applies). Dispatch prompt = the acceptance steps verbatim + the app URL + this line: "run `playwright-cli --help` and read the SKILL.md it names; snapshot first, click by ref". The walker is never the implementer. A project behind a login saves `playwright-cli state-save auth.json` once by hand; the walker loads it. The walk proves reachable, text present, no error — the user still judges whether it feels right. Per the preamble, this check counts only after it has been seen red once on a real project.
2. Routes A/B: machine gate green → done. **A/B is the default.** A behaviour change is route B unless it lands in the route C list below.
3. Route C is exactly four things — schema/migration, module boundary, money flow, permission/tenant isolation. Nothing else earns a ticket plus an independent review; copy changes and ordinary behaviour fixes do not.
   Route C gate: one independent Sonnet review of the diff against the ticket's done-checks.
   **Three verdicts, not two** — `ship`, `reject`, `blocked-upstream`. The full wording the reviewer is given is `agent-brief.md`; what matters here is where each one routes.
   **`reject` = an implementation slip**, and is allowed only for: a done-check fails, machine gate red, a container-contract violation, or code and tests beyond what the done-checks require (the ceiling — a branch, a field, an abstraction, a test no done-check names). It must **quote the done-check it fails or exceeds, word for word**. Style, taste, naming, "could be simpler" = a note, never a reject. It routes to a new implementer.
   **`blocked-upstream` = the ticket is what is wrong**, and it never routes to an implementer — it goes to main chat, and from there to the user. Use it when the done-checks contradict each other; when a done-check is ambiguous enough that two readings both pass; when the ticket contradicts the constitution, an ADR or a contract page; when a file the work needs is missing from `## Shared files touched`; or when **the diff carries a defect in one of the four route C classes — schema, module boundary, money, permission/tenant isolation — that no done-check names.**
   That last clause is the one that was missing, and it cost a shipped cross-tenant leak in testing: a reviewer found a query filtering on `brand_id` with `org_id` accepted and ignored, wrote it down, and shipped, because "no done-check requires org_id filtering". A defect in those four classes is **never a note**. An incomplete done-check list is an upstream fault; routing it to the implementer is how it gets shipped.
   A reject is appended to the ticket file under `## Rejected` — the quoted done-check plus the evidence — before re-dispatch; the dispatch prompt itself does not change, so the record is the only way the next round learns what failed. A `blocked-upstream` is appended under `## Blocked` and **no re-dispatch follows it**.
4. At most one re-review. Still disputed → Fable decides.
5. Trust machine output and `git diff`, not the worker's prose.
6. **`git diff --name-only` against the ticket's `## Shared files touched`, every ticket, main chat, no dispatch.** A file in the diff that the field did not name is `blocked-upstream` — the ticket was written against a wrong picture of the code. This costs one command and no agent, which is why it applies on route B too, where nothing else looks at the diff. It catches the undeclared edit; it does not catch the detour *around* a shared file, which stays with the `agent-brief` rule and the reviewer.

## Test suite shape

Tests are code someone maintains; more of them is not more safety.

- Delete: a test asserting a screen string equals a literal; duplicates of one behaviour that differ only in fixture.
- Keep: data correctness, money arithmetic, tenant isolation, module boundaries, API contract shape.
- The test-to-production line ratio is held by a **gate in the repo** — one frozen number that may only go down — not by a number written here. A limit in prose is not a limit. Trim while already rewriting that layer, never as a refactor round of its own.

## Tickets and parallel work

- Work bigger than one ticket: /to-spec → /to-tickets, slice vertically (schema → API → screen → test), user approves the list, then dispatch. /to-tickets writes Matt's ticket shape (what to build, blocked by, acceptance criteria); the main chat then rewrites each into the 3-field ticket above, at the path named there, before dispatch.
- **Work sequentially. Parallel worktrees are the exception**, earned only when two tickets touch no file in common *and* each is over half a day. Measured: parallel coordination is the largest time sink in practice — agents stall waiting for notifications that never arrive.
- Merge one line at a time; run the **full** test suite on main after each merge — that is the only place the whole suite runs.
- After dispatching, say what is running and **do not promise a time** — nobody can predict an agent run. The user may start the next slice or wait; overlapping is an option, never an obligation.

## Needs user approval before starting

DB schema/migrations, payments or paid APIs, anything public-facing, deleting real data, core architecture changes, contradictory requirements.

## Reporting

Completion report = acceptance steps the user can do by hand (open which screen, click what, see what), each carrying the walker's ✅ and screenshot path when the step opens a screen, **plus one plain line of volume**: how many lines of code and of tests this slice added, and the module's new total. A line count is not jargon, and a report that hides it hides the growth. A slice that settled a Gate A or route C decision names the ADR id it wrote and the paths that ADR governs; no other slice reports a doc, because no other slice writes one. File lists and endpoints go in git log, not the report.
Subagent reports: conclusion + `file:line` + what was skipped. Never paste whole files.
