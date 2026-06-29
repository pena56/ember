# Unit 16d: Hoist notify derivation (`deriveNotificationSync` + `notificationCopy`) into `@ember/core`

Issue: #137 (umbrella #16) · Branch: feat/137-notify-core-hoist · Boundary: `packages/core` (+ mechanical `apps/web` import repoint)
Route: **standard** — a single pure-code move, zero behavior change, fully resolved. The only
cross-cut is a mechanical import-path update in `apps/web` (the consumer must follow the moved
source); no new feature, no new dep. Not "complex" — there are no open questions and the web side is
purely `from './…' → from '@ember/core'`.

Fourth slice of umbrella **#16** (Notification engine), inserted as the agreed prerequisite (user,
2026-06-29) so web (16c) and mobile (16e) share **one** decision source: 16a core engine (MERGED) →
16b Convex server (MERGED) → 16c web wiring (MERGED) → **16d notify-core hoist (this)** → 16e mobile
notification sync (closes #16).

## Goal
The pure notification-sync derivation + warm-voice copy map — written in `apps/web/src/notify` for
Unit 16c — moves verbatim into `@ember/core`, its true home (it is pure, `Date.now()`-free, and
already imports only from `@ember/core`). Web repoints its two importers to `@ember/core`; the moved
web files (and their tests) are deleted. **No behavior changes** — same functions, same signatures,
same copy strings, same tests. This single-sources the decision (invariant #5) so 16e (mobile) reuses
it rather than duplicating, guaranteeing both platforms submit identical `dedupeKey`s + copy and the
16b ledger dedupes correctly.

## Resolved forks (2026-06-29, with user)
- **Hoist to core (not duplicate on mobile).** The derivation/copy are shared domain logic; core is
  their home. Mobile (16e) will `import { deriveNotificationSync, notificationCopy } from '@ember/core'`
  exactly as web will after this unit.
- (Carried) The functions are pure and **core-eligible**: no `new Date()` (caller injects `now`/`tz`),
  no platform API, deps are all already-exported core symbols (`planNotifications`, `deriveTodayGoal`,
  `localDayOf`, `NOTIFICATION_PRIORITY`, `DEFAULT_GOAL_ACTIVE_MS`, and the `Notification*` types).

## Implementation

### `packages/core/src/notification-copy.ts` (new — moved from `apps/web/src/notify/notification-copy.ts`)
Verbatim move. Change the import of `NotificationType` from `'@ember/core'` to the **local** module
that defines it (the same module 16a's `notification.ts` declares it in — use a relative
`./notification.js` import, matching how sibling core files reference each other). Keep the exhaustive
`switch` (no `default`) so adding a `NotificationType` without copy still fails typecheck.

### `packages/core/src/notification-sync.ts` (new — moved from `apps/web/src/notify/derive-notification-sync.ts`)
Verbatim move of `deriveNotificationSync` + the `NotificationSyncInput` / `SubmitIntent` /
`NotificationSyncPlan` types + the `NOTIFICATION_TYPES` constant. Rewrite the two imports to be
**intra-core relative** (`./notification.js` for engine symbols + types, `./session.js` if
`ReadingSession` lives there — verify the real module; whatever `index.ts` re-exports them from) and
`./notification-copy.js` for `notificationCopy`. No logic change.

> File name note: the web file was `derive-notification-sync.ts`; in core it becomes
> `notification-sync.ts` to sit beside `notification.ts` (16a). The **exported symbol names are
> unchanged** — only the file path and the import specifiers change.

### `packages/core/src/index.ts` (edit) — re-export
Add, beside the existing `export * from './notification.js';`:
```ts
export * from './notification-copy.js';
export * from './notification-sync.js';
```

### `packages/core/src/tests/` (new — moved from web)
Move `notification-copy.test.ts` and `derive-notification-sync.test.ts` into core's test dir
(`packages/core/src/tests/`, matching the existing core test layout — verify the exact folder). Repoint
their imports from the old relative web paths to `@ember/core` (or intra-core relative, matching how
other core tests import — check a sibling test). Assertions unchanged. (Net core test count rises by
these two files; net web test count drops by the same two.)

### `apps/web/src/notify/use-notification-sync.ts` (edit) — repoint import
Change `import { deriveNotificationSync } from './derive-notification-sync.js';` →
`import { deriveNotificationSync } from '@ember/core';`. Nothing else in the hook changes (it already
imports core symbols). The `NotificationPort` interface + the hook body stay in web.

### `apps/web/src/notify/convex-notification-port.ts` — unchanged
It imports `NotificationPort` from `./use-notification-sync.js` (web-local) — that type **stays** in
web (it is web-port plumbing, not domain logic). No edit.

### Delete from `apps/web/src/notify/`
- `derive-notification-sync.ts` (moved to core)
- `notification-copy.ts` (moved to core)
- `derive-notification-sync.test.ts` (moved to core)
- `notification-copy.test.ts` (moved to core)
Remaining web `notify/` files: `use-notification-sync.ts`, `convex-notification-port.ts`, and the hook
test `apps/web/src/tests/use-notification-sync.test.tsx`. The hook test mocks/derives via the hook, not
the moved pure module — confirm it has no direct `./derive-notification-sync.js` / `./notification-copy.js`
import; if it does, repoint to `@ember/core`.

## Dependencies
- none new. Pure intra-monorepo move. `apps/web` already depends on `@ember/core` (workspace), so the
  repoint needs no manifest change. Mobile is untouched in this unit (it consumes the result in 16e).

## Verify when done
- [ ] `deriveNotificationSync` + `notificationCopy` + their types are exported from `@ember/core`
      (importable as `import { deriveNotificationSync, notificationCopy } from '@ember/core'`).
- [ ] The two pure tests run **in core** and pass unchanged (goal-met → `intent===null` + four
      `${type}:${today}` suppress keys; goal-not-met qualifying → `selected` + matching copy,
      `suppress===[]`; goal-not-met no-candidate → both empty/null; copy distinct/non-empty per type;
      exhaustive switch enforced at compile time).
- [ ] `apps/web/src/notify/derive-notification-sync.ts`, `notification-copy.ts`, and their two test
      files no longer exist; web's `use-notification-sync.ts` imports `deriveNotificationSync` from
      `@ember/core`; the web hook test still passes (behavior identical).
- [ ] No `new Date()` / `Date.now()` introduced into core (the moved code is already clock-free —
      caller injects `now`/`tz`).
- [ ] `pnpm -w typecheck` · `pnpm -w test` (counts shift web→core, total ≈ unchanged) · `pnpm -w lint`
      all green.
- [ ] No invariant violated — esp. **#5** (this *strengthens* single-sourcing: one decision module,
      now consumed by both clients), and core purity (no platform API, no clock) preserved.

## Deferred to 16e / #17 (do NOT solve here)
- **16e (mobile notification sync — closes #16):** add `deviceId` to the mobile `SyncBundle`
  (store-context.tsx); a mobile `useNotificationSync` hook mirroring web's (register device **no
  token**, engine via the now-hoisted `deriveNotificationSync` → `submitIntent` → `claimSlot('suppressed')`,
  lazy convex port, gated on auth+bundle, triggers on mount/foreground/signal); mount in
  `AnonymousAuthGate` after `useReconciler()`. **No `expo-notifications`, no permission, no token, no
  local fire** (per 2026-06-29 forks: server-push-only + permission deferred to #17).
- **#17 Settings (the whole device-notification surface):** `expo-notifications` permission prompt +
  priming UI, `getExpoPushTokenAsync` → `registerDevice(token)`, foreground notification handler + tap
  responder, quiet-hours / enabled-types / explicit-primary overrides. Until #17 grants a token no
  device is push-eligible (`electPrimaryDevice` filters `hasToken`), so #16 ships the full
  decide→submit→dedupe→relay pipeline with delivery activated in #17.
