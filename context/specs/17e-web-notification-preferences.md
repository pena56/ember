# Unit 17e: Web Settings parity — notification preferences

Issue: #149 · Branch: feat/149-web-notification-preferences · Boundary: apps/web
Route: standard — one boundary (web app), UI unit, no new dep, ambiguity resolved.

## Goal
Web sibling of 17d: surface the 17c persisted `NotificationPreferences` on web via a dedicated
`/settings` route — four per-type toggles + a quiet-hours window — read/written through the web
store so changes persist + sync via the existing outbox (LWW reconciler). Mirrors 17d's data
flow; the platform differences are deliberate and decided below.

### Resolved decisions (do not re-litigate)
- **Parity only.** This slice is web-store get/set + the web Settings UI. It does NOT wire prefs
  into the planner — that's the separate cross-platform slice **#150** (17f), which reads prefs
  into `deriveNotificationSync` on both mobile + web at once. So, like 17d today, the toggles
  here persist + sync but are **behaviourally inert until #150**. State this in a short code
  comment near the toggles so it isn't mistaken for a bug.
- **Dedicated `/settings` route** (not a dialog) inside the AppShell layout, plus a "Settings"
  nav tab — matches the approved nav (`Today · Library · Stats · Settings`).
- **No push-gate.** Web has no push-enablement surface (no 17a equivalent — `useNotificationSync`
  runs directly), so there is no "enable first" gate: the controls are always active. (Browser
  Notification-permission gating is a separate future concern, explicitly out of scope.)

## Implementation

### `apps/web/src/store/web-store.ts` — two pass-throughs
Mirror the existing `getGoalConfig` (read) and the clock-injected mutating methods.
- Import from `@ember/store`: `getNotificationPreferences`, `setNotificationPreferences`,
  `type NotificationPreferencesRecord`; from `@ember/core`: `type NotificationPreferences`.
- Add to the `WebStore` interface + `createWebStore` factory:
  - `getNotificationPreferences(): Promise<NotificationPreferencesRecord>` → `return getNotificationPreferences(repo);`
  - `setNotificationPreferences(prefs: NotificationPreferences): Promise<NotificationPreferencesRecord>` →
    `return setNotificationPreferences({ repo, hlc: clock.nextStamp(), newOutboxId: () => clock.newOutboxId() }, prefs);`
    (exactly one HLC stamp per call — invariant #2, guaranteed inside 17c).
  - Doc-comment both in house style.

### `apps/web/src/components/ui/switch.tsx` — new shadcn-style primitive
A thin shadcn-idiom wrapper over the umbrella `radix-ui` package's `Switch` (already a dep — NO
new dependency). Token-only classes (invariant #6: `bg-accent` checked / `bg-text-muted`
unchecked track, `bg-surface-raised` thumb), `focus-visible` accent ring matching the rest of
`components/ui`. Forwards ref + `checked`/`onCheckedChange`/`disabled` props; Radix gives the
`role="switch"` + keyboard semantics for free. Keep it generic (no notification-specific copy).

### `apps/web/src/settings/format-hour.ts` — pure formatter
Mirror mobile's `format-hour.ts`: `formatHour(hour: number): string` → 12-h display
(`0→"12 AM"`, `8→"8:00 AM"`, `12→"12 PM"`, `22→"10 PM"`, `24→"Midnight"`). Pure, no DOM. Add a
co-located `format-hour.test.ts` covering the same branch points (0 / AM / noon / PM / 24).
(Small duplication of the mobile helper is intentional — no cross-package refactor in this slice.)

### `apps/web/src/settings/hour-field.tsx` — bespoke hour stepper
Web analog of mobile's `HourField` for one whole-hour 0–24 value. Use the existing shadcn
`Button` (ghost/outline) for `−`/`+` (no new Radix Select dep). Props
`{ label; hour; onChange; disabled? }`. `−`/`+` clamp + self-disable at 0 / 24; display via
`formatHour`; emits an integer in range. a11y: a labelled group with `role="group"`/`aria-label`
and the buttons carrying `aria-label` ("earlier"/"later"); value announced via the visible text.
Token-only.

### `apps/web/src/settings/use-notification-preferences.ts` — hook
Web glue (thin; typecheck-covered). `useWebStore()` for the store. Local `prefs` seeded from
`DEFAULT_NOTIFICATION_PREFERENCES` (`@ember/core`). Load once on mount via `useEffect`
(cancelled-flag guard) and re-read on `window` `focus` (so a sync from another device reflects on
return) — fail-soft. Optimistic `setEnabledType(type, enabled)` / `setQuietHours(start, end)` that
build the full next `NotificationPreferences`, update local state immediately, and persist
fire-and-forget + fail-soft (no Convex on the render path — invariant #1). Return
`{ prefs, ready, setEnabledType, setQuietHours }`.

### `apps/web/src/settings/settings-page.tsx` — the page (net-new UI)
Build with `frontend-design`, audit with `impeccable`; honour `ui-context.md`. Column shell
matching the other tabs: `mx-auto w-full max-w-2xl px-6 py-10`. A `font-serif` "Settings" header.
A **Notifications** section card (`rounded-2xl bg-surface-raised border border-line`) containing:
- 4 per-type rows (label + `Switch`) in `NOTIFICATION_PRIORITY` order — derive `ORDERED_TYPES`
  from the priority map (don't hand-list); `TYPE_LABELS: Record<NotificationType, string>`
  exhaustive (a new type → TS error, not a silent drop). Labels: streak-risk→"Streak risk",
  goal-progress→"Goal progress", best-time→"Best time", lapse-reengage→"Lapse re-engage".
- A **Quiet hours** row with two `HourField`s (From `quietStartHour`, To `quietEndHour`).
- Warm priming copy line (second person, no exclamation), consistent with mobile's tone.
- The short "inert until #150" comment near the toggles.
Presentational where practical: the page may call `useNotificationPreferences()` directly (web
pages own their hooks — cf. `stats-page` → `useStats`); no extra route wrapper needed.

### `apps/web/src/App.tsx` — route
Add `<Route path="settings" element={<SettingsPage />} />` inside the `<AppShell/>` layout route
(alongside today/library/stats).

### `apps/web/src/app-shell.tsx` — nav
Add `<Tab to="/settings">Settings</Tab>` after the Stats tab in the Primary `<nav>`.

## Dependencies
- none (`radix-ui` umbrella already provides `Switch`; `react-router` already present).

## Verify when done
- [ ] Toggling a type flips its `Switch` immediately and persists: a later
      `getNotificationPreferences()` reflects it (one outbox entry per change — 17c).
- [ ] Changing a quiet-hours field persists the new 0–24 integer; a focus re-read shows the
      saved value, not the default.
- [ ] `/settings` renders inside the shell; the Settings nav tab activates (underline) on it.
- [ ] Type rows render in `NOTIFICATION_PRIORITY` order with correct labels; all four present.
- [ ] `Switch` + `HourField` are token-only (no hardcoded colors, invariant #6); proper a11y
      (Radix `switch` role; hour group labelled, buttons labelled, value announced).
- [ ] `settings-page` built via frontend-design + audited with impeccable; matches the other
      tabs' column shell + card idiom.
- [ ] A `web-store-notification-preferences.test.ts` (mirroring the other `web-store-*` tests)
      asserts get-default / set-persists / exactly one outbox entry per set.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean
- [ ] No invariant violated (#1 reads local / writes via outbox off the render path; #2 one HLC
      stamp per set; #5 no merge logic here; #6 token-only).

## Out of scope (tracked elsewhere)
- Planner consumption of prefs (`resolveNotificationConfig` → `deriveNotificationSync`) on both
  platforms — **Issue #150 (Unit 17f)**. Without it the toggles here are inert by design.
- Account / Theme sections on the new page — the theme control already lives in the shell nav;
  these can grow the page later.
