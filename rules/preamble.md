# skeleton-slice rules (injected every session)

Injected below: workflow.md, reuse-first.md. Loaded on demand by /skeleton, /slice, /container-contract: container-contract.md, screen-contract.md, pencil-bridge.md.

- A new check must be proven red once (break the behaviour, see it fail, restore) before it counts.
- "X does not exist" requires having searched everywhere X could be.
- Subagents read files by line range or Grep hit, never whole files. Files over 800 lines get split before new code goes in — test files exempt, splitting a test file buys nothing.
- Irreversible decisions (data model, module boundary, sync/async, error & transaction boundary) are settled before coding, never deferred with "refactor later"; record them with the domain-modeling skill.
- Any numeric threshold must name its source. "Industry benchmark", "derived" and "reasonable default" are not sources — they are guesses until this project's own data confirms them, and a guess lives in a file the user can edit, never in code.
- Before a slice is planned, answer in one sentence: what has this already hurt in real use? "Nothing yet" means the first ticket is to produce real use, not to start building.

---
