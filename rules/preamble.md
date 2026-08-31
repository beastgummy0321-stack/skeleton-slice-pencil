# skeleton-slice rules (injected every session)

Injected below: workflow.md, reuse-first.md. Loaded on demand by /skeleton, /slice, /container-contract: container-contract.md, screen-contract.md, pencil-bridge.md.

- A new check must be proven red once (break the behaviour, see it fail, restore) before it counts.
- "X does not exist" requires having searched everywhere X could be.
- Subagents read files by line range or Grep hit, never whole files. Line count never orders a split — a split is a module-boundary decision, and the module's own total already lands in every completion report.
- Docs are containers too: one entry doc per module, and an agent reads the entry plus only what the entry names. **Unlink before you delete** — dropping a doc from its entry, or gitignoring it and `git rm -r --cached`, retires it, needs no permission, and is the move to reach for; deleting the file needs the user's.
- A doc an agent writes is disposable unless it is `CONTEXT.md` or an ADR: it names on line one what makes it dead, and is born under `.scratch/`, which is gitignored. Inside `.scratch/` a doc whose stated death condition is met is deleted without asking — that path is the only place an agent deletes freely, and it holds no code, no data, no config. Promoting a doc out of it into the tracked tree is a user decision — the `doc-budget` gate holds the total, and only the user raises it.
- Irreversible decisions (data model, module boundary, sync/async, error & transaction boundary) are settled before coding, never deferred with "refactor later"; record them with the domain-modeling skill.
- Any numeric threshold must name its source. "Industry benchmark", "derived" and "reasonable default" are not sources — they are guesses until this project's own data confirms them, and a guess lives in a file the user can edit, never in code.
- Before a slice is planned, answer in one sentence: what has this already hurt in real use? "Nothing yet" means the first ticket is to produce real use, not to start building.

---
