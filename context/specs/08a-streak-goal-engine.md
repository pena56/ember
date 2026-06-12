# Unit 08a: core streak/goal/freeze derivation engine + store goal config

Issue: #68 (part of umbrella Unit 08) · Branch: feat/68-streak-goal-engine · Boundary: packages/core + packages/store
Route: standard — shared pure-TS brain (core+store), no new dep, no UI; ambiguity resolved (mirrors 07a/06a/04a).

First slice of Unit 08 (Streaks + daily goal + freezes), split COMPLEX→sub-units by boundary per the
03/04/05/06/07 pattern: **08a** shared brain (this) → **08b** web Today goal ring + streak ember →
**08c** mobile Today goal ring + streak ember (device-bound). 08a is fully headless-testable: no UI,
no clock, no timers, no DOM. It is the derivation layer every habit surface reads (invariant #3:
streaks/stats are always *derived* from the raw session log, never stored as an authoritative aggregate).

## Goal
Turn the immutable `ReadingSession` log (07a) into the three numbers the Today screen needs — the
**reading streak** (with banked, auto-consumed **freezes**), **today's goal progress** (active minutes
vs target), and the **ember status** (lit / at-risk / broken) — as **pure** functions of
`(sessions, today, goalTarget)`. The caller (08b/08c) supplies `today` as a local-day string (via 07a's
`localDayOf(Date.now(), -getTimezoneOffset())`); core holds no clock, exactly like `reduce` in 07a.
Plus a tiny **store** layer for the user's daily-goal target — a single syncable, mutable `GoalConfig`
record (HLC last-write-wins), defaulting to 20 minutes when unset.

## Design decisions (confirmed with user, 2026-06-12)
- **Streak rule = any reading.** A local day extends the streak if it has *any* real session
  (`activeMs > 0`; 07a already drops zero-active slices, so any persisted session counts). The streak
  is **goal-independent** — meeting the goal is *not* required to keep the ember lit. The goal ring is a
  separate, exceedable progress measure.
- **Daily goal = 20 minutes active reading**, default. Stored as a syncable `GoalConfig` record so it is
  cross-device + ready for the Settings UI (unit 17); the engine reads the target, defaulting to 20 min
  when no record exists. Metric = idle-capped **active time** (`session.activeMs`) — the same honest
  measure 07a accrues — not pages.
- **Freezes = banked, auto-consumed**, both **derived** from session history (no mutable counter — keeps
  invariant #3). A freeze protects the streak across a single missed local day.
  - **Defaulted rule (noted, tunable):** earn **1 freeze per 5 consecutive read-days** in the current
    run, **capped at 2** banked. A missed (non-today) day **auto-consumes** one banked freeze to keep the
    streak alive (the frozen day preserves the streak but does **not** increment it); when freezes run
    out, the next missed day **breaks** the streak (resets run + banked to 0). `today` itself, when
    unread, is **pending** — it neither breaks the streak nor consumes a freeze (the day isn't over).

## Streak model (the derivation contract)
Pure forward simulation over the **calendar days** from the first read-day to `today` inclusive.
`readDays` = the set of distinct `localDay`s present in `sessions`. Walking `d` from `firstReadDay` to
`today`:
- `d` is a read-day → `streak += 1`; if `streak % FREEZE_EARN_EVERY === 0` then
  `banked = min(FREEZE_CAP, banked + 1)`; `longest = max(longest, streak)`.
- `d` is missed **and `d === today`** → pending: stop (no break, no consume).
- `d` is missed, **`banked > 0`** → consume: `banked -= 1`; streak **preserved** (not incremented).
- `d` is missed, **`banked === 0`** → break: `streak = 0`, `banked = 0`.

`current` = `streak` after the walk; `longest` = peak over **all** history (full walk needed — past runs
included). `status`: `lit` if `today ∈ readDays`; else `at-risk` if `current > 0`; else `broken`.
(Walk cost is O(days-since-first-read); acceptable for a learning-project local store — noted, not
optimized. `current`/`status`/`banked` need only the tail, but `longest` needs the whole history.)

Calendar-day stepping uses UTC arithmetic on the plain `YYYY-MM-DD` label
(`Date.parse(day+'T00:00:00Z') + 86_400_000`) — these are **date labels**, not instants, so there is no
tz/DST hazard; the local-day correctness already lives in 07a's `localDay` stamping (invariant #4).

## Implementation

### `packages/core/src/streak.ts` (new)
- `export const DEFAULT_GOAL_TARGET_MINUTES = 20` · `export const DEFAULT_GOAL_ACTIVE_MS = DEFAULT_GOAL_TARGET_MINUTES * 60_000`.
- `export const FREEZE_EARN_EVERY = 5` · `export const FREEZE_CAP = 2`.
- `export function nextLocalDay(day: string): string` — `new Date(Date.parse(day + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10)`. Pure; exported for tests.
- `export function activeMsByDay(sessions: ReadingSession[]): Map<string, number>` — sum `activeMs` grouped by `localDay`.
- `export type StreakStatus = 'lit' | 'at-risk' | 'broken'`.
- `export type StreakResult = { current: number; longest: number; freezesBanked: number; lastReadDay: string | null; status: StreakStatus }`.
- `export function deriveStreak(sessions: ReadingSession[], today: string, opts?: { earnEvery?: number; cap?: number }): StreakResult`
  — pure (no input mutation); implements the forward simulation above. Empty/no read-days →
  `{ current: 0, longest: 0, freezesBanked: 0, lastReadDay: null, status: 'broken' }`. `lastReadDay` =
  the max `localDay` (or `null`). Defaults `earnEvery = FREEZE_EARN_EVERY`, `cap = FREEZE_CAP`.
- `export type TodayGoal = { targetActiveMs: number; activeMs: number; ratio: number; met: boolean }`.
- `export function deriveTodayGoal(sessions: ReadingSession[], today: string, targetActiveMs: number): TodayGoal`
  — `activeMs` = sum of `activeMs` for sessions with `localDay === today`; `ratio = targetActiveMs > 0 ? activeMs / targetActiveMs : 1` (raw, may exceed 1 — UI clamps for the ring); `met = activeMs >= targetActiveMs`.
- `export type HabitSummary = { streak: StreakResult; goal: TodayGoal }`.
- `export function deriveHabitSummary(sessions: ReadingSession[], today: string, targetActiveMs = DEFAULT_GOAL_ACTIVE_MS): HabitSummary`
  — convenience composition (`{ streak: deriveStreak(...), goal: deriveTodayGoal(...) }`) so 08b/08c call one seam.
- Re-export from `packages/core/src/index.ts` (`export * from './streak.js'`). Core stays runtime-dep-free (no uuid/clock/Date.now()).

### `packages/store/src/goal-config.ts` (new)
- `export const GOAL_CONFIG_COLLECTION = 'goalConfig'` · `export const GOAL_CONFIG_ID = 'default'` (single record — one goal per user; per-doc goals out of scope).
- `export type GoalConfigRecord = { id: string; targetActiveMs: number; updatedAt: string }` (`updatedAt` = encoded HLC; cross-device tiebreak is HLC last-write-wins, like reading-position).
- `export async function getGoalConfig(repo: Repository): Promise<GoalConfigRecord>` — `repo.get(GOAL_CONFIG_COLLECTION, GOAL_CONFIG_ID)`; if null, return an **unpersisted** default `{ id: GOAL_CONFIG_ID, targetActiveMs: DEFAULT_GOAL_ACTIVE_MS, updatedAt: '' }` (empty `updatedAt` string-sorts lowest, so any real `set` wins by HLC compare).
- `export async function setGoalConfig(deps: { repo: Repository; hlc: Hlc; newOutboxId: () => string }, targetActiveMs: number): Promise<GoalConfigRecord>`:
  1. `target = Math.max(60_000, Math.trunc(targetActiveMs))` (sane 1-min floor; integer ms).
  2. `record = { id: GOAL_CONFIG_ID, targetActiveMs: target, updatedAt: encode(deps.hlc) }`.
  3. `await repo.put(GOAL_CONFIG_COLLECTION, record)` — **overwrites** the single record. This is mutable
     *settings*, not a session: invariant #3 governs sessions/derived aggregates, not config; cross-device
     conflicts resolve via the HLC `updatedAt` in the unit-12 reconciler.
  4. `await repo.enqueue(makeOutboxEntry({ id: deps.newOutboxId(), hlc: deps.hlc, collection: GOAL_CONFIG_COLLECTION, recordId: GOAL_CONFIG_ID, op: 'put', payload: record }))` — one HLC-stamped outbox entry (invariant #2).
  5. return `record`.
- Barrel-export from `packages/store/src/index.ts` (`export * from './goal-config.js'`) — consumer surface only (Metro-safe carry-forward from 03c/04a).

### Tests
- `packages/core/src/tests/streak.test.ts` (fixture `ReadingSession[]` via a small `mk(localDay, activeMs)` helper; no platform APIs):
  - **empty** → `current 0, longest 0, freezesBanked 0, lastReadDay null, status 'broken'`.
  - **consecutive run ending today** (3 read days incl. today) → `current 3, status 'lit'`, `lastReadDay = today`.
  - **read yesterday, not today** → `status 'at-risk'`, `current` = run through yesterday (today pending, no break).
  - **plain break (no freeze)** → run of 4, a missed non-today day with `banked 0`, then nothing → `current 0`, `longest 4`.
  - **earn + cap** → 5 consecutive read days ⇒ `freezesBanked 1`; 10 ⇒ `2`; 15 ⇒ still `2` (cap).
  - **auto-consume** → 5 read days (earn 1), miss one non-today day, read today ⇒ freeze covers gap: `current 6`, `freezesBanked 0`, `status 'lit'`.
  - **freezes exhausted** → 1 banked, then two consecutive missed non-today days ⇒ first frozen, second breaks ⇒ `current 0`.
  - **longest across runs** → run of 4, break, run of 2 ending today ⇒ `longest 4`, `current 2`.
  - **multiple sessions, one day** → two sessions same `localDay` count the day **once** for streak.
  - **purity** → `deriveStreak` does not mutate the input array (snapshot compare).
  - `nextLocalDay` rolls month/year boundaries correctly (e.g. `2026-02-28→…-03-01`? no — 2026 not leap: `2026-02-28→2026-03-01`; `2026-12-31→2027-01-01`).
- `packages/core/src/tests/today-goal.test.ts`:
  - sums only `today`'s sessions; `met` true at/above target, false below; `ratio > 1` when over target; ignores other days; `deriveHabitSummary` composes both.
- `packages/store/src/tests/goal-config.test.ts` (`MemoryRepository`, fixed `Hlc`, monotonic fake `newOutboxId`):
  - `getGoalConfig` with nothing stored → default `DEFAULT_GOAL_ACTIVE_MS`, `updatedAt ''`.
  - `setGoalConfig` writes exactly **one** record (`id 'default'`) + exactly **one** outbox entry (`op 'put'`, `recordId 'default'`, `payload` deep-equals the returned record), `updatedAt === encode(hlc)`.
  - `getGoalConfig` after `set` returns the stored value.
  - `setGoalConfig` twice → still a **single** `goalConfig` record (overwritten), **two** outbox entries (mutation-log append).
  - below-floor target (e.g. `1_000`) clamped to `60_000`.

## Dependencies
- none. Core stays runtime-dep-free; store adds no new dep (reuses `@ember/core` + existing `Repository`/`makeOutboxEntry`/`Hlc`/`encode`).

## Verify when done
- [ ] `deriveStreak` implements the any-reading rule + banked/auto-consumed freezes (earn 1/5, cap 2),
      keeps `today` pending, computes `longest` over full history, and is pure (no input mutation).
- [ ] `deriveTodayGoal` sums today's `activeMs` vs target → `ratio`/`met`; `deriveHabitSummary` composes both.
- [ ] `getGoalConfig` defaults to 20 min unset; `setGoalConfig` writes one mutable record + exactly one
      HLC-stamped outbox entry, clamps below-floor targets, and overwrites (single record).
- [ ] Barrel exports the consumer surface only; existing 03/04/06/07 conformance + suites still green.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated — esp. #1 (works offline, Convex never on read path),
      #2 (every syncable mutation through the outbox with an HLC stamp — the goal-config write),
      #3 (streaks/goal derived from the session log, never stored as an authoritative aggregate),
      #4 (session day = local calendar date, consumed as-is, never recomputed in UTC); core/store
      import no platform API.
