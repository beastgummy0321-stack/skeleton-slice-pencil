# skeleton-slice rules (injected every session)

Injected below: workflow.md, reuse-first.md. Loaded on demand by /skeleton, /slice, /container-contract: container-contract.md, screen-contract.md.

- A new check must be proven red once (break the behaviour, see it fail, restore) before it counts.
- "X does not exist" requires having searched everywhere X could be.
- Subagents read files by line range or Grep hit, never whole files. Line count never orders a split — a split is a module-boundary decision, and the module's own total already lands in every completion report.
- **A blank is not a licence, and a wall is not a detour.** A hard-to-reverse decision (undoing it would redo finished work) that the constitution, a contract or the ticket has not settled is escalated — open an issue or ask — never filled in by the agent. When reality blocks the plan, stop and report; reinterpreting the goal to get around the wall is the same offence as filling the blank. Reversible single-module details stay the agent's to decide. A number an agent states without a named source is a filled blank.
- Project docs are one tree: `CONSTITUTION.md` (≤20 lines, the only entry), `BOARD.md` (points to it), and `docs/` — `CONTEXT.md`, `adr/`, `contracts/<module>.md`, `issues/<slug>/` (gitignored; a ticket dies with its board row and is deleted freely). A doc unreachable from `CONSTITUTION.md` in ≤2 links is retired: unlink it, or gitignore + `git rm -r --cached` — that needs no permission; deleting a tracked file needs the user's. The `doc-budget` gate holds the tracked total; only the user raises it.
- Finished work has exactly three exits: deliver, open an issue, or propose a constitution amendment. Writing another explanatory doc is not an exit.
- Irreversible decisions (data model, module boundary, sync/async, error & transaction boundary, and which component owns a judgment call) are settled at Gate A before coding, never deferred with "refactor later"; record them with the domain-modeling skill.

---
