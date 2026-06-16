# Unit 11c: Mobile auth UI + provider (anonymous auto sign-in, claim, returning sign-in)

Issue: #101 (umbrella #11) · Branch: feat/101-mobile-auth-ui · Boundary: `apps/mobile/`
Route: standard — single client boundary (`apps/mobile/`); product fork (account-UI placement)
resolved with user 2026-06-16 → **dedicated account sheet** opened from a Library-header icon; the
`@convex-dev/auth/react` contract is the same well-trodden wiring proven in 11b, re-expressed for
React Native (SecureStore token storage, expo-network connectivity, expo-router modal). UI unit →
frontend-design + impeccable before review. New deps added to `apps/mobile`.

> Third and final slice of umbrella **Unit 11** (Auth: anonymous-local → account claim), after
> **11a** Convex Auth backend (#97, merged) → **11b** web auth UI + provider (#99, merged) →
> **11c** mobile auth UI + provider (this — device-bound).

## Goal
Wire the Expo client to the 11a Convex Auth backend so the mobile app: (1) is wrapped in
`ConvexAuthProvider` with **SecureStore** token storage; (2) **signs in anonymously by itself** once
connected + unauthenticated (the online sync identity); (3) lets the user **claim** that anonymous
identity into a Password account and **sign back in** to an existing account from a **dedicated
account sheet** (a modal opened by a person icon in the Library header); (4) **signs out**. The app
stays fully usable while signed-out/offline (invariant #1). After this unit the Library header shows
an account affordance, claim/sign-in/sign-out work against the live dev deployment on a real
device/simulator, and `pnpm -w typecheck/test/lint` are green. This closes umbrella #11.

## Architecture notes (resolved — record, don't re-litigate)
- **Account-UI placement = dedicated sheet (user, 2026-06-16).** A quiet person icon sits in the
  Library header beside `ThemeControl`; tapping opens a modal account screen (claim / sign-in /
  sign-out). NOT inline in the Today screen, NOT a full nav tab. (The web analog was a header menu +
  dialog; mobile has no top app-bar, so the icon→modal sheet is the native-idiomatic equivalent.)
- **Token storage = `expo-secure-store`, not localStorage.** RN has no `localStorage`; pass a
  SecureStore adapter to `ConvexAuthProvider` so the anon/claimed session persists across app
  launches. SecureStore keys must be `[A-Za-z0-9._-]` only and values are size-limited (~2 KB, warns
  beyond) — set a sanitized `storageNamespace` (see Implementation) and watch for the size warning in
  the device gate; this is the one piece without prior in-repo precedent.
- **Connectivity = `expo-network`, not `navigator.onLine`.** `signIn("anonymous")` is a one-shot
  action that fails offline and does not self-retry, so we gate it on network state and retry on a
  network-restored event — the RN analog of 11b's `online` listener. Convex Anonymous needs network;
  on a first-ever-offline launch there is simply no Convex session yet — the app reads/highlights/
  captures entirely from the local SQLite store (invariant #1) and the outbox accumulates.
- **Claim reactivity (carry-forward from 11b, re-solved for RN).** `@convex-dev/auth` derives
  `isAuthenticated = token !== null`; the anon→password **claim swaps one non-null token for another**,
  so `isAuthenticated` never flips and `convex/react`'s `ConvexProviderWithAuth` never re-calls
  `client.setAuth` — every live query stays on the stale anonymous identity until the auth state is
  re-initialized. Web fixed this with `window.location.reload()`; RN has no equivalent. **Fix:
  remount the auth provider subtree by bumping a React `key`** (an `AuthProviderGate` exposing
  `resetAuthClient()`): the remounted `ConvexAuthProvider` re-reads the (now password) token from
  SecureStore and re-runs `setAuth` with the fresh identity, so queries re-bind. Because this is a
  React remount (not a JS-bundle reload) module state survives → the success toast is shown directly,
  no storage shuttle needed (web needed sessionStorage; mobile does not). Sign-out flips token→null (a
  real status change) so it stays reactive without a remount. **Fallback if the key-remount proves
  flaky on-device:** recreate the `ConvexReactClient` instance inside the same gate (heavier — drops/
  reopens the websocket — but bulletproof). Do not re-invoke `client.setAuth` manually (clobbers the
  provider's auth-state callback — the reason web rejected it).
- **Non-destructive locally; data sync is #12.** Ownership is enforced server-side at push time via
  `ctx.auth` (11a). There is **no `owner`/`userId` field** and **no mutation signature change** here.
  The native SQLite store/outbox/clock are **untouched**; reader/library/stats/today work identically
  regardless of auth state. Signing into a *different* existing account while holding local anon data
  is the merge case (UI = #14); 11c does not pull or merge remote data — that is #12. Invariants
  #1/#2 stay intact.
- **Auth never gates content.** The whole app renders for anonymous users; auth state is consumed
  only by the account icon + sheet. A missing `EXPO_PUBLIC_CONVEX_URL` must **not** crash the app
  (improving on 11b's hard throw, which blanked the web page) — log a clear dev warning, skip the
  provider/anon sign-in, and let the app run fully offline-local (invariant #1).

## Implementation

### Dependencies (add to `apps/mobile`)
Install with `npx expo install` (picks the SDK-56-compatible version) for the expo-* packages;
resolve exact versions at install. **`convex` MUST be pinned to the repo's `1.40.0`** (architecture.md)
so `convex/`, `apps/web`, and `apps/mobile` share one copy — no duplicate in the lockfile.
- `convex@1.40.0` — `ConvexReactClient`, `useQuery` (works under RN/metro; Convex supports RN).
- `@convex-dev/auth@0.0.94` — `ConvexAuthProvider`, `useAuthActions`, `useConvexAuth` (matches the
  11a/11b pin; `@auth/core` comes transitively).
- `expo-secure-store` — encrypted token storage adapter.
- `expo-network` — connectivity gate + restored-event for anon sign-in retry.
- `@ember/convex` as `"workspace:*"` — reuse the **existing** `./_generated/api` export shim added in
  11b (no `convex/package.json` change this unit). Import `import { api } from "@ember/convex/_generated/api";`.
  Metro enables package `exports` by default on SDK 56; the existing `metro.config.js` `.js`→source
  resolver does not interfere (the shim resolves to a real generated `_generated/api.js`). **Codegen
  gate:** `convex/_generated/` is git-ignored, so typecheck requires the generated files present
  locally first (`npx convex dev --once` — already present from 11a). If metro fails to resolve the
  subpath export, set `config.resolver.unstable_enablePackageExports = true` (or fall back to a
  relative `../../convex/_generated/api.js` import) and note it — do not block on it.

### Convex client + SecureStore adapter — `src/convex/convex-client.ts` (new)
```ts
import { ConvexReactClient } from "convex/react";
const url = process.env.EXPO_PUBLIC_CONVEX_URL;
export const convex = url ? new ConvexReactClient(url) : null; // null → app runs offline-local
```
Export a SecureStore adapter (the `TokenStorage` shape `@convex-dev/auth` expects — async is fine):
```ts
import * as SecureStore from "expo-secure-store";
export const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};
```
Missing-URL is non-fatal (invariant #1): `convex === null` → skip the provider/anon sign-in below.

### Provider wiring — `app/_layout.tsx` (edit)
Wrap the tree in `<ConvexAuthProvider client={convex} storage={secureStorage} storageNamespace={...}>`
**above** `ThemeProvider` (auth is app-wide; theme/store stay independent), inside the existing
`AuthProviderGate` (below). `storageNamespace` must be SecureStore-key-safe (`[A-Za-z0-9._-]`) — use a
fixed slug like `"ember-auth"` (NOT the raw deployment URL, which contains `:/.`). When `convex` is
`null`, render the children **without** the provider (offline-local mode). Keep the existing
`GestureHandlerRootView`/`SafeAreaProvider` and the `InnerLayout` (StoreProvider + Stack + Toaster).
Register the modal route: add `<Stack.Screen name="account" options={{ presentation: "modal" }} />`
(or set it via the route's own `options`).

### Auth provider gate (claim-reactivity remount) — `src/auth/auth-provider-gate.tsx` (new)
A tiny context that holds a numeric `key` and exposes `resetAuthClient()` (increments it); it renders
`<ConvexAuthProvider key={key} …>{children}</ConvexAuthProvider>`. `useAuthReset()` returns
`resetAuthClient`. The account sheet calls it after a successful claim/sign-in to force the token
re-read (see Architecture notes). The reducer (key bump) is the only testable logic.

### Anonymous auto sign-in — `src/auth/use-anonymous-auth.ts` (new) + pure helper
- Pure helper `shouldSignInAnonymously({ isLoading, isAuthenticated, online, hasFired })` → boolean
  (true only when `!isLoading && !isAuthenticated && online && !hasFired`) — **unit-tested**.
- The hook reads `useConvexAuth()`, gets initial state from `Network.getNetworkStateAsync()`, and on
  satisfying the predicate calls `void signIn("anonymous")` exactly once (ref guard for Strict-Mode
  double-invoke). Subscribe to `Network.addNetworkStateChangeListener` to retry when connectivity
  returns; clear the ref once `isAuthenticated` flips true so a later **sign-out re-anonymizes**
  (the 11b regression — replicate the fix). Clean up the subscription on unmount. No UI — called once
  high in the tree (e.g. an effect in `InnerLayout` or a mounted `<AnonymousAuthGate/>`).

### Identity hook — `src/auth/use-account.ts` (new) + pure helper
- Pure helper `deriveAccountView({ isLoading, isAuthenticated, user })` →
  `{ status: 'loading' | 'anonymous' | 'claimed', email: string | undefined }` where
  `claimed = isAuthenticated && user && !user.isAnonymous` — **unit-tested** (mirrors web's contract).
- The hook wires `useConvexAuth()` + `useQuery(api.users.currentUser)` into the helper.

### Error sanitization — `src/auth/auth-errors.ts` (new) + test
Port `friendlyAuthError(err, mode: 'signUp'|'signIn'|'signOut')` **verbatim** from 11b (pure, no
platform deps): maps Convex Auth's stable tokens — `InvalidSecret`/`InvalidAccountId` (signIn →
"Incorrect email or password."; signUp → account-exists steer), `TooManyFailedAttempts` (rate-limit),
weak-password, network — to one calm sentence per flow; never leaks the raw
`[CONVEX A(auth:signIn)] … Uncaught Error` string. **Intentional duplication** of the web copy (logic
is identical and platform-agnostic); recorded as a follow-up to extract a shared module if a third
consumer or drift appears — do not extract now (keeps 11c single-boundary). Carry the same 8 tests.

### Account UI (the sheet)
- `src/auth/account-button.tsx` (new) — a person-icon button (bespoke inline `react-native-svg`,
  token-colored via `useResolveClassNames`, invariant #6) for the Library header. Reads `useAccount()`:
  anonymous → outline person (accessibilityLabel "Save your library"); claimed → filled/checked person
  ("Account"); loading → neutral. `onPress` → `router.push('/account')`.
- `app/account.tsx` (new) — the modal route; renders `<AccountSheet/>` inside a themed `SafeAreaView`.
- `src/auth/account-sheet.tsx` (new) — the form, presented as a slide-up sheet:
  - `status==='anonymous'` → **Create account** by default: email + password `TextInput`s + submit →
    `signIn("password", { email, password, flow: "signUp" })`; a "Already have an account? Sign in"
    toggle → `flow: "signIn"`. On success: `resetAuthClient()` (remount → token re-read), `toast.success`
    (warm voice: "Your library is saved." / "Welcome back."), `router.back()`. On failure: inline error
    + `toast.error(friendlyAuthError(err, mode))` (no raw stack); sheet stays open. Disable submit while
    pending; basic email/non-empty-password validation before calling.
  - `status==='claimed'` → show the email + a **Sign out** button (`signOut()` from `useAuthActions()`;
    on sign-out the anon effect re-anons on the next network tick). Sign-out is reactive — no remount.
  - `status==='loading'` → token-tinted `ActivityIndicator`.
  - Accessibility: header role on the title, labelled inputs, `keyboardType="email-address"` +
    `autoCapitalize="none"` on email, `secureTextEntry` on password, submit on keyboard return, the
    modal dismisses via swipe/back. Token-only styling (invariant #6) — no hardcoded colors.
- Wire `<AccountButton/>` into the Library header (`src/library/library-screen.tsx`) — a `flex-row`
  cluster with the existing `ThemeControl` so the header reads: `Ember` … `[ThemeControl] [👤]`.

### Env wiring — `apps/mobile/.env.example` (new) + USER gate
- Commit `apps/mobile/.env.example` with `EXPO_PUBLIC_CONVEX_URL=https://<your-deployment>.convex.cloud`.
- **USER setup gate (deployment-bound, like 11a/11b):** the user creates `apps/mobile/.env.local` with
  the real dev URL (root `.env.local` `CONVEX_URL` for deployment `necessary-warbler-246`). Expo only
  exposes `EXPO_PUBLIC_`-prefixed vars to the client; restart metro (clear cache) after editing.
  `.env.local` stays git-ignored.

## Testing
Mobile has **no component-render test infra** (no `@testing-library/*`); tests are pure-logic, like
`present-habit.ts`/`select-continue-reading.ts`. Do **not** add render infra or new test deps. Extract
decision logic into pure helpers and test those; thin hooks/components are verified in the device gate.
- `auth-errors.test.ts` — the 8 mappings ported from 11b (never leaks raw text; per-flow copy).
- `derive-account-view.test.ts` — loading/anonymous/claimed derivation incl. `isAnonymous` edge.
- `should-sign-in-anonymously.test.ts` — the predicate truth table (offline/loading/authed/already-
  fired all return false; only the all-clear case true).
- `auth-provider-gate` reducer — `resetAuthClient` increments the remount key (one tiny test).
- Do **not** instantiate `ConvexReactClient` or mount `ConvexAuthProvider` in the vitest/node env. The
  existing mobile tests must keep passing (auth doesn't gate content; nothing in the existing render
  paths touches a convex hook).

## Verify when done
- [ ] `apps/mobile` has `convex@1.40.0` + `@convex-dev/auth@0.0.94` + `expo-secure-store` +
      `expo-network` + `@ember/convex` (workspace); `convex` is the **same single version** as `convex/`
      and `apps/web` (no duplicate in the lockfile).
- [ ] `app/_layout.tsx` wraps the tree in `ConvexAuthProvider` (SecureStore storage, key-safe
      namespace) over a `ConvexReactClient`, inside the `AuthProviderGate`; app still renders for an
      anonymous/offline user and when `EXPO_PUBLIC_CONVEX_URL` is unset (no content gated behind auth).
- [ ] Account icon reflects loading/anonymous/claimed; the modal sheet does signUp + signIn + signOut
      with inline sanitized errors + warm toasts; all token-driven (invariant #6), a11y-clean.
- [ ] `useAnonymousAuth` signs in anonymously once when connected+unauthenticated, retries on
      network-restored, re-anons after sign-out, and never fires offline / when authed / when loading.
- [ ] Claim/sign-in re-binds live queries without a manual reload (the `resetAuthClient` remount);
      sign-out is reactive without a remount.
- [ ] **No core/store/outbox/clock source changed; no `owner`/`userId` field; no mutation signature
      changed** (invariants #1/#2). Diff is confined to `apps/mobile/` + docs (the `convex/package.json`
      shim already exists from 11b — untouched).
- [ ] `pnpm -w typecheck` passes (requires `convex/_generated` present — codegen gate).
- [ ] `pnpm -w test` passes (new pure-logic auth tests green; existing mobile tests unaffected).
- [ ] `pnpm -w lint` clean (eslint-config-expo; bespoke SVG icon + RN inputs).
- [ ] **USER device-verify gate** (deployment-bound; before merge): with `apps/mobile/.env.local` set,
      `pnpm --filter @ember/mobile start` on a device/simulator → app loads anonymous (header icon
      present); open sheet → "Save your library"; Create account → header flips to claimed + queries
      re-bind with no manual reload; kill & reopen app → still claimed (SecureStore persisted); Sign out
      → anonymous (re-anon on next connectivity); Sign in with those creds → claimed again; airplane
      mode → library/reader/stats/today fully usable, no auth error blocks the UI (invariant #1). Watch
      for SecureStore key-charset/size warnings and metro package-exports resolution.

## Dispatch
Standard route: Sonnet TDD executor builds `apps/mobile/` (client + SecureStore adapter + provider
gate + `useAnonymousAuth` + `use-account` + the pure helpers & their tests first + `auth-errors` +
account button/sheet/modal route + `.env.example`) → **frontend-design** (account icon + sheet visual
quality) → **impeccable** (UX/a11y/visual audit of the new UI) → fresh-context **Opus reviewer** checks
invariant #1/#2 non-violation (native store/outbox/clock untouched, no owner field, no mutation change),
that auth never gates content (incl. missing-env stays usable), the `@convex-dev/auth/react` + SecureStore
wiring matches the library contract, the single-convex-version pin, the claim-remount approach, and
token/a11y cleanliness → branch `feat/101-mobile-auth-ui`, commit, PR "Closes #101" → USER runs the
`.env.local` + device-verify gate before merge. **This closes umbrella #11** — promote the SecureStore
+ claim-remount learnings to architecture.md if they prove durable; on merge, close #11.
