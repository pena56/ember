# Progress Tracker
Update after every meaningful change.

## Current Phase
- unit-01 complete / ready for unit-02

## Current Goal
- Unit 02: design tokens + shared component primitives.

## Completed
- (scaffolding) Context files generated from grill-me planning + look/feel session.
- Stack chosen and versions pinned (architecture.md, verified 2026-06-08).
- Build plan drafted (specs/00-build-plan.md, units 01–17).
- **Unit 01 done** (2026-06-08): pnpm + Turborepo monorepo scaffold on branch
  `feat/01-monorepo-tooling-scaffold`. All three verify commands green:
  `pnpm -w typecheck` ✓ · `pnpm -w test` ✓ · `pnpm -w lint` ✓.
  ESLint flat config enforces kebab-case filenames, PascalCase no-I-prefix types,
  and import-x/order. Convex hand-scaffolded (schema.ts empty defineSchema, convex.json,
  tsconfig.json); user must run `npx convex dev` once to provision deployment and
  generate `convex/_generated`.

## Next Up
- Unit 02: design tokens + shared component primitives.
- Manual follow-up: run `npx convex dev` from repo root to provision the Convex dev
  deployment and generate `convex/_generated`.

## Open Questions (resolve before/at the relevant unit)
- **Mobile text-layer extraction** (unit 05): react-native-pdf's text-layer story is weaker than
  pdf.js. Confirm approach — native text extraction, a pdf.js-in-webview path on mobile, or a
  hybrid. Affects highlight anchoring parity across clients.
- **Concrete color hex values + chosen fonts** (unit 02): directions set (warm amber accent,
  cream/charcoal surfaces, serif headings + sans body), exact tokens TBD in the design pass.
- **Convex auth provider** (unit 11): which sign-in method(s) — email link, OAuth (Google/Apple)?
- **Per-client component approach** (unit 02): build bespoke token-driven components vs adopt a
  light RN/web UI kit each.
- **Quota numbers** (unit 13): confirm defaults (e.g. 2GB/user, 100MB/file) and monetization path.
- **Web reader leaf decisions**: font/scroll polish — safe to decide during build.

## Architecture Decisions (durable — promoted to architecture.md invariants)
- On-device store is source of truth; Convex is sync server, never on read path.
- HLC for ordering; SHA-256 for document identity; sessions are an immutable derived-from log.
- Conflict rules: furthest-page (overridable), union annotations/tags, additive sessions.
- Anonymous-local → account claim processed as a merge event.
- Hybrid notifications de-duplicated via primary-device election + delivery ledger.
- Shared `packages/core` (pure TS) + `Repository` store abstraction (SQLite/Dexie).
- Lint/format: official configs (typescript-eslint base + eslint-config-expo for mobile +
  react-hooks/jsx-a11y for web), Prettier. Conventions: kebab-case files & dirs, PascalCase
  types (no `I`-prefix), grouped/ordered imports via `@ember/*` aliases — all enforced in the
  flat config wired in unit 01 (see code-standards.md + architecture.md Tooling).

## Session Notes
- Project root: `C:\Users\MOSES\Documents\personal\ember`.
- Design fully specified across architecture.md / ui-context.md; resume by picking the next
  build-plan unit and running `spec-unit`.
