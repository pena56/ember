# Unit 17i: Web Settings primary-device picker

Issue: #158 · Branch: feat/158-web-primary-device-picker · Boundary: apps/web
Route: **standard** — one boundary (web app), UI unit, no new dep (radix-ui already present), seam landed in 17g.
THIRD / final slice of the split **explicit-primary** feature: **17g** convex foundation (MERGED, #154) →
**17h** mobile Settings device-picker (MERGED, #156) → **17i** web Settings device-picker (this). Web only.

## Goal
Give the web Settings page the same "Push device" picker 17h gave mobile: list the owner's registered
devices from `getNotificationState`, radio-select the primary, and call the `setPrimaryDevice({ deviceId })`
mutation landed in 17g. Behaviour, copy, and decisions are a faithful web sibling of 17h — only the platform
surface differs (shadcn/radix instead of RN, page-owns-hooks instead of route/screen split, jsdom-testable
presentational card). No convex change, no store change, no core change.

Concretely, on web the *current* device is the browser, which today has `hasToken: false` (no web-push
token pipeline exists yet). So the current row will honestly read "Not receiving push yet" while a registered
phone reads its last-seen — this is exactly the cross-device value: read on web, designate the phone as the
nudge target.

### Resolved decisions (baked — user may veto, do NOT re-litigate in the executor)
Carried verbatim from 17h (parity is the point); web-specific clarifications noted:
- **Own card titled "Push device", placed AFTER the Notifications card** in `settings-page.tsx` — a sibling
  `<section>` card, same `rounded-2xl bg-surface-raised border border-line` shell. Routing (which device
  buzzes) is a distinct concern from the per-type/quiet-hours content controls.
- **NOT gated by anything.** Web has no push-enable surface at all (17e established this — web controls are
  always active), so there is nothing to gate on. The picker's per-device eligibility signal is `hasToken`,
  shown as annotation, never as a hard gate.
- **A tokenless device (`hasToken === false`) is still SELECTABLE**, shown with a muted "Not receiving push
  yet" subtext. Do NOT disable it. The election (17g) falls back to recency in the interim, so designating a
  device you're about to enable is valid — the exact call 17g deferred to the client. (On web the *current*
  browser is itself tokenless today; it must remain selectable.)
- **Fewer than 2 devices → no radios.** Render one muted informational row instead ("Only this device is
  registered. Sign in on another device to choose where your daily nudge lands."). A one-device picker is
  meaningless; don't show a lone always-checked radio.
- **Single-select radio semantics.** Selecting a row calls `setPrimaryDevice` for that device; the convex
  mutation enforces exactly-one-primary server-side. The current device is marked ("This device") and sorted
  first; remaining devices follow by most-recently-active (tie-break deviceId asc — mirrors 17g).
- **"Primary" governs the async PUSH target only** (carried from 17g). Warm, second-person copy conveying
  "which device gets the nudge when you're away" — do NOT explain foreground/`claimSlot` mechanics.
- **No `convex === null` guard needed** (web-specific): `apps/web/src/convex/convex-client.ts` *throws* at
  import if `VITE_CONVEX_URL` is unset — web has no offline-local no-convex mode (unlike mobile), and
  `ConvexAuthProvider` always wraps the app. So `useConvexAuth` is always safe on the Settings page; no
  `Redirect` guard (mobile needed one because `convex` there can be null).

## Implementation

### `apps/web/src/notify/use-notification-sync.ts` — widen the inline port
Web's `NotificationPort` is defined **inline here** (not in a separate `notification-port.ts` like mobile);
`convex-notification-port.ts` and the tests import it from this file. Widen it in place (do NOT extract a new
file — that is out-of-scope churn; a future symmetry refactor can extract it):
- Add an exported `interface NotificationStateDevice { deviceId: string; platform: 'ios' | 'android' | 'web';
  hasToken: boolean; lastSeenAt: number; isPrimary: boolean }` (the full shape 17g's `getNotificationState`
  returns — no raw tokens).
- Add two methods to `NotificationPort`:
  - `getNotificationState(): Promise<{ devices: NotificationStateDevice[] }>;`
  - `setPrimaryDevice(args: { deviceId: string }): Promise<unknown>;` with a short doc-comment (designates the
    owner's primary push device; server enforces exactly-one-per-owner).
  The sync scheduler itself does not call these — they ride the same single web `NotificationPort` so the
  picker hook reuses the identical lazy-port machinery.

### `apps/web/src/notify/convex-notification-port.ts` — adapter passthrough
Add the two passthroughs to the returned object:
- `getNotificationState: () => convex.query(api.notifications.getNotificationState, {}),`
- `setPrimaryDevice: (a) => convex.mutation(api.notifications.setPrimaryDevice, a),`

### `apps/web/src/settings/device-picker-rows.ts` — pure ordering seam (verbatim port)
Copy `apps/mobile/src/settings/device-picker-rows.ts` **verbatim** (it is pure, RN-free, platform-agnostic
TS — no adaptation). Exports `interface DevicePickerRow { deviceId; platform: 'ios'|'android'|'web';
isPrimary; hasToken; lastSeenAt; isCurrent }` and `deriveDevicePickerRows({ devices, currentDeviceId })`:
current device first, then others by `lastSeenAt` desc tie-break `deviceId` asc; non-mutating (`.filter()`
then `.sort()`); empty → `[]`; null-current → no row flagged. It is the single place order/marking is decided
(invariant #5 — the hook and card carry zero decision logic). Cross-app import from `apps/mobile` would be a
boundary violation — duplication is the established pattern (format-hour was duplicated web↔mobile in 17e).
Also copy the test → `apps/web/src/tests/device-picker-rows.test.ts` (13 cases, verbatim).

### `apps/web/src/settings/format-last-seen.ts` — pure relative formatter (verbatim port)
Copy `apps/mobile/src/settings/format-last-seen.ts` **verbatim**: `formatRelativeLastSeen(now, lastSeenAt)`
→ "Active just now" (<60s), "Active Nm/Nh/Nd ago", negative delta clamps to "just now". Pure, `now` injected.
Copy its test → `apps/web/src/tests/format-last-seen.test.ts` (11 cases, verbatim).

### `apps/web/src/settings/use-primary-device.ts` — thin web hook (typecheck-only glue)
Web analog of mobile's `use-primary-device.ts`, but using **web idioms** — mirror `use-notification-sync.ts`
(lazy convex port) + `use-notification-preferences.ts` (mount load + window-`focus` re-read):
- `useConvexAuth().isAuthenticated`; `useSyncBundle()` for `deviceId` (the current device).
- Lazy convex port singleton via the same `getPort()` pattern as `use-notification-sync` — `import('../convex/
  convex-client.js')` + `import('./convex-notification-port.js')`, kept in a ref so it survives re-renders;
  accept an optional injected `{ port }` for test symmetry. (No `convex === null` check — web's client throws
  at import if unset; mirror `use-notification-sync`, which passes `convex` straight through.)
- State: `devices: NotificationStateDevice[]` (seeded `[]`) and `nowMs: number` (seeded `Date.now()`).
- Load on mount + re-read on **window `'focus'`** (NOT `useFocusEffect` — that's expo-router; web uses the
  `window.addEventListener('focus', …)` pattern from `use-notification-preferences`). Refresh: if
  `!isAuthenticated || bundle === null` return; else `const { devices } = await port.getNotificationState();
  setDevices(devices); setNowMs(Date.now());` — async, off the render path, fail-soft (offline / error keeps
  the current list). Cancelled-flag guard on unmount like `use-notification-preferences`.
- `setPrimary(deviceId)`: gate (no-op if unauth / bundle null); **optimistic** — immediately set local
  `devices` so exactly the chosen row has `isPrimary: true` (others false); then
  `void getPort().then((port) => port.setPrimaryDevice({ deviceId })).catch(() => {})` fire-and-forget /
  fail-soft; a focus re-read reconciles. No Convex on the render path (invariant #1).
- Return `{ devices, currentDeviceId: bundle?.deviceId ?? null, nowMs, ready: isAuthenticated && bundle !==
  null, setPrimary }`.
- **Capture `nowMs` in the hook, never call `Date.now()` in the card's render** — mirrors 17h's final form
  (the mobile spec's `nowMs={Date.now()}` in render tripped a purity lint; capturing on refresh is the fix and
  keeps the card pure + testable). The card receives `nowMs` as a prop.
- Untested thin glue (typecheck-only, consistent with `use-notification-preferences` being untested).

### `apps/web/src/components/ui/radio-group.tsx` — shadcn/radix RadioGroup wrapper (NO new dep)
New primitive over the `radix-ui` umbrella's `RadioGroup` (already a dependency — same source as `switch.tsx`;
NO new dep). Mirror `switch.tsx`'s wrapper style + token-only classes (invariant #6):
- Export `RadioGroup` (over `RadioGroupPrimitive.Root`) and `RadioGroupItem` (over `RadioGroupPrimitive.Item`
  containing `RadioGroupPrimitive.Indicator` with a token-painted filled dot).
- Unchecked item: `border border-line` ring; checked: `border-accent` + `bg-accent` filled indicator dot.
  Focus ring `focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ring-offset-surface`.
  `disabled:opacity-50` for completeness though we never disable rows here.
- Radix gives `role="radiogroup"` on the root + `role="radio"`, roving tabindex, arrow-key nav, and
  `aria-checked` on each item for free — do not hand-roll a11y.

### `apps/web/src/settings/push-device-card.tsx` — presentational card (jsdom-testable)
A **pure presentational** component (props in, no data hooks — unlike the page, so it unit-tests without any
convex/bundle mocking; this is the render coverage the RN side of 17h could not get). Signature:
`PushDeviceCard({ rows, nowMs, onSelectPrimary }: { rows: DevicePickerRow[]; nowMs: number; onSelectPrimary:
(deviceId: string) => void })`.
- Same card shell as `NotificationsCard` (`rounded-2xl bg-surface-raised border border-line`, uppercase
  caption "Push device", priming line "Choose which device gets your daily nudge when you're away.").
- Exhaustive `const PLATFORM_LABELS: Record<'ios'|'android'|'web', string> = { ios: 'iPhone', android:
  'Android', web: 'Web' }` (a new platform value → TS error, not a silent blank).
- **`rows.length >= 2`:** a `<RadioGroup value={<the isPrimary row's deviceId, or ''>}
  onValueChange={onSelectPrimary}>` with one row per device. Each row = a `<label>` wrapping the row content
  and a `<RadioGroupItem value={row.deviceId} id={…} aria-label={PLATFORM_LABELS[row.platform] + (row.isCurrent
  ? ' · This device' : '')}>`; clicking the row selects it. Visible content: platform label, a "This device"
  chip when `row.isCurrent`, a muted `formatRelativeLastSeen(nowMs, row.lastSeenAt)` line, and a muted "Not
  receiving push yet" line when `!row.hasToken`. Hairline dividers between rows (`divide-y divide-line` or
  `h-px bg-line`), matching `NotificationsCard`.
- **`rows.length < 2`:** a single muted informational row (no RadioGroup) with the copy from the decisions
  above. (`rows.length === 0` — pre-load / unauth — renders the same informational row; harmless.)
- Token-only (invariant #6). Build via **frontend-design** (net-new card), then audit with **impeccable**
  before review; honour `context/ui-context.md`. Match `NotificationsCard`'s `px-5 py-4` / hairline idiom so
  the two cards read as siblings.

### `apps/web/src/settings/settings-page.tsx` — wire the hook
The page already owns `useNotificationPreferences()` and renders `<NotificationsCard>`. Add, in the same
page (web pattern = page owns hooks; no route/screen split):
- `const { devices, currentDeviceId, nowMs, setPrimary } = usePrimaryDevice();`
- `const deviceRows = deriveDevicePickerRows({ devices, currentDeviceId });`
- Render `<PushDeviceCard rows={deviceRows} nowMs={nowMs} onSelectPrimary={setPrimary} />` inside the sections
  column, AFTER `<NotificationsCard>`.

### `apps/web/src/tests/use-notification-sync.test.tsx` — satisfy the widened port
The inline `NotificationPort` grew two required members, so the test's fakes must stub them (mechanical
type-satisfaction, exactly like 17h's `run-notification-sync.test.ts` change — NOT scope creep):
- `makeFakePort` (line ~117): add `getNotificationState: vi.fn().mockResolvedValue({ devices: [] }),` and
  `setPrimaryDevice: vi.fn().mockResolvedValue({ ok: true }),`.
- `hoisted.createConvexNotificationPort` (line ~46): add the same two stubs to the returned object.
No behavioural assertions change — the sync hook never calls the new methods.

## Tests (TDD — red first)
Web renders in jsdom, so cover the pure seams AND the presentational card; the hook is typecheck-only glue
(consistent with `use-notification-preferences` being untested).
### `apps/web/src/tests/device-picker-rows.test.ts` — verbatim port (13 cases)
Current-first even when another has a newer `lastSeenAt`; non-current order by `lastSeenAt` desc tie-break
`deviceId` asc; `isCurrent`/`isPrimary`/`hasToken` passthrough; empty → `[]`; single → one row `isCurrent`;
null-current → no row flagged, recency-only order.
### `apps/web/src/tests/format-last-seen.test.ts` — verbatim port (11 cases)
`<60s` → "just now"; minute/hour/day boundaries; multi-unit floor (90m → "1h ago"); negative delta clamps.
### `apps/web/src/tests/push-device-card.test.tsx` — NEW render coverage (@testing-library/react)
Feed plain props (no convex/bundle mocks needed — the card is presentational):
- `>= 2` rows → `role="radiogroup"` present with N `role="radio"` items; the `isPrimary` row is
  `aria-checked`; the `isCurrent` row shows the "This device" chip; a `!hasToken` row shows "Not receiving
  push yet"; last-seen text is rendered from `formatRelativeLastSeen(nowMs, …)`.
- Clicking a non-primary row calls `onSelectPrimary` with that `deviceId` (via radix `onValueChange`).
- `< 2` rows (e.g. one, and zero) → NO `radiogroup`; the informational row copy is shown.

## Dependencies
- none. Consumes 17g's `setPrimaryDevice` + widened `getNotificationState` (both merged). `radix-ui` already
  installed (17e's `switch.tsx`) — `RadioGroup` is in the same umbrella package.

## Verify when done
- [ ] Web `NotificationPort` widened: `getNotificationState` returns `NotificationStateDevice[]`
      (`platform/hasToken/lastSeenAt/isPrimary`); `setPrimaryDevice` added; convex adapter passes both through;
      `use-notification-sync` still compiles + its tests pass with the two stubbed methods.
- [ ] `deriveDevicePickerRows` + `formatRelativeLastSeen` copied verbatim from mobile with their full test
      suites (24 cases total) green under web's vitest.
- [ ] `use-primary-device` (web): gates on auth+bundle, loads on mount + re-reads on window focus (fail-soft,
      off render path), captures `nowMs` on refresh, `setPrimary` optimistic + fire-and-forget (invariant #1 —
      no Convex on the render path), no `convex === null` guard (web client throws at import).
- [ ] `radio-group.tsx`: token-only radix wrapper, NO new dep; gives `role="radiogroup"`/`role="radio"` +
      keyboard nav + `aria-checked` for free.
- [ ] "Push device" card renders after Notifications in `settings-page.tsx`; `>= 2` devices → single-select
      RadioGroup (current marked + first, tokenless annotated but selectable); `< 2` → informational row.
- [ ] Card built via frontend-design + audited with impeccable; token-only (invariant #6); platform labels
      exhaustive; `push-device-card.test.tsx` proves radiogroup / checked / chip / annotation / select / info-row.
- [ ] Invariant #5 — order/marking decided only in `deriveDevicePickerRows`; hook/card carry no decision
      logic. Invariant #7 unaffected (UI only records the choice; election/ledger unchanged).
- [ ] `pnpm -w typecheck` · `pnpm -w test` · `pnpm -w lint` all clean.
- [ ] **BROWSER-VERIFY (user, before merge):** `pnpm --filter @ember/web dev`, signed in with ≥2 registered
      devices (e.g. this browser + a phone from 17h) → the "Push device" card lists both, current browser first
      with "This device" chip + "Not receiving push yet", phone shows its last-seen; select the phone → radio
      moves, reload/return-to-tab → choice persists (focus re-read); with only the browser registered → the
      informational row shows (no radios); light↔dark re-theme is clean.

## Out of scope (later)
- Web-push token pipeline (service worker + `PushManager`) so a web device can itself be a real push target —
  separate future unit; until then a web device is legitimately tokenless.
- The **stale-intent claim-review** correctness gap (disable-a-type-after-submit cancels the pending server
  intent) — separate queued unit; the next thing after 17i.
- Renaming misleading `quiet*Hour` fields / "Quiet hours" copy — **Issue #153**.
- Extracting web's `NotificationPort` into its own `notify/notification-port.ts` for full mobile symmetry —
  optional cleanup, not required for this feature.
