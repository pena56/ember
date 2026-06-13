# Unit 08c: mobile Today goal ring + streak ember

Issue: #72 (part of umbrella Unit 08) · Branch: feat/72-mobile-today-habit · Boundary: apps/mobile
Route: standard — single boundary (apps/mobile), no new dep, ambiguity resolved in 08a/08b. **UI unit** →
`frontend-design` (net-new RN ember + ring) → `impeccable` (polish/a11y) → `code-review`. **Device-bound** —
the pure presenter is Vitest-tested; the hook + RN components are **device-verified in Expo Go** (no headless
RN renderer, same precedent as 07c/06d/02d), so this closes with a **Device-verify** section, not browser-verify.

Final slice of umbrella Unit 08, after **08a** (shared brain: core `deriveHabitSummary` + store goal config,
MERGED #69) and **08b** (web Today ember + ring, MERGED #71). This unit **renders** that same derived summary on
the **mobile** Today tab — a faithful mirror of 08b in uniwind/react-native-svg. No business logic lives here:
08c is presentation + a thin read hook + two additive read-only native-store delegations. Invariant #3 holds —
the streak/goal numbers are *derived on read* from the session log, never stored.

## How this differs from 08b (web) — read this first
08c mirrors 08b's structure and copy exactly except for four platform realities:
1. **`useResolveClassNames`, not className colors.** uniwind only resolves *known-compiled* classes, and
   react-native-svg takes `ColorValue` props, not CSS classes. Resolve token colors to `ColorValue` via
   `useResolveClassNames('bg-streak-lit').backgroundColor` (etc.) and pass them to `<Path>`/`<Circle>`, exactly
   as `ember-flame.tsx` already does (`bg-accent`/`border-line`/`bg-surface`). The `streak-lit`/`streak-risk`
   tokens are present in `@ember/tokens/theme.uniwind.css` (verified) — no tokens-boundary change.
2. **`useNativeStore()` returns `{ store, ready }`, not a bare store.** The hook must gate on `ready` and guard
   `store` being `null` before init (mirror `use-continue-reading.ts` mobile). No `useWebStore()` equivalent.
3. **No CSS drop-shadow / blur filter on RN.** The web ember's glow uses `filter: drop-shadow(...)` + a
   `blur-md` div — neither exists in react-native-svg. Render the "lit" glow with RN-native means
   (`frontend-design`'s call): e.g. a `fillOpacity` lift, a soft `shadow*`/`elevation` on a wrapping `View`, or a
   faint concentric `<Circle>` halo. Keep it subtle and token-tinted; `motion-safe` → gate any animation behind
   `useReducedMotion()` from `react-native-reanimated` (already a dep) or simply ship it static (acceptable).
4. **The hook + components are NOT render-tested.** No headless RN renderer exists (stated verbatim in
   `use-reading-position.ts`). So `use-habit-summary.ts` (mobile) and the three components are **device-verified**,
   exactly like `useContinueReading` (06e) and `useSessionTracking` (07c). The pure `present-habit` seam IS
   Vitest-tested. This is the one place 08c has fewer tests than 08b (which had a jsdom render test) — by
   established precedent, not omission.

## Goal
Make the mobile Today tab habit-forward, matching web. Add two glanceable surfaces above Continue Reading:
- a **streak ember** — the flame motif showing `current` streak with status (`lit` / `at-risk` / `broken`),
  plus banked freezes when any;
- a **today's goal ring** — a circular progress ring of today's **active minutes** vs the target (default 20 min),
  clamped to a full ring at/over target.

Both read one seam: `deriveHabitSummary(sessions, today, targetActiveMs)` from `@ember/core` (08a), fed by
`today = localDayOf(Date.now(), -new Date().getTimezoneOffset())` and the user's stored
`GoalConfigRecord.targetActiveMs`. Warm, encouraging voice — a dim ember is "your ember's resting," never
"STREAK LOST" (ui-context brand). Copy strings are identical to 08b (the pure presenter is shared, below).

## Product decisions (carried verbatim from 08b — not new ambiguity)
All habit *behaviour* was resolved in 08a; all *presentation* copy/clamping was resolved in 08b. 08c only
decides the **native composition**, within ui-context:
- **Placement:** a compact **habit header** (ember + ring) sits between the greeting's hairline separator
  (`<View className="h-px w-12 bg-line" />`) and the Continue Reading section — the differentiator is glanceable
  on open. `frontend-design` has latitude on exact composition (side-by-side vs stacked) given the narrower
  phone column; keep it inside the existing `px-6` Today column.
- **Streak ember states / goal ring / freezes / out-of-scope:** identical semantics to 08b §"Product decisions"
  (lit → `streak-lit` + soft glow + Fraunces count; at-risk → `streak-risk` + "keep it lit today"; broken/zero →
  dim muted flame + "Start your streak"; ring arc = clamped `ratio`, center `N / 20 min`, "Goal met" when met,
  no >100%; freeze snowflake + count only when `freezesBanked > 0`; longest/heatmap/time-of-day are Stats unit 09).
  Reuse the existing `EmberFlame` flame path for motif parity where practical (it already matches the web mark).

## Implementation (apps/mobile only)

### Store surface — `apps/mobile/src/store/native-store.ts` (additive, mirrors 07c's recordSession seam)
Expose two **read-only** delegations on `NativeStore` (the engine functions are already in `@ember/store`):
- `listSessions(): Promise<ReadingSession[]>` → `listSessions(repo)` (no filter — derivation needs the whole log).
- `getGoalConfig(): Promise<GoalConfigRecord>` → `getGoalConfig(repo)` (returns the unpersisted 20-min default
  when unset, per 08a).
- **Not** exposed: `setGoalConfig` — editing the target is the Settings unit (17). 08c is read-only; it writes
  nothing (no outbox entry, no merge path — invariants #2/#5 untouched).
- Import `listSessions`, `getGoalConfig` + the `GoalConfigRecord` type from `@ember/store`; `ReadingSession` is
  already imported from `@ember/core` in this file. Match the file's existing import/delegation style:
  ```ts
  async listSessions(): Promise<ReadingSession[]> {
    return listSessions(repo);
  },
  async getGoalConfig(): Promise<GoalConfigRecord> {
    return getGoalConfig(repo);
  },
  ```

### Pure presenter — `apps/mobile/src/today/present-habit.ts` (new; copy 08b's verbatim)
A **byte-for-byte copy** of `apps/web/src/today/present-habit.ts` (pure, imports only `@ember/core` —
`HabitSummary`, `StreakStatus`). Same `HabitView` shape, same clamping (`Math.min(1, Math.max(0, ratio))`),
same `Math.round(ms / 60_000)`, same `goalLabel` (`` `${goalMinutes} / ${targetMinutes} min` ``), same
pluralization (`0`→`'Start your streak'`, else `` `${n} day${n === 1 ? '' : 's'}` ``), same status sublabels
(`lit`→`'Lit today'`, `at-risk`→`'Read today to keep it lit'`, broken/0→`'A few minutes is all it takes'`).
This is a deliberate per-platform copy (house style — each app keeps its own thin presenter; cf. 07c's
`session-tracker.ts` copy). Do **not** hoist to a shared package in this unit (YAGNI; would change boundaries).

### Read hook — `apps/mobile/src/today/use-habit-summary.ts` (new; mirrors use-continue-reading.ts mobile)
- `export interface HabitSummaryState { view: HabitView; loading: boolean }`.
- `export function useHabitSummary(): HabitSummaryState`:
  - `const { store, ready } = useNativeStore();` `useState<HabitView>(defaultView)` so first paint is neutral
    (broken/0, empty ring — no fake numbers); `loading` starts `true`.
  - Effect gated on `if (!ready || !store) return;` with a `cancelled` flag exactly like `useContinueReading`.
  - In the effect: `const today = localDayOf(Date.now(), -new Date().getTimezoneOffset());`
    `const [sessions, goal] = await Promise.all([store.listSessions(), store.getGoalConfig()]);`
    `const summary = deriveHabitSummary(sessions, today, goal.targetActiveMs);`
    `if (!cancelled) setView(presentHabit(summary));`. `finally` → `if (!cancelled) setLoading(false)`.
  - **Swallow read errors → the neutral default view** (invariant #1: Today must render offline even if a read
    fails): catch → `setView(defaultView())`. `defaultView()` =
    `presentHabit(deriveHabitSummary([], today, DEFAULT_GOAL_ACTIVE_MS))`.
  - Import `localDayOf`, `deriveHabitSummary`, `DEFAULT_GOAL_ACTIVE_MS` (+ `HabitView` from the local presenter)
    from `@ember/core` / `./present-habit.js`. Deps `[store, ready]`. No timers, no clock injection — computes
    `today` from the real clock like the greeting already does.

### Components (uniwind + react-native-svg, token-driven via `useResolveClassNames` — invariant #6)
- `apps/mobile/src/today/streak-ember.tsx` — flame `<Svg>` (reuse `EmberFlame`'s path shape for motif parity)
  tinted by status via resolved tokens (`bg-streak-lit` / `bg-streak-risk` / muted `bg-text-muted`), a subtle
  RN-native glow when `lit` (per platform-reality #3 — `frontend-design`'s choice), the `streakCount` in
  **Fraunces** (`0` shows no big number — just the encouraging label), `streakLabel` + `streakSublabel` in Inter
  (`font-sans`), and freeze pips (a small snowflake `<Svg>` + count) when `freezesBanked > 0`. The root `View`
  carries `accessibilityRole="image"` + `accessibilityLabel` e.g. `"3 days reading streak, lit today"` (or
  `"Start your streak — a few minutes is all it takes"` at zero); decorative SVG is hidden
  (`accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`).
- `apps/mobile/src/today/goal-ring.tsx` — two concentric react-native-svg `<Circle>`s (track in `line`, progress
  arc in `accent`, both resolved via `useResolveClassNames`) using `strokeDasharray`/`strokeDashoffset` driven by
  `ringFraction`, `transform="rotate(-90 ...)"` so it starts at top, `strokeLinecap="round"`. Use the same
  geometry as 08b (RADIUS 40, STROKE_WIDTH 8, viewBox 100). Center overlay (absolutely positioned `View`) shows
  `goalLabel` (Inter, `tabular-nums` where supported) + a quiet "Goal met" when `goalMet`.
  `accessibilityRole="image"` + `accessibilityLabel` e.g. `"Today's goal: 12 of 20 minutes"` / `"Today's goal
  met: 20 of 20 minutes"`. Arc animation optional (gate behind `useReducedMotion()` if added; static is fine).
- `apps/mobile/src/today/habit-header.tsx` — composes ember + ring; consumes `useHabitSummary()`; renders a calm
  **skeleton** (a quiet placeholder `View`, `accessibilityState={{ busy: true }}`,
  `accessibilityLabel="Loading habit summary"`, **no fake numbers**) while `loading`, then the two surfaces.
  Keep the warm card aesthetic consistent with the mobile `ContinueReadingCard`
  (`bg-surface-raised border border-line rounded-2xl`, generous padding).
- Wire into `apps/mobile/src/today/today-screen.tsx`: render `<HabitHeader />` in a labelled `<View>`
  (`accessibilityLabel="Reading habit"`) between the hairline separator and the Continue Reading `<View>`,
  inside the existing `ScrollView`/`px-6 py-10` column. **Important:** the screen currently early-returns a
  full-screen `ActivityIndicator` while `useContinueReading().loading` — the habit header must still appear when
  Continue Reading is present, and its own loading is owned by `useHabitSummary`/the skeleton, independent of the
  Continue Reading spinner (don't couple the two loading states). The greeting block and Continue Reading card
  are otherwise untouched.

### Tests
- `apps/mobile/src/today/present-habit.test.ts` (pure — no render; copy 08b's suite verbatim, vitest node env):
  - `broken`/empty summary → `streakCount 0`, `streakLabel 'Start your streak'`, `ringFraction 0`,
    `goalLabel '0 / 20 min'`, `goalMet false`, `streakSublabel` = the warm broken copy.
  - `lit`, `current 1` → `'1 day'` (singular); `current 3` → `'3 days'` (plural).
  - `at-risk` → the at-risk sublabel; status passes through.
  - ratio clamping: `0.5` → `0.5`; `1` → `1`, `goalMet true`; `1.7` → `ringFraction 1`, `goalMet true`, minutes
    reflect the real (over-target) active.
  - minutes rounding: `activeMs 750_000` → `13`; non-default target reflected in `targetMinutes`.
  - `freezesBanked` passes through (e.g. `2`); `0` passes through as `0`.
- `apps/mobile/src/tests/native-store-habit.test.ts` (new — thin seam test; mirror `native-store-session.test.ts`
  harness: `MemoryRepository` + `MemoryBlobStore` + fake `Hasher` + `createNativeClock` over in-memory storage):
  - `getGoalConfig()` with nothing stored → returns the unpersisted 20-min default
    (`targetActiveMs === DEFAULT_GOAL_ACTIVE_MS`, empty `updatedAt`).
  - `listSessions()` returns `[]` on an empty repo; after seeding via `recordSession` (the existing seam), returns
    those rows (delegation only — the 08a internals are already tested in `packages/store`).
- **No hook/component render test** — no headless RN renderer (same precedent as `use-continue-reading`/
  `use-session-tracking`). The hook's swallow-on-error, loading→resolved, and the visual surfaces are covered by
  the **Device-verify** section below.

## Dependencies
- none. Reuses `@ember/core` (`deriveHabitSummary`, `localDayOf`, `DEFAULT_GOAL_ACTIVE_MS`, `HabitSummary`,
  `StreakStatus`, `ReadingSession`), `@ember/store` (`listSessions`, `getGoalConfig`, `GoalConfigRecord`),
  `react-native-svg` + `uniwind` (already deps), the existing `EmberFlame` motif, and the
  `streak-lit`/`streak-risk`/`accent`/`line` tokens already in `@ember/tokens/theme.uniwind.css` (verified
  present — no tokens-boundary change).

## Verify when done
- [ ] Mobile Today renders the streak ember + goal ring above Continue Reading, derived from the live session
      log + stored goal target via `deriveHabitSummary` (no stored aggregate — invariant #3).
- [ ] The pure `present-habit` presenter is a faithful copy of 08b (same clamping/rounding/pluralization/copy);
      its Vitest suite is green.
- [ ] `useHabitSummary` gates on `ready`/`store`, swallows read errors to a neutral broken/empty view — Today
      renders with zero network and on read failure (invariant #1). 08c writes nothing (#2/#5 untouched).
- [ ] All UI is token-only — colors resolved via `useResolveClassNames`, never hardcoded (invariant #6);
      ember/ring carry `accessibilityRole="image"` + accessible labels; decorative SVG is hidden; no fake
      numbers while loading.
- [ ] `native-store` gains read-only `listSessions` + `getGoalConfig` delegations only; the thin seam test passes.
- [ ] `frontend-design` generated the RN ember + ring; `impeccable` polished them (incl. light/dark + a11y)
      before review.
- [ ] `pnpm -w typecheck` passes · `pnpm -w test` passes · `pnpm -w lint` clean.
- [ ] core/store/web/tokens byte-identical to main (apps/mobile-only diff). Existing mobile suites still green.

## Device-verify (user, before merge — Expo Go)
`pnpm --filter @ember/mobile start` (or `npx expo start --clear` in `apps/mobile`) → open the Today tab:
- With **no sessions**: a dim/unlit ember + "Start your streak" + an empty ring reading `0 / 20 min`; the page
  renders fully (greeting + Continue Reading) — nothing throws.
- **Read a PDF a few minutes** (07c session tracking produces the log), return to Today → the ring fills toward
  20 min and the ember lights with the day count + "Lit today".
- **Light and dark** both legible (toggle device/theme); the ember/ring re-theme via tokens.
- **Freeze pips** appear after a run that banks a freeze (≥5-day streak per 08a); a missed-but-frozen day still
  reads as a live streak, not a broken one.
- Confirm the habit header coexists with the Continue Reading card (both visible; loading states independent).
