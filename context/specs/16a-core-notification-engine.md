# Unit 16a: Core notification-decision engine (pure planner)

Issue: #131 · Branch: feat/131-core-notification-engine · Boundary: packages/core
Route: standard — one boundary, pure TS, no new dep, no UI; mirrors 14a/15a. Net-new logic
is contained (reuses `deriveStreak`/`deriveTodayGoal`/`localDayOf`); all product forks resolved.

First slice of umbrella #16. The pure brain that decides **what** notification (if any) to
schedule for a local day and **when** (local wall time). Delivery, cross-device dedupe
(primary-device election + delivery ledger, invariant #7), and platform scheduling defer to
16b (Convex) / 16c (web) / 16d (mobile). No syncable record, no store/convex/apps change here.

## Goal
Add `packages/core/src/notification.ts` exporting a pure `planNotifications(input)` that returns
the ordered candidate `NotificationPlan[]` for today **and** the single `selected` plan honoring
the ≤1/local-day cap, plus `learnBestHour(sessions, …)`. Caller supplies `now`/`tzOffsetMinutes`
(no `Date.now()`). Fully unit-tested. Barrel-exported.

## Implementation

### `packages/core/src/notification.ts`
All times are wall-clock ms epochs in, and the function derives local hour/day via existing
`localDayOf` + arithmetic (`(now + tzOffsetMinutes*60_000)`); **never** `Date.now()`/`new Date()`
for ordering. Reuse `deriveStreak` + `deriveTodayGoal` from `./streak.js`, `ReadingSession` +
`localDayOf` from `./session.js`.

**Types & constants**
- `NotificationType = 'streak-risk' | 'best-time' | 'goal-progress' | 'lapse-reengage'`.
- `NotificationPlan = { type: NotificationType; localDay: string; dedupeKey: string;
  scheduledWall: number; priority: number }` where `dedupeKey = \`${type}:${localDay}\`` (this is
  the key 16b's server ledger / invariant #7 dedupes on) and `scheduledWall` = wall ms epoch of
  the plan's local anchor hour on `localDay`.
- `NOTIFICATION_PRIORITY: Record<NotificationType, number>` — **streak-risk(0) > goal-progress(1)
  > best-time(2) > lapse-reengage(3)** (lower = higher priority; protect an active streak first,
  then push partial progress over the line, then the habitual nudge, then win-back last).
- `NotificationConfig` (all optional, these defaults) — drives every decision so the engine stays
  input-pure and #17 can later override per-user:
  - `goalTargetMs = DEFAULT_GOAL_ACTIVE_MS` (reuse from streak.ts)
  - `quietStartHour = 8`, `quietEndHour = 22` (waking window `[8,22)`, local)
  - `defaultBestHour = 20`, `bestTimeWindowSessions = 30`, `bestTimeMinSessions = 5`
  - `goalProgressHour = 15`, `streakRiskHour = 21`
  - `lapseDays = 3`
- Export the resolved defaults as a named `DEFAULT_NOTIFICATION_CONFIG` constant.

**`learnBestHour(sessions, config?) : number`**
Modal local start-hour over the most-recent `bestTimeWindowSessions` sessions (sort by
`startedAt` desc, take N). Local hour of a session = `Math.floor(((s.startedAt +
s.tzOffsetMinutes*60_000) % 86_400_000) / 3_600_000)`. If fewer than `bestTimeMinSessions`
qualifying sessions → return `defaultBestHour`. Ties broken by earliest hour (deterministic).

**`planNotifications(input) : { candidates: NotificationPlan[]; selected: NotificationPlan | null }`**
`input = { sessions: ReadingSession[]; now: number; tzOffsetMinutes: number; config?: Partial<NotificationConfig> }`.
1. Resolve config over defaults. Compute `today = localDayOf(now, tzOffsetMinutes)`,
   `streak = deriveStreak(sessions, today)`, `goal = deriveTodayGoal(sessions, today, goalTargetMs)`.
2. Build a candidate per applicable type (each at its anchor hour, converted to `scheduledWall`
   on `today`):
   - **streak-risk** @ `streakRiskHour` — when `goal.met === false` **and** `streak.current > 0`
     **and** `streak.status !== 'lit'` (i.e. today still unread → streak would break/consume a
     freeze). (Already-read suppression is implicit: `goal.met` or `status==='lit'` cancels it.)
   - **goal-progress** @ `goalProgressHour` — when `goal.met === false` **and** `goal.activeMs > 0`
     (partial progress, not yet done).
   - **best-time** @ `learnBestHour(sessions, config)` — when `goal.met === false` (the habitual
     "time to read" nudge; suppressed once today's goal is met / already read enough).
   - **lapse-reengage** @ `defaultBestHour` — when `streak.status === 'broken'` **and**
     `daysSince(lastReadDay, today) >= lapseDays` (`lastReadDay === null` counts as lapsed only if
     there is ≥1 session; with zero sessions, no lapse nudge — nothing to re-engage). Use a small
     local `daysBetween(dayA, dayB)` helper over the `YYYY-MM-DD` labels (reuse `nextLocalDay`
     stepping or date-label diff; no tz math — labels are dates, per streak.ts precedent).
3. **Quiet-hours filter:** drop any candidate whose anchor hour is outside `[quietStartHour,
   quietEndHour)`.
4. `candidates` = surviving plans sorted ascending by `priority`.
5. `selected` = `candidates[0] ?? null` (the ≤1/day cap — single highest-priority plan).

Keep it pure and allocation-clean (mirror streak.ts style/comments). No uuid, no clock, no I/O.

### `packages/core/src/index.ts`
Append `export * from './notification.js';` (keep ordering after smart-view).

## Dependencies
- none (no new runtime dep; pure TS reusing existing core modules).

## Verify when done
- [ ] `learnBestHour` returns the modal recent-session start-hour, and `defaultBestHour` when
      `< bestTimeMinSessions` sessions; tie → earliest hour.
- [ ] `planNotifications`: streak-risk fires for an at-risk unread day with goal unmet and is
      suppressed once `goal.met`/`status==='lit'`; goal-progress requires partial progress;
      best-time suppressed when goal met; lapse-reengage only after `lapseDays` of no reading.
- [ ] Quiet-hours drops out-of-window anchors; `selected` is the single highest-priority survivor
      (≤1/day), `null` when no candidate; `dedupeKey === \`${type}:${localDay}\``.
- [ ] No `Date.now()`/ordering-`new Date()`; core stays platform-API-free (code-standards).
- [ ] `pnpm -w typecheck` passes (9 tasks)
- [ ] `pnpm -w test` passes (new `notification.test.ts`; core count rises)
- [ ] `pnpm -w lint` clean (6 tasks)
- [ ] No invariant in architecture.md violated (#1 core purity; #7 dedupeKey is the per-(type,day)
      key the server ledger will enforce — engine doesn't itself do cross-device election)
