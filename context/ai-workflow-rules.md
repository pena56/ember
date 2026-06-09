# AI Workflow Rules

## How to scope a unit
- One unit = one **tracer-bullet vertical slice** that leaves the app runnable and a little more
  capable than before. Prefer end-to-end-thin over layer-complete.
- Always keep a known-good baseline: get the trivial path working (open one PDF → see a streak
  tick) before deepening any hard subsystem, so hard bugs are debugged against something working.
- Pull dependencies **just-in-time** — install/pin a library in the unit that first needs it,
  using the versions in `architecture.md`.

## Ordering principles (applied in 00-build-plan.md)
1. Foundation/tooling first. 2. Security (auth) before the sync/file features it gates.
3. Backend/sync before the frontend wiring that depends on it. 4. UI shells (tokens, screens)
before real data. 5. Local-first store before remote sync (offline is the source of truth).

## Verify before a unit is "done"
- `pnpm -w typecheck` · `pnpm -w test` · `pnpm -w lint` all pass.
- Pure logic in `packages/core/` has unit tests (it's testable without a device — use that).
- Offline behavior is explicitly exercised for any unit touching sync/store.
- Update `context/progress-tracker.md`; promote any durable rule to an invariant.

## Device-bound verification (convention)
Some behaviour can only be proven on a real device — native modules (expo-sqlite,
expo-notifications), fonts, theming, persistence across reload. CI cannot exercise it. The
convention (do this for EVERY unit with a device-bound check, not just when asked):
- Build an **interactive verification screen** under `apps/mobile/app/dev/` that runs the checks
  and shows pass/✗-fail + the actual interaction output on screen — never rely on "trust me, I
  ran it" or buried console logs. Feed named async `Check`s to the shared
  `apps/mobile/src/dev/verification-harness.tsx` (a Check returns a detail string to PASS, throws
  to FAIL; runnable all-at-once or one-at-a-time for steps that need an app reload between them).
- List each unit's screen in `app/dev/index.tsx`; reach it via the `__DEV__`-gated link on the
  home screen. Keep the harness **token-driven** (ui-context.md) like any other UI.
- This is **throwaway**: once every check is green on device, delete the whole `app/dev/` route
  group, `src/dev/`, and the `__DEV__` home link in the same PR (or a cleanup commit before
  merge). Nothing in production imports it. The persistent real adapter (e.g.
  `src/store/expo-sqlite-driver.ts`) stays — only the verification UI is removed.

## Spec loop
- Use `spec-unit` to turn the next build-plan item into a scoped, verifiable spec before coding.
- Keep specs small enough to review in one sitting; if a unit feels >1 sitting, split it.
