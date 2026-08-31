# Container contract (module boundaries)

Machine-enforced by dependency-cruiser on pre-commit (prove it red once when wiring it up):
- Cross-module imports go through the module's single entry file (`index.ts`) only.
- No dependency cycles. Modules never import the app shell (`src/app`).

Checked by the reviewer (not by the implementer):

1. **Register before you build.** New module = 4 lines in the ticket: entry file path; input/output shape of each exported function; who calls it; what it must not import or touch.
2. **State stays inside.** Data crosses modules only as entry-point arguments and return values. No shared mutable globals, no reaching into another module's state.
3. **Errors don't leak.** Every entry-point function defines its error return shape. Disabling any non-core module must leave the main screen loading.
4. **Interface is the contract.** Changing an entry-point signature or the mock data shape = changing the contract → back to /slice station ①. Mock shape must equal entry-point output shape.
5. **Findable over elegant.** Module dir name = the screen/feature name the user sees, directly under `src/modules/<name>/`, no intermediate layers; no Manager/Helper/Util/Base as module names. Duplicate code across modules is fine; extract shared code only at the 3rd real caller, and the extraction becomes its own registered module.
6. **Pull-out test** (route C, station ③): delete a non-core module folder + its registration line → build passes, main screen loads → restore.
7. **The docs are a container too.** One entry doc beside the module's entry file (`README.md`, ≤ 80 lines): what the module does, its entry path, and links to the decisions still in force. An agent opens the entry plus only what the entry links — a doc no entry links is off the read path, and that is how a doc retires. Retiring is unlinking (drop the link, or gitignore it and `git rm -r --cached`), never deletion. Held by the `doc-budget` gate, whose frozen baseline lives in `.claude/doc-budget.json` and is committed: tracked markdown may only shrink.
