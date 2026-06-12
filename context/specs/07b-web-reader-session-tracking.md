# Unit 07b: web reader session-tracking event wiring

Issue: #64 (part of umbrella Unit 07) · Branch: feat/64-web-reader-session-tracking · Boundary: apps/web
Route: standard — single boundary (apps/web), no new dep, behavioral (no net-new visual surface, like 06b);
wires 07a's already-shipped pure `reduce` + store `recordSession` into the web reader. Ambiguity resolved by
07a's contract.

Second slice of umbrella Unit 07: **07a** shared brain (core `reduce`/`localDayOf`/`makeReadingSession` +
store `recordSession`/`listSessions` — MERGED #62) → **07b** web reader event wiring (this) → **07c** mobile
reader event wiring (device-bound, WebView bridge). 07a is fully headless; 07b is the first unit that produces
a *real* session log from actual reading on the web client.

## Goal
Make the web reader emit the four `TrackerEvent`s (open / activity / page / close) — **plus a ~15s heartbeat
while the tab is visible** — drive them through a small **pure session-tracker seam** that holds the
`TrackerState` and applies 07a's `reduce`, and persist every emitted `FlushedSession` via a new web-store
`recordSession`. The pure reducer already exists (07a); 07b is the platform shell: timers, page-visibility
gating, tz-offset capture, and routing flushed sessions to the store — never blocking reading on a failed write
(invariant #1). No core/store change beyond exposing `recordSession` on the web-store surface.

## Design decisions (carried from 07a, resolved 2026-06-12)
- **Heartbeat = 15s while visible.** A `setInterval` fires `activity()` every 15s **only while the tab is
  visible**. This keeps the active-time tail counted to within one beat (07a's active-time model) without core
  owning a clock. While the tab is hidden no heartbeat runs, so no active time accrues during away time.
- **Visibility transitions cap/resume the bout.** On `visibilitychange`→hidden: fire one `activity()` (caps the
  tail at the hide moment, crediting the partial ≤15s interval) then pause the heartbeat. On →visible: fire one
  `activity()` then resume the heartbeat — if the away gap exceeded the 60s idle threshold, `reduce` auto-splits
  the bout (no special handling here); if not, reading continues in the same bout.
- **Close on unmount / pagehide.** The reader is per-doc (remounts on docId change). On unmount **and** on the
  `pagehide` event (tab/window close, bfcache), fire `close()` so the final bout flushes. `pagehide` is the
  reliable "page going away" signal (`beforeunload`/`unload` are unreliable and block bfcache).
- **tz offset = minutes east of UTC.** Each event stamps `tzOffsetMinutes = -new Date().getTimezoneOffset()`
  (converts JS's west-positive convention to 07a's east-positive — e.g. `+60` CET, `-300` EST). Invariant #4:
  the local day is stamped at capture, never recomputed in UTC.
- **Wiring is additive to 06b.** The reader already calls `scheduleSave()` (position) on scroll/page change.
  07b adds tracking calls alongside, in the same `onScroll` / `onPageChange` seams — it does not touch the
  position-save path.
- **Failed writes never break reading.** `recordSession` is fire-and-forget from the tracker's `onFlush`:
  the promise rejection is caught and logged (invariant #1), exactly like `useReadingPosition`'s save path.

## Implementation

### `apps/web/src/store/web-clock.ts` (edit)
- Add `newId(): string` to `WebClock` (returns a fresh uuid — the session record id). Keep `newOutboxId()` as
  the outbox-entry id factory. Both delegate to the same injected `newId` generator (`crypto.randomUUID` in
  prod), but are named distinctly so `recordSession`'s two id factories read correctly. Add a `newId` test
  (returns distinct values; injected generator is used).

### `apps/web/src/store/web-store.ts` (edit)
- Extend the `WebStore` interface with:
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

### `apps/web/src/reader/session-tracker.ts` (new — pure, no React, no DOM, no timers)
The testable seam: holds `TrackerState` in a closure, applies 07a's `reduce`, forwards each flushed session to
an `onFlush` callback. Mirrors the mobile reading-position-controller pattern (pure logic, injected clock).
- `export interface SessionTracker { open(docId: string, page: number): void; activity(): void; page(page: number): void; close(): void; }`
- `export function createSessionTracker(deps: { now: () => number; tzOffset: () => number; onFlush: (flushed: FlushedSession) => void }): SessionTracker`
  - Internal mutable `state: TrackerState = initialTrackerState()`.
  - Each method builds the matching `TrackerEvent` with `at: deps.now()` and (except `close`)
    `tzOffsetMinutes: deps.tzOffset()`, calls `reduce(state, event)`, replaces `state` with the result, and
    invokes `deps.onFlush(f)` for each `f` in `result.flushed` (in order).
  - `open` → `{ type:'open', docId, page, at, tzOffsetMinutes }`; `activity` → `{ type:'activity', at, tzOffsetMinutes }`;
    `page` → `{ type:'page', page, at, tzOffsetMinutes }`; `close` → `{ type:'close', at }`.
  - Uses `IDLE_THRESHOLD_MS`/`reduce` defaults — no idle override (the 15s heartbeat keeps gaps ≤ 60s while reading).
  - Imports `reduce`, `initialTrackerState`, types from `@ember/core`. Pure: no `Date.now()` (caller injects `now`),
    no DOM, no React, no timers.

### `apps/web/src/reader/use-session-tracking.ts` (new — the platform shell hook)
Owns the timers + browser event listeners; delegates all reducer logic to the pure tracker.
- `export function useSessionTracking({ docId, ready, getPage }: { docId: string; ready: boolean; getPage: () => number }): { onActivity: () => void; onPage: (page: number) => void }`
- Builds one `SessionTracker` per docId mount (ref) with:
  - `now: () => Date.now()`,
  - `tzOffset: () => -new Date().getTimezoneOffset()`,
  - `onFlush: (f) => { void store.recordSession(f).catch((err) => console.warn('[useSessionTracking] recordSession error (swallowed):', err)); }` (invariant #1).
- On `ready` flipping true (once per docId): `tracker.open(docId, getPage())`. Guard with a ref like
  `useReadingPosition`'s resume-once pattern so re-renders don't re-open.
- **Heartbeat:** a `setInterval(() => tracker.activity(), 15_000)` started when ready+visible; cleared on
  unmount. Keep a small helper that starts/stops the interval on visibility changes.
- **Visibility:** `document.addEventListener('visibilitychange', …)` — on hidden fire `tracker.activity()` then
  stop the heartbeat; on visible fire `tracker.activity()` then (re)start the heartbeat.
- **Teardown:** `window.addEventListener('pagehide', () => tracker.close())`; and the effect cleanup (unmount /
  docId change) fires `tracker.close()` then removes all listeners + clears the interval. Closing twice is safe
  (a second `close` on an empty state flushes nothing — `reduce` 'close' on `open:null` returns `[]`).
- Returns `onActivity` / `onPage` thin wrappers the reader calls from its existing seams.
- Stable-ref the `getPage`/`store` access the same way `useReadingPosition` does (refs updated in effects, not
  during render) to satisfy `react-hooks` lint.
- `HEARTBEAT_MS = 15_000` as a module const.

### `apps/web/src/reader/reader-page.tsx` (edit)
- Call `useSessionTracking({ docId, ready: status === 'ready', getPage: () => currentPageRef.current })`.
- In the existing `onPageChange` handlers (both `ScrollReader` and `PagedReader` wiring), additionally call
  `tracking.onPage(p)` next to `scheduleSave()`.
- In the `ScrollReader` `onScroll` seam, additionally call `tracking.onActivity()` next to `scheduleSave`.
- No change to the position-save path, layout, or any visual element — purely additive event taps.

## Tests
- `apps/web/src/reader/session-tracker.test.ts` (pure, fake clock + fixed tz, no jsdom needed):
  - open → activities at +15s/+30s/+45s → close ⇒ exactly **one** `onFlush` with `activeMs === 45_000`,
    `pages` = opened page, `startedAt`/`endedAt` correct, `tzOffsetMinutes` = injected value.
  - idle split: open, activity +30s, activity +120s (gap 90s) ⇒ first `onFlush` (`activeMs === 30_000`) on the
    +120s event; final close drops the zero-active second bout ⇒ exactly one `onFlush` total.
  - page events accumulate distinct ascending pages and advance active time; repeat page no dup.
  - open-over-open: `open` B while A is live flushes A (if active) then tracks B.
  - close on empty state ⇒ no `onFlush`; double close ⇒ no extra `onFlush`.
  - `onFlush` receives the events **in order** for a multi-flush sequence.
- `apps/web/src/store/web-clock.test.ts` (extend): `newId()` returns the injected generator's value / distinct
  values; does not perturb the HLC clock.
- `apps/web/src/tests/web-store-session.test.ts` (new, `MemoryRepository` + `MemoryBlobStore` + injected
  `createWebClock` over in-memory storage, mirroring `web-store-reading-position.test.ts`):
  - `recordSession(flushed)` writes exactly one `sessions` record (uuid id, not docId) + exactly one outbox
    entry (`op:'put'`, `recordId === session.id`, payload deep-equals the returned session).
  - two calls append two distinct records (no overwrite); `updatedAt` strings are monotonic (clock advanced).
- `apps/web/src/tests/use-session-tracking.test.tsx` (new, jsdom + `@testing-library/react` + `vi.useFakeTimers`,
  injected `StoreProvider store={…}` stub capturing `recordSession` calls):
  - mounting a ready reader opens a bout; advancing fake timers by 15s fires a heartbeat `activity`; on unmount
    `close` flushes one session through the stub's `recordSession` (assert call count + the flushed shape).
  - `visibilitychange`→hidden stops the heartbeat (no further `activity` accrual after hide); →visible resumes.
  - a rejected `recordSession` is swallowed (no throw, reader unaffected).
  - Keep this hook test lean — the reducer math is covered by `session-tracker.test.ts`; here only assert the
    timer/visibility/teardown plumbing and the fire-and-forget swallow.

## Dependencies
- none. Reuses 07a's `@ember/core` (`reduce`, `initialTrackerState`, `IDLE_THRESHOLD_MS`, types) +
  `@ember/store` (`recordSession`). No new package, no new dep.

## Verify when done
- [ ] Reading a doc on the web client produces session records: the pure tracker threads open/activity/page/close
      through `reduce` and routes each flushed session to `store.recordSession`.
- [ ] Heartbeat accrues active time only while the tab is visible; hide caps the tail, show resumes (auto-split
      via `reduce` when the away gap > 60s).
- [ ] `close()` flushes the final bout on unmount and on `pagehide`; double-close is a safe no-op.
- [ ] `web-store.recordSession` appends one immutable `ReadingSession` (uuid id) + exactly one HLC-stamped outbox
      entry per call; repeated calls never overwrite (append-only).
- [ ] `tzOffsetMinutes` is `-getTimezoneOffset()` (east-positive); local day stamped at capture (invariant #4).
- [ ] Failed `recordSession` is swallowed — a write error never interrupts reading (invariant #1).
- [ ] No change to the 06b reading-position path; reader layout/visuals byte-identical (additive taps only).
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated — esp. #1 (works offline, Convex never on read path), #2 (every
      syncable mutation through the outbox with one HLC stamp), #3 (sessions append-only & immutable; stats
      derived), #4 (session day = local calendar date stamped at capture with tz offset). core/store unchanged
      except the additive web-store `recordSession` surface; no platform API leaks into @ember/core or @ember/store.

## Browser-verify (user, before merge)
`pnpm --filter @ember/web dev` → open a PDF, read/scroll for ~30–60s, switch pages → then in DevTools
Application → IndexedDB (`ember` → `records`) confirm one or more `sessions` rows appear with the right
`localDay`, ascending `pages`, and `activeMs` roughly matching engaged time (idle-capped); and the `outbox`
table gains one entry per session. Leave the tab idle >60s then interact → a new session row (bout split).
Switch the OS/browser timezone if convenient → `localDay`/`tzOffsetMinutes` reflect the local date.
