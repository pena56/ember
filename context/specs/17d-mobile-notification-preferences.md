# Unit 17d: Mobile Settings UI — notification preferences

Issue: #147 · Branch: feat/147-mobile-notification-preferences · Boundary: apps/mobile
Route: standard — one boundary (mobile app), UI unit, no new dep, ambiguity resolved.

## Goal
Surface the 17c persisted `NotificationPreferences` in the mobile Settings modal: four
per-type on/off toggles + a quiet-hours window, read and written through the native store
(so changes persist + sync via the existing outbox). Decided product shape:
- **Toggles + quiet-hours pickers together** in one Notifications section.
- Per-type toggles are **shown always but disabled/dimmed until push is enabled** — the
  existing Enable row is the gate; prefs read as "what you'll get once it's on".
- Quiet-hours uses a **bespoke hour selector** (whole local hours 0–24, matching the model) —
  **no new native dep** (no `@react-native-community/datetimepicker`), consistent with the
  bespoke `EmberToggle`. Token-only styling (invariant #6).

This is the read/write-into-UI slice. No core/store/convex change — 17b/17c already provide
the model, persistence, and sync; this consumes them.

## Implementation

### `apps/mobile/src/store/native-store.ts` — two thin pass-throughs
Mirror the existing `getGoalConfig` (read) and the mutating methods (e.g. `importPdf`) that
inject `{ hlc: clock.nextStamp(), newOutboxId: () => clock.newOutboxId() }`.
- Import from `@ember/store`: `getNotificationPreferences`, `setNotificationPreferences`,
  `type NotificationPreferencesRecord`; from `@ember/core`: `type NotificationPreferences`.
- Add to the `NativeStore` interface + factory:
  - `getNotificationPreferences(): Promise<NotificationPreferencesRecord>` →
    `return getNotificationPreferences(repo);`
  - `setNotificationPreferences(prefs: NotificationPreferences): Promise<NotificationPreferencesRecord>` →
    `return setNotificationPreferences({ repo, hlc: clock.nextStamp(), newOutboxId: () => clock.newOutboxId() }, prefs);`
    (exactly one HLC stamp per call — invariant #2, already guaranteed inside 17c's use-case).
  - Doc-comment both, matching the house style.

### `apps/mobile/src/notify/use-notification-preferences.ts` — new hook
Thin glue mirroring `use-push-enablement.ts` (untested glue — typecheck-covered; the pure
decision seam lives in core/store, not here). Invariants: #1 reads local, the only writes go
through the store's outbox path; #5 no decision logic reinvented; #6 no styling here.
- `useNativeStore()` for the store (+ `ready`). Local state `prefs: NotificationPreferences`
  seeded from `DEFAULT_NOTIFICATION_PREFERENCES` (import from `@ember/core`).
- `load()` (async, fail-soft): when `ready`, `setPrefs((await store.getNotificationPreferences()).prefs)`.
  Call it from `useFocusEffect` (mirror `usePushEnablement`) so re-opening the modal re-reads
  the durable record rather than trusting stale local state.
- Expose optimistic setters that update local state immediately then persist (fire-and-forget,
  fail-soft), each producing the full next `NotificationPreferences` and calling
  `store.setNotificationPreferences(next)`:
  - `setEnabledType(type: NotificationType, enabled: boolean)` — `{ ...prefs, enabledTypes: { ...prefs.enabledTypes, [type]: enabled } }`.
  - `setQuietHours(startHour: number, endHour: number)` — `{ ...prefs, quietStartHour: startHour, quietEndHour: endHour }`.
    (Storage `normalizePrefs` already trunc+clamps; the picker only emits whole 0–24 hours, so
    no extra guard here.)
- Return `{ prefs, ready, setEnabledType, setQuietHours }`. No Convex read on the render path.

### `apps/mobile/src/settings/` — UI (presentational, props-in)
Keep the route→presentational split: the **route** owns the hooks, the screen takes props.

1. **`hour-field.tsx` — new bespoke component** (net-new UI; build with `frontend-design`, then
   `impeccable`). A token-only inline hour selector for a single 0–24 whole-hour value:
   - Props: `{ label: string; hour: number; onChange: (hour: number) => void; disabled?: boolean }`.
   - Tap opens a compact in-card picker of hours (e.g. a horizontal/wheel list or stepper —
     designer's call) rendered with token classes only (no hardcoded colors, invariant #6).
   - Formats the displayed hour in local 12-h style (`8:00 AM`, `10 PM`, `24` shown as end-of-day)
     — display-only; the stored/emitted value stays a 0–24 integer.
   - Full a11y: `accessibilityRole="adjustable"` with `accessibilityValue`, label from `label`,
     and `accessibilityState={{ disabled }}`.
2. **`settings-screen.tsx` — extend the existing `NotificationsSection`** (changing existing UI →
   run `impeccable` on the whole section after). Add new props to `SettingsScreen` +
   `NotificationsSection`:
   `prefs: NotificationPreferences`, `pushEnabled: boolean`,
   `onToggleType: (type: NotificationType, enabled: boolean) => void`,
   `onChangeQuietHours: (startHour: number, endHour: number) => void`.
   - Below the existing Enable row, render a **per-type list** (one row per type, in
     `NOTIFICATION_PRIORITY` order — derive from the priority map, don't hand-list) with a
     human label per type and an `EmberToggle` bound to `prefs.enabledTypes[type]`.
     - **Gating:** when `!pushEnabled`, the type rows + quiet-hours are visually dimmed
       (`opacity` token-driven) and non-interactive (`Pressable disabled` / `pointerEvents`),
       `accessibilityState={{ disabled: true }}`. The Enable row stays fully interactive.
   - A **Quiet hours** row using two `HourField`s ("From" `quietStartHour`, "To" `quietEndHour`),
     calling `onChangeQuietHours` with the updated pair; share the same `disabled={!pushEnabled}`.
   - Type labels: `streak-risk → "Streak risk"`, `goal-progress → "Goal progress"`,
     `best-time → "Best time"`, `lapse-reengage → "Lapse re-engage"` (single small map in the
     screen; keys come from the priority map so a new type surfaces as a missing-label TODO,
     not a silent drop).
3. **`app/settings.tsx` — wire the new hook** into the existing `SettingsRouteInner`: call
   `useNotificationPreferences()` and pass `prefs`, `pushEnabled: state.enabled`, `onToggleType`,
   `onChangeQuietHours` into `<SettingsScreen/>` alongside the existing push props.

## Dependencies
- none (bespoke hour picker — explicitly NO new native module).

## Verify when done
- [ ] Toggling a type flips its `EmberToggle` immediately and persists: a subsequent
      `getNotificationPreferences()` reflects the change (one outbox entry per toggle — 17c).
- [ ] Changing a quiet-hours field persists the new 0–24 integer; reopening the modal
      (focus re-read) shows the saved value, not the default.
- [ ] When push is OFF, type + quiet-hours controls are dimmed and non-interactive; the Enable
      row still works. Enabling push makes them interactive without a remount glitch.
- [ ] Type rows render in `NOTIFICATION_PRIORITY` order with correct labels; all four present.
- [ ] No hardcoded colors anywhere new (invariant #6); a11y roles/states on every new control
      (`switch` for toggles, `adjustable` for hour fields, `disabled` when gated).
- [ ] `HourField` built via frontend-design + audited with impeccable; honours `ui-context.md`
      tokens; the existing Enable-row design/behaviour is unchanged.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean
- [ ] No invariant violated (#1 reads local / writes via outbox; #2 one HLC stamp per set;
      #5 no merge logic here; #6 token-only).

## Device-bound (user, after merge — like 02d/17a)
Headless gates can't render RN. After merge, on device/simulator: toggles persist across modal
close/reopen and app restart; quiet-hours picker reads naturally and re-themes light↔dark;
dimmed state is legible; with two devices, a toggle on one converges on the other (LWW via the
reconciler). Note any picker/gesture fixes back here, as with 02d's bundler notes.

## Note for later slices (do NOT build here)
- Web settings parity (apps/web) is the sibling slice.
- A type disabled *after* an intent was already submitted (goal still unmet) leaves a stale
  pending server intent — cancelling it is the convex/explicit-primary slice's concern, not this
  UI unit (carried over from 17b's note).
