# Unit 12c: Web reconciler wiring — Convex transport + clock.receive + scheduler

Issue: #107 (umbrella #12) · Branch: feat/107-web-reconciler-wiring · Boundary: `apps/web`
Route: standard — one boundary (`apps/web`), forks resolved, no new dep, no visual surface (the
reconciler is a side-effect hook). Wires the already-built core engine (12b) to the live server (12a).

Third slice of umbrella **#12**: **12a** Convex sync server ✅ → **12b** core reconciler + merge fold
✅ → **12c** web reconciler wiring (this) → **12d** mobile reconciler wiring (device-bound).

## Goal
The web app actually syncs: an authed user's local outbox is pushed to Convex and remote changes are
pulled and folded in, on a sensible schedule, entirely through the existing `reconcile()` driver from
12b. No merge logic added here (invariant #5 — it all lives in `applyPull`); this unit only supplies
the three injected ports (`SyncTransport`, `SyncStore`, `ReconcilerClock`) + `newOutboxId`, plus a
scheduler that decides *when* to run. Convex stays off the read path (invariant #1): the UI keeps
reading the local store; sync is a background reconciliation that never blocks rendering and fails soft
when offline.

## Resolved forks (2026-06-26)
- **Sync trigger = interval + lifecycle (user-chosen).** One overlap-guarded imperative loop, gated on
  `isAuthenticated`. Triggers: on auth-ready (false→true), a periodic `setInterval` (15s), `window`
  `focus`, `window` `online`, and a **debounced** run after each local mutation (fast push). Rejected:
  Convex reactive `useQuery(pull)` (folds the cursor loop into a React effect — more moving parts) and
  minimal load-only (weak cross-device freshness). The imperative loop matches 12b's `reconcile()`.
- **Share one repo + one clock between the WebStore and the reconciler.** The HLC clock MUST be a
  single in-memory instance (two `WebClock`s over the same `localStorage` could diverge mid-session and
  break monotonicity); the `Repository` MUST be the same instance so the reconciler drains the same
  outbox the UI appends to. So `StoreProvider` builds `repo`/`clock` once and exposes them to the
  reconciler via context, instead of `createWebStore` owning them privately.
- **Mutation→sync signal at the `repo.enqueue` chokepoint, not per WebStore method.** Every syncable
  mutation funnels through `repo.enqueue`. Wrapping the repo so `enqueue` fires a notifier gives the
  "debounced run after local mutation" trigger with ONE wrap point and zero changes to the seven
  WebStore mutators (and auto-covers future ones). The reconciler's own furthest-page corrective
  `enqueue` also fires it — which is desirable: it promptly flushes the correction, and 12b's monotone
  join guarantees the follow-up reconcile finds nothing to correct, so it terminates.
- **No store/core/convex change.** `sync-meta`/`pull-cursor` is a normal record in Dexie's generic
  `records` table (compound `[collection+id]` key) — verified, no schema migration. `DexieRepository`
  already satisfies the structural `SyncStore`. `OutboxEntry` already matches 12a's `push` validator
  field-for-field. The only core touch is consuming its exports.

## Implementation (all under `apps/web/src`)

### `store/web-clock.ts` — add `receive` (makes `WebClock` a `ReconcilerClock` source)
- Import `receive as hlcReceive` from `@ember/core`.
- Add to the `WebClock` interface: `/** Merge a remote stamp into the local clock, persist, return it. */ receive(remote: Hlc): Hlc;`
- In the factory, mirror `nextStamp`: `receive(remote) { clock = hlcReceive(clock, remote, nowFn()); storage.setItem(HLC_KEY, encode(clock)); return clock; }`.
- The `ReconcilerClock` the driver wants is the adapter `{ tick: () => webClock.nextStamp(), receive: (r) => webClock.receive(r) }`. `newOutboxId` is `webClock.newOutboxId`.

### `sync/mutation-signal.ts` — tiny synchronous emitter (new)
```ts
export interface SyncSignal { notify(): void; subscribe(cb: () => void): () => void; }
export function createSyncSignal(): SyncSignal { /* Set<cb>; notify() calls each; subscribe returns unsub */ }
```

### `sync/with-mutation-notify.ts` — repo wrapper (new)
- `export function withMutationNotify(repo: Repository, notify: () => void): Repository` — returns a
  delegating `Repository` identical to `repo` except `enqueue` awaits `repo.enqueue(e)` then calls
  `notify()`. All other methods pass straight through. Keeps the WebStore untouched and gives the
  reconciler a wake signal on every outbox append.

### `sync/convex-sync-transport.ts` — `SyncTransport` over Convex (new)
```ts
import { api } from '@ember/convex/_generated/api';
import type { ConvexReactClient } from 'convex/react';
import type { OutboxEntry, RemoteEntry, SyncTransport } from '@ember/core';

export function createConvexSyncTransport(client: ConvexReactClient): SyncTransport {
  return {
    push: (entries: OutboxEntry[]) => client.mutation(api.sync.push, { entries }),
    pull: (cursor: number, limit?: number) =>
      client.query(api.sync.pull, limit === undefined ? { cursor } : { cursor, limit }),
  };
}
```
- `client.mutation/query` auto-attach the auth token via the app's `ConvexAuthProvider`. `push` returns
  `{ acked }`, `pull` returns `{ entries, cursor }` — both already match the port shapes (12a). Pure
  pass-through; no field remapping (OutboxEntry ≡ push validator; pull row map ≡ `RemoteEntry`).

### `store/store-context.tsx` — lift repo+clock, expose a sync bundle (modify)
- Production path: build once →
  ```ts
  const webClock = createWebClock();
  const signal = createSyncSignal();
  const repo = withMutationNotify(new DexieRepository('ember'), signal.notify);
  const store = createWebStore({ repo, blobs: new OpfsBlobStore(), hasher: subtleCryptoHasher, clock: webClock });
  const bundle: SyncBundle = {
    store: repo,                                   // structural SyncStore
    clock: { tick: () => webClock.nextStamp(), receive: (r) => webClock.receive(r) },
    newOutboxId: () => webClock.newOutboxId(),
    signal,
  };
  ```
- Add a second context (`SyncBundleContext`) carrying `SyncBundle | null`; export
  `useSyncBundle(): SyncBundle | null`. When a `store` prop is injected (tests), the bundle is `null`
  (production instantiation is skipped — jsdom never touches OPFS/IndexedDB/Convex). `useWebStore`
  is unchanged. Do NOT import the convex client here (keep existing store-context tests' blast radius
  zero) — the transport is built in the reconciler hook.

### `sync/use-reconciler.ts` — the scheduler (new)
```ts
export function useReconciler(opts?: { transport?: SyncTransport; intervalMs?: number }): void;
```
- Reads `useSyncBundle()` and `useConvexAuth()`. If `!isAuthenticated` or `bundle === null`: do nothing
  (and tear down any timers/listeners). Else mount an effect that:
  - Builds the transport: `opts?.transport ?? createConvexSyncTransport(convex)` (the `convex` singleton
    — kept behind the optional injection so the test never imports the throwing singleton).
  - Defines a single **overlap-guarded, trailing-coalescing** `run()`:
    ```
    if (inFlightRef.current) { queuedRef.current = true; return; }
    if (!navigator.onLine) return;                 // fail soft offline; 'online' re-triggers
    inFlightRef.current = true;
    try { do { queuedRef.current = false;
                await reconcile({ store: bundle.store, transport, clock: bundle.clock, newOutboxId: bundle.newOutboxId }); }
          while (queuedRef.current); }
    catch { /* swallow — local-first: a sync failure is non-fatal, next trigger retries */ }
    finally { inFlightRef.current = false; }
    ```
  - Wires triggers: immediate `run()` on effect mount (auth-ready), `setInterval(run, opts?.intervalMs ?? 15_000)`,
    `window` `focus` → `run`, `window` `online` → `run`, and `bundle.signal.subscribe(debounced(run, 500))`.
  - Cleanup: clear interval, remove listeners, unsubscribe, cancel the debounce timer. Effect deps:
    `[isAuthenticated, bundle, transport]`.
- No UI. No exported component. Pure side-effect hook (mirrors `useAnonymousAuth`).

### `App.tsx` — call it (modify)
- Add `useReconciler();` next to `useAnonymousAuth();` in `App()`. One line.

## Tests (`apps/web/src/tests`, Vitest + jsdom; existing patterns)
- **`web-clock.test.ts`** (extend): `receive(remote)` returns a stamp ≥ both the prior local stamp and
  `remote`, persists to `HLC_KEY`, and survives reload (re-`createWebClock` over the same storage keeps
  monotonicity). Use `encode`/`parse` to assert ordering.
- **`convex-sync-transport.test.ts`** (new): a fake `ConvexReactClient` (`{ mutation, query }` spies)
  asserts `push` calls `api.sync.push` with `{ entries }` and returns `{ acked }`; `pull(cursor)` omits
  `limit`, `pull(cursor, n)` includes it; results pass straight through as `{ entries, cursor }`.
- **`with-mutation-notify.test.ts`** (new): `enqueue` triggers `notify` exactly once after the inner
  enqueue resolves; `get/put/delete/unacked/ack` delegate and do NOT notify. Use `MemoryRepository`.
- **`use-reconciler.test.tsx`** (new): render the hook inside a provider supplying a fake `SyncBundle`
  (`MemoryRepository` as `store`, a fake monotone `clock`, a real `createSyncSignal`) + a fake
  `transport`; mock `convex/react`'s `useConvexAuth`. Assert: (1) no run while unauthenticated; (2) one
  run on auth-ready; (3) `signal.notify()` schedules a debounced run (fake timers); (4) interval fires
  runs; (5) overlap guard — concurrent triggers during an in-flight run coalesce into exactly one
  trailing run, never concurrent `reconcile`s; (6) offline (`navigator.onLine=false`) skips, and an
  `online` event triggers a run; (7) a throwing transport is swallowed (no unhandled rejection) and the
  next trigger still runs. Drive a real end-to-end push+pull+furthest-page-correction through the fake
  transport + `MemoryRepository` to prove the wiring (not the merge — that's 12b's suite).

## Verify when done
- [ ] `pnpm -w typecheck` · `pnpm -w test` · `pnpm -w lint` all green.
- [ ] **#1** Convex off the read path: UI still reads the local store; `reconcile` only ever runs in the
      background hook and writes pulled records to the local repo. App fully functions offline (runs are
      skipped, not awaited by render).
- [ ] **#2** No new outbox entries on the pull path except 12b's furthest-page correction; the transport
      only ships what `unacked()` already produced. No direct Convex writes from UI components.
- [ ] **#5** Zero merge logic in `apps/web` — all decisions come from `applyPull` via `reconcile`.
- [ ] Same repo + same clock instance shared by WebStore and reconciler (single source of HLC + outbox).
- [ ] No change to `packages/core`, `packages/store`, or `convex/`. No new dependency.
- [ ] Sign-out tears the scheduler down; sign-in (incl. the anonymous auto sign-in) starts it.

## Deferred
- **12d** mobile reconciler wiring (RN AppState/NetInfo lifecycle instead of `window` focus/online;
  device-bound, its own clock/repo). Same ports, same `reconcile()`.
- Sync status UI (a "last synced / syncing…" indicator), backoff/retry tuning, and conflict telemetry
  are out of scope — this unit is the wiring, not the chrome.

## No deploy gate
Pure client wiring against the already-deployed 12a server. No schema push. (12a's deploy gate already
put `records` + `syncState` on dev `necessary-warbler-246`.)
