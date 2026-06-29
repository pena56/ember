# Unit 16e: Mobile notification sync (closes umbrella #16)

Issue: #139 (umbrella #16) · Branch: feat/139-mobile-notification-sync · Boundary: `apps/mobile`
Route: **standard, NON-UI** — one boundary (`apps/mobile`), spec fully resolved (all three forks
settled 2026-06-29), mirrors the existing 16c web wiring + the mobile `use-reconciler`/`sync-scheduler`
precedent. Renders nothing → no `frontend-design`/`impeccable`. Not "inline" (a new hook + adapter +
port + node-tested orchestration + a `SyncBundle` field). Not "complex" (no open questions, no second
boundary — core is untouched; it already ships the derivation from 16d).

Fifth and final slice of umbrella **#16** (Notification engine): 16a core engine (MERGED) → 16b Convex
server (MERGED) → 16c web wiring (MERGED) → 16d notify-core hoist (MERGED) → **16e mobile notification
sync (this) — closes #16.**

## Goal
Give mobile the same background notification pipeline web got in 16c: on launch / foreground / local
mutation, register this device (**no Expo token**), derive the day's plan from the **hoisted** core
`deriveNotificationSync` (16d), `submitIntent` the single selected nudge, and `claimSlot('suppressed')`
every type once the daily goal is met — so the 16b server ledger dedupes across devices and (once #17
grants a token) delivers on exactly one device. **No `expo-notifications`, no permission, no token, no
local fire** — server-push-only, permission deferred to #17.

Unlike web (which inlined everything in one hook), mobile follows its **established sync split**: the
*when* reuses the already-node-tested pure `createSyncScheduler` (`apps/mobile/src/sync/sync-scheduler.ts`),
and the *what* is a small node-tested `runNotificationSync` orchestration. The RN hook is thin untested
glue, exactly like `use-reconciler.ts`.

## Resolved forks (2026-06-29, with user — carried from the 16d spec)
- **Server-push-only.** Mobile never schedules a local notification; the 16b 5-min cron is the sole
  deliverer. This slice only submits intents + suppresses.
- **Permission/token fully deferred to #17.** Mobile registers with **no** `expoPushToken` this slice, so
  `electPrimaryDevice` (filters `hasToken===true`) finds no eligible device until #17 — the pipeline is
  built and dedupes now; delivery switches on in #17.
- **Derivation single-sourced in core (16d, done).** Mobile imports `deriveNotificationSync` from
  `@ember/core` — identical `dedupeKey`s + copy to web, so the ledger dedupes correctly cross-device.

## Implementation

### `apps/mobile/src/store/store-context.tsx` (edit) — expose `deviceId`
- Add `deviceId: string;` to the `SyncBundle` interface (doc: "Stable per-install device id from the
  native clock — used by the notification-sync hook to register/claim under invariant #7").
- In the production bundle builder, set `deviceId: clock.deviceId` (the `NativeClock` already exposes it,
  persisted under `ember-device-id`). No other bundle field changes.

### `apps/mobile/src/notify/notification-port.ts` (new) — RN-free port interface
The `NotificationPort` interface lives in its **own RN-free module** (NOT in the hook as web did) so the
node-tested `runNotificationSync` can depend on the type without transitively importing `react-native`.
```ts
export interface NotificationPort {
  registerDevice(args: { deviceId: string; platform: 'ios' | 'android' }): Promise<unknown>;
  submitIntent(args: {
    deviceId: string; dedupeKey: string; type: string; localDay: string;
    scheduledWall: number; title: string; body: string;
  }): Promise<unknown>;
  claimSlot(args: { dedupeKey: string; deviceId: string; via: 'suppressed' }): Promise<unknown>;
}
```
(Platform union is `'ios' | 'android'` — the 16b `registerDevice` validator accepts `ios|android|web`.)

### `apps/mobile/src/notify/run-notification-sync.ts` (new) — pure-ish, node-tested orchestration
The mobile analog of web's inline `run()` steps, extracted so it is testable with no native modules
(caller injects `now`/`tz`/`platform` — no clock/platform calls inside). No try/catch here — the
scheduler swallows (local-first).
```ts
import { deriveNotificationSync } from '@ember/core';
import type { ReadingSession } from '@ember/core';
import type { GoalConfigRecord } from '@ember/store';
import type { NotificationPort } from './notification-port.js';

export interface RunNotificationSyncDeps {
  port: NotificationPort;
  store: {
    listSessions(): Promise<ReadingSession[]>;
    getGoalConfig(): Promise<GoalConfigRecord>;
  };
  deviceId: string;
  platform: 'ios' | 'android';
  now: number;
  tzOffsetMinutes: number;
}

export async function runNotificationSync(deps: RunNotificationSyncDeps): Promise<void> {
  const { port, store, deviceId, platform, now, tzOffsetMinutes } = deps;
  // 1. Register device (no token) + liveness heartbeat.
  await port.registerDevice({ deviceId, platform });
  // 2. Read sessions + goal config (all local — invariant #1).
  const sessions = await store.listSessions();
  const goalConfig = await store.getGoalConfig();
  // 3. Derive via 16a's engine (pure, hoisted to core in 16d).
  const { intent, suppress } = deriveNotificationSync({
    sessions, now, tzOffsetMinutes,
    config: { goalTargetMs: goalConfig.targetActiveMs },
  });
  // 4. Submit the single selected intent, if any.
  if (intent) {
    await port.submitIntent({
      deviceId,
      dedupeKey: intent.plan.dedupeKey,
      type: intent.plan.type,
      localDay: intent.plan.localDay,
      scheduledWall: intent.plan.scheduledWall,
      title: intent.title,
      body: intent.body,
    });
  }
  // 5. Claim suppressed slots (goal met — block every device from nudging).
  for (const key of suppress) {
    await port.claimSlot({ dedupeKey: key, deviceId, via: 'suppressed' });
  }
}
```
This is byte-for-byte the same decision/flow web runs (invariants #1/#2/#5/#7), minus the
`disposed`-guard bookkeeping (the scheduler owns teardown/overlap).

### `apps/mobile/src/notify/convex-notification-port.ts` (new) — Convex adapter
Verbatim mirror of web's `convex-notification-port.ts`, but importing `NotificationPort` from
`./notification-port.js` and using `@ember/convex/_generated/api` (the path the mobile
`convex-sync-transport.ts` uses):
```ts
import type { ConvexReactClient } from 'convex/react';
import { api } from '@ember/convex/_generated/api';
import type { NotificationPort } from './notification-port.js';

export function createConvexNotificationPort(convex: ConvexReactClient): NotificationPort {
  return {
    registerDevice: (a) => convex.mutation(api.notifications.registerDevice, a),
    submitIntent: (a) => convex.mutation(api.notifications.submitIntent, a),
    claimSlot: (a) => convex.mutation(api.notifications.claimSlot, a),
  };
}
```
Only lazily imported by the hook when no port is injected (so node tests never load the convex
singleton) — same precedent as `convex-sync-transport.ts`.

### `apps/mobile/src/notify/use-notification-sync.ts` (new) — thin RN adapter
Mirrors `use-reconciler.ts` exactly for gating/teardown/lazy-singleton, and **reuses
`createSyncScheduler`** for the schedule (immediate + 15s interval + foreground + reconnect + debounced
mutation signal, overlap-guarded). Untested thin glue (like `use-reconciler.ts`), covered by typecheck.
- Signature: `useNotificationSync(opts?: { port?: NotificationPort; intervalMs?: number }): void`.
- Gate: `useConvexAuth().isAuthenticated && useSyncBundle() !== null` (else return/teardown).
- Read the `NativeStore` via `useNativeStore()` for `listSessions`/`getGoalConfig`; hold it in a `ref`
  (stable post-init) so it is **not** an effect dependency — same reasoning web used for `storeRef`.
  Deps: `[isAuthenticated, bundle, injectedPort, intervalMs]`.
- Resolve the port: injected → use it; else lazily
  `Promise.all([import('../convex/convex-client.js'), import('./convex-notification-port.js')])` →
  `createConvexNotificationPort(convex)` (guard `convex === null`, matching `use-reconciler`).
- Build the scheduler:
  ```ts
  const scheduler = createSyncScheduler({
    runOnce: () => runNotificationSync({
      port,
      store: storeRef.current,                 // NativeStore
      deviceId: activeBundle.deviceId,
      platform: Platform.OS as 'ios' | 'android',
      now: Date.now(),
      tzOffsetMinutes: -new Date().getTimezoneOffset(),
    }),
    isOnline: async () => (await Network.getNetworkStateAsync()).isConnected ?? false,
    signal: activeBundle.signal,
    appState: AppState,
    network: Network,
    ...(intervalMs !== undefined ? { intervalMs } : {}),
  });
  ```
  `Date.now()` / `getTimezoneOffset()` live in this **app-layer** adapter (allowed — only `@ember/core`
  must be clock-free); they are computed fresh per `runOnce`.
- Teardown returns `() => scheduler.dispose()` (plus the `disposed`/lazy-import guard pattern from
  `use-reconciler`).

### `apps/mobile/app/_layout.tsx` (edit) — mount
In `AnonymousAuthGate`, call `useNotificationSync();` immediately after `useReconciler();` (same Convex
auth + store scope; renders nothing). Import from `../src/notify/use-notification-sync.js`.

## Tests
### `apps/mobile/src/notify/run-notification-sync.test.ts` (new — node, no native modules)
Drive `runNotificationSync` with a spy `NotificationPort` + a fake `store` (`listSessions`/`getGoalConfig`)
+ injected `now`/`tzOffsetMinutes`/`platform`. Mirror web's `derive-notification-sync` + hook assertions:
- **registerDevice always first**, with `{ deviceId, platform }`.
- **Goal met** → `submitIntent` NOT called; `claimSlot('suppressed')` called once per type for the four
  `${type}:${today}` keys (assert the exact key set + `via:'suppressed'`).
- **Goal not met, a candidate qualifies** → exactly one `submitIntent` with the selected plan's
  `dedupeKey/type/localDay/scheduledWall` + the matching `notificationCopy` title/body; no `claimSlot`.
- **Goal not met, no candidate** → register only; no `submitIntent`, no `claimSlot`.
- (Reuse the 16a/16c fixture style — fixed epochs + explicit `tzOffsetMinutes`, no `Date.now()`.)

The `useNotificationSync` hook + `createConvexNotificationPort` are untested thin glue (typecheck-covered),
following the `use-reconciler.ts` precedent. The "convex singleton not loaded when a port is injected"
guarantee holds **by construction** (the singleton is only inside the lazy `import()` branch taken when
no port is injected) — same structural guarantee `use-reconciler` relies on; no dedicated test required.

## Dependencies
- **None new.** `convex`, `expo-network`, `react-native` (`Platform`/`AppState`) are already present.
  `expo-notifications` is deliberately **NOT** added (that is #17). Core already exports the derivation
  (16d). `@ember/store` (for `GoalConfigRecord`) is already a mobile dependency.

## Verify when done
- [ ] `pnpm -w typecheck` · `pnpm -w test` (mobile test count rises by the new `run-notification-sync`
      file) · `pnpm -w lint` — all green.
- [ ] `deviceId` is on the mobile `SyncBundle` and set from `clock.deviceId`.
- [ ] `runNotificationSync` node tests pass (the four cases above); the derivation comes from
      `@ember/core` (16d), not re-implemented.
- [ ] `useNotificationSync` is mounted in `AnonymousAuthGate` after `useReconciler()`; gates on
      auth+bundle; lazily imports the convex port only when none is injected.
- [ ] **No** `expo-notifications` import anywhere; no permission/token/local-fire code (those are #17).
- [ ] No invariant violated — #1 (reads stay local; the hook only writes intents/claims, fail-soft, off
      the render path), #2 (intents/claims are direct authed calls — NOT outbox), #5 (decision via the
      single hoisted engine), #7 (submit-one + suppress; server ledger elects/dedupes — mobile never
      elects or fires). `@ember/core` untouched (no platform API / clock added).

## Device verification (optional, non-blocking)
The logic is fully verifiable headlessly (node tests + typecheck). On a real build, launching the app
while signed in should `registerDevice` (no token) + `submitIntent`/`claimSlot` against the deployed
Convex; nothing visibly *fires* (no token until #17). No simulator run is required to merge this unit —
actual push delivery validation belongs to #17.

## Closes umbrella #16
With 16e merged, the notification engine is end-to-end: core decides (16a), the server dedupes/relays
(16b), and both clients submit/suppress (16c web, 16e mobile) from one hoisted derivation (16d).
Remaining notification work lives in **#17 Settings** (the whole device-notification surface:
`expo-notifications` permission + priming, token acquisition → `registerDevice(token)`, foreground
handler + tap responder, quiet-hours / enabled-types / explicit-primary overrides) plus the two deferred
claim-review client units.
