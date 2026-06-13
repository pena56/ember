# Unit 09e: Web Stats tab UI

Issue: #82 (part of umbrella Unit 09, #9) · Branch: feat/82-web-stats-tab
Boundary: **apps/web only** (new `/stats` route + nav tab + a pure presenter + a hook + section
components). No core change, no store change, no new dep.
Route: **standard + UI** — single boundary (apps/web), product scope resolved (see Decisions). It
builds visible UI, so per spec-unit the executor runs **frontend-design** (net-new screen) then
**impeccable** (audit) *before* `code-review`. The pure presenter is built test-first (`tdd`).

**Phase 2 (analytics), second slice** of umbrella **Unit 09 (Stats tab)**:
- Phase 1 (page-count capture) ✅ — 09a/09b/09c. Every opened doc carries `pageCount`.
- **09d** ✅ core analytics engine (#80, merged) — the pure rollups this screen renders.
- **09e** (this) the **web** Stats tab.
- **09f** mobile Stats tab (device-bound; same engine, bespoke uniwind UI).

## Goal
Render the Stats tab (IA `ui-context.md` §App Structure): a calm, glanceable analytics screen
derived entirely from on-device data (invariant #3: stats DERIVED, never stored). It composes the
09d engine + the 08a habit/streak derivation behind the **already-existing** store seams. Nothing
new is persisted; the page is pure read + derive + present, and must render offline even if a read
fails (invariant #1 — neutral empty view, never a crash).

## v1 scope — "full glance" (resolved with user 2026-06-13)
Six sections, top to bottom:
1. **Streak** — current + longest (+ status), from `deriveHabitSummary` (08a).
2. **Activity heatmap** — **trailing 365 days** ending today, GitHub-style week-column grid.
3. **Totals** — active time · pages turned · days read · sessions (`deriveTotals`).
4. **Reading speed** — pages/hour (`deriveSpeed`); "—" when no data.
5. **Time-of-day** — 4 day-parts as proportional bars (`deriveTimeOfDay`).
6. **Your books** — per-book progress % + finish ETA, **all books with ≥1 session, most-recent
   read first** (`deriveBookProgress` + a presentation-layer last-read sort).

## Decisions (resolved with the user 2026-06-13 — not invented)
- **Full glance**: all engine rollups ship in this one slice (not lean / not deferred).
- **Heatmap window = trailing 365 days**: `toDay = today`, `fromDay = localDayOf(now − 364·DAY_MS, tz)`.
  ~53 week-columns × 7 day-rows. Fits a `max-w-2xl` column with small (~10–11px) cells; allow
  horizontal scroll on narrow viewports (no layout break).
- **Per-book list = all books with sessions, most-recent first.** `deriveBookProgress` returns one
  entry per `Document` (docs order); the web layer **filters to docId's that have ≥1 session** and
  **sorts by that doc's most-recent session `endedAt` desc**. Finished books (remaining 0) stay in
  the list, labelled "Finished". Books with no sessions are omitted from this panel.
- **No `Date.now()` in the presenter.** "today" / window bounds / last-read sorting are computed in
  the **hook** (presentation, may read the device clock — exactly as `use-habit-summary.ts` does)
  and passed into the pure presenter. The presenter never reads a clock.

## Context (already in place — read these, change only what this spec names)
- `apps/web/src/today/` — **the pattern to mirror exactly**:
  - `present-habit.ts` — pure `Summary → View` mapper (no DOM/React/Date), unit-tested.
  - `use-habit-summary.ts` — fetch (parallel) → derive (core) → `present*` → `{ view, loading }`;
    swallows read errors to a neutral `defaultView()` (invariant #1). `today` computed via
    `localDayOf(Date.now(), -new Date().getTimezoneOffset())`.
  - `goal-ring.tsx` — token-only SVG (`var(--color-accent)` / `var(--color-line)`), `role="img"` +
    `aria-label`, `motion-safe:` transitions. **The SVG/a11y/token idiom to reuse for the heatmap
    + bars.**
  - `habit-header.tsx` — card aesthetic (`rounded-2xl bg-surface-raised border border-line`) +
    loading **skeleton** (no fake numbers).
  - `today-page.tsx` — `mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-10` column;
    Fraunces headings, Inter body/labels; `<section aria-label>` per block.
- `apps/web/src/App.tsx` — route tree. Shell layout route holds `today` + `library`. **Add `stats`.**
- `apps/web/src/app-shell.tsx` — sticky top-nav with `<Tab to="/today">` / `<Tab to="/library">`.
  **Add `<Tab to="/stats">Stats</Tab>`** in the `<nav aria-label="Primary">`.
- `apps/web/src/store/store-context.tsx` — `useWebStore()` returns the `WebStore` directly.
- `WebStore` (`apps/web/src/store/web-store.ts`) — already exposes `listSessions()`,
  `listDocuments()`, `listReadingPositions()`, `getGoalConfig()`. **No store change.**
- `@ember/core` (barrel) — exports the 09d engine (`deriveAnalytics`, `buildHeatmap`,
  `deriveTotals`, `deriveSpeed`, `deriveTimeOfDay`, `dayPartOfHour`, `deriveBookProgress`,
  `AnalyticsSummary`, `HeatmapCell`, `BookProgress`, `ReadingTotals`, `ReadingSpeed`, `TimeOfDay`,
  `DayPart`) **and** 08a (`deriveHabitSummary`, `HabitSummary`, `StreakStatus`,
  `DEFAULT_GOAL_ACTIVE_MS`, `localDayOf`). All consumed; none modified.
- Design tokens / voice: `context/ui-context.md` — Amber Ember palette, Fraunces+Inter, warm/cozy,
  quiet non-gamified copy ("A missed day is your ember dimming, never STREAK LOST!"). Heatmap "lit"
  cells use accent ramps; empty cells use `line`. Tailwind v4 `@theme` tokens only (invariant #6).

## Implementation (all new files under `apps/web/src/stats/`)

### 1. `present-stats.ts` (new, pure — built test-first)
The single pure mapper. **No DOM, no React, no `Date`.** Input is everything the hook has derived
plus the raw arrays needed for the title join + last-read sort (both deterministic):
```ts
export interface PresentStatsInput {
  habit: HabitSummary;            // 08a — streak.current / .longest / .status
  analytics: AnalyticsSummary;    // 09d — totals / speed / timeOfDay / books
  heatmap: HeatmapCell[];         // 09d buildHeatmap output (dense, fromDay..toDay)
  docs: Document[];               // for docId → title
  sessions: ReadingSession[];     // for per-doc most-recent endedAt (book ordering)
}
export interface StatsView {
  hasData: boolean;               // sessions.length > 0 — drives empty state
  streak: {
    currentLabel: string;         // "12 days" / "1 day" / "No streak yet"
    longestLabel: string;         // "Best: 21 days" / "Best: —"
    status: StreakStatus;
  };
  heatmap: {
    cells: { day: string; level: 0 | 1 | 2 | 3 | 4; activeMs: number; label: string }[];
    maxActiveMs: number;          // for the legend
  };
  totals: {
    activeLabel: string;          // "4h 12m" / "12m" / "0m"
    pagesLabel: string;           // "318 pages" / "1 page" / "0 pages"
    daysReadLabel: string;        // "9 days" / "1 day"
    sessionsLabel: string;        // "14 sessions" / "1 session"
  };
  speed: { pagesPerHourLabel: string };  // "27 pages/hour" or "—"
  timeOfDay: {
    parts: { part: DayPart; label: string; activeMs: number; fraction: number }[]; // 4, fixed order
    hasAny: boolean;              // false → all zero
  };
  books: {
    docId: string;
    title: string;
    progressLabel: string | null; // "64%" / "100%" / null (pageCount unknown)
    etaLabel: string | null;      // "~2h left" / "Finished" / null (not estimable)
    progressRatio: number | null; // for the bar width (0..1) — null → indeterminate/empty bar
  }[];
}
export function presentStats(input: PresentStatsInput): StatsView;
```
Pure logic the presenter owns (all unit-tested):
- **Duration formatting** — a local `formatDuration(ms)`: `0 → "0m"`, `< 1h → "Nm"`, else `"Hh Mm"`
  (drop trailing `0m` → `"2h"`). Reuse the same helper for active time + ETA.
- **ETA label** — `etaMs === null → null`; `pagesRemaining === 0 → "Finished"`; else
  `"~" + formatDuration(etaMs) + " left"`.
- **Progress label** — `progressRatio === null → null`; else `Math.round(ratio*100) + "%"`.
- **Heatmap level binning** — map each cell's `activeMs` to `0..4`: `0 → 0`; otherwise 4 quartile
  buckets of `maxActiveMs` (e.g. `ceil(activeMs / maxActiveMs * 4)` clamped 1..4; `maxActiveMs===0`
  → all 0). `label` = `"<day>: <formatDuration(activeMs)>"` (e.g. "2026-06-13: 18m") for the cell
  title/aria.
- **Book ordering + join** — for each `BookProgress`, look up `title` from `docs`
  (`docs.find(d => d.id === docId)?.title ?? docId`) and a `lastReadAt` = max `endedAt` over that
  doc's sessions; **drop books with no sessions**; sort remaining by `lastReadAt` desc (stable).
- **Pluralization** — "1 day"/"N days", "1 page"/"N pages", "1 session"/"N sessions".
- **Streak labels** — current `0 → "No streak yet"`, else `"N day(s)"`; longest `0 → "Best: —"`,
  else `"Best: N day(s)"`. Warm, never guilt (voice in ui-context).

### 2. `use-stats.ts` (new — hook, mirrors `use-habit-summary.ts`)
```ts
export interface StatsState { view: StatsView; loading: boolean; }
export function useStats(): StatsState;
```
- `const store = useWebStore();`
- In an effect with a `cancelled` flag: `setLoading(true)`, then `Promise.all([listSessions(),
  listDocuments(), listReadingPositions(), getGoalConfig()])`.
- Compute `const tz = -new Date().getTimezoneOffset();` `const now = Date.now();`
  `const today = localDayOf(now, tz);` `const fromDay = localDayOf(now - 364*86_400_000, tz);`
- Derive: `habit = deriveHabitSummary(sessions, today, goal.targetActiveMs)`;
  `analytics = deriveAnalytics(sessions, docs, positions)`;
  `heatmap = buildHeatmap(sessions, fromDay, today)`.
- `setView(presentStats({ habit, analytics, heatmap, docs, sessions }))`.
- **Swallow read errors** → a neutral `defaultView()` (empty arrays through the same derive+present
  pipeline) so the page renders offline (invariant #1). `finally` clears `loading` (guard `cancelled`).
- Deps `[store]`. Mirror `use-habit-summary.ts` exactly for structure.

### 3. Section components (new — `frontend-design` builds these; `impeccable` audits)
Token-only (invariant #6), `motion-safe:` transitions, semantic markup + a11y, Fraunces for big
numbers / Inter for labels, card aesthetic consistent with `habit-header.tsx`:
- `stat-card.tsx` — small wrapper: `rounded-2xl bg-surface-raised border border-line px-6 py-5`,
  optional section title (Inter uppercase tracking, muted) — reused by the sections below.
- `streak-stat.tsx` — current (Fraunces hero numeral) + longest + status-aware sublabel. May reuse
  the ember motif (`streak-ember.tsx`) lightly; keep it calmer than Today (no goal ring here).
- `activity-heatmap.tsx` — the year grid. Group `view.heatmap.cells` into **week columns** (compute
  weekday from the `day` string via `new Date(day+'T00:00:00Z').getUTCDay()`; pad leading blanks for
  the first partial week). Each cell: small rounded square, fill from a 5-step accent ramp keyed by
  `level` (0 = `line`; 1–4 = increasing accent via `color-mix`/opacity), `title`/`aria-label` =
  cell `label`. `role="img"` on the grid with a summarizing `aria-label`; horizontal scroll wrapper
  for narrow widths. Compact month ticks optional.
- `totals-stat.tsx` — the four totals as a quiet row/grid (Fraunces numerals + Inter labels) +
  the reading-speed figure ("27 pages/hour" / "—").
- `time-of-day-stat.tsx` — 4 horizontal bars (morning/afternoon/evening/night) widthed by
  `fraction`, accent fill on `line` track; show duration per part; calm empty state when `!hasAny`.
- `book-progress-list.tsx` + `book-progress-row.tsx` — title (Inter), a thin progress bar
  (`progressRatio`; indeterminate/empty when null), `progressLabel` + `etaLabel` ("64% · ~2h left",
  "100% · Finished", or just the title when both null). Empty when no books.
- Copy stays in the **warm, quiet voice** (ui-context §Brand & Voice) — factual numbers, gentle
  framing, no exclamation/gamification.

### 4. `stats-page.tsx` (new — composition)
- Same column shell as `today-page.tsx`: `mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-10`.
- `const { view, loading } = useStats();`
- `loading` → a calm **skeleton** (mirror `HabitSkeleton`; no fake numbers).
- `!view.hasData` → a warm **empty state** (e.g. "Your story starts with a single page." — voice-
  appropriate, no guilt) instead of zero-filled panels; the heatmap may still render (all-empty) as
  a quiet backdrop, or be hidden — `frontend-design`'s call within the voice.
- Otherwise the six `<section aria-label="…">` blocks in order, each a `stat-card`.

### 5. Wiring (edits)
- `App.tsx` — import `StatsPage`; add `<Route path="stats" element={<StatsPage />} />` inside the
  `<Route element={<AppShell />}>` block (beside `today` / `library`).
- `app-shell.tsx` — add `<Tab to="/stats">Stats</Tab>` after the Library tab in the Primary nav.

### Tests
- `apps/web/src/stats/present-stats.test.ts` (new — **the TDD core**, mirror `present-habit.test.ts`;
  plain fixtures, no DOM/clock). Cover:
  - duration formatting (`0m`, `45m`, `2h`, `2h 5m`), ETA (`null`, `Finished`, `~Xh left`), progress
    (`null`, `0%`, `64%`, `100%`).
  - heatmap level binning (all-zero → all level 0; max maps to 4; mid values to expected quartiles;
    `maxActiveMs` correct; per-cell label string).
  - totals + speed labels incl. pluralization + `"—"` when speed null.
  - time-of-day parts (fixed 4-part order, fractions sum-correct, `hasAny` false on all-zero).
  - **book ordering/join**: titles joined from `docs`; books with no sessions dropped; remaining
    sorted by most-recent `endedAt` desc; finished book → "Finished"; pageCount-unknown book →
    `progressLabel`/`etaLabel` null but still listed.
  - `hasData` false when `sessions` empty; the empty pipeline yields all-zero/neutral view.
  - purity (inputs not mutated).
- `apps/web/src/tests/stats-page.test.tsx` (new — `render` within `StoreProvider` + injected
  `WebStore` exposing seeded `listSessions/listDocuments/listReadingPositions/getGoalConfig`, mirror
  `today-habit.test.tsx`):
  - seeded data → streak label, a known total, a book title with its % all visible after load.
  - empty store → the warm empty-state copy renders (no crash, no fake numbers).
  - a rejecting `listSessions` → still renders the neutral view (invariant #1, no throw).
- `apps/web/src/tests/app-shell.test.tsx` (extend) — add a case: clicking the **Stats** tab
  navigates to `/stats` and a Stats landmark/heading is visible; `/` still redirects to Today. Keep
  existing cases green (the new nav link must not break the Today/Library link queries — the Stats
  link text is distinct).

## Dependencies
- none new. React + react-router + the existing shadcn card/utils already in `apps/web`; `@ember/core`
  engine (09d) + habit (08a); the existing `WebStore` seams. No store, no core, no new package.

## Verify when done
- [ ] `/stats` route + a **Stats** nav tab exist; nav between Today/Library/Stats works; `/`
      still redirects to Today.
- [ ] `presentStats` is pure (no DOM/React/`Date`, no input mutation); all formatting/binning/
      ordering lives there and is exhaustively unit-tested.
- [ ] `useStats` mirrors `use-habit-summary` (parallel fetch → derive → present → `{view,loading}`),
      computes today/window/last-read from the clock in the hook, and **swallows read errors to a
      neutral view** (renders offline — invariant #1).
- [ ] All six sections render from the engine outputs; heatmap = trailing 365 days, dense, week
      columns, token-ramp fills, a11y labels, horizontal-scroll-safe; per-book list = books with
      sessions, most-recent first, finished labelled.
- [ ] Token-only styling (invariant #6 — no hardcoded colors/spacing); warm non-gamified voice;
      Fraunces numerals + Inter labels; loading skeleton + warm empty state (no fake numbers).
- [ ] `frontend-design` produced the screen and `impeccable` audited it (UX/visual/a11y) **before**
      `code-review`.
- [ ] New presenter + page tests green; extended shell nav test green; existing web suite unchanged.
- [ ] `pnpm -w typecheck` · `pnpm -w test` · `pnpm -w lint` all clean.
- [ ] packages/* , apps/mobile byte-identical to main (apps/web-only diff).
- [ ] Invariants honoured — **#1** (pure read+derive, no Convex on the path, store error never breaks
      the screen), **#3** (every stat DERIVED from the append-only session log, nothing stored),
      **#6** (semantic tokens only).
