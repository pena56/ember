# Unit 17h: Mobile Settings primary-device picker

Issue: #156 · Branch: feat/156-mobile-primary-device-picker · Boundary: apps/mobile
Route: **standard** — one boundary (mobile app), UI unit, no new dep, seam already landed in 17g.
SECOND slice of the split **explicit-primary** feature: **17g** convex foundation (MERGED, #154) →
**17h** mobile Settings device-picker (this) → **17i** web Settings device-picker. Mobile only.

## Goal
Let the user choose, in the mobile Settings modal, which of their registered devices is the primary
push target. List the owner's devices from `getNotificationState`, radio-select the primary, and call
the `setPrimaryDevice({ deviceId })` mutation landed in 17g. The convex election already prefers the
designated `isPrimary && hasToken` device and falls back to recency; this slice is purely the client
surface that reads the state and writes the choice. No convex change, no store change, no core change.

### Resolved decisions (baked — user may veto, do NOT re-litigate in the executor)
- **Own Section card titled "Push device", placed AFTER the Notifications section** (a sibling
  `Section`, not nested inside Notifications). It concerns *routing* (which device buzzes), a distinct
  concern from the per-type/quiet-hours *content* controls.
- **NOT gated by this device's push-enablement.** Unlike the per-type rows (dimmed when *this* device's
  push is off), the picker stays active regardless — the user may designate a *different* device as
  primary from here. The picker's own eligibility signal is per-device `hasToken`, shown as annotation.
- **A tokenless device (`hasToken === false`) is still SELECTABLE**, shown with a muted
  "Not receiving push yet" subtext. Do NOT hard-disable it. Rationale: the choice is a *preference*
  (17g) — the election falls back to recency in the interim, so designating a device you're about to
  enable is valid and avoids a chicken-and-egg gate. (This is the exact call 17g deferred to the client.)
- **Fewer than 2 devices → no radios.** Render one muted informational row instead
  ("Only this device is registered. Sign in on another device to choose where your nudges land.").
  A one-device picker is meaningless; don't show a lone always-checked radio.
- **Single-select radio semantics.** Selecting a row calls `setPrimaryDevice` for that device; the
  convex mutation enforces exactly-one-primary server-side. The current device is marked ("This
  device") and sorted first; remaining devices follow by most-recently-active.
- **"Primary" governs the async PUSH target only** (carried from 17g). Copy should convey "which
  device gets the nudge when you're not actively reading" in a warm, second-person tone — do NOT
  over-explain foreground/`claimSlot` mechanics to the user.

## Implementation

### `apps/mobile/src/notify/notification-port.ts` — widen the port
- Widen `getNotificationState`'s return `devices` element to the full shape convex already returns
  (17g): `{ deviceId: string; platform: 'ios' | 'android' | 'web'; hasToken: boolean; lastSeenAt: number; isPrimary: boolean }[]`.
  (`use-push-enablement.ts` reads only `.deviceId`/`.hasToken` — widening is additive, it still compiles.)
- Add one method: `setPrimaryDevice(args: { deviceId: string }): Promise<unknown>;` with a short
  doc-comment (designates the owner's primary push device; server enforces exactly-one-per-owner).

### `apps/mobile/src/notify/convex-notification-port.ts` — adapter passthrough
- Add `setPrimaryDevice: (a) => convex.mutation(api.notifications.setPrimaryDevice, a),`. The existing
  `getNotificationState` passthrough already returns the widened rows (17g) — no change there.

### `apps/mobile/src/settings/device-picker-rows.ts` — pure ordering seam (the tested logic)
Pure, RN-free, no clock. `deriveDevicePickerRows({ devices, currentDeviceId })` →
`DevicePickerRow[]` where `DevicePickerRow = { deviceId; platform; isPrimary; hasToken; isCurrent }`.
- **Order:** the current device (`deviceId === currentDeviceId`) first; then the rest by `lastSeenAt`
  descending, tie-break `deviceId` ascending (mirror 17g's deterministic election tie-break so the UI
  order is stable and predictable). `isCurrent = deviceId === currentDeviceId`.
- Keep it allocation-light; it is the single place device order/marking is decided (invariant #5 — the
  hook and screen carry zero decision logic).

### `apps/mobile/src/settings/format-last-seen.ts` — pure relative formatter
Mirror `format-hour.ts` style. `formatRelativeLastSeen(now: number, lastSeenAt: number): string` →
`"Active just now"` (<60s), `"Active 5m ago"`, `"Active 3h ago"`, `"Active 2d ago"` (integer floor at
each unit; clamp negatives to "just now"). Pure — `now` is INJECTED (no `Date.now()` inside; the
component passes `Date.now()`, which is fine outside core). Co-located `format-last-seen.test.ts`.

### `apps/mobile/src/notify/use-primary-device.ts` — thin hook (typecheck-only glue)
Mirror `use-push-enablement.ts`'s gating + lazy-port + `useFocusEffect` pattern exactly.
- `useConvexAuth().isAuthenticated`; `useSyncBundle()` for `deviceId` (the current device).
- Lazy convex port singleton in a ref (identical `getPort` pattern to use-push-enablement); accept an
  optional injected `{ port }` for future testing symmetry.
- State: `devices` (`GetNotificationStateDevices[]`, seeded `[]`).
- `refresh` (in `useFocusEffect`): if `!isAuthenticated || bundle === null` return; else
  `const { devices } = await port.getNotificationState(); setDevices(devices);` — async, off the
  render path, fail-soft (offline / null convex keeps current list). Same invariant-#1 class as
  use-push-enablement's registration read.
- `setPrimary(deviceId)`: gate (no-op if unauth / bundle null); **optimistic** — immediately set local
  `devices` so exactly the chosen row has `isPrimary: true` (others false); then
  `void port.setPrimaryDevice({ deviceId }).catch(() => {})` fire-and-forget / fail-soft; a focus
  re-read reconciles. No Convex on the render path (invariant #1).
- Return `{ devices, currentDeviceId: bundle?.deviceId ?? null, ready: isAuthenticated && bundle !== null, setPrimary }`.

### `apps/mobile/src/settings/settings-screen.tsx` — new presentational section
The screen stays presentational (props in, no data hooks). Add props for the picker and a new
`DeviceSection` rendered after `NotificationsSection`:
- New props on `SettingsScreenProps` + threaded into a `DeviceSection`:
  `devices: DevicePickerRow[]` (already ordered — pass the result of `deriveDevicePickerRows` from the
  route), `currentDeviceId: string | null`, `nowMs: number` (pass `Date.now()` from the route so the
  component stays clock-free-testable), `onSelectPrimary: (deviceId: string) => void`.
- `DeviceSection` uses the existing `Section` shell (`label="Push device"`), with a short warm priming
  line ("Choose which device gets your daily nudge when you're away.").
- **≥2 devices:** a radio group. Each row a `Pressable` with `accessibilityRole="radio"`,
  `accessibilityState={{ checked: row.isPrimary }}`, `accessibilityLabel` = platform display name +
  (row.isCurrent ? " · This device" : ""), `accessibilityHint` = "Sends your daily nudge to this device".
  Visible content: platform label (`PLATFORM_LABELS` exhaustive `Record<'ios'|'android'|'web', string>`
  → "iPhone"/"Android"/"Web" — a new platform value becomes a TS error, not a silent blank), a "This
  device" chip when `isCurrent`, a muted `formatRelativeLastSeen(nowMs, lastSeenAt)` line, and a muted
  "Not receiving push yet" line when `!hasToken`. A token-painted selected indicator (filled dot / check
  via `useResolveClassNames`, `bg-accent` selected vs `border-line` unselected — invariant #6, mirror
  the existing `EmberToggle` token approach). Hairline dividers between rows (`h-px bg-line mx-5`).
- **<2 devices:** a single muted informational row (no radios) with the copy above.
- Build this section with **frontend-design** (net-new UI), then audit with **impeccable** before
  review; honour `context/ui-context.md` tokens. Match the existing card/hairline/`px-5 py-4` idiom.

Note `DevicePickerRow` needs a shared type — export it from `device-picker-rows.ts` and import it in
the screen (keeps the screen presentational over an already-decided row list).

### `apps/mobile/app/settings.tsx` — wire the hook
- In `SettingsRouteInner`, add `const { devices, currentDeviceId, setPrimary } = usePrimaryDevice();`.
- Compute ordered rows at the route: `deriveDevicePickerRows({ devices, currentDeviceId })` and pass
  into `<SettingsScreen … devices={rows} currentDeviceId={currentDeviceId} nowMs={Date.now()} onSelectPrimary={setPrimary} />`.
  (The route already owns hooks and passes props down — same split as the existing prefs/push wiring.)

## Tests (TDD — red first)
Headless CI cannot render RN, so cover the pure seams; the hook + screen are typecheck-only glue
(consistent with use-push-enablement / use-notification-preferences being untested).
### `apps/mobile/src/settings/device-picker-rows.test.ts`
- Current device sorts first even when another has a newer `lastSeenAt`.
- Non-current devices order by `lastSeenAt` desc, tie-break `deviceId` asc.
- `isCurrent` true only for `currentDeviceId`; `isPrimary`/`hasToken` pass through unchanged.
- Empty `devices` → `[]`; single device → one row flagged `isCurrent`.
- `currentDeviceId` null (unauth/no bundle) → no row flagged current; order by recency only.
### `apps/mobile/src/settings/format-last-seen.test.ts`
- `<60s` → "just now"; exact minute / hour / day boundaries; multi-unit floors (e.g. 90m → "1h ago");
  negative delta (clock skew) clamps to "just now".

## Dependencies
- none. Consumes 17g's `setPrimaryDevice` + widened `getNotificationState` (both merged).

## Verify when done
- [ ] Port widened: `getNotificationState` devices carry `platform/hasToken/lastSeenAt/isPrimary`;
      `setPrimaryDevice` added to port + convex adapter; use-push-enablement still compiles.
- [ ] `deriveDevicePickerRows` orders current-first then recency (tie-break id), marks `isCurrent`,
      passes `isPrimary`/`hasToken` through; handles empty / single / null-current.
- [ ] `formatRelativeLastSeen` covers just-now / m / h / d and clamps negatives; pure (injected `now`).
- [ ] `use-primary-device` gates on auth+bundle, refreshes on focus (fail-soft, off render path),
      `setPrimary` is optimistic + fire-and-forget (invariant #1 — no Convex on the render path).
- [ ] "Push device" section renders after Notifications; ≥2 devices → radio group (single-select,
      current marked + first, tokenless annotated but selectable); <2 devices → informational row.
- [ ] Section built via frontend-design + audited with impeccable; token-only (invariant #6);
      radios carry `accessibilityRole="radio"` + `accessibilityState.checked`; platform labels exhaustive.
- [ ] Invariant #5 — order/marking decided only in `deriveDevicePickerRows`; hook/screen carry no
      decision logic. Invariant #7 unaffected (UI only records the choice; election/ledger unchanged).
- [ ] `pnpm -w typecheck` · `pnpm -w test` · `pnpm -w lint` all clean.
- [ ] **DEVICE-BOUND (owed, user):** on a real build with ≥2 registered devices — radios render,
      selecting one persists (reopen modal → same primary), tokenless device shows the annotation,
      one-device state shows the informational row. (Headless CI can't render RN — same class as
      owed 17a/17d verification.)

## Out of scope (later)
- **17i** web Settings device-picker (the web sibling — same seam, web store/UI).
- The **stale-intent claim-review** correctness gap (disable-a-type-after-submit cancels the pending
  server intent) — separate queued unit.
- Renaming misleading `quiet*Hour` fields / "Quiet hours" copy — **Issue #153**.
