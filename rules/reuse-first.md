# Reuse first

1. Before building a capability, look for an existing skill / plugin / MCP server / maintained open-source package (updated within 12 months, clear compatible licence, real adoption). Report ≤3 candidates with name, source, last update, licence, gap — then **ask before installing anything**.
2. Code-level reuse order is ponytail's ladder (already loaded): exists in repo → stdlib → platform-native → installed dep → minimal code.
3. Never generate API names, parameters, versions or behaviour from memory. Verify (repo code > official docs for the pinned version > changelog > community) or report "not found". No near-miss substitutes.
4. Exempt: typos, style tweaks, bug fixes, refactors, and anything the user has already chosen.
5. Report: name the package/skill you adopted, or one sentence on why nothing fit.
