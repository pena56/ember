# Unit 12d: Mobile reconciler wiring — Convex transport + clock.receive + scheduler

Issue: #109 (umbrella #12) · Branch: feat/109-mobile-reconciler-wiring · Boundary: `apps/mobile`
Route: standard — one boundary (`apps/mobile`), forks already resolved (mirror 12c), no new dep
(`expo-network` + RN `AppState` already deps), no visual surface (the reconciler is a side-effect hook).
The device-bound mirror of 12c: same ports, same `reconcile()`, RN lifecycle instead of `window`.

**Final** slice of umbrella **#12**: **12a** Convex sync server ✅ → **12b** core reconciler + merge fold
✅ → **12c** web reconciler wiring ✅ → **12d** mobile reconciler wiring (this) → umbrella #12 COMPLETE.

## Goal
The mobile app actually syncs: an authed user's local outbox is pushed to Convex and remote changes
are pulled and folded in, on a sensible schedule, entirely through the existing `reconcile()` driver
from 12b. No merge logic here (invariant #5 — it all lives in `applyPull`); this unit only supplies the
three injected ports (`SyncTransport`, `SyncStore`, `ReconcilerClock`) + `newOutboxId`, plus a scheduler
that decides *when* to run. Convex stays off the read path (invariant #1): the UI keeps reading the
local SQLite store; sync is a background reconciliation that never blocks rendering and fails soft when
offline. When `EXPO_PUBLIC_CONVEX_URL` is unset (`convex === null`) the scheduler never mounts — the app
runs offline-local exactly as today.

## Mirrors 12c — same resolved forks (no new product decisions)
- **Sync trigger = interval + lifecycle** (same decision the user made for 12c). One overlap-guarded
  imperative loop, gated on `isAuthenticated`. Triggers: on auth-ready (effect mount), a periodic
  `setInterval` (15s), **RN `AppState` → `active`** (foreground; the mobile analog of `window` `focus`),
  **`expo-network` connectivity → connected** (the analog of `window` `online`), and a **debounced** run
  after each local mutation (fast push). The imperative loop matches 12b's `reconcile()`.
- **Share one repo + one clock between the NativeStore and the reconciler.** The HLC clock MUST be a
  single in-memory instance (two `NativeClock`s over the same kv-store could diverge mid-session and
  break monotonicity); the `Repository` MUST be the same instance so the reconciler drains the same
  outbox the UI appends to. `StoreProvider` builds `repo`/`clock` once (in its async init) and exposes
  them to the reconciler via context.
- **Mutation→sync signal at the `repo.enqueue` chokepoint, not per NativeStore method.** Wrapping the
  repo so `enqueue` fires a notifier gives the "debounced run after local mutation" trigger with ONE wrap
  point and zero changes to the NativeStore mutators. The reconciler's own furthest-page corrective
  `enqueue` also fires it — desirable: it promptly flushes the correction, and 12b's monotone join
  guarantees the follow-up reconcile finds nothing to correct, so it terminates.
- **No store/core/convex change.** `sync-meta`/`pull-cursor` is a normal record in SQLite's generic
  `records(collection, id, record)` table (PK `(collection, id)`) — verified, no DDL change.
  `SqliteRepository` already satisfies the structural `SyncStore` (`get/put/delete/enqueue/unacked/ack`).
  `OutboxEntry` already matches 12a's `push` validator and pull rows already match `RemoteEntry` (proven
  in 12c). The only core touch is consuming its exports.

## Mobile-specific design decision (not a product fork)
The mobile Vitest config is `environment: 'node'`, `include: ['src/**/*.test.ts']` — no jsdom, no
`.tsx` rendering. So unlike 12c (which rendered the hook in jsdom), **the schedulable logic is extracted
into a pure, injectable `sync-scheduler.ts`** tested in node; the hook is a thin adapter that wires
platform ports (`AppState`, `expo-network`, the convex singleton) into it. This mirrors the established
mobile pattern — `reading-position-controller.ts` + thin `use-reading-position.ts`; `session-tracker.ts`
+ thin `use-session-tracking.ts`; `should-sign-in-anonymously.ts` + thin `use-anonymous-auth.ts`. The
hook itself is intentionally untested (thin glue, covered by typecheck), exactly like `use-anonymous-auth`.

## Implementation (all under `apps/mobile/src`)

### `store/native-clock.ts` — add `receive` (makes `NativeClock` a `ReconcilerClock` source)
- Import `receive as hlcReceive` from `@ember/core`.
- Add to the `NativeClock` interface: `/** Merge a remote stamp into the local clock, persist, return it. */ receive(remote: Hlc): Hlc;`
- In the factory, mirror `nextStamp`: `receive(remote) { clock = hlcReceive(clock, remote, nowFn()); storage.setItem(HLC_KEY, encode(clock)); return clock; }`.
- The `ReconcilerClock` adapter the driver wants is `{ tick: () => clock.nextStamp(), receive: (r) => clock.receive(r) }`; `newOutboxId` is `clock.newOutboxId`.

### `sync/mutation-signal.ts` — tiny synchronous emitter (new — copy 12c verbatim)
```ts
export interface SyncSignal { notify(): void; subscribe(cb: () => void): () => void; }
export function createSyncSignal(): SyncSignal { /* Set<cb>; notify() calls each; subscribe returns unsub */ }
```

### `sync/with-mutation-notify.ts` — repo wrapper (new — copy 12c verbatim)
- `export function withMutationNotify(repo: Repository, notify: () => void): Repository` — delegating
  `Repository` identical to `repo` except `enqueue` awaits `repo.enqueue(e)` then calls `notify()`.
  All other methods (`get/put/query/delete/unacked/ack/close`) pass straight through.

### `sync/convex-sync-transport.ts` — `SyncTransport` over Convex (new — copy 12c verbatim)
```ts
import type { ConvexReactClient } from 'convex/react';
import { api } from '@ember/convex/_generated/api';
import type { OutboxEntry, RemoteEntry, SyncTransport } from '@ember/core';

export function createConvexSyncTransport(client: ConvexReactClient): SyncTransport {
  return {
    push: (entries: OutboxEntry[]) => client.mutation(api.sync.push, { entries }),
    pull: (cursor: number, limit?: number) =>
      client.query(api.sync.pull, limit === undefined ? { cursor } : { cursor, limit }),
  };
}
```
- Pure pass-through; `client.mutation/query` auto-attach the auth token via `ConvexAuthProvider`.

### `sync/sync-scheduler.ts` — the pure, injectable scheduler (new — the testable core)
```ts
/** Structural RN AppState (subscribe to foreground/background transitions). */
export interface AppStateLike {
  addEventListener(type: 'change', handler: (state: string) => void): { remove(): void };
}
/** Structural expo-network listener (subscribe to connectivity changes). */
export interface NetworkLike {
  addNetworkStateListener(listener: (state: { isConnected?: boolean }) => void): { remove(): void };
}
export interface SyncSchedulerDeps {
  runOnce: () => Promise<unknown>;        // does ONE reconcile(...) — injected (merge-agnostic)
  isOnline: () => Promise<boolean>;       // prod: expo-network getNetworkStateAsync().isConnected
  signal: SyncSignal;                     // mutation wake
  appState: AppStateLike;                 // prod: react-native AppState
  network: NetworkLike;                   // prod: expo-network
  intervalMs?: number;                    // default 15_000
  debounceMs?: number;                    // default 500
}
export function createSyncScheduler(deps: SyncSchedulerDeps): { dispose(): void };
```
Behaviour (overlap-guarded, trailing-coalescing — same shape as 12c's `run()` but with async offline
check and injected lifecycle ports):
```
let inFlight = false, queued = false, disposed = false;
async function run() {
  if (inFlight) { queued = true; return; }   // request a single trailing pass
  inFlight = true;
  try {
    do {
      queued = false;
      if (!(await isOnline())) break;         // fail soft offline; network listener re-triggers
      await runOnce();
    } while (queued && !disposed);
  } catch { /* swallow — local-first: a sync failure is non-fatal; next trigger retries */ }
  finally { inFlight = false; }
}
```
Wiring on construct: immediate `void run()` (auth-ready); `setInterval(() => void run(), intervalMs)`;
`appState.addEventListener('change', s => { if (s === 'active') void run(); })`;
`network.addNetworkStateListener(st => { if (st.isConnected) void run(); })`;
`signal.subscribe(debounced(run, debounceMs))`. `dispose()`: set `disposed`, clear interval, `.remove()`
both subscriptions, unsubscribe the signal, clear the debounce timer. No platform imports — pure.

### `sync/use-reconciler.ts` — the thin RN adapter hook (new; `.ts`, no JSX)
```ts
export function useReconciler(opts?: { transport?: SyncTransport; intervalMs?: number }): void;
```
- Reads `useSyncBundle()` + `useConvexAuth()`. If `!isAuthenticated || bundle === null`: do nothing
  (effect returns; any prior scheduler torn down via cleanup).
- In the effect, build the transport behind the optional injection and construct the scheduler:
  ```
  let disposed = false; let dispose: (() => void) | undefined;
  void (async () => {
    const transport = opts?.transport
      ?? createConvexSyncTransport((await import('../convex/convex-client.js')).convex!);
    if (disposed || !transport) return;       // convex null ⇒ bail (gate already prevents this)
    const sched = createSyncScheduler({
      runOnce: () => reconcile({ store: bundle.store, transport, clock: bundle.clock, newOutboxId: bundle.newOutboxId }),
      isOnline: async () => (await Network.getNetworkStateAsync()).isConnected ?? false,
      signal: bundle.signal, appState: AppState, network: Network,
      intervalMs: opts?.intervalMs,
    });
    dispose = sched.dispose;
  })();
  return () => { disposed = true; dispose?.(); };
  ```
  Imports: `AppState` from `react-native`, `* as Network` from `expo-network`, `reconcile` +
  `SyncTransport` from `@ember/core`. The convex singleton is **lazily imported** so node tests (which
  never import this hook) and headless graphs never touch native auth modules — same rationale as 12c.
  Effect deps: `[isAuthenticated, bundle, opts?.transport, opts?.intervalMs]`. No UI; pure side-effect
  hook (mirrors `useAnonymousAuth`).

### `store/store-context.tsx` — lift repo+clock, expose a sync bundle (modify)
- In the async `init()` (after `SqliteRepository.create`), build once:
  ```ts
  const signal = createSyncSignal();
  const repo = withMutationNotify(rawRepo, signal.notify);
  const clock = createNativeClock();
  const store = createNativeStore({ repo, blobs, hasher: expoCryptoHasher, clock });
  const bundle: SyncBundle = {
    store: repo,                                   // structural SyncStore (same instance)
    clock: { tick: () => clock.nextStamp(), receive: (r) => clock.receive(r) },
    newOutboxId: () => clock.newOutboxId(),
    signal,
  };
  setState({ store, ready: true, bundle });
  ```
- Add `bundle: SyncBundle | null` to `StoreState` (null in the initial/injected-store states). Export a
  `SyncBundle` interface (mirror 12c: `{ store: SyncStore; clock: { tick(): Hlc; receive(remote: Hlc): Hlc }; newOutboxId(): string; signal: SyncSignal }`)
  and a `useSyncBundle(): SyncBundle | null` hook. When `injectedStore` is provided (tests), the bundle
  stays `null` so the reconciler tears down — production native modules are never touched in headless
  runs (existing escape hatch). `useNativeStore` is unchanged. The async appearance of the bundle (after
  SQLite opens) is fine: the reconciler effect lists `bundle` in deps and starts when it flips non-null.

### `app/_layout.tsx` — call the hook in the convex-gated, store-scoped component (modify)
- `AnonymousAuthGate` already (a) is rendered only when `convex !== null` and (b) sits inside
  `StoreProvider` — exactly the scope `useReconciler` needs (Convex auth context + `useSyncBundle`). Add
  `useReconciler();` next to `useAnonymousAuth();` there and widen its comment to "anonymous auth +
  background sync". One added call. (Optionally rename to `SyncGate` — keep churn minimal; a comment is enough.)

## Tests (`apps/mobile/src/tests` + co-located, Vitest + node; existing patterns; `*.test.ts` only)
- **`native-clock.test.ts`** (extend): `receive(remote)` returns a stamp ≥ both the prior local stamp
  and `remote`, persists to `HLC_KEY`, and survives reload (re-`createNativeClock` over the same storage
  keeps monotonicity). Use `encode`/`parse` to assert ordering.
- **`convex-sync-transport.test.ts`** (new): a fake client (`{ mutation, query }` spies) asserts `push`
  calls `api.sync.push` with `{ entries }` and returns `{ acked }`; `pull(cursor)` omits `limit`,
  `pull(cursor, n)` includes it; results pass straight through as `{ entries, cursor }`. (Mirror 12c.)
- **`with-mutation-notify.test.ts`** (new): `enqueue` triggers `notify` exactly once after the inner
  enqueue resolves; `get/put/query/delete/unacked/ack` delegate and do NOT notify. Use `MemoryRepository`.
- **`sync-scheduler.test.ts`** (new — the heavy suite, pure node, no React). Construct
  `createSyncScheduler` with a spy `runOnce`, a fake async `isOnline`, a real `createSyncSignal`, and
  fake `appState`/`network` (objects whose `addEventListener`/`addNetworkStateListener` capture the
  handler and return `{ remove }` spies); `vi.useFakeTimers()`. Assert:
  (1) one `runOnce` immediately on construct (auth-ready);
  (2) `signal.notify()` schedules a debounced run (advance fake timers);
  (3) the interval fires runs;
  (4) **overlap guard** — hold `runOnce` open on an unresolved promise, fire several triggers, resolve:
      exactly one trailing run, never concurrent (`maxConcurrent === 1`, exactly 2 total here);
  (5) offline (`isOnline → false`) skips `runOnce`; a `network` connected event (`{ isConnected: true }`)
      triggers a run (and a `{ isConnected: false }` event does not);
  (6) an `appState` `'active'` event triggers a run; a `'background'` event does not;
  (7) a throwing `runOnce` is swallowed (no unhandled rejection) and the next trigger still runs;
  (8) `dispose()` clears the interval, calls both subscriptions' `.remove()`, unsubscribes the signal,
      cancels the debounce timer, and no run happens after dispose;
  (9) **e2e wiring** — set `runOnce = () => reconcile({ store: MemoryRepository, transport: fakeTransport,
      clock: fakeMonotoneClock, newOutboxId })` and drive a push + pull + furthest-page-correction through
      the fake transport, proving the ports are wired correctly (not the merge — that's 12b's suite).
- (Optional) **`mutation-signal.test.ts`** if not already covered — notify fan-out + unsubscribe.

## Verify when done
- [ ] `pnpm -w typecheck` · `pnpm -w test` · `pnpm -w lint` all green.
- [ ] **#1** Convex off the read path: UI still reads the local SQLite store; `reconcile` only ever runs
      in the background scheduler and writes pulled records to the local repo. App fully functions offline
      (runs are skipped via `isOnline`, not awaited by render); `convex === null` ⇒ scheduler never mounts.
- [ ] **#2** No new outbox entries on the pull path except 12b's furthest-page correction; the transport
      only ships what `unacked()` already produced. No direct Convex writes from UI components.
- [ ] **#5** Zero merge logic in `apps/mobile` — all decisions come from `applyPull` via `reconcile`.
- [ ] Same repo + same clock instance shared by NativeStore and reconciler (single source of HLC + outbox).
- [ ] No change to `packages/core`, `packages/store`, or `convex/`. No new dependency.
- [ ] Sign-out tears the scheduler down (`isAuthenticated → false`); sign-in (incl. anonymous auto
      sign-in) starts it once the store bundle is ready.

## Deferred
- Sync status UI (a "last synced / syncing…" indicator), backoff/retry tuning, and conflict telemetry
  are out of scope — this unit is the wiring, not the chrome.
- Hoisting the shared HLC-clock + sync-scheduler logic into `@ember/store` (web + mobile now have near-
  identical `mutation-signal`/`with-mutation-notify`/`convex-sync-transport`) is a future dedupe unit,
  not this one.

## No deploy gate
Pure client wiring against the already-deployed 12a server. No schema push. (12a's deploy gate already
put `records` + `syncState` on dev `necessary-warbler-246`.)
