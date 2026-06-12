# Unit 07a: core session/idle tracking engine + store persistence

Issue: #62 (part of umbrella Unit 07) · Branch: feat/62-session-tracking-engine · Boundary: packages/core + packages/store
Route: standard — shared pure-TS brain (core+store), no new dep, no UI; ambiguity resolved (mirrors 06a/04a).

First slice of Unit 07 (session/idle tracking engine), split COMPLEX→sub-units by boundary per the
03/04/05/06 pattern: **07a** shared brain (this) → **07b** web reader event wiring → **07c** mobile
reader event wiring (device-bound, WebView bridge). 07a is fully headless-testable: no reader, no
timers, no DOM/WebView, no UI. It produces the immutable session log every habit feature (streaks
08, analytics 09) derives from (invariant #3).

## Goal
Define the platform-agnostic session layer: a `ReadingSession` immutable record, a **pure reducer**
(`reduce`) that turns a stream of reader events (open / activity / page / close) into flushed
reading-session slices — accumulating active time with a **60s idle cap**, splitting bouts at the
**local-day boundary** — and store `recordSession` / `listSessions` use-cases that append each
flushed session through the outbox. The reducer holds no clock and no timers: the caller (07b/07c)
supplies wall-clock ms and the tz offset on every event, exactly like `Hasher`/`Hlc` deps elsewhere.

## Design decisions (confirmed with user, 2026-06-12)
- **Idle threshold = 60s.** A gap > 60s between activity events ends the current bout (the user
  stopped reading); a new bout begins at the next event.
- **One record per reading bout.** A bout = continuous engaged reading of one document (all
  inter-activity gaps ≤ 60s). Not a fine-grained per-page event log.
- **Midnight split.** If a continuous bout crosses the user's local calendar date, it is flushed as
  two records — one stamped each local day (invariant #4: local-day stamped at capture, with tz
  offset, never recomputed in UTC).
- **Zero-active sessions are dropped.** A slice with `activeMs === 0` (open→close with no engaged
  time) is NOT emitted — opening and instantly closing a doc is not a reading session. Keeps the
  outbox free of noise; "did you read today" (08) stays meaningful.

## Active-time model (the reducer's contract)
The caller emits an `activity` event on every scroll / page-turn / tap **and a periodic heartbeat
(≈15s) while the reader is focused** (07b/07c). Within a bout, active time is the sum of
inter-activity gaps, each capped at the idle threshold:

- Consecutive activities `p → t`, `gap = t − p`:
  - `gap ≤ idleThreshold` **and same local day** → continuous engagement: `activeMs += gap`,
    advance `lastActivityAt = t`.
  - `gap > idleThreshold` **or local day changed** → the bout ends: **flush** the current slice
    (`endedAt = lastActivityAt`), then **start a fresh slice** for the same `docId` beginning at `t`.
- Because every retained gap is ≤ threshold, within a flushed session `activeMs ≤ endedAt − startedAt`
  by construction; the heartbeat keeps the tail after the last real interaction counted to within one
  beat (no special close-time crediting needed — the trailing window is the heartbeat's job, not core's).

The midnight under-count at a crossing (the single sub-threshold gap straddling midnight is dropped
when we restart the slice) is < 60s and accepted — it avoids core having to compute an exact midnight
epoch from a tz.

## Implementation

### `packages/core/src/session.ts` (new)
- `export type ReadingSession = { id: string; docId: string; localDay: string; tzOffsetMinutes: number; startedAt: number; endedAt: number; activeMs: number; pages: number[]; updatedAt: string }`.
  - `id` = uuid (caller-supplied at persist — sessions are NOT keyed by docId; many per document).
  - `docId` = the document id (04a sha256 hex).
  - `localDay` = `'YYYY-MM-DD'` local calendar date of the slice (invariant #4).
  - `tzOffsetMinutes` = minutes **east** of UTC at capture (e.g. `+60` CET, `-300` EST). 07b/07c pass
    `-new Date().getTimezoneOffset()` to convert JS's west-positive convention to ours.
  - `startedAt` / `endedAt` = wall ms epoch of the slice's first / last activity.
  - `activeMs` = engaged time (idle-capped sum of gaps), integer ≥ 0.
  - `pages` = distinct page numbers visited in the slice, **ascending**, 1-based.
  - `updatedAt` = encoded HLC stamp (`encode(hlc)`) — ordering key; string-sort agrees with `compare`.
- `export type FlushedSession = Omit<ReadingSession, 'id' | 'updatedAt'>` — what the reducer emits; the
  store use-case stamps `id` + `updatedAt` at persist time (core stays uuid/clock-free, like 06a/04a).
- `export const IDLE_THRESHOLD_MS = 60_000`.
- `export type OpenSlice = { docId: string; localDay: string; tzOffsetMinutes: number; startedAt: number; lastActivityAt: number; activeMs: number; pages: number[] }` (internal accumulator; exported for test assertions).
- `export type TrackerState = { open: OpenSlice | null }`.
- `export function initialTrackerState(): TrackerState` → `{ open: null }`.
- `export type TrackerEvent =`
  `| { type: 'open'; docId: string; page: number; at: number; tzOffsetMinutes: number }`
  `| { type: 'activity'; at: number; tzOffsetMinutes: number }`
  `| { type: 'page'; page: number; at: number; tzOffsetMinutes: number }`
  `| { type: 'close'; at: number }`.
- `export function localDayOf(wall: number, tzOffsetMinutes: number): string`
  — `new Date(wall + tzOffsetMinutes * 60_000).toISOString().slice(0, 10)`. **Pure** formatting of a
  supplied epoch — NOT `Date.now()` (the HLC rule bans `Date.now()` for *ordering*, not `Date` for
  formatting a passed-in time). No tz database, just arithmetic.
- `export function reduce(state: TrackerState, event: TrackerEvent, idleThresholdMs = IDLE_THRESHOLD_MS): { state: TrackerState; flushed: FlushedSession[] }`
  — **pure**; never mutates `state` (return new objects). Semantics:
  - **open**: `flushed = finalize(state.open)` (0 or 1); start a new slice
    `{ docId, localDay: localDayOf(at,tz), tzOffsetMinutes: tz, startedAt: at, lastActivityAt: at, activeMs: 0, pages: page≥1 ? [trunc(page)] : [] }`.
  - **activity / page**: if `state.open` is null → no-op (`{ state, flushed: [] }`, defensive). Else
    compute `gap = at − slice.lastActivityAt`, `day = localDayOf(at, tz)`:
    - `gap > idleThresholdMs || day !== slice.localDay` → `flushed = finalize(slice)`; **start a fresh
      slice** for `slice.docId` at `at` (`localDay = day`, `activeMs = 0`, `pages = []` plus the page
      for a `page` event).
    - else → continue: `activeMs += gap`, `lastActivityAt = at`; for a `page` event add the page to
      `pages` (distinct, keep ascending). `flushed = []`.
  - **close**: `flushed = finalize(state.open)`; `state = { open: null }`.
  - `finalize(slice)`: returns `[]` if `slice` is null **or `slice.activeMs === 0`** (drop zero-active);
    else `[{ docId, localDay, tzOffsetMinutes, startedAt: slice.startedAt, endedAt: slice.lastActivityAt, activeMs: slice.activeMs, pages: slice.pages }]`.
  - Page numbers are normalized `Math.max(1, Math.trunc(page))`; `pages` kept sorted-distinct.
- `export function makeReadingSession(flushed: FlushedSession, args: { id: string; hlc: Hlc }): ReadingSession`
  — pure factory: `{ ...flushed, id: args.id, updatedAt: encode(args.hlc) }`. `Hlc`/`encode` from
  `./hlc.js`. Core stays runtime-dep-free (no zod/uuid) — same rule as `document`/`reading-position`.
- Re-export from `packages/core/src/index.ts` (`export * from './session.js'`).

### `packages/store/src/sessions.ts` (new)
- `export const SESSIONS_COLLECTION = 'sessions'`.
- `export async function recordSession(deps, flushed: FlushedSession): Promise<ReadingSession>` where
  `deps: { repo: Repository; newId: () => string; newOutboxId: () => string; hlc: Hlc }`. Steps:
  1. `session = makeReadingSession(flushed, { id: deps.newId(), hlc: deps.hlc })`.
  2. `await repo.put(SESSIONS_COLLECTION, session)` — **append**: `id` is a fresh uuid so `put` never
     replaces an existing record (invariant #3 sessions are immutable & append-only; there is NO
     update path and NO delete).
  3. `await repo.enqueue(makeOutboxEntry({ id: deps.newOutboxId(), hlc: deps.hlc, collection: SESSIONS_COLLECTION, recordId: session.id, op: 'put', payload: session }))`
     — one HLC-stamped outbox entry per session (invariant #2). Caller supplies `hlc` + the two id
     factories — store stays platform-free (consistent with 04a/06a).
  4. return `session`.
  - **Batch note (documented, not enforced here):** one `reduce` step flushes 0 or 1 sessions, but a
    midnight-spanning sequence yields several over time; 07b/07c call `recordSession` once per flushed
    session. The store contract is one record + one entry **per call**.
- `export async function listSessions(repo: Repository, filter?: { docId?: string; localDay?: string }): Promise<ReadingSession[]>`
  — `repo.query<ReadingSession>(SESSIONS_COLLECTION, pred)` where `pred` (omitted when no filter)
  ANDs the provided `docId` / `localDay`. Flat list; ordering/aggregation is the stats concern (08/09).
- Barrel-export from `packages/store/src/index.ts` (`export * from './sessions.js'`) — consumer
  surface only, no test-only module (Metro-safe carry-forward from 03c/04a).

### Tests
- `packages/core/src/tests/session.test.ts` (fixture-based, no platform APIs, fixed wall values):
  - `localDayOf`: a wall just before vs after local midnight (e.g. tz `+60`) lands on different dates;
    tz sign respected (a UTC instant near midnight stamps the correct local day for `+`/`−` offsets).
  - **active-time accrual:** open then activities at +15s, +30s, +45s (all gaps ≤ 60s) → on close one
    session, `activeMs === 45_000`, `startedAt`/`endedAt` correct, `pages` = the opened page.
  - **idle split:** open, activity +30s, activity +120s (gap 90s > 60s) → the +120s activity flushes
    the first session (`activeMs === 30_000`, `endedAt` = the +30s time) and starts a new bout; a final
    close flushes the second (zero-active second bout if no further activity → **dropped**).
  - **page accumulation:** `page` events add distinct ascending page numbers; a repeat page doesn't
    duplicate; page also advances active time like an activity.
  - **midnight split:** within sub-60s gaps but crossing local midnight → two sessions with the two
    adjacent `localDay`s; the pre-midnight slice ends at its last activity, the post-midnight slice
    starts at the crossing activity.
  - **zero-active drop:** open then immediate close (no activity) → `flushed` is empty; open→close after
    one activity → exactly one session.
  - **open-over-open:** `open` doc B while doc A's slice is live → flushes A (if active) then opens B.
  - **purity:** `reduce` does not mutate the input `state` (assert the passed object is unchanged).
  - `makeReadingSession`: `updatedAt === encode(hlc)`, all `flushed` fields preserved, `id` set.
- `packages/store/src/tests/sessions.test.ts` (`MemoryRepository`, fixed `Hlc`, monotonic fake
  `newId`/`newOutboxId`):
  - `recordSession` writes exactly one record + exactly one outbox entry (`recordId === session.id`,
    `op:'put'`, `payload` deep-equals the returned session); record id is the uuid, not the docId.
  - two `recordSession` calls for the same `docId` create **two** distinct records (append-only — no
    overwrite) and two outbox entries.
  - `listSessions` returns all; `listSessions(repo, { docId })` and `{ localDay }` filter correctly;
    `{ docId, localDay }` ANDs.

## Dependencies
- none. Core stays runtime-dep-free; store adds no new dep (uses existing `@ember/core`).

## Verify when done
- [ ] `reduce` accrues idle-capped active time, splits bouts on a >60s gap AND on a local-day change,
      drops zero-active slices, and is pure (no input mutation).
- [ ] `localDayOf` stamps the user's local calendar date from a wall ms + tz offset (invariant #4).
- [ ] `recordSession` appends one immutable `ReadingSession` (uuid id) + exactly one HLC-stamped outbox
      entry; repeated calls never overwrite (append-only); there is no update/delete path.
- [ ] `listSessions` reads back saved sessions and filters by `docId` / `localDay`.
- [ ] Barrel exports the consumer surface only; existing 03/04/06 conformance + suites still green.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated — esp. #1 (works offline, Convex never on read path),
      #2 (every syncable mutation through the outbox with an HLC stamp), #3 (sessions append-only &
      immutable; stats derived, never stored as authoritative aggregate), #4 (session day = local
      calendar date stamped at capture with tz offset); core/store import no platform API.
