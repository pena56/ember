# Unit 17b: Core notification preferences

Issue: #143 · Branch: feat/143-core-notification-preferences · Boundary: packages/core
Route: standard — one boundary (pure TS), contained logic, no new dep, ambiguity resolved.

## Goal
Add the pure, user-facing preference model that feeds the notification planner: a
`NotificationPreferences` shape (per-type on/off for all four types + quiet-hours), a
`resolveNotificationConfig(prefs)` mapping into the existing `NotificationConfig`, and an
`enabledTypes` gate inside `planNotifications` so disabled types never become candidates.
No persistence, no UI, no convex/store change — this is the foundation later slices read from.

## Implementation

### `packages/core/src/notification.ts` — add `enabledTypes` to the config gate
- Extend `NotificationConfig` with `enabledTypes: Record<NotificationType, boolean>`.
- Extend `DEFAULT_NOTIFICATION_CONFIG` with `enabledTypes` = all four `true`
  (derive the keys from `NOTIFICATION_PRIORITY` so it stays single-sourced; no hand-typed list).
- In `planNotifications`, after the raw candidates are collected and BEFORE the quiet-hours
  filter, drop any candidate whose `enabledTypes[type]` is `false`. (A disabled type is never
  scheduled; an all-`true` default preserves today's behaviour exactly — existing 16a tests
  must stay green untouched.)

### `packages/core/src/notification-preferences.ts` — new file (user-facing model)
- `export type NotificationPreferences = { enabledTypes: Record<NotificationType, boolean>; quietStartHour: number; quietEndHour: number; }`
  with a short doc comment: this is the **persisted, syncable** user shape (per-account); a
  later slice writes it through the outbox. quietStartHour inclusive / quietEndHour exclusive,
  local hours — mirrors `NotificationConfig`'s existing semantics.
- `export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences` — all types `true`,
  `quietStartHour: 8`, `quietEndHour: 22` (match `DEFAULT_NOTIFICATION_CONFIG`; derive type keys
  from `NOTIFICATION_PRIORITY`, don't re-list them).
- `export function resolveNotificationConfig(prefs?: Partial<NotificationPreferences>): Partial<NotificationConfig>`
  — pure. Maps a (partial) preference into a `Partial<NotificationConfig>` suitable to spread
  into `planNotifications`/`deriveNotificationSync`'s `config`:
  - `enabledTypes`: merge supplied flags over the all-`true` default (partial allowed).
  - quiet-hours: pass through `quietStartHour`/`quietEndHour` **clamped to integers in [0, 24]**;
    if the result is degenerate (`start >= end`), fall back to the defaults (8/22) rather than
    silently muting every type — document this guard inline.
  - Omit any field the caller didn't supply (return a sparse `Partial`), so unspecified prefs
    keep `DEFAULT_NOTIFICATION_CONFIG`.
- No platform APIs, no `Date.now()`, no zod (plain clamping). Keep it dependency-free.

### `packages/core/src/index.ts` — barrel
- Add `export * from './notification-preferences.js';` after `./notification-sync.js`.

### Note for the later wiring slice (do NOT build here)
`deriveNotificationSync`'s goal-met `suppress` list still spans all four type keys (idempotent —
leave as-is). A type disabled *after* an intent was already submitted, with goal still unmet,
leaves a stale pending server intent; cancelling that is a client/convex concern handled when
preferences are persisted and wired. Out of scope for this pure slice.

## Dependencies
- none.

## Verify when done
- [ ] `resolveNotificationConfig(DEFAULT_NOTIFICATION_PREFERENCES)` spread into `planNotifications`
      yields byte-identical output to passing no config (default parity).
- [ ] Disabling a single type removes exactly that type from `candidates`/`selected`; the next
      lower-priority enabled type is selected in its place.
- [ ] Disabling all four types ⇒ `selected === null`, `candidates === []`.
- [ ] Custom quiet-hours narrow/shift the window correctly; degenerate `start >= end` falls back
      to 8/22 (not "everything muted").
- [ ] Partial prefs leave unspecified config fields at their `DEFAULT_NOTIFICATION_CONFIG` value.
- [ ] All existing 16a `notification` + 16d `notification-sync` tests pass unchanged.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated (esp. #1 core purity, #5 single-source decision).
