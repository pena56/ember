# Code Standards

Enforced automatically (configure in unit 01; do not restate rules — see config):
- ESLint flat config — `eslint.config.js` at repo root, built on the stack's **official** configs
  (versions in `architecture.md` → Tooling): `typescript-eslint` recommended shared base;
  `apps/mobile` extends **`eslint-config-expo`**; `apps/web` adds `eslint-plugin-react-hooks` +
  `eslint-plugin-jsx-a11y`; `convex/` adds **`@convex-dev/eslint-plugin`** (official — catches
  arg-validation and query/mutation/action misuse). Layer Prettier last via `eslint-config-prettier`.
- The team conventions below are enforced by config, not prose — unit 01 wires the rule, then
  this file just names the decision:
  - **File names: kebab-case** (`hlc-clock.ts`, `use-reader.ts`); React components stay
    PascalCase (`ReaderView.tsx`). → `unicorn/filename-case`.
  - **Directories: kebab-case** (`conflict-merge/`, `design-tokens/`).
  - **Types: PascalCase, no `I`-prefix**; `interface` or `type` both allowed. →
    `@typescript-eslint/naming-convention`.
  - **Imports: grouped + ordered** (external → workspace → local); workspace packages imported
    by name (`@ember/core`), not deep relative paths. → `import/order` +
    `eslint-import-resolver-typescript`.
- Prettier — `.prettierrc`.
- TypeScript strict mode — `tsconfig.base.json` (`strict: true`, `noUncheckedIndexedAccess`).
- Convex generates its own types — do not hand-edit `convex/_generated`.

Conventions NOT machine-enforced (these are why this file exists):
- **Platform-agnostic logic lives in `packages/core/`** and must not import React, Expo, RN,
  Dexie, or any platform API. If you reach for a platform API in core, the boundary is wrong.
- **All persistence goes through the `Repository` interface** — UI/feature code never touches
  SQLite or IndexedDB directly.
- **All sync mutations go through the outbox** — never call a Convex mutation directly from a
  component; enqueue an outbox entry and let the reconciler push it.
- Time: never call `Date.now()` for ordering — use the HLC clock from core. Wall-clock is only
  for display.
- Derive, don't store: never persist a streak count or stat total as the source of truth;
  compute from the session log.
- Prefer pure functions in core (testable without a device); keep side effects at the edges.

## File Organization
- `packages/core/` — domain, HLC, outbox, reconciler, conflict-merge, stats derivation (pure TS).
- `packages/store/` — `Repository` interface + `sqlite/` and `dexie/` implementations.
- `packages/tokens/` — shared design tokens (see `ui-context.md`).
- `apps/mobile/` — Expo app; screens via expo-router, platform glue only.
- `apps/web/` — React PWA; service worker + IndexedDB glue only.
- `convex/` — schema + functions; one file per domain concern.
