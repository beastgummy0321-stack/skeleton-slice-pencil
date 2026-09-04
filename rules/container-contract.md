# Container contract (module boundaries)

Machine-enforced on pre-commit (prove it red once when wiring it up) — dependency-cruiser for TS/JS, `import-linter` for Python; a hand-written test suite for this is the last rung, not the first:
- Cross-module imports go through the module's single entry file (`index.ts`) only.
- No dependency cycles. Modules never import the app shell (`src/app`).

Checked by the reviewer (not by the implementer):

1. **Register before you build.** New module = 4 lines in the ticket: entry file path; input/output shape of each exported function; who calls it; what it must not import or touch. The same 4 lines seed `docs/contracts/<module>.md` — a contract page is five things and nothing else: entry path, exported shapes, error shapes, what it must not import, and **decisions in force — ADR ids only, never their prose**.
2. **State stays inside.** Data crosses modules only as entry-point arguments and return values. No shared mutable globals, no reaching into another module's state.
3. **Errors don't leak.** Every entry-point function defines its error return shape. Disabling any non-core module must leave the main screen loading.
4. **Interface is the contract.** Changing an entry-point signature or the mock data shape = changing the contract → back to /slice station ①. Mock shape must equal entry-point output shape.
5. **Findable over elegant.** Module dir name = the screen/feature name the user sees, directly under `src/modules/<name>/`, no intermediate layers; no Manager/Helper/Util/Base as module names. Duplicate code across modules is fine; extract shared code only at the 3rd real caller, and the extraction becomes its own registered module.
6. **Pull-out test** (route C, station ③): delete a non-core module folder + its registration line → build passes, main screen loads → restore.
7. **Shape inside the module.** A handler / routes file parses the request, calls one function, wraps the reply; a business branch in it is a defect, and a function that computes money or an approval amount never lives there. A file at the project's line cap is an alarm that a boundary is missing, handled per workflow.md "A boundary escalation is not a menu" — never by carving out the smallest function, never by adding the file to a known-oversized list.
