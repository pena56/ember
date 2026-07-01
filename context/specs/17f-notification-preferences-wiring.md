# Unit 17f: Wire notification preferences into the planner (mobile + web)

Issue: #150 · Branch: feat/150-notification-preferences-wiring · Boundary: apps/mobile + apps/web
Route: **standard** — two *client* boundaries, but a single mechanical wiring of one shared,
already-tested core seam (`resolveNotificationConfig`, built + unit-tested in 17b). ~4 symmetric,
independent lines per side, zero new logic, zero ambiguity, both files already have test
harnesses. Doing both platforms in one slice is a pre-agreed decision (the deferred wiring 17c/
17d/17e all pointed at). Not split because the multi-boundary risk the rubric guards (interdependent
cross-layer design) is absent here — the two edits are parallel copies against a done core function.

## Goal
Close the **known gap**: the persisted `NotificationPreferences` (17c store, 17d mobile UI, 17e web
UI) are currently **behaviourally inert** — neither sync runner reads them, so toggling a type or a
quiet-hours field changes nothing that fires. This unit reads prefs in both runners and spreads
`resolveNotificationConfig(prefs)` into `deriveNotificationSync`'s `config`, so a disabled type is
dropped and a custom active-hours window is honoured. After this slice the Settings controls
actually take effect. **No core change, no store change, no UI change** — pure client wiring.

### Resolved facts (do NOT re-litigate or "fix")
- **`resolveNotificationConfig(prefs)` already exists** (`packages/core/src/notification-preferences.ts`)
  and is unit-tested: merges `enabledTypes` over all-true, clamps quiet hours to `[0,24]` integers,
  and returns a **sparse `Partial<NotificationConfig>`** so unspecified fields keep
  `DEFAULT_NOTIFICATION_CONFIG` when spread. Use it as-is. Do not reimplement its logic in the clients.
- **Field-name quirk (pre-existing #16 semantics — leave alone):** `quietStartHour`/`quietEndHour`
  actually define the **ALLOWED/active** window — `planNotifications` keeps a plan iff
  `localHour >= quietStartHour && localHour < quietEndHour` (see `notification.ts` step 3). Despite the
  "quiet" name it is the *notify* window. This unit only forwards the values; it does NOT rename
  fields or touch the planner or the Settings copy.
- **Degenerate-window fallback is intentional:** when `start >= end`, `resolveNotificationConfig`
  falls back to the 8/22 defaults because the planner cannot express a wrap-around window. Do not
  "fix" this either — just forward the resolved result.
- **The store getters already exist:** `store.getNotificationPreferences()` is on `NativeStore` (17d)
  and `WebStore` (17e), each returning a `NotificationPreferencesRecord` (`{ id, prefs, updatedAt }`).
  Read `.prefs` off the record.
- **Invariant #1 preserved:** `getNotificationPreferences` is a **local** read (same class as the
  existing local `getGoalConfig` read); no Convex enters the read path.

## Implementation

### `apps/mobile/src/notify/run-notification-sync.ts`
1. Imports: add `resolveNotificationConfig` to the existing `@ember/core` import; add
   `type NotificationPreferencesRecord` to the existing `@ember/store` type import.
2. Widen the `store` dep interface (`RunNotificationSyncDeps.store`) with one method:
   `getNotificationPreferences(): Promise<NotificationPreferencesRecord>;`
   (The real `NativeStore` already implements it — the mobile caller `use-notification-sync.ts`
   passes the whole store, so it satisfies the widened structural type with no caller edit.)
3. In step 2 (local reads), read prefs alongside goal config:
   `const prefsRecord = await store.getNotificationPreferences();`
4. In step 3, spread the resolved config into `deriveNotificationSync`:
   ```ts
   config: {
     goalTargetMs: goalConfig.targetActiveMs,
     ...resolveNotificationConfig(prefsRecord.prefs),
   },
   ```
   Order matters only trivially (no key overlap with `goalTargetMs`). Keep the existing comments;
   update the step-2 comment to mention prefs are read locally too (invariant #1).

### `apps/web/src/notify/use-notification-sync.ts`
Mirror the mobile edit exactly:
1. Add `resolveNotificationConfig` to the `@ember/core` import.
2. In Step 2 (after `const goalConfig = await store.getGoalConfig();`):
   `const prefsRecord = await store.getNotificationPreferences();` then `if (disposed) return;`
   (`WebStore` already declares `getNotificationPreferences` from 17e — no interface change needed here).
3. In Step 3, spread `...resolveNotificationConfig(prefsRecord.prefs)` into the `config` object
   exactly as mobile. Update the Step-2 comment to note prefs are read locally.

## Tests (TDD — red first, then wire)

### `apps/mobile/src/notify/run-notification-sync.test.ts`
- The fake `store` currently supplies only `listSessions` / `getGoalConfig`. Add a
  `getNotificationPreferences` returning a `NotificationPreferencesRecord`; default it to
  `{ id: 'default', prefs: DEFAULT_NOTIFICATION_PREFERENCES, updatedAt: '' }` in the shared fixture
  so the existing four cases keep passing unchanged (all-true + default window = today's behaviour).
- Add **two** new cases:
  - **Disabled type is dropped:** goal-not-met scenario that currently yields a `submitIntent` for
    some type T; set `prefs.enabledTypes[T] = false` → assert **no** `submitIntent` for T (either no
    intent at all, or the next-priority enabled type, depending on the fixture — assert on T's absence).
  - **Active-hours window honoured:** with a candidate whose anchor hour sits outside a narrowed
    window (e.g. set `quietStartHour`/`quietEndHour` so the plan's `localHour` falls outside
    `[start,end)`), assert the candidate is filtered out (no `submitIntent`). Use fixed epochs +
    explicit `tzOffsetMinutes`, matching the file's existing fixture style (no `Date.now()`).

### `apps/web/src/tests/use-notification-sync.test.tsx`
- Extend the mock store with `getNotificationPreferences` (default all-true/default window so
  existing assertions hold).
- Add **one** case proving prefs reach the engine on web: a disabled type (or a narrowed window)
  suppresses the intent the default would have submitted — assert via the injected `NotificationPort`
  spy (no `submitIntent` for the disabled type). Mirror the existing test's port-spy harness.

## Dependencies
- none (uses existing `@ember/core` `resolveNotificationConfig` + existing store getters).

## Verify when done
- [ ] Mobile: disabled type → its intent is not submitted; narrowed active window filters an
      out-of-window candidate; the four pre-existing cases still pass with the default-prefs fixture.
- [ ] Web: a disabled type (or narrowed window) suppresses the intent; existing cases still pass.
- [ ] Both runners read prefs via a **local** `getNotificationPreferences()` (invariant #1 — no
      Convex on the read path) and spread `resolveNotificationConfig(prefsRecord.prefs)` into config.
- [ ] No change to `packages/core`, `packages/store`, the Settings UI, or the field semantics.
- [ ] Invariant #5 intact — zero decision logic added in the clients; all planning still defers to
      `deriveNotificationSync` / `resolveNotificationConfig`.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean

## Out of scope (tracked elsewhere)
- Renaming the misleading `quiet*Hour` fields / reconciling the "Quiet hours" UI copy with the
  actual active-window semantics — a core+UI concern, not this wiring slice. (Flag to user if worth
  a follow-up issue.)
- A type disabled *after* an intent was already submitted (stale pending server intent) — the
  convex/explicit-primary slice's concern (carried from 17b/17d notes).
- Explicit-primary convex election + the two deferred claim-review client units.
