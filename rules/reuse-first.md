# Reuse first

1. Before building a capability, look for an existing skill / plugin / MCP server / maintained open-source package (updated within 12 months, clear compatible licence, real adoption). Report ≤3 candidates with name, source, last update, licence, gap — then **ask before installing anything**.
2. Before laying a foundation (/skeleton station two) or settling a route C module boundary, find ≤2 open-source projects that do the same job and name, per project, which part to copy and which not to. The blueprint usually exists; the failure is building a whole floor from intuition when one could be copied. Record what was looked at in the ADR under "what we looked at", including "nothing found" — so the search is not repeated next month.
3. Code-level reuse order is ponytail's ladder (already loaded): exists in repo → stdlib → platform-native → installed dep → minimal code.
4. Never generate API names, parameters, versions or behaviour from memory. Verify (repo code > official docs for the pinned version > changelog > community) or report "not found". No near-miss substitutes.
5. Exempt: typos, style tweaks, bug fixes, refactors, and anything the user has already chosen.
6. Report: name the package/skill you adopted, or one sentence on why nothing fit.
