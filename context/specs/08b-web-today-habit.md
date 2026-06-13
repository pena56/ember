# Unit 08b: web Today goal ring + streak ember

Issue: #70 (part of umbrella Unit 08) · Branch: feat/70-web-today-habit · Boundary: apps/web
Route: standard — single boundary (apps/web), no new dep, ambiguity resolved in 08a. **UI unit** →
`frontend-design` (net-new ember + ring) → `impeccable` (polish/a11y) → `code-review`.

Second slice of Unit 08, after **08a** (shared brain: core `deriveHabitSummary` + store goal config,
MERGED #69). This unit **renders** that derived summary on the web **Today** tab; **08c** mirrors it on
mobile (device-bound). No business logic lives here — 08b is presentation + a thin read hook. Invariant
#3 holds: the streak/goal numbers are *derived on read* from the session log, never stored.

## Goal
Make the Today tab habit-forward. Add two glanceable surfaces above Continue Reading:
- a **streak ember** — the glowing flame motif (ui-context) showing `current` streak with status
  (`lit` / `at-risk` / `broken`), plus banked freezes when any;
- a **today's goal ring** — a circular progress ring of today's **active minutes** vs the target
  (default 20 min), clamped to a full ring at/over target.

Both read one seam: `deriveHabitSummary(sessions, today, targetActiveMs)` from `@ember/core` (08a),
fed by `today = localDayOf(Date.now(), -new Date().getTimezoneOffset())` and the user's stored
`GoalConfigRecord.targetActiveMs`. Warm, encouraging voice — a dim ember is "your ember's resting,"
never "STREAK LOST" (ui-context brand).

## Product decisions (defaults from ui-context — not new ambiguity)
All habit *behaviour* was resolved with the user in 08a (any-reading streak, 20-min active goal,
banked/auto-consumed freezes). 08b only decides **presentation**, within ui-context:
- **Placement:** a compact **habit header** (ember + ring, side by side) sits between the greeting's
  hairline separator and the Continue Reading section — the differentiator is glanceable on open.
  (ui-context IA lists streak/goal on Today; `frontend-design` has latitude on exact composition.)
- **Streak ember states:** `lit` → flame in `streak-lit` with a soft glow + count in Fraunces;
  `at-risk` → flame in `streak-risk`, gentle "keep it lit today" sublabel; `broken`/zero → dim,
  unlit flame (muted) + encouraging "Start your streak" copy (mirrors the existing
  `ContinueReadingCard` empty-state flame). Never guilt-tripping.
- **Goal ring:** arc fraction = **clamped** `ratio` (`min(1, max(0, goal.ratio))`); center shows
  active minutes (e.g. `12 / 20 min`); `met` → full ring in accent + a quiet "Goal met" note. Over
  target still reads as a full ring (no >100%).
- **Freezes:** when `freezesBanked > 0`, show a small, quiet snowflake + count near the ember (it
  explains why a missed day didn't break the streak). Omit entirely when `0`. Lowest-priority
  element — `frontend-design` decides visual weight.
- **Longest streak / heatmap / time-of-day** are **out of scope** — they belong to the Stats tab
  (unit 09). Today stays a glance, not a dashboard.

## Implementation (apps/web only)

### Store surface — `apps/web/src/store/web-store.ts` (additive, mirrors existing seams)
Expose two read-only delegations on `WebStore` (the engine functions are already in `@ember/store`):
- `listSessions(): Promise<ReadingSession[]>` → `listSessions(repo)` (no filter — derivation needs the
  whole log for `longest`/forward-sim; filtering is a stats concern).
- `getGoalConfig(): Promise<GoalConfigRecord>` → `getGoalConfig(repo)` (returns the unpersisted 20-min
  default when unset, per 08a).
- **Not** exposed: `setGoalConfig` — editing the target is the Settings unit (17). 08b is read-only;
  it never writes (no outbox entry, no merge path — invariant #2/#5 untouched).
- Import the two functions + `GoalConfigRecord` type from `@ember/store`, `ReadingSession` from
  `@ember/core`, matching the file's existing import style.

### Pure presenter — `apps/web/src/today/present-habit.ts` (new; the headless-testable seam)
Maps the derived `HabitSummary` → a flat view model so all formatting/clamping logic is unit-tested
without rendering (jsdom does no layout). No DOM, no React, no `Date`.
- `export interface HabitView { streakCount: number; streakStatus: StreakStatus; streakLabel: string;
  streakSublabel: string; freezesBanked: number; ringFraction: number; goalMinutes: number;
  targetMinutes: number; goalLabel: string; goalMet: boolean }`.
- `export function presentHabit(summary: HabitSummary): HabitView`:
  - `ringFraction = Math.min(1, Math.max(0, summary.goal.ratio))`.
  - `goalMinutes = Math.round(summary.goal.activeMs / 60_000)`,
    `targetMinutes = Math.round(summary.goal.targetActiveMs / 60_000)`.
  - `goalLabel = \`${goalMinutes} / ${targetMinutes} min\``; `goalMet = summary.goal.met`.
  - `streakCount = summary.streak.current`; `streakStatus = summary.streak.status`;
    `freezesBanked = summary.streak.freezesBanked`.
  - `streakLabel`: `0` → `'Start your streak'`; else `` `${n} day${n === 1 ? '' : 's'}` `` (Fraunces
    count is rendered by the component; label is the word(s)).
  - `streakSublabel` (quiet, status-aware, warm): `lit` → `'Lit today'`; `at-risk` →
    `'Read today to keep it lit'`; `broken`/0 → `'A few minutes is all it takes'`.
- Re-derive nothing — this is pure view-mapping over 08a's output.

### Read hook — `apps/web/src/today/use-habit-summary.ts` (new; mirrors use-continue-reading.ts)
- `export interface HabitSummaryState { view: HabitView; loading: boolean }`.
- `export function useHabitSummary(): HabitSummaryState`:
  - `const store = useWebStore();` cancel-flag + `loading` exactly like `useContinueReading`.
  - In the effect: `const today = localDayOf(Date.now(), -new Date().getTimezoneOffset());`
    `const [sessions, goal] = await Promise.all([store.listSessions(), store.getGoalConfig()]);`
    `const summary = deriveHabitSummary(sessions, today, goal.targetActiveMs);`
    `setView(presentHabit(summary));`.
  - **Swallow read errors → a neutral default view** (invariant #1: Today must render offline even if a
    read fails): `presentHabit(deriveHabitSummary([], today, DEFAULT_GOAL_ACTIVE_MS))` (i.e. broken/0,
    empty ring). Import `localDayOf`, `deriveHabitSummary`, `DEFAULT_GOAL_ACTIVE_MS` from `@ember/core`.
  - Deps `[store]`. No timers, no clock injection — computes `today` from the real clock like the
    greeting already does (`new Date()`); tests compute the expected `today` the same way.

### Components (token-driven, no hardcoded color/spacing — invariant #6)
- `apps/web/src/today/streak-ember.tsx` — flame SVG (reuse the path shape already in
  `continue-reading-card.tsx`'s empty-state flame for motif consistency) tinted by status
  (`text-streak-lit` / `text-streak-risk` / dim `text-text-muted`), a soft glow when `lit`, the
  `streakCount` in **Fraunces** (`0` shows no big number — just the encouraging label), `streakLabel`
  + `streakSublabel` in Inter, and the freeze pips (snowflake + count) when `freezesBanked > 0`.
  `aria-label` announces e.g. `"3 day reading streak, lit today"`.
- `apps/web/src/today/goal-ring.tsx` — two concentric SVG `<circle>`s (track in `line`, progress arc in
  `accent`) using `stroke-dasharray`/`stroke-dashoffset` driven by `ringFraction`; center label
  `goalLabel` (Inter), full + a quiet "Goal met" when `goalMet`. `motion-safe` arc transition.
  `role="img"` + `aria-label` e.g. `"Today's goal: 12 of 20 minutes"`. Decorative SVG bits
  `aria-hidden`.
- `apps/web/src/today/habit-header.tsx` — composes ember + ring into the Today header band; consumes
  `useHabitSummary()`; renders a calm **skeleton** (or the existing Spinner pattern) while `loading`,
  then the two surfaces. Keeps the warm card aesthetic (soft rounded, generous spacing) consistent with
  `ContinueReadingCard`. **No fake numbers while loading.**
- Wire into `apps/web/src/today/today-page.tsx`: render `<HabitHeader />` in a labelled `<section>`
  between the hairline separator (`<div className="h-px w-12 bg-line" />`) and the Continue Reading
  `<section>`. The greeting block and Continue Reading are otherwise untouched.

### Tests
- `apps/web/src/today/present-habit.test.ts` (pure — no render):
  - `broken`/empty summary → `streakCount 0`, `streakLabel 'Start your streak'`, `ringFraction 0`,
    `goalLabel '0 / 20 min'`, `goalMet false`, `streakSublabel` = the warm broken copy.
  - `lit`, `current 1` → `streakLabel '1 day'` (singular); `current 3` → `'3 days'` (plural).
  - `at-risk` → the at-risk sublabel; status passes through.
  - ratio clamping: `ratio 0.5` → `ringFraction 0.5`; `ratio 1` → `1`, `goalMet true`; `ratio 1.7`
    (over target) → `ringFraction 1`, `goalMet true`, minutes reflect the real (over-target) active.
  - minutes rounding: `activeMs 750_000` → `13` (12.5 → 13); target from a non-default config reflected.
  - `freezesBanked` passes through (e.g. `2`).
- `apps/web/src/today/today-habit.test.tsx` (jsdom render; mirror `tests/today-continue-reading.test.tsx`
  injected-store harness — render `<TodayPage/>` inside `StoreProvider store={stub}` + `MemoryRouter`):
  the stub implements `listSessions` + `getGoalConfig` (plus the no-op other `WebStore` methods the page
  touches: `listReadingPositions`, `listDocuments` returning `[]`). Tests compute `today` via
  `localDayOf(Date.now(), -new Date().getTimezoneOffset())` so fixture sessions land on "today".
  - lit streak: stub returns 3 consecutive read-days ending today + today's active ≥ target → renders the
    streak count `3` and a met goal (`role="img"` ring label shows full/`met`).
  - in-progress goal: today active below target → ring label shows `N / 20 min`, not met.
  - empty/offline: `listSessions` rejects → page still renders (no throw), shows `'Start your streak'`
    and an empty ring (invariant #1).
  - loading → resolved: a skeleton/spinner shows first, real numbers after the awaits settle.
- No direct `useHabitSummary` unit test — its branches are exercised through the render test (same
  precedent as `useContinueReading`, covered via `TodayPage`). The formatting logic lives in the pure
  `present-habit` seam, tested directly.

## Dependencies
- none. Reuses `@ember/core` (`deriveHabitSummary`, `localDayOf`, `DEFAULT_GOAL_ACTIVE_MS`, types),
  `@ember/store` (`listSessions`, `getGoalConfig`, `GoalConfigRecord`), existing shadcn primitives,
  and the `streak-lit`/`streak-risk`/`accent`/`line` tokens already in `packages/tokens` (verified
  present — no tokens-boundary change).

## Verify when done
- [ ] Today renders the streak ember + goal ring above Continue Reading, derived from the live session
      log + stored goal target via `deriveHabitSummary` (no stored aggregate — invariant #3).
- [ ] `presentHabit` clamps the ring to `[0,1]`, rounds minutes, pluralizes the day label, and maps
      lit/at-risk/broken to warm, non-guilt copy; freezes shown only when banked > 0.
- [ ] `useHabitSummary` swallows read errors to a neutral broken/empty view — Today renders with zero
      network and on read failure (invariant #1). 08b writes nothing (no outbox/merge — #2/#5 untouched).
- [ ] All UI is token-only (no hardcoded color/spacing — invariant #6); ember/ring carry accessible
      `aria-label`/`role`; decorative SVG is `aria-hidden`; arc animation is `motion-safe`.
- [ ] `frontend-design` generated the ember + ring; `impeccable` polished them before review.
- [ ] `pnpm -w typecheck` passes · `pnpm -w test` passes · `pnpm -w lint` clean.
- [ ] core/store/mobile/tokens byte-identical to main (apps/web-only diff). Existing web suites still green.
- [ ] **BROWSER-VERIFY (user, before merge):** `pnpm --filter @ember/web dev` → Today shows a dim ember
      + empty ring with no sessions; read a PDF a few minutes → Today's ring fills toward 20 min and the
      ember lights with the day count; light/dark both legible; freeze pips appear after a 5-day run.
