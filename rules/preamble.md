# skeleton-slice rules (injected every session)

Injected below: workflow.md, reuse-first.md. Loaded on demand by /skeleton, /slice, /container-contract: container-contract.md, screen-contract.md, pencil-bridge.md.

- A new check must be proven red once (break the behaviour, see it fail, restore) before it counts.
- "X does not exist" requires having searched everywhere X could be.
- Subagents read files by line range or Grep hit, never whole files. Files over 800 lines get split before new code goes in.
- Irreversible decisions (data model, module boundary, sync/async, error & transaction boundary) are settled before coding, never deferred with "refactor later"; record them with the domain-modeling skill.

---
