# Unit 09d: Core analytics engine (heatmap, totals, speed, time-of-day, per-book progress + ETA)

Issue: #80 (part of umbrella Unit 09, #9) · Branch: feat/80-core-analytics-engine
Boundary: packages/core (one new pure module + barrel ride). **No store, no UI, no platform API.**
Route: **standard** — single boundary (packages/core), no new dep, fully headless-testable, product
ambiguity resolved (see Decisions). Mirrors the `streak.ts` shared-brain precedent: a pure derivation
file over the session log, bundling several `derive*` functions, no `Date.now()`, no clock injection.

**Phase 2 (analytics), first slice** of umbrella **Unit 09 (Stats tab)**:
- Phase 1 (page-count capture) ✅ COMPLETE — **09a** core model + store setter (#74), **09b** web reader
  capture (#76), **09c** mobile reader capture (#78). Every opened document now carries `pageCount`.
- **09d** (this) the core analytics engine — pure rollups the Stats tab renders.
- **09e** web Stats tab UI (consumes this engine; needs frontend-design + impeccable).
- **09f** mobile Stats tab UI (device-bound; needs frontend-design + impeccable).

## Goal
Derive the Stats-tab rollups as **pure functions of the on-device data** — the append-only session log
(invariant #3: stats are DERIVED, never stored), plus `Document.pageCount` (Phase 1) and
`ReadingPosition` (furthest page) for per-book progress/ETA. The engine takes plain arrays
(`ReadingSession[]`, `Document[]`, `ReadingPosition[]`) and a `today` label — no I/O, no store, no DOM,
no `Date.now()` — so it is exhaustively unit-testable and identical on web and mobile. 09e/09f call it
through the **already-existing** store seams `listSessions()` / `listDocuments()` / `listReadingPositions()`.

## Context (already in place — read these, change only what this spec names)
- `packages/core/src/session.ts` — `ReadingSession` (`docId, localDay, tzOffsetMinutes, startedAt,
  endedAt, activeMs, pages: number[], …`). `pages` is the distinct ascending 1-based pages visited in
  that bout. `localDayOf(wall, tz)` formats a local 'YYYY-MM-DD'. **Reuse these; do not re-derive.**
- `packages/core/src/streak.ts` — **the pattern to mirror exactly.** Pure file, no `Date.now()`,
  `activeMsByDay(sessions): Map<localDay, ms>`, `nextLocalDay(day): string` (UTC date-label arithmetic,
  DST-safe), `deriveStreak` / `deriveTodayGoal` / `deriveHabitSummary` composition. **Reuse
  `activeMsByDay` and `nextLocalDay`** — import them; do not reimplement day-bucketing or date walking.
- `packages/core/src/document.ts` — `Document` carries `title: string` and optional `pageCount?: number`
  (Phase 1). `pageCount` is `undefined` for docs opened before a reader filled it in.
- `packages/core/src/reading-position.ts` — `ReadingPosition` (`id` = docId, `page` = furthest 1-based
  page via the furthest-page-wins merge, invariant #5). This is the canonical "current page" per book —
  **use it for progress/ETA**, not a session re-scan (sessions are the fallback only).
- `packages/core/src/index.ts` — barrel is `export * from './<file>.js'` per module. A new
  `analytics.js` line rides the same pattern (consumer-surface only). Core stays runtime-dep-free.
- Store seams (already exist on both `WebStore` and `NativeStore` — **no store change in this unit**):
  `listSessions(): Promise<ReadingSession[]>`, `listDocuments(): Promise<Document[]>`,
  `listReadingPositions(): Promise<ReadingPosition[]>`. 09e/09f wire these; 09d only adds the pure core.

## Decisions (resolved with the user 2026-06-13 — not invented)
- **One engine unit.** All rollups ship together in `analytics.ts` (mirrors `streak.ts` bundling
  several `derive*`). 09e/09f consume one module.
- **Time-of-day = 4 day-parts**, not a 24-bin histogram. Buckets by each session's **local start hour**
  (`hourOf(startedAt, tzOffsetMinutes)`): **morning 05–11, afternoon 12–16, evening 17–21, night
  22–04**. The whole session's `activeMs` is attributed to its start-hour's part (bouts are short; no
  splitting across the boundary — stated as the deliberate simplification).
- **Per-book ETA speed = per-book, fall back to global.** Use the book's own pages-per-active-hour when
  it has usable data (`activeMs > 0` AND pages turned `> 0` for that doc); otherwise fall back to the
  global average speed; if neither exists, ETA is `null`.
- **Progress basis = furthest reading-position page / pageCount** (canonical current page, invariant #5).
  If a doc has no `ReadingPosition`, fall back to the max page seen in that doc's sessions; if still none,
  furthest page is `0`. `progressRatio`/`etaMs` are `null` whenever `pageCount` is unknown.
- **Speed "pages" = pages turned** = sum of `session.pages.length` across the relevant sessions (engaged
  page-turns during active time), NOT distinct-across-the-book. `null` (not `0`/`Infinity`) when
  `activeMs === 0` or pages turned `=== 0` — the UI renders "—".
- **Heatmap takes an explicit `[fromDay, toDay]`** and emits a **dense** inclusive series (every day,
  zero-filled) so the UI controls the window (e.g. trailing 365 days). Walk days with `nextLocalDay`.
- **No `Date.now()`, no new dep, no UI.** `today` and any window bounds are **passed in** by the caller
  (the presenter computes "today" from the device clock, exactly as 08b/08c already do for streak/goal).

## Implementation

### `packages/core/src/analytics.ts` (new)
A pure module. Import `ReadingSession` from `./session.js`, `Document` from `./document.js`,
`ReadingPosition` from `./reading-position.js`, and **reuse** `activeMsByDay` + `nextLocalDay` from
`./streak.js`. No other imports. Suggested surface (names are the contract 09e/09f will import — keep
them stable):

```ts
// ---- shared helpers ----
const MS_PER_HOUR = 3_600_000;

/** Local hour 0..23 of a wall-clock ms epoch at the given tz offset (minutes east of UTC). */
export function hourOf(wall: number, tzOffsetMinutes: number): number {
  return new Date(wall + tzOffsetMinutes * 60_000).getUTCHours();
}

// ---- 1. totals ----
export type ReadingTotals = {
  activeMs: number;       // Σ session.activeMs
  pagesTurned: number;    // Σ session.pages.length
  daysRead: number;       // distinct localDays with activeMs > 0
  sessions: number;       // session count
};
export function deriveTotals(sessions: ReadingSession[]): ReadingTotals;

// ---- 2. speed ----
export type ReadingSpeed = {
  pagesPerHour: number | null;   // pagesTurned / (activeMs / 3.6e6); null if no data
  msPerPage: number | null;      // activeMs / pagesTurned;            null if no data
};
export function deriveSpeed(sessions: ReadingSession[]): ReadingSpeed;

// ---- 3. time-of-day ----
export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';
export type TimeOfDay = Record<DayPart, number>;  // activeMs per part
export function deriveTimeOfDay(sessions: ReadingSession[]): TimeOfDay;
/** 05–11 morning, 12–16 afternoon, 17–21 evening, 22–04 night. */
export function dayPartOfHour(hour: number): DayPart;

// ---- 4. heatmap (dense, caller-supplied window) ----
export type HeatmapCell = { day: string; activeMs: number; sessions: number };
export function buildHeatmap(sessions: ReadingSession[], fromDay: string, toDay: string): HeatmapCell[];

// ---- 5. per-book progress + ETA ----
export type BookProgress = {
  docId: string;
  pageCount: number | null;        // from Document; null if unknown
  furthestPage: number;            // reading-position page, else max session page, else 0
  progressRatio: number | null;    // furthestPage / pageCount, clamped 0..1; null if pageCount unknown
  pagesRemaining: number | null;   // max(0, pageCount - furthestPage); null if pageCount unknown
  etaMs: number | null;            // pagesRemaining * effectiveMsPerPage; null if not estimable
};
export function deriveBookProgress(
  sessions: ReadingSession[],
  docs: Document[],
  positions: ReadingPosition[],
): BookProgress[];   // one entry per doc in `docs`, stable order = docs order

// ---- top-level composition (range-free rollups) ----
export type AnalyticsSummary = {
  totals: ReadingTotals;
  speed: ReadingSpeed;
  timeOfDay: TimeOfDay;
  books: BookProgress[];
};
export function deriveAnalytics(
  sessions: ReadingSession[],
  docs: Document[],
  positions: ReadingPosition[],
): AnalyticsSummary;
// NOTE: heatmap is NOT folded in — it needs a window; 09e/09f call buildHeatmap separately.
```

Behaviour notes the executor must honour:
- **Empty input** → `deriveTotals` all-zero; `deriveSpeed` both `null`; `deriveTimeOfDay` all-zero parts;
  `buildHeatmap` a dense zero-filled series for the range (still emits cells for the empty range);
  `deriveBookProgress` `[]`; `deriveAnalytics` the composed empties.
- **`deriveSpeed`** global: `pagesTurned = Σ session.pages.length`, `activeMs = Σ session.activeMs`; both
  `null` when `activeMs === 0 || pagesTurned === 0`.
- **`deriveTimeOfDay`**: for each session add `activeMs` to `dayPartOfHour(hourOf(startedAt, tz))`. Start
  from `{ morning:0, afternoon:0, evening:0, night:0 }`.
- **`buildHeatmap`**: build `activeMsByDay` + a per-day session-count map from `sessions`, then walk
  `fromDay … toDay` inclusive with `nextLocalDay`, emitting `{ day, activeMs: map.get(day) ?? 0,
  sessions: countMap.get(day) ?? 0 }`. If `fromDay > toDay`, return `[]` (guard, documented).
- **`deriveBookProgress`** per doc:
  - `furthestPage` = `positions.find(p => p.id === docId)?.page` ?? `max(session.pages)` over that doc's
    sessions ?? `0`.
  - `pageCount` = `doc.pageCount ?? null`.
  - `pageCount === null` → `progressRatio`, `pagesRemaining`, `etaMs` all `null`.
  - else `progressRatio = clamp(furthestPage / pageCount, 0, 1)`,
    `pagesRemaining = max(0, pageCount - furthestPage)`.
  - **ETA speed**: per-book `msPerPage` from that doc's sessions via `deriveSpeed(docSessions)`; if `null`,
    fall back to global `deriveSpeed(sessions).msPerPage`; if still `null`, `etaMs = null`; else
    `etaMs = pagesRemaining * effectiveMsPerPage` (0 when `pagesRemaining === 0`).
- **Purity**: never mutate inputs; no `Date.now()`; no platform API. Reuse `activeMsByDay`/`nextLocalDay`.

### `packages/core/src/index.ts` (edit)
Add `export * from './analytics.js';` alongside the existing `streak.js` line (consumer-surface only;
the new symbols ride the star export — no other barrel change).

### Tests — `packages/core/src/tests/analytics.test.ts` (new)
Mirror `streak.test.ts` / `today-goal.test.ts` style (plain fixtures, no clock, exhaustive edges). Build
a small `makeSession(partial)` fixture helper. Cover:
- **deriveTotals**: sums `activeMs`/`pagesTurned`; `daysRead` counts distinct localDays with `activeMs>0`
  (a zero-active day does not count); `sessions` = length; empty → all zero.
- **deriveSpeed**: known fixture → exact `pagesPerHour` / `msPerPage`; `activeMs===0` → both `null`;
  `pagesTurned===0` → both `null`.
- **dayPartOfHour**: boundary hours 4→night, 5→morning, 11→morning, 12→afternoon, 16→afternoon,
  17→evening, 21→evening, 22→night, 0/23→night. **hourOf**: a tz offset shifts the local hour across a
  day boundary correctly (e.g. a UTC time + `tzOffsetMinutes` that lands in the previous/next local day).
- **deriveTimeOfDay**: two sessions in different parts accrue to the right buckets; tz offset moves a
  session into a different part; empty → all-zero parts.
- **buildHeatmap**: dense inclusive series (length = day count) with zero-fill on gap days; activeMs +
  session count correct on populated days; single-day range → one cell; `fromDay > toDay` → `[]`.
- **deriveBookProgress**:
  - position present → `furthestPage` from position; `progressRatio`/`pagesRemaining` from `pageCount`.
  - no position, sessions present → `furthestPage` = max session page.
  - no position, no sessions → `furthestPage` 0.
  - `pageCount` undefined → `progressRatio`/`pagesRemaining`/`etaMs` all `null`.
  - `furthestPage >= pageCount` → `pagesRemaining` 0, `progressRatio` clamped to 1, `etaMs` 0.
  - **ETA per-book vs global fallback**: a book with its own speed uses it; a book with `pageCount` and
    remaining pages but NO own active time falls back to the global `msPerPage`; with neither → `etaMs`
    `null`. Assert the fallback actually changes the number (distinct per-book vs global fixtures).
  - output order matches `docs` order; one entry per doc.
- **deriveAnalytics**: composes the above for a multi-doc, multi-session fixture (one assertion that the
  four members line up with the individual derive* outputs).
- **purity**: inputs not mutated (snapshot the fixture arrays before/after).

## Dependencies
- none new. Pure `@ember/core` over its own types (`ReadingSession`, `Document`, `ReadingPosition`) +
  reused `activeMsByDay`/`nextLocalDay`. No store, no UI, no platform API, no `Date.now()`.

## Verify when done
- [ ] `analytics.ts` is pure (no input mutation, no `Date.now()`, no platform API); reuses
      `activeMsByDay` + `nextLocalDay` rather than reimplementing.
- [ ] All seven exported functions match the surface above; `null` (not `0`/`NaN`/`Infinity`) is used for
      "no data" in speed/progress/eta; day-part bounds and fallbacks behave per Decisions.
- [ ] Barrel exports the new module (consumer-surface only); every existing core/store suite still green.
- [ ] New `analytics.test.ts` green and exhaustive (totals, speed, time-of-day incl. tz, heatmap density,
      per-book progress + ETA fallback, composition, purity).
- [ ] `pnpm -w typecheck` · `pnpm -w test` · `pnpm -w lint` all clean.
- [ ] apps/web, apps/mobile, packages/store, packages/tokens byte-identical to main (packages/core-only
      diff: `analytics.ts` + barrel + `tests/analytics.test.ts`).
- [ ] Invariants honoured — **#1** (pure on-device derivation, no Convex, no I/O), **#3** (stats DERIVED
      from the append-only session log, never stored), core imports no platform API.
