# Container contract (module boundaries)

Machine-enforced by dependency-cruiser on pre-commit (prove it red once when wiring it up):
- Cross-module imports go through the module's single entry file (`index.ts`) only.
- No dependency cycles. Modules never import the app shell (`src/app`).

Checked by the reviewer (not by the implementer):

1. **Register before you build.** New module = 4 lines in the ticket: entry file path; input/output shape of each exported function; who calls it; what it must not import or touch. The same 4 lines seed `docs/contracts/<module>.md`.
2. **State stays inside.** Data crosses modules only as entry-point arguments and return values. No shared mutable globals, no reaching into another module's state.
3. **Errors don't leak.** Every entry-point function defines its error return shape. Disabling any non-core module must leave the main screen loading.
4. **Interface is the contract.** Changing an entry-point signature or the mock data shape = changing the contract → back to /slice station ①. Mock shape must equal entry-point output shape.
5. **Findable over elegant.** Module dir name = the screen/feature name the user sees, directly under `src/modules/<name>/`, no intermediate layers; no Manager/Helper/Util/Base as module names. Duplicate code across modules is fine; extract shared code only at the 3rd real caller, and the extraction becomes its own registered module.
6. **Pull-out test** (route C, station ③): delete a non-core module folder + its registration line → build passes, main screen loads → restore.
7. **The docs are one tree.** `CONSTITUTION.md` (≤20 lines) is the single entry; `BOARD.md` points to it; everything else lives under `docs/` — `CONTEXT.md`, `adr/`, one page per module in `contracts/<module>.md` (entry path, exported shapes, error shapes, decisions in force), tickets in `issues/<slug>/` (gitignored, deleted on completion). A dispatch prompt carries exactly: constitution summary + the one ticket + the contract pages the ticket names — an agent never hunts for docs. A doc unreachable from `CONSTITUTION.md` in ≤2 links is retired (unlink, or gitignore + `git rm -r --cached`; deleting a tracked file needs the user). Held by the `doc-budget` gate (`.claude/doc-budget.json`, committed): tracked markdown may only shrink.
