# Unit 07c: mobile reader session-tracking event wiring

Issue: #66 (part of umbrella Unit 07) · Branch: feat/66-mobile-reader-session-tracking · Boundary: apps/mobile
Route: standard — single boundary (apps/mobile), no new dep (`AppState` is already part of `react-native`),
behavioral (no net-new visual surface, like 06d/07b); wires 07a's already-shipped pure `reduce` + store
`recordSession` into the native reader. Ambiguity resolved by 07a's contract + the 07b web precedent.

Final slice of umbrella Unit 07: **07a** shared brain (core `reduce`/`localDayOf`/`makeReadingSession` +
store `recordSession`/`listSessions` — MERGED #62) → **07b** web reader event wiring (MERGED #64) → **07c**
mobile reader event wiring (this). 07c produces a real session log from actual reading on the native client.

## Goal
Make the native reader emit the four `TrackerEvent`s (open / activity / page / close) — **plus a ~15s heartbeat
while the app is foregrounded** — drive them through a small **pure session-tracker seam** that holds the
`TrackerState` and applies 07a's `reduce`, and persist every emitted `FlushedSession` via a new native-store
`recordSession`. The pure reducer already exists (07a); 07c is the platform shell: timers, **app-state** gating
(foreground/background, not page-visibility), tz-offset capture, and routing flushed sessions to the store —
never blocking reading on a failed write (invariant #1). No core/store change beyond exposing `recordSession`
on the native-store surface.

## How this differs from 07b (web) — read this first
07c mirrors 07b's structure exactly except for three platform realities:
1. **`AppState` replaces `visibilitychange`.** There is no DOM/page-visibility on RN. Foreground = the web's
   "visible"; background/inactive = "hidden". The hook subscribes to `AppState.addEventListener('change', …)`
   and reads `AppState.currentState` for the initial state.
2. **No `pagehide`.** There is no tab-close event. The effect-cleanup (screen pop / docId change / unmount) is
   the **sole** flush path, and on RN it is reliable (the screen unmounts deterministically on back-navigation),
   so this is *more* dependable than web — no best-effort caveat needed.
3. **The shell hook is NOT unit-tested.** This project has no headless RN test renderer (stated verbatim in
   `use-reading-position.ts`: "the hook's React-integration layer has no headless test renderer available").
   So `use-session-tracking.ts` (mobile) is **device-verified in Expo Go**, exactly like `useReadingPosition`
   (06d). The pure tracker + store + clock changes ARE unit-tested (Vitest, node env). This is the one place
   07c has fewer tests than 07b (which had a jsdom hook test) — by established precedent, not omission.

## Design decisions (carried from 07a/07b, resolved 2026-06-12)
- **Heartbeat = 15s while foregrounded.** A `setInterval` fires `activity()` every 15s **only while the app is
  `active`**. Keeps the active-time tail counted to within one beat (07a's active-time model) without core
  owning a clock. While backgrounded no heartbeat runs, so no active time accrues during away time.
- **App-state transitions cap/resume the bout.** On `AppState` → not `active` (i.e. `background` **or**
  `inactive`): fire one `activity()` (caps the tail at the moment of leaving, crediting the partial ≤15s
  interval) then pause the heartbeat. On → `active`: fire one `activity()` then resume the heartbeat — if the
  away gap exceeded the 60s idle threshold, `reduce` auto-splits the bout (no special handling here); if not,
  reading continues in the same bout. iOS `inactive` is transient (app switcher, incoming call, notification
  pulldown); pausing on it is the conservative-correct choice — no active time should accrue when the app is
  not the foreground app, and a quick return resumes the same bout (gap < 60s).
- **Close on unmount / docId change.** The reader screen is per-doc. On the effect cleanup (back-navigation,
  docId change, unmount), fire `close()` so the final bout flushes. No `pagehide` equivalent exists or is needed.
- **tz offset = minutes east of UTC.** Each event stamps `tzOffsetMinutes = -new Date().getTimezoneOffset()`
  (converts JS's west-positive convention to 07a's east-positive — e.g. `+60` CET, `-300` EST; Hermes supports
  `getTimezoneOffset`). Invariant #4: the local day is stamped at capture, never recomputed in UTC.
- **Wiring is additive to 06d.** The reader already calls `scheduleSave()` (position) from `handlePosition` and
  updates the toolbar from `handlePageChange`. 07c adds tracking calls alongside, in those same seams — it does
  not touch the position-save path or any visual element.
- **Failed writes never break reading.** `recordSession` is fire-and-forget from the tracker's `onFlush`: the
  promise rejection is caught and logged (invariant #1), exactly like `useReadingPosition`'s save path.
- **Pure session-tracker is duplicated, not shared.** `apps/mobile/src/reader/session-tracker.ts` is a copy of
  07b's `apps/web/.../session-tracker.ts` (both pure, both import only `@ember/core`). This matches the house
  style where each platform keeps its own thin controller (cf. `reading-position-controller.ts` exists per-app).
  Keeping it in-boundary preserves 07c as a single-boundary unit. A future refactor MAY hoist both copies into
  `@ember/store` if a third consumer appears — YAGNI now; do **not** touch shared packages in this unit.

## Implementation

### `apps/mobile/src/store/native-clock.ts` (edit)
- Add `newId(): string` to the `NativeClock` interface + impl (returns a fresh uuid — the session record id).
  Keep `newOutboxId()` as the outbox-entry id factory. Both delegate to the same injected `newId` generator
  (`expo-crypto`'s `randomUUID` in prod), but are named distinctly so `recordSession`'s two id factories read
  correctly. Add a `newId` test (returns distinct values; uses the injected generator; does not perturb the
  HLC clock).

### `apps/mobile/src/store/native-store.ts` (edit)
- Extend the `NativeStore` interface with:
  `recordSession(flushed: FlushedSession): Promise<ReadingSession>`.
- Implement by delegating to the store use-case (one HLC stamp per call — a midnight-spanning sequence flushes
  several sessions over time, each its own `recordSession` call, each its own stamp):
  ```ts
  async recordSession(flushed: FlushedSession): Promise<ReadingSession> {
    return recordSession(
      { repo, newId: () => clock.newId(), newOutboxId: () => clock.newOutboxId(), hlc: clock.nextStamp() },
      flushed,
    );
  }
  ```
- Import `recordSession` from `@ember/store` and the `FlushedSession` / `ReadingSession` types from `@ember/core`.

### `apps/mobile/src/reader/session-tracker.ts` (new — pure, no React, no RN, no timers)
A copy of 07b's web `session-tracker.ts`. Holds `TrackerState` in a closure, applies 07a's `reduce`, forwards
each flushed session to an `onFlush` callback. Injected clock/tz so it is headless-testable.
- `export interface SessionTracker { open(docId: string, page: number): void; activity(): void; page(page: number): void; close(): void; }`
- `export function createSessionTracker(deps: { now: () => number; tzOffset: () => number; onFlush: (flushed: FlushedSession) => void }): SessionTracker`
  - Internal mutable `state: TrackerState = initialTrackerState()`.
  - Each method builds the matching `TrackerEvent` with `at: deps.now()` and (except `close`)
    `tzOffsetMinutes: deps.tzOffset()`, calls `reduce(state, event)`, replaces `state` with the result, and
    invokes `deps.onFlush(f)` for each `f` in `result.flushed` (in order).
  - `open` → `{ type:'open', docId, page, at, tzOffsetMinutes }`; `activity` → `{ type:'activity', at, tzOffsetMinutes }`;
    `page` → `{ type:'page', page, at, tzOffsetMinutes }`; `close` → `{ type:'close', at }`.
  - Uses `reduce`/`IDLE_THRESHOLD_MS` defaults — no idle override (the 15s heartbeat keeps gaps ≤ 60s while reading).
  - Imports `reduce`, `initialTrackerState`, types from `@ember/core`. Pure: no `Date.now()` (caller injects `now`),
    no RN, no React, no timers.

### `apps/mobile/src/reader/use-session-tracking.ts` (new — the platform shell hook)
Owns the timers + `AppState` subscription; delegates all reducer logic to the pure tracker. Mirrors
`use-reading-position.ts` house style: `useNativeStore()` for the store, stable refs updated in effects (never
`.current` at render), one tracker per docId mount behind a guard ref.
- `export function useSessionTracking({ docId, ready, getPage }: { docId: string; ready: boolean; getPage: () => number }): { onActivity: () => void; onPage: (page: number) => void }`
- Reads `const { store } = useNativeStore();` and boxes it in a ref (store may be `null`/`undefined` before the
  store finishes initializing — guard `onFlush` so a missing store is a silent no-op, like `useReadingPosition`).
- Builds one `SessionTracker` per docId mount (ref) with:
  - `now: () => Date.now()`,
  - `tzOffset: () => -new Date().getTimezoneOffset()`,
  - `onFlush: (f) => { void storeRef.current?.recordSession(f).catch((err) => console.warn('[useSessionTracking] recordSession error (swallowed):', err)); }` (invariant #1).
- On `ready` flipping true (once per docId): `tracker.open(docId, getPageRef.current())`. Guard with a ref like
  `useReadingPosition`'s resume-once pattern so re-renders don't re-open. (`ready` = WebView posted `'ready'`,
  i.e. `status === 'ready'` in the screen.)
- **Heartbeat:** `setInterval(() => tracker.activity(), HEARTBEAT_MS)` started when ready and the app is `active`;
  cleared on unmount. Small start/stop helpers (idempotent, like 07b) toggled by app-state changes.
- **App-state:** `const sub = AppState.addEventListener('change', handleAppStateChange);` — on a transition to
  `'active'` fire `tracker.activity()` then (re)start the heartbeat; on a transition to anything else
  (`'background'`/`'inactive'`) fire `tracker.activity()` then stop the heartbeat. Seed the initial heartbeat
  from `AppState.currentState === 'active'`. Remove via `sub.remove()` in cleanup (RN's modern subscription API).
- **Teardown:** the effect cleanup (unmount / docId change) fires `tracker.close()`, stops the heartbeat, and
  calls `sub.remove()`. Closing twice is safe (a second `close` on `open:null` flushes nothing — `reduce`
  'close' returns `[]`). No `pagehide`/`beforeunload` equivalent.
- Returns `onActivity` / `onPage` thin wrappers the screen calls from its existing seams.
- `HEARTBEAT_MS = 15_000` as a module const. Effect deps `[docId, ready]` (mirrors 07b); `getPage`/`store`
  accessed through refs updated in their own effects to satisfy `react-hooks` lint.

### `apps/mobile/src/reader/reader-screen.tsx` (edit)
- Add a `currentPageRef` updated alongside `setCurrentPage(page)` in `handlePageChange` (so `getPage` reads the
  live page without re-subscribing — mirrors web's `currentPageRef`).
- Call `useSessionTracking({ docId, ready: status === 'ready', getPage: () => currentPageRef.current })`.
- In `handlePageChange`, additionally call `tracking.onPage(page)` (next to `setCurrentPage`).
- In `handlePosition` (the scroll/position capture seam), additionally call `tracking.onActivity()` next to
  `scheduleSave()`.
- No change to the 06d position-save path, the load/watchdog effects, layout, or any visual element — purely
  additive event taps.

## Tests
- `apps/mobile/src/tests/session-tracker.test.ts` (pure, fake clock + fixed tz, node env — copy 07b's suite):
  - open → activities at +15s/+30s/+45s → close ⇒ exactly **one** `onFlush` with `activeMs === 45_000`,
    `pages` = opened page, `startedAt`/`endedAt` correct, `tzOffsetMinutes` = injected value.
  - idle split: open, activity +30s, activity +120s (gap 90s) ⇒ first `onFlush` (`activeMs === 30_000`) on the
    +120s event; final close drops the zero-active second bout ⇒ exactly one `onFlush` total.
  - page events accumulate distinct ascending pages and advance active time; repeat page no dup.
  - open-over-open: `open` B while A is live flushes A (if active) then tracks B.
  - close on empty state ⇒ no `onFlush`; double close ⇒ no extra `onFlush`.
  - `onFlush` receives the events **in order** for a multi-flush sequence.
- `apps/mobile/src/tests/native-clock.test.ts` (extend): `newId()` returns the injected generator's value /
  distinct values; does not perturb the HLC clock (assert `nextStamp` unaffected by `newId` calls).
- `apps/mobile/src/tests/native-store-session.test.ts` (new, `MemoryRepository` + `MemoryBlobStore` + a fake
  `Hasher` + `createNativeClock` over an in-memory `StorageLike`, mirroring `native-store-reading-position.test.ts`):
  - `recordSession(flushed)` writes exactly one `sessions` record (uuid id, not docId) + exactly one outbox
    entry (`op:'put'`, `recordId === session.id`, payload deep-equals the returned session).
  - two calls append two distinct records (no overwrite); the records' `updatedAt`/HLC strings are monotonic
    (clock advanced).
- **No hook test for `use-session-tracking.ts`** — no headless RN renderer exists (same precedent as
  `use-reading-position.ts` from 06d). The timer/app-state/teardown plumbing is covered by the **Device-verify**
  section below.

## Dependencies
- none. Reuses 07a's `@ember/core` (`reduce`, `initialTrackerState`, `IDLE_THRESHOLD_MS`, types) +
  `@ember/store` (`recordSession`), and `AppState` from `react-native` (already a dep). No new package, no new dep.

## Verify when done
- [ ] Reading a doc on the native client produces session records: the pure tracker threads
      open/activity/page/close through `reduce` and routes each flushed session to `store.recordSession`.
- [ ] Heartbeat accrues active time only while the app is foregrounded; backgrounding caps the tail,
      foregrounding resumes (auto-split via `reduce` when the away gap > 60s).
- [ ] `close()` flushes the final bout on screen pop / docId change / unmount; double-close is a safe no-op.
- [ ] `native-store.recordSession` appends one immutable `ReadingSession` (uuid id) + exactly one HLC-stamped
      outbox entry per call; repeated calls never overwrite (append-only).
- [ ] `tzOffsetMinutes` is `-getTimezoneOffset()` (east-positive); local day stamped at capture (invariant #4).
- [ ] Failed `recordSession` is swallowed — a write error never interrupts reading (invariant #1).
- [ ] No change to the 06d reading-position path; reader layout/visuals unchanged (additive taps only).
- [ ] `session-tracker.ts` imports only `@ember/core` — no `react-native`/React leak into the pure seam.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated — esp. #1 (works offline, Convex never on read path), #2 (every
      syncable mutation through the outbox with one HLC stamp), #3 (sessions append-only & immutable; stats
      derived), #4 (session day = local calendar date stamped at capture with tz offset). core/store unchanged
      except the additive native-store `recordSession` surface; no platform API leaks into @ember/core or @ember/store.

## Device-verify (user, before merge — Expo Go)
`pnpm --filter @ember/mobile start` (or `npx expo start --clear` in `apps/mobile`) → open a PDF on a device/
simulator, read/scroll for ~30–60s, switch pages. Because IndexedDB DevTools aren't available on native,
verify via the logged session writes (temporarily log the flushed session in `onFlush`, or inspect the
SQLite `records`/`outbox` tables if a debug query is wired): confirm one or more `sessions` rows appear with
the right `localDay`, ascending `pages`, and `activeMs` roughly matching engaged time (idle-capped); and the
outbox gains one entry per session. **Background the app** (home button / app switcher) for >60s then return →
a new session row (bout split via the idle threshold). Quickly flip to the app switcher and back (<60s) →
the same bout continues (no split). Back out of the reader → final bout flushes. Switch the device timezone if
convenient → `localDay`/`tzOffsetMinutes` reflect the local date.
