# Unit 01: Monorepo + Tooling Scaffold

Issue: #1 · Branch: feat/01-monorepo-tooling-scaffold · Boundary: repo-root tooling
Route: standard — single tooling boundary, fully-resolved spec, no novel logic; too large for inline.

## Goal
A pnpm + Turborepo monorepo that installs clean and where `pnpm -w typecheck`, `pnpm -w lint`,
and `pnpm -w test` all run and pass against five empty-but-present packages/apps
(`packages/core`, `packages/store`, `packages/tokens`, `apps/mobile`, `apps/web`) plus an
initialized `convex/`. ESLint flat config enforces the team conventions from `code-standards.md`.
No feature code — this is the skeleton everything else builds on.

## Implementation

### Workspace root
- `package.json` (private, `"packageManager": "pnpm@<latest>"`), `pnpm-workspace.yaml` globbing
  `packages/*` and `apps/*` (convex stays at root, not a workspace member).
- Root scripts delegate to Turbo: `typecheck`, `lint`, `test`, `build` → `turbo run <task>`.
  These back the `pnpm -w <task>` verify commands in AGENTS.md.
- `turbo.json` with `typecheck`, `lint`, `test`, `build` pipelines (build `dependsOn: ["^build"]`).
- `.gitignore` (node_modules, dist, .turbo, .expo, convex/_generated, *.local), `.npmrc` if needed.

### TypeScript
- `tsconfig.base.json` at root: `strict: true`, `noUncheckedIndexedAccess: true`, modern
  module/target for TS 6.0.3, `composite`/`declaration` as needed, path aliases `@ember/*` →
  `packages/*/src`. Each package/app has a `tsconfig.json` extending the base.
- `@ember/core`, `@ember/store`, `@ember/tokens` resolvable by name (matches code-standards import rule).

### ESLint flat config (`eslint.config.js` at root)
Built on official configs (versions below). Layered per-scope:
- Shared base: `typescript-eslint` recommended + `@typescript-eslint/naming-convention`
  (PascalCase types, no `I`-prefix) + `eslint-plugin-unicorn` `filename-case` → kebab-case
  (React components `.tsx` allowed PascalCase) + `eslint-plugin-import` `import/order`
  (external → workspace → local) with `eslint-import-resolver-typescript` resolving `@ember/*`.
- `apps/mobile/**` extends `eslint-config-expo`.
- `apps/web/**` adds `eslint-plugin-react-hooks` + `eslint-plugin-jsx-a11y`.
- `convex/**` adds `@convex-dev/eslint-plugin`.
- `eslint-config-prettier` layered last to disable conflicting rules.
- Ignore `convex/_generated`, `dist`, `.expo`, build output.

### Prettier
- `.prettierrc` (project defaults — single source of formatting truth).

### Package/app shells (present, minimal, lintable & typecheckable)
- `packages/core`, `packages/store`, `packages/tokens`: each `package.json` (name `@ember/<x>`,
  `type: module`), `tsconfig.json`, `src/index.ts` (placeholder export so typecheck has a target),
  and a trivial passing test so `pnpm -w test` is green.
- `apps/mobile`: Expo SDK 56 shell (expo-router) — minimal app that boots; `package.json`,
  `tsconfig.json` extending base + expo. Do not add features.
- `apps/web`: Vite 8 + React 19 PWA shell that boots; `package.json`, `tsconfig.json`, minimal
  entry. PWA service-worker wiring may be stubbed (real offline lands in later units).
- `convex/`: hand-scaffold the folder so it exists independent of any login — `schema.ts`
  (empty `defineSchema({})` is fine), `convex.json`, and `tsconfig.json`. Do NOT run
  `npx convex dev` from inside the executor (it needs the root package.json to already exist and
  opens an interactive login). Leave `_generated` git-ignored and lint-ignored; it is produced
  post-scaffold. **After** the executor finishes (root package.json now present), the user runs
  `npx convex dev` once to provision the dev deployment and generate `_generated` — note this as
  the single manual follow-up step.

### Test runner
- Pick one workspace-wide runner (Vitest recommended for TS packages) wired into the `test`
  Turbo pipeline; each package's trivial test runs under it.

## Dependencies
Use the versions pinned in `architecture.md` (Stack + Tooling tables, verified 2026-06-08) —
do NOT re-resolve or substitute remembered versions. For unpinned tooling pulled in here
(pnpm itself, turbo, vitest, expo-router peers, vite/react plugin), resolve latest from the
live registry at install time (`pnpm view <pkg> version`). Install just-in-time.

Pinned (from architecture.md): typescript@6.0.3, eslint@10.4.1, typescript-eslint@8.60.1,
eslint-config-expo@56.0.4, eslint-plugin-react-hooks@7.1.1, eslint-plugin-jsx-a11y@6.10.2,
@convex-dev/eslint-plugin@2.0.0, eslint-plugin-import@2.32.0,
eslint-import-resolver-typescript@4.4.5, eslint-plugin-unicorn@65.0.0, prettier@3.8.3,
eslint-config-prettier@10.1.8, convex@1.40.0, expo SDK 56.0.9 / RN 0.85.3, expo-router@56.2.9,
react@19.2.7, vite@8.0.16.

## Verify when done
- [ ] `pnpm install` completes clean from a fresh clone; workspaces link `@ember/*` by name.
- [ ] All five packages/apps + `convex/` exist with the boundary layout from architecture.md.
- [ ] ESLint flags a kebab-case filename violation, a non-PascalCase type, and an out-of-order
      import (spot-check) — i.e. the conventions are actually wired, not just installed.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated (no platform imports in `packages/core`; convex
      not on any read path — trivially true at scaffold stage).
