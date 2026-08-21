# Screen contract

Applies to new screens, new flows, and UI changes that need new data. Style/copy-only and internal-only changes are exempt.

1. **Order: prototype → backend → wire.** Prototype = clickable UI + mock data + the contract (`src/schemas/<screen>.ts`: zod schema, action signatures, a comment per field saying where the data comes from). No backend code before the prototype is accepted.
2. **Four states** per screen — normal, empty, error, loading — switchable in the prototype. Missing one = contract incomplete.
3. **Mock data must be ugly**: long strings, 0, negatives, many rows, a broken image — at least one each.
4. **Mocks live in one place** (`src/mocks/`, single entry). No `if (mock)` branches in app code. Going live = remove the mock source; the frontend diff must be zero.
5. **Contract is frozen once the prototype is accepted.** Backend produces no field the contract lacks; frontend shows no field the contract lacks. Can't meet it → stop and report; the user changes the contract, not the AI.
6. **External specs** (third-party API fields, platform limits, file formats) come from the authoritative doc, cited inline. Not found → ask. Never invent names.
7. Links to other screens only say "goes where, with which params". The target screen's internals belong to its own contract.
