# Unit 09f: Mobile Stats tab UI

Issue: #84 (part of umbrella Unit 09, #9) · Branch: feat/84-mobile-stats-tab
Boundary: **apps/mobile only** (new bottom-tab `Stats` screen + a pure presenter + a hook + section
components, all uniwind/RN). No core change, no store change, no new dep.
Route: **standard + UI** — single boundary (apps/mobile), product scope already resolved by the web
twin 09e (see Decisions). It builds visible UI, so per spec-unit the executor runs
**frontend-design** (net-new screens) then **impeccable** (audit) *before* `code-review`. The pure
presenter is built test-first (`tdd`).

**Phase 2 (analytics), final slice** of umbrella **Unit 09 (Stats tab)** — completes the umbrella:
- Phase 1 (page-count capture) ✅ — 09a/09b/09c. Every opened doc carries `pageCount`.
- **09d** ✅ core analytics engine (#80, merged) — the pure rollups this screen renders.
- **09e** ✅ web Stats tab (#82, merged) — the screen this slice mirrors onto RN.
- **09f** (this) the **mobile** Stats tab — bespoke uniwind UI, same engine, device-verified.

## Goal
Add a third bottom tab **Stats** to the Expo/RN app (IA `ui-context.md` §App Structure: Today /
Library / Stats). A calm, glanceable analytics screen derived entirely from on-device data
(invariant #3: stats DERIVED, never stored). It composes the 09d engine + 08a habit/streak behind
the **already-existing** `NativeStore` read seams. Nothing new is persisted; the screen is pure
read → derive → present, and must render offline even if a read fails (invariant #1 — neutral empty
view, never a crash).

This is the mobile twin of **09e**. Same six-section product, mirrored onto the RN `(tabs)` shell +
uniwind/`react-native-svg` idioms. **No product invention** — the three product decisions were
resolved with the user for 09e (2026-06-13) and carry over verbatim; this slice is mechanical
platform mirroring + RN platform-reality adaptations.

## v1 scope — "full glance" (carried from 09e, same six sections, top to bottom)
1. **Streak** — current + longest (+ status), from `deriveHabitSummary` (08a).
2. **Activity heatmap** — **trailing 365 days** ending today, week-column grid, horizontally scrollable.
3. **Totals** — active time · pages turned · days read · sessions (`deriveTotals`).
4. **Reading speed** — pages/hour (`deriveSpeed`); "—" when no data.
5. **Time-of-day** — 4 day-parts as proportional bars (`deriveTimeOfDay`).
6. **Your books** — per-book progress % + finish ETA, **all books with ≥1 session, most-recent
   read first** (`deriveBookProgress` + a presentation-layer last-read sort).

## Decisions (carried from 09e — not re-litigated)
- **Full glance**: all engine rollups ship in this slice.
- **Heatmap window = trailing 365 days**: `toDay = today`, `fromDay = localDayOf(now − 364·DAY_MS, tz)`.
- **Per-book list = all books with sessions, most-recent first.** Finished books stay, labelled
  "Finished". Books with no sessions omitted.
- **No clock in the presenter** — "today" / window bounds / last-read sort are computed in the hook
  (may read the device clock, exactly like `use-habit-summary.ts`) and passed into the pure presenter.

## RN platform-reality adaptations (mechanical — mirror 08c/09c precedent, not product choices)
- **Per-platform presenter copy.** Mobile keeps its own thin presenter (house style — cf.
  `apps/mobile/src/today/present-habit.ts` is a copy of the web one, and `session-tracker.ts` from
  07c). 09f **copies `apps/web/src/stats/present-stats.ts` verbatim** into
  `apps/mobile/src/stats/present-stats.ts` (identical `PresentStatsInput` / `StatsView` / logic) and
  unit-tests it locally. This keeps the boundary at apps/mobile (no shared-package change) and matches
  precedent. The presenter is pure (no DOM/React/`Date`), so it ports unchanged.
- **No headless RN renderer in this project.** Per 08c/09c precedent (`today-screen.tsx`,
  `use-habit-summary.ts`, the section components carry **no** `.test.tsx`), only the pure presenter is
  unit-tested; the screen/hook/components' React + native-SVG wiring is verified in **Expo Go**. Do
  **not** add a renderHook/render test for the hook or screen — there is no test infra for it here.
- **Token colors via `useResolveClassNames` → `ColorValue`, never `var(--…)` and never a className on
  an SVG element** (invariant #6 the RN way — see `goal-ring.tsx` / `streak-ember.tsx`).
- **No CSS `color-mix` / `opacity` ramp via color functions in RN.** The heatmap 5-step accent ramp
  uses the **resolved accent `ColorValue` + a per-level `opacity`** on the cell `View` (level 0 →
  `bg-line`; levels 1–4 → accent at increasing opacity, e.g. 0.28 / 0.48 / 0.72 / 1.0). Same technique
  `streak-ember.tsx` uses for status opacity. No `motion-safe:` (RN); ship static, no motion dep.
- **Horizontal scroll for the heatmap.** ~53 week-columns × 7 rows of ~10px cells will not fit a phone
  width — wrap the grid in a horizontal `ScrollView` (`showsHorizontalScrollIndicator={false}`), like
  no existing mobile surface needs but is the obvious RN equivalent of the web overflow-x wrapper.

## Context (already in place — read these, change only what this spec names)
- `apps/mobile/src/today/` — **the mobile pattern to mirror exactly**:
  - `present-habit.ts` / `present-habit.test.ts` — the pure presenter + its unit test (house-style
    per-platform copy). 09f's `present-stats.ts` + `.test.ts` are the same idea, copied from web 09e.
  - `use-habit-summary.ts` — the hook to mirror: `const { store, ready } = useNativeStore();`, effect
    gated on `if (!ready || !store) return;`, `cancelled` flag, `setLoading(true)`,
    `Promise.all([...])`, derive (core) → `present*` → `setView`, **swallow read errors → neutral
    `defaultView()`** (invariant #1), `finally` clears loading under the `cancelled` guard, deps
    `[store, ready]`. `today = localDayOf(Date.now(), -new Date().getTimezoneOffset())`.
  - `goal-ring.tsx` — token-only `react-native-svg` (`useResolveClassNames('bg-accent').backgroundColor
    as ColorValue`), `accessibilityRole="image"` + `accessibilityLabel`. **The SVG/a11y/token idiom for
    the heatmap + bars.**
  - `streak-ember.tsx` — status-aware color + **opacity** technique (the heatmap ramp reuses this),
    `accessibilityElementsHidden` on decorative inner views, ember motif for streak parity.
  - `habit-header.tsx` — card aesthetic (`bg-surface-raised border border-line rounded-2xl px-5 py-5`)
    + a **skeleton** while loading (no fake numbers, `bg-line` placeholders).
  - `today-screen.tsx` — the screen shell to mirror: `<View className="flex-1 bg-surface">` →
    `<SafeAreaView edges={['top']} style={{ flex: 1 }}>` → `<ScrollView>` →
    `<View className="px-6 py-10 gap-9">`; Fraunces (`font-serif`) headings, Inter (`font-sans`)
    labels; `accessibilityRole="header"`; token-tinted `ActivityIndicator` for inline loading.
- `apps/mobile/app/(tabs)/_layout.tsx` — the bottom tab bar. Two `<Tabs.Screen>` (index=Today,
  library=Library) with bespoke inline-SVG icons (`SunIcon`, `LibraryIcon`) taking a `color`/`size`
  prop, tab colors resolved via `useResolveClassNames`. **Add a third `<Tabs.Screen name="stats">`**
  with a new `StatsIcon`.
- `apps/mobile/app/(tabs)/index.tsx` / `library.tsx` — one-line route files that render the screen
  component (`export default function …Route() { return <Screen />; }`). **Add `app/(tabs)/stats.tsx`**
  in the same shape rendering `<StatsScreen />`.
- `apps/mobile/src/store/native-store.ts` — `NativeStore` already exposes `listSessions()`,
  `listDocuments()`, `listReadingPositions()`, `getGoalConfig()` (confirmed). **No store change.**
- `apps/mobile/src/store/store-context.tsx` — `useNativeStore()` returns `{ store, ready }` (store may
  be null before composition; `ready` gates the first read). Import exactly as the Today hooks do.
- `@ember/core` (barrel) — exports the 09d engine (`deriveAnalytics`, `buildHeatmap`, `deriveTotals`,
  `deriveSpeed`, `deriveTimeOfDay`, `dayPartOfHour`, `deriveBookProgress`, and types
  `AnalyticsSummary`, `HeatmapCell`, `BookProgress`, `ReadingTotals`, `ReadingSpeed`, `TimeOfDay`,
  `DayPart`) **and** 08a (`deriveHabitSummary`, `HabitSummary`, `StreakStatus`,
  `DEFAULT_GOAL_ACTIVE_MS`, `localDayOf`). All consumed; none modified. **Confirm each name in the
  barrel before importing.**
- Design tokens / voice: `context/ui-context.md` — Amber Ember palette, Fraunces+Inter, warm/cozy,
  quiet non-gamified copy. Available tokens used by Today (reuse the same): `bg-surface`,
  `bg-surface-raised`, `border-line` / `bg-line`, `text` / `text-text-muted`, `bg-accent` /
  `text-accent`, `bg-streak-lit` / `bg-streak-risk`.

## Implementation (all new files under `apps/mobile/src/stats/`)

### 1. `present-stats.ts` (new, pure — copied verbatim from `apps/web/src/stats/present-stats.ts`)
Identical `PresentStatsInput` and `StatsView` contracts and identical pure logic (duration
formatting `0m`/`Nm`/`Hh Mm`, ETA `null`/`Finished`/`~Xh left`, progress `null`/`N%`, heatmap level
binning 0..4 over `maxActiveMs` quartiles + `"<day>: <duration>"` label, book join from `docs` +
drop-no-session + sort by most-recent `endedAt` desc, pluralization, warm streak labels). No DOM/
React/`Date`; no input mutation. Built test-first (see Tests). It ports unchanged — diff against the
web file should be content-identical (only the file path differs).

### 2. `use-stats.ts` (new — hook, mirrors `apps/mobile/src/today/use-habit-summary.ts`)
```ts
export interface StatsState { view: StatsView; loading: boolean; }
export function useStats(): StatsState;
```
- `const { store, ready } = useNativeStore();`
- `defaultView()` builds the neutral view through the real empty pipeline:
  `presentStats({ habit: deriveHabitSummary([], today, DEFAULT_GOAL_ACTIVE_MS), analytics:
  deriveAnalytics([], [], []), heatmap: buildHeatmap([], fromDay, today), docs: [], sessions: [] })`.
- Effect gated `if (!ready || !store) return;`, `cancelled` flag, `setLoading(true)`:
  - `const tz = -new Date().getTimezoneOffset();` `const now = Date.now();`
    `const today = localDayOf(now, tz);` `const fromDay = localDayOf(now - 364*86_400_000, tz);`
  - `Promise.all([store.listSessions(), store.listDocuments(), store.listReadingPositions(),
    store.getGoalConfig()])`.
  - `habit = deriveHabitSummary(sessions, today, goal.targetActiveMs)`;
    `analytics = deriveAnalytics(sessions, docs, positions)`;
    `heatmap = buildHeatmap(sessions, fromDay, today)`;
    `setView(presentStats({ habit, analytics, heatmap, docs, sessions }))`.
  - **`catch` → `setView(defaultView())`** (invariant #1); `finally` clears `loading` (guard `cancelled`).
- Deps `[store, ready]`. Mirror `use-habit-summary.ts` structure exactly.

### 3. Section components (new — `frontend-design` builds; `impeccable` audits)
Token-only (invariant #6, via `useResolveClassNames` for SVG, uniwind classNames otherwise),
`react-native-svg` for the heatmap/bars, semantic RN a11y (`accessibilityRole`, `accessibilityLabel`,
`accessibilityElementsHidden` on decorative inner nodes), Fraunces (`font-serif`) for big numbers /
Inter (`font-sans`) for labels, card aesthetic matching `habit-header.tsx`:
- `stat-card.tsx` — small wrapper `View`: `bg-surface-raised border border-line rounded-2xl px-5 py-5`,
  optional section title (`font-sans text-xs uppercase tracking-widest text-text-muted`) — reused by
  the sections below.
- `streak-stat.tsx` — current (Fraunces hero numeral) + longest + status-aware sublabel. May reuse the
  ember motif lightly (calmer than Today — no goal ring here).
- `activity-heatmap.tsx` — the year grid. Group `view.heatmap.cells` into **week columns** (weekday via
  `new Date(day + 'T00:00:00Z').getUTCDay()`; pad leading blanks for the first partial week). Wrap in a
  **horizontal `ScrollView`**. Each cell: small rounded `View` (~10–11px), level 0 → `bg-line`; levels
  1–4 → accent `ColorValue` at increasing `opacity` (no `color-mix`). `accessibilityRole="image"` on the
  grid with a summarizing `accessibilityLabel`; cells decorative (hidden from AT — the grid carries the
  summary). Optional compact month ticks.
- `totals-stat.tsx` — the four totals as a quiet row/grid (Fraunces numerals + Inter labels) + the
  reading-speed figure ("27 pages/hour" / "—").
- `time-of-day-stat.tsx` — 4 horizontal bars (morning/afternoon/evening/night) widthed by `fraction`
  (`View` with `style={{ width: \`${fraction*100}%\` }}` over a `bg-line` track, accent fill); show
  duration per part; calm empty state when `!hasAny`.
- `book-progress-list.tsx` + `book-progress-row.tsx` — title (Inter), a thin progress bar
  (`progressRatio`; indeterminate/empty when null), `progressLabel` + `etaLabel` ("64% · ~2h left" /
  "100% · Finished" / just the title when both null). Empty when no books.
- Copy stays in the **warm, quiet voice** (ui-context §Brand & Voice) — factual numbers, gentle
  framing, no exclamation/gamification.

### 4. `stats-screen.tsx` (new — composition, mirrors `today-screen.tsx`)
- Shell: `<View className="flex-1 bg-surface">` → `<SafeAreaView edges={['top']} style={{ flex: 1 }}>`
  → `<ScrollView showsVerticalScrollIndicator={false}>` → `<View className="px-6 py-10 gap-9">`.
- A Fraunces screen heading (`font-serif text-4xl text-text`, `accessibilityRole="header"`) — e.g.
  "Your reading" — with a quiet muted Inter subtitle.
- `const { view, loading } = useStats();`
- `loading` → a calm **skeleton** (mirror `HabitSkeleton`'s `bg-line` placeholder blocks; no fake
  numbers) or a token-tinted `ActivityIndicator`, consistent with Today.
- `!view.hasData` → a warm **empty state** (e.g. "Your story starts with a single page." — voice-
  appropriate, no guilt) instead of zero-filled panels; the heatmap may render all-empty as a quiet
  backdrop or be hidden — `frontend-design`'s call within the voice.
- Otherwise the six sections in order, each wrapped in a `stat-card` with an `accessibilityLabel`.

### 5. Wiring (edits)
- `app/(tabs)/stats.tsx` (new) — one-line route: `import { StatsScreen } from
  '../../src/stats/stats-screen.js';` `export default function StatsRoute() { return <StatsScreen />; }`.
- `app/(tabs)/_layout.tsx` (edit) — add a `StatsIcon` (bespoke inline `react-native-svg` taking
  `{ color, size }`, e.g. a small bar-chart / spark motif consistent with the Sun/Library icons) and a
  third `<Tabs.Screen name="stats" options={{ title: 'Stats', tabBarIcon: ({ color, size }) =>
  <StatsIcon color={color} size={size} /> }} />` after the Library screen. No other tab-bar change.

### Tests
- `apps/mobile/src/stats/present-stats.test.ts` (new — **the TDD core**, the mobile copy of web 09e's
  `present-stats.test.ts`; plain fixtures, no DOM/clock). Cover the same matrix:
  - duration formatting (`0m`, `45m`, `2h`, `2h 5m`), ETA (`null`, `Finished`, `~Xh left`), progress
    (`null`, `0%`, `64%`, `100%`).
  - heatmap level binning (all-zero → all level 0; max → 4; mid → expected quartiles; `maxActiveMs`
    correct; per-cell label string).
  - totals + speed labels incl. pluralization + `"—"` when speed null.
  - time-of-day parts (fixed 4-part order, fractions, `hasAny` false on all-zero).
  - book ordering/join: titles joined from `docs`; no-session books dropped; remaining sorted by most-
    recent `endedAt` desc; finished → "Finished"; pageCount-unknown → null labels but still listed.
  - `hasData` false when `sessions` empty; the empty pipeline yields a neutral view.
  - purity (inputs not mutated).
- **No hook/screen/component test** — see RN platform-reality: no headless RN renderer in this project
  (08c/09c precedent). The hook + screen + section components are verified on device in Expo Go.

## Dependencies
- none new. `react-native-svg` + `uniwind` + `expo-router` + `react-native-safe-area-context` already
  in apps/mobile; `@ember/core` engine (09d) + habit (08a); the existing `NativeStore` read seams. No
  store, no core, no new package.

## Verify when done
- [ ] A third **Stats** bottom tab exists; tapping it shows the Stats screen; Today/Library unaffected.
- [ ] `present-stats.ts` is pure (no DOM/React/`Date`, no input mutation), content-identical to the web
      09e presenter, and exhaustively unit-tested locally.
- [ ] `useStats` mirrors `use-habit-summary` (ready/store gate, `cancelled` flag, parallel fetch →
      derive → present → `{view, loading}`), computes today/window from the clock in the hook, and
      **swallows read errors to a neutral view** (renders offline — invariant #1).
- [ ] All six sections render from the engine outputs; heatmap = trailing 365 days, dense, week
      columns, **horizontally scrollable**, accent-opacity ramp (no `color-mix`), a11y label; per-book
      list = books with sessions, most-recent first, finished labelled.
- [ ] Token-only styling (invariant #6 — `useResolveClassNames`/uniwind classes, no hardcoded colors,
      no className on SVG elements); warm non-gamified voice; Fraunces numerals + Inter labels; loading
      skeleton + warm empty state (no fake numbers).
- [ ] `frontend-design` produced the screens and `impeccable` audited (UX/visual/a11y) **before**
      `code-review`.
- [ ] New presenter test green; existing mobile suite unchanged. (No hook/screen test — device-verified.)
- [ ] `pnpm -w typecheck` · `pnpm -w test` · `pnpm -w lint` all clean.
- [ ] packages/* , apps/web byte-identical to main (apps/mobile-only diff).
- [ ] Invariants honoured — **#1** (pure read+derive, no Convex on the path, store error never breaks
      the screen, null-store/`ready` gate), **#3** (every stat DERIVED from the append-only session log,
      nothing stored), **#6** (token-only via the RN resolver).
