# Unit 16c: Web notification sync — engine wiring + intent submit + suppress-on-read

Issue: #135 (umbrella #16) · Branch: feat/135-web-notification-sync · Boundary: `apps/web`
Route: standard — one boundary, **non-UI** background wiring, all forks resolved. Net-new logic is
contained (reuses 16a `planNotifications` + 16b's `api.notifications.*` mutations); mirrors the
existing `useReconciler` / `useBlobSync` auth+bundle-gated side-effect-hook pattern. No new dep.

Third slice of umbrella **#16** (Notification engine): 16a core engine (MERGED) → 16b Convex server
(MERGED) → **16c web wiring (this)** → 16d mobile (device-bound). **There is no UI in this slice** —
no Notification is shown on web, no permission prompt — so no `frontend-design`/`impeccable` step.

## Goal
A background hook that, while authed, keeps the web device registered, runs 16a's engine over the
local session log, **submits the day's `selected` plan as an intent** (so the elected mobile device
can deliver it, invariant #7), and **`claimSlot('suppressed')`** for today's keys once the goal is
met — so no device nudges a user who already read. Convex stays off the read path (invariant #1):
all reads are local; the hook only *writes* notification intents/claims, fail-soft.

## Resolved forks (2026-06-29, with user)
- **No local web fire.** Web never shows a `Notification` and schedules no SW/`setTimeout` timer.
  All real delivery rides mobile push (16d). Web's only job is engine → `submitIntent` → suppress.
- **Permission UX deferred to #17 Settings.** This slice ships **no** permission prompt UI. (Web
  never needs `Notification.requestPermission()` here since it never fires locally.)
- (Carried from 16b) **most-recently-active device wins** election — web has no Expo token, so it is
  never elected primary; it participates only as an intent submitter + suppressor.

## Implementation

### `apps/web/src/notify/notification-copy.ts` (new) — pure copy map
`export function notificationCopy(type: NotificationType): { title: string; body: string }`.
Warm, literary voice matching the app (cf. `today-page.tsx` greetings). Defaults (adjustable later):
- `streak-risk` → `{ title: "Your streak's still warm", body: "A few minutes tonight keeps it glowing." }`
- `goal-progress` → `{ title: "You're almost there", body: "A little more reading finishes today's goal." }`
- `best-time` → `{ title: "Your reading hour", body: "This is usually when you read — pick up where you left off?" }`
- `lapse-reengage` → `{ title: "Your books are waiting", body: "It's been a while. A page or two is a fine place to start." }`
Exhaustive `switch` over `NotificationType` (no `default` → compile-time totality).

### `apps/web/src/notify/derive-notification-sync.ts` (new) — pure planner adapter (unit-tested)
```ts
import { DEFAULT_GOAL_ACTIVE_MS, deriveTodayGoal, localDayOf, NOTIFICATION_PRIORITY,
         planNotifications } from '@ember/core';
import type { NotificationConfig, NotificationPlan, NotificationType, ReadingSession } from '@ember/core';

export interface NotificationSyncInput {
  sessions: ReadingSession[];
  now: number;
  tzOffsetMinutes: number;
  config?: Partial<NotificationConfig>;
}
export interface SubmitIntent { plan: NotificationPlan; title: string; body: string }
export interface NotificationSyncPlan {
  intent: SubmitIntent | null;   // the day's selected plan to submit (≤1/day), or null
  suppress: string[];            // dedupeKeys to claimSlot('suppressed')
}
export function deriveNotificationSync(input: NotificationSyncInput): NotificationSyncPlan;
```
Logic (pure, no I/O, no `new Date()` — caller injects `now`/`tz`):
1. `today = localDayOf(now, tzOffsetMinutes)`;
   `goalTargetMs = input.config?.goalTargetMs ?? DEFAULT_GOAL_ACTIVE_MS`;
   `goal = deriveTodayGoal(sessions, today, goalTargetMs)`.
2. **Goal met** (`goal.met === true`) → the user has read enough today; nothing should fire on any
   device. Return `{ intent: null, suppress: NOTIFICATION_TYPES.map(t => \`${t}:${today}\`) }`
   where `NOTIFICATION_TYPES = Object.keys(NOTIFICATION_PRIORITY) as NotificationType[]`. (Claiming a
   key with no pending intent is harmless + idempotent — it also blocks a *later* submit from another
   device. This is the "suppress-if-read is client-driven" path from 16b.)
3. **Goal not met** → `{ selected } = planNotifications(input)`; return
   `{ intent: selected ? { plan: selected, ...notificationCopy(selected.type) } : null, suppress: [] }`.

> Both clients run the *same* engine over the *same* synced sessions → same `selected` → same
> `dedupeKey`; the 16b ledger dedupes. Web only ever submits the single `selected` (the ≤1/day cap).

### `apps/web/src/store/store-context.tsx` (edit) — expose `deviceId` on the bundle
Add `deviceId: string;` to `SyncBundle`; in the production builder set `deviceId: webClock.deviceId`
(the stable `ember-device-id`). No change to the injected/null-bundle path (tests supply their own).

### `apps/web/src/notify/use-notification-sync.ts` (new) — the background hook
Mirror `use-reconciler.ts` exactly for gating/teardown/lazy-singleton/error-swallowing:
```ts
export interface NotificationPort {
  registerDevice(args: { deviceId: string; platform: 'web' }): Promise<unknown>;
  submitIntent(args: { deviceId: string; dedupeKey: string; type: string; localDay: string;
    scheduledWall: number; title: string; body: string }): Promise<unknown>;
  claimSlot(args: { dedupeKey: string; deviceId: string; via: 'suppressed' }): Promise<unknown>;
}
export function useNotificationSync(opts?: { port?: NotificationPort }): void;
```
- Gate: run only when `useConvexAuth().isAuthenticated` **and** `useSyncBundle() !== null` (production
  store). Tear down on sign-out / bundle-null (same as `useReconciler`).
- Reads come from `useWebStore()` (`listSessions()` + `getGoalConfig()`, as `use-habit-summary.ts`
  does); `deviceId` from the bundle; `now = Date.now()`, `tzOffsetMinutes = -new Date().getTimezoneOffset()`.
- Port resolution: when `opts.port` is injected use it; else lazily
  `import('../convex/convex-client.js')` and adapt the singleton —
  `registerDevice: (a) => convex.mutation(api.notifications.registerDevice, a)`, etc. (same lazy
  pattern `useReconciler` uses for its transport, so injected-port tests never load the singleton).
- A `run()` pass (overlap-guarded with an `inFlightRef`):
  1. `await port.registerDevice({ deviceId, platform: 'web' })` (registration + liveness heartbeat).
  2. `const sessions = await store.listSessions(); const goal = await store.getGoalConfig();`
  3. `const { intent, suppress } = deriveNotificationSync({ sessions, now: Date.now(),
     tzOffsetMinutes: -new Date().getTimezoneOffset(), config: { goalTargetMs: goal.targetActiveMs } });`
  4. `if (intent) await port.submitIntent({ deviceId, dedupeKey: intent.plan.dedupeKey,
     type: intent.plan.type, localDay: intent.plan.localDay, scheduledWall: intent.plan.scheduledWall,
     title: intent.title, body: intent.body });`
  5. `for (const key of suppress) await port.claimSlot({ dedupeKey: key, deviceId, via: 'suppressed' });`
  - Wrap the whole pass in try/catch and **swallow** (invariant #1 — a write failure is non-fatal;
    next trigger retries). Skip when `!navigator.onLine`.
- Triggers (lean — no periodic interval needed; focus + the local-mutation signal + mount cover day
  rollover and fresh sessions): run on mount, on `window` `focus`, and (debounced ~500ms) on
  `bundle.signal.subscribe(...)` (fires after every local outbox append — i.e. a captured session).
  Clean up all listeners + the subscription on teardown.

### `apps/web/src/App.tsx` (edit) — mount the hook
Add `useNotificationSync();` immediately after `useReconciler();` (line ~88), with a one-line comment
("Background notification scheduler — registers the device + submits today's intent; no UI, no local
fire (delivery rides mobile). Convex off the read path.").

## Dependencies
- none new. Reuses `@ember/core` (16a) + `@ember/convex/_generated/api` (`api.notifications.*`, 16b,
  already generated & committed). No store/convex/mobile change.

## Verify when done
- [ ] `deriveNotificationSync` (pure): goal-met → `intent === null` and `suppress` = all four
      `${type}:${today}` keys; goal-not-met + a qualifying day → `intent.plan` is 16a's `selected`
      with the matching `notificationCopy`, `suppress === []`; goal-not-met + no candidate →
      `intent === null`, `suppress === []`; no `new Date()` inside (caller injects now/tz).
- [ ] `notificationCopy` returns distinct non-empty title/body for each of the four types
      (exhaustive switch — adding a type without copy fails typecheck).
- [ ] `useNotificationSync` (hook test, mirror `use-reconciler.test.tsx`): with an injected port +
      fake bundle (deviceId) + a store returning fixture sessions + `isAuthenticated: true`, a pass
      calls `registerDevice` then `submitIntent`/`claimSlot` with the derived args; does **nothing**
      when unauthenticated or bundle is null; swallows a rejected port call (no throw); re-runs on the
      signal. The Convex singleton is never imported when a port is injected.
- [ ] `SyncBundle.deviceId` is wired from `webClock.deviceId` in the production builder.
- [ ] `useNotificationSync()` is mounted in `App.tsx` after `useReconciler()`.
- [ ] `pnpm -w typecheck` (9) · `pnpm -w test` (6; new `notify` tests) · `pnpm -w lint` (6) all clean.
- [ ] No invariant violated — esp. **#1** (all reads local; hook only writes, fail-soft, never on the
      render path), **#2** (notification intents/claims are direct authed calls **by design** — the
      same exception class as 13a blob metadata; nothing here goes through the outbox/`records`),
      **#5** (the decision is 16a's engine, reused — no merge/decision logic reinvented here),
      **#7** (web submits the single `selected` + suppresses; the 16b server ledger does the actual
      cross-device dedupe — web does not elect or fire).

## Deferred to 16d / #17 (do NOT solve here)
- **16d (mobile, device-bound):** `expo-notifications` permission + `getExpoPushTokenAsync` →
  `registerDevice(token)`; local `scheduleNotificationAsync` at `scheduledWall`; receive server Expo
  push; `claimSlot('local')` on local fire / `claimSlot('suppressed')` on read; device-bound accept.
- **#17 Settings:** the notification opt-in/permission prompt UI, quiet-hours / enabled-types /
  explicit-primary overrides. 16c uses no permission and the default config.
