# Unit 17c: Persist + sync notification preferences

Issue: #145 · Branch: feat/145-store-notification-preferences · Boundary: packages/store
Route: standard — one boundary, near-clone of `goal-config.ts`, no new dep, ambiguity resolved.

## Goal
Give the 17b `NotificationPreferences` value a persistent, syncable home: a singleton settings
record read/written through the `Repository` + outbox, so a user's enabled-types + quiet-hours
survive reload and merge across devices via the existing reconciler (LWW by `updatedAt` HLC).
Store layer only — no platform-store exposure, no UI (those are the mobile/web wiring slices).

## Implementation

### `packages/store/src/notification-preferences.ts` — new file
Mirror `packages/store/src/goal-config.ts` exactly (same shape, doc-comment style, invariants).

- Imports from `@ember/core`: `type Hlc`, `encode`, `makeOutboxEntry`, `type NotificationPreferences`,
  `DEFAULT_NOTIFICATION_PREFERENCES`. Imports `type Repository` from `./repository.js`.
- `export const NOTIFICATION_PREFERENCES_COLLECTION = 'notificationPreferences';`
- `export const NOTIFICATION_PREFERENCES_ID = 'default';`  (singleton — one record per account)
- `export type NotificationPreferencesRecord = { id: string; prefs: NotificationPreferences; updatedAt: string };`
  — doc-comment `updatedAt`: encoded HLC; `''` for the unpersisted default so any real set wins by
  HLC compare (mirrors `GoalConfigRecord`).
- `export async function getNotificationPreferences(repo: Repository): Promise<NotificationPreferencesRecord>`
  — `repo.get<NotificationPreferencesRecord>(COLLECTION, ID)`; if stored, **normalize it through the
  same guard `setNotificationPreferences` uses** (so a record written by an older/looser client still
  yields a full `enabledTypes` map) and return it; else return
  `{ id: ID, prefs: DEFAULT_NOTIFICATION_PREFERENCES, updatedAt: '' }`. (Normalizing on read must NOT
  write or change `updatedAt`.)
- `export async function setNotificationPreferences(deps: { repo: Repository; hlc: Hlc; newOutboxId: () => string }, prefs: NotificationPreferences): Promise<NotificationPreferencesRecord>`
  — build `record = { id: ID, prefs: normalizePrefs(prefs), updatedAt: encode(deps.hlc) }`;
  `repo.put(COLLECTION, record)`; `repo.enqueue(makeOutboxEntry({ id: deps.newOutboxId(), hlc: deps.hlc,
  collection: COLLECTION, recordId: ID, op: 'put', payload: record }))`; return `record`. Exactly one
  outbox entry per call (two calls → two entries — mutation-log append, like `setGoalConfig`).
- Private `normalizePrefs(prefs): NotificationPreferences` — light sanity guard, pure:
  - `enabledTypes`: start from `DEFAULT_NOTIFICATION_PREFERENCES.enabledTypes` and overlay the supplied
    flags (coerced to boolean) so the map always carries every type key (single-source key set — do not
    hand-list types; spread the default).
  - `quietStartHour` / `quietEndHour`: `Math.trunc`, then clamp to `[0, 24]`.
  - (No degenerate-window fallback here — that's `resolveNotificationConfig`'s job at read-into-planner
    time in core; storage keeps the user's raw choice.)

### `packages/store/src/index.ts` — barrel
- Add `export * from './notification-preferences.js';` (place near the `goal-config` export).

## Dependencies
- none.

## Verify when done
- [ ] `getNotificationPreferences` on an empty repo returns the default record with `updatedAt: ''`.
- [ ] `setNotificationPreferences` persists the record (subsequent `get` returns it) and enqueues
      **exactly one** outbox entry per call (`collection: 'notificationPreferences'`, `recordId: 'default'`,
      `op: 'put'`, payload === the record); two calls → two entries.
- [ ] `updatedAt` on a set record is the encoded HLC (`encode(hlc)`), non-empty; sorts above `''`.
- [ ] `normalizePrefs` fills a missing/partial `enabledTypes` key from the default and clamps
      out-of-range / fractional quiet hours to integers in `[0, 24]`.
- [ ] Test runs against `MemoryRepository` (headless; no platform dep), mirroring `goal-config.test.ts`.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated (esp. #2 every syncable mutation through the outbox with
      an HLC stamp; #5 cross-device merge via the shared reconciler — no bespoke merge here).
