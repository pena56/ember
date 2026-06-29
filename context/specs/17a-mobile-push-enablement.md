# Unit 17a: Mobile push enablement — Settings screen + permission/token + handlers

Issue: #141 (umbrella #17) · Branch: feat/141-mobile-push-enablement · Boundary: `apps/mobile`
Route: **standard, net-new UI** — one boundary (`apps/mobile`), product fully resolved (both forks
settled 2026-06-29 with the user). Because it builds a **new Settings screen**, design quality is part
of "done": generate the screen with `frontend-design`, then audit with `impeccable`, **before**
`code-review` (per the spec-unit UI rule). Not "complex" (single boundary, no open questions — core,
store, and convex are untouched; 16b's `registerDevice` already accepts the token). On the larger end
of standard, so the spec isolates a node-testable seam (`derivePushControlState`) and keeps all native
/ UI work thin and design-driven.

First slice of umbrella **#17 (Settings)**: **17a mobile push enablement (this)** → 17b notification
preferences (quiet-hours / enabled-types / explicit-primary, feeding the engine) → 17c+ web settings
parity + the two deferred claim-review client units.

## Goal
Light up the #16 pipeline on-device. Today every mobile device registers with **no token** (16e), so
`electPrimaryDevice` (filters `hasToken === true`) finds no target and nothing is ever pushed. 17a adds:

1. A **new Settings screen** with a **Notifications** section: warm priming copy + an **Enable** control.
2. Tapping Enable runs the OS permission flow → on grant, `getExpoPushTokenAsync` → `registerDevice`
   **with** the Expo token, flipping `hasToken` true. From then on `electPrimaryDevice` has a target and
   the 16b cron delivers exactly one push per (type, local-day) across the owner's devices.
3. A **foreground notification handler** (show a banner while the app is foregrounded) and a
   **tap responder** (tapping a delivered push opens the app to Today).

Once a real device has a token, #16 is end-to-end live: core decides → client submits → server dedupes
→ **push arrives**. This is the slice that turns delivery on.

## Resolved forks (2026-06-29, with user)
- **Settings screen is the home** for the Enable control + priming (not a Today-tab card, not a
  launch-time modal). 17a establishes the Settings surface that 17b/17c extend.
- **17a includes the foreground handler + tap responder** — "turn on → a real push arrives → tap →
  app opens" is one coherent, verifiable slice.
- **Preferences deferred to 17b** (quiet-hours / enabled-types / explicit-primary + the preference
  model that feeds `deriveNotificationSync`). **Web settings + claim-review** → later slices.
- **EAS `projectId` is required and currently absent.** `app.json` has no `extra.eas.projectId`, so
  `getExpoPushTokenAsync` cannot mint a real token yet. 17a ships the **full flow + UI**; real token
  acquisition activates the moment a `projectId` exists — the same "pipeline ships dark, delivery
  switches on later" precedent #16 followed. The hook reads the id from `Constants.expoConfig?.extra?.eas?.projectId`
  and **fail-softs** (no token, no crash, toggle stays "off") when it's absent.
- **Permission denial deep-links to the system settings app** (`Linking.openSettings()`); we never
  re-prompt once the OS has hard-denied (iOS only shows the system sheet once).

## Implementation

### 1. Dependency + native config
- `cd apps/mobile && npx expo install expo-notifications` (let `expo install` pick the SDK-56-aligned
  version — do **not** hand-pin from the npm registry; the 02d lesson). It must land in
  `apps/mobile/package.json` dependencies.
- Add `"expo-notifications"` to the `plugins` array in `apps/mobile/app.json` (string form is fine;
  icon/color/sound config is **not** required this slice).
- Do **not** add an EAS `projectId` yourself — that's an account-level value the user provides. Note in
  the PR that real-device token acquisition needs `extra.eas.projectId` (or `eas init`).

### 2. `apps/mobile/src/notify/native-notifications.ts` (new) — thin expo-notifications wrapper
Thin, **untested** glue (no decision logic). One module so nothing else imports `expo-notifications`
directly, keeping the testable code free of native imports. Exposes:
- `getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'>` (maps
  `Notifications.getPermissionsAsync()` → normalized status; treat iOS provisional as `granted`).
- `requestPermission(): Promise<'granted' | 'denied' | 'undetermined'>` (`requestPermissionsAsync()`).
- `acquireExpoPushToken(projectId: string): Promise<string | null>` — `getExpoPushTokenAsync({ projectId })`,
  returning `.data`; **catch and return `null`** (no projectId / no network / simulator → fail-soft).
- `ensureAndroidChannel(): Promise<void>` — `setNotificationChannelAsync('default', { name, importance })`
  guarded by `Platform.OS === 'android'`.
- `setForegroundHandler(): void` — `Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) })`.
- `addTapResponder(onTap: () => void): () => void` — wraps `addNotificationResponseReceivedListener`,
  returns an unsubscribe.

### 3. `apps/mobile/src/notify/push-control-state.ts` (new) — pure, node-tested
The one testable seam — drives the toggle UI with no native imports.
```ts
export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface PushControlState {
  enabled: boolean;            // toggle reads ON only when granted AND a token is registered
  primaryAction: 'request' | 'open-settings' | 'none';
  needsSystemSettings: boolean; // true → the row's CTA deep-links to OS settings
}

export function derivePushControlState(input: {
  permission: PermissionStatus;
  hasToken: boolean;
}): PushControlState;
```
Rules: `undetermined` → `{ enabled:false, primaryAction:'request', needsSystemSettings:false }`;
`granted && hasToken` → `{ enabled:true, primaryAction:'none', needsSystemSettings:false }`;
`granted && !hasToken` → `{ enabled:false, primaryAction:'request', needsSystemSettings:false }` (re-acquire);
`denied` → `{ enabled:false, primaryAction:'open-settings', needsSystemSettings:true }`.

### 4. `apps/mobile/src/notify/notification-port.ts` (edit) — thread the token
Extend `registerDevice` arg to include the optional token:
```ts
registerDevice(args: { deviceId: string; platform: 'ios' | 'android'; expoPushToken?: string }): Promise<unknown>;
```
`convex-notification-port.ts` already spreads its args into the mutation (`(a) => convex.mutation(...)`),
and the 16b `registerDevice` validator already accepts `expoPushToken: v.optional(v.string())`, so **no
change** is needed there. 16e's `runNotificationSync` keeps calling `registerDevice` with no token
(still valid — optional field).

### 5. `apps/mobile/src/notify/use-push-enablement.ts` (new) — thin hook
Thin, **untested** glue (like `use-reconciler`/`use-notification-sync`). Exposes
`usePushEnablement(): { state: PushControlState; enable: () => void; refresh: () => void }`.
- On mount + focus: read `getPermissionStatus()` and the registered `hasToken` (from
  `getNotificationState` for **this** `deviceId`, or track locally after a successful enable); derive
  `state` via `derivePushControlState`. Fail-soft.
- `enable()`:
  - if `primaryAction === 'open-settings'` → `Linking.openSettings()`.
  - else → `requestPermission()`; on `granted`: `ensureAndroidChannel()`,
    `projectId = Constants.expoConfig?.extra?.eas?.projectId`; if present
    `token = await acquireExpoPushToken(projectId)`; if `token` →
    `port.registerDevice({ deviceId, platform: Platform.OS as 'ios'|'android', expoPushToken: token })`
    (deviceId from `useSyncBundle()!.deviceId`); then `refresh()`. All wrapped fail-soft (a failure
    leaves the toggle off; the user can retry).
  - Resolve the port the same lazy way `use-notification-sync` does (injected `port?` option for tests;
    else lazy `import('../convex/convex-client.js')` + `createConvexNotificationPort`, guard `convex === null`).
- Gate on `useConvexAuth().isAuthenticated && useSyncBundle() !== null` (no auth/bundle → `enable()`
  is a no-op and the row shows a muted "Sign in to sync reminders" hint — keep minimal).

### 6. `apps/mobile/src/settings/settings-screen.tsx` + `apps/mobile/app/settings.tsx` (new) — the UI
- Route `app/settings.tsx`: modal route mirroring `app/account.tsx` exactly (guard `convex === null` →
  `<Redirect href="/library" />`; `<View className="flex-1 bg-surface"><SafeAreaView>…`). Register it in
  `_layout.tsx`'s `Stack` with `presentation: 'modal'` beside the `account` screen.
- `settings-screen.tsx`: a titled **Settings** screen with a **Notifications** section — warm priming
  copy ("Get a gentle nudge to keep your reading streak alive") and an **Enable** row/toggle bound to
  `usePushEnablement()`: `state.enabled` → shows "On"; `primaryAction==='request'` → "Enable
  notifications"; `needsSystemSettings` → "Open Settings". Leave room for future sections (Account,
  Theme) but build only Notifications now.
- **Design:** generate the screen with `frontend-design`, then audit with `impeccable`. Token-only
  styling (**invariant #6** — no hardcoded colors; use `className` + the uniwind token stack, mirror
  `account-sheet`/`library-screen`). Full a11y: the toggle/row has `accessibilityRole`,
  `accessibilityState={{ checked: state.enabled }}`, and a descriptive label. Honor `ui-context.md`.

### 7. Entry affordance — gear icon
A new `apps/mobile/src/settings/settings-button.tsx` mirroring `account-button.tsx` (token-colored SVG
gear via `useResolveClassNames`, `accessibilityRole="button"`, label "Settings", `onPress →
router.push('/settings')`). Render it in the **Today** screen header (`src/today/today-screen.tsx` —
read it for the existing header layout; place the gear consistently with how Library hosts
`AccountButton`). If Today has no header slot, add a minimal one matching the Library header pattern.

### 8. Handlers — mount once
`setForegroundHandler()` + the tap responder must be mounted exactly once. Add a tiny
`apps/mobile/src/notify/use-notification-handlers.ts` (thin, untested) that on mount calls
`setForegroundHandler()` and `addTapResponder(() => router.push('/(tabs)'))`, returning the unsubscribe
in cleanup. Call it from `AnonymousAuthGate` in `_layout.tsx` (after `useNotificationSync()`), same
Convex-auth scope, renders nothing. (Foreground handler is global; safe to set unconditionally.)

## Tests
### `apps/mobile/src/notify/push-control-state.test.ts` (new — node, no native modules)
Drive `derivePushControlState` across the four cases:
- `undetermined` → `enabled:false`, `primaryAction:'request'`, `needsSystemSettings:false`.
- `granted` + `hasToken:true` → `enabled:true`, `primaryAction:'none'`, `needsSystemSettings:false`.
- `granted` + `hasToken:false` → `enabled:false`, `primaryAction:'request'` (re-acquire).
- `denied` → `enabled:false`, `primaryAction:'open-settings'`, `needsSystemSettings:true`.

The hooks (`use-push-enablement`, `use-notification-handlers`), `native-notifications.ts`, the screen,
and the buttons are thin glue / native / design surfaces — **untested** (typecheck + `impeccable` +
`code-review` cover them), following the `use-reconciler` / `use-notification-sync` precedent. The
"convex singleton not loaded when a port is injected" guarantee holds by construction (lazy `import()`
branch), as before.

## Dependencies
- **New:** `expo-notifications` (via `npx expo install` — SDK-56-aligned). No other new deps.
- `convex` / `expo-constants` / `expo-linking` / `react-native` already present; `getNotificationState`,
  `registerDevice` (with optional token) already exist from 16b. `@ember/core` / `@ember/store` /
  `convex/` **untouched** (no schema or mutation change — the token field already exists).

## Verify when done
- [ ] `pnpm -w typecheck` · `pnpm -w test` (mobile count rises by `push-control-state.test.ts`) ·
      `pnpm -w lint` — all green.
- [ ] `expo-notifications` is in `apps/mobile/package.json` + `app.json` plugins; nothing else imports
      it directly except `native-notifications.ts`.
- [ ] `derivePushControlState` node tests pass (four cases).
- [ ] Settings screen reachable via the gear from Today (`router.push('/settings')`), token-only styled
      (invariant #6), a11y-complete; the Notifications row reflects `state` (Enable / On / Open Settings).
- [ ] Enabling requests permission → acquires a token (when a `projectId` exists) →
      `registerDevice({ expoPushToken })`; `getNotificationState` then shows `hasToken: true` for this
      device. With no `projectId`, the flow fail-softs (toggle stays off, no crash).
- [ ] Foreground handler shows a banner; tapping a delivered push opens the app to Today.
- [ ] No invariant violated — #1 (reads local; this only writes registration, fail-soft, off the render
      path), #6 (token-only styling), #7 unchanged (server still elects/dedupes; client never fires),
      and the **raw push token is still never stored in our schema** (only in the Expo push component;
      our `pushDevices` keeps `hasToken` boolean only). `@ember/core` stays clock-/platform-free.

## Device verification (required for real delivery — first time it matters)
With an EAS `projectId` configured (`eas init` or `extra.eas.projectId`), on a real device (push tokens
don't work in the iOS simulator): sign in → open Settings → Enable notifications → grant → confirm
`getNotificationState` shows `hasToken:true` → trigger a due intent (read at goal-not-met during the
window) → a push arrives → tapping it opens the app to Today; foregrounded, a banner shows. Without a
`projectId` the logic + UI are headless/typecheck/design-verified and token acquisition is the device
step (the #16 "ships dark" precedent). No simulator run blocks merge.

## Deferred to 17b / later (do NOT solve here)
- **17b — Notification preferences:** quiet-hours / enabled-types / explicit-primary overrides + the
  preference model that feeds `deriveNotificationSync` (so disabled types/quiet windows suppress at the
  source). Likely extends both the core engine input and this Settings screen.
- **Later:** web notification settings parity; the two deferred claim-review client units (web + mobile).
- **Not here:** notification icon/sound theming, rich/categorized notifications, badge counts.
