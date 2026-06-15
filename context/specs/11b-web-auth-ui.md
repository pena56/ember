# Unit 11b: Web auth UI + provider (anonymous auto sign-in, claim, returning sign-in)

Issue: #99 (umbrella #11) · Branch: feat/99-web-auth-ui · Boundary: `apps/web/` (+ a one-line
`convex/package.json` export shim)
Route: standard — single client boundary (`apps/web/`), product forks resolved 2026-06-15,
well-trodden `@convex-dev/auth/react` wiring + one account menu/dialog. UI unit → frontend-design
+ impeccable before review. New deps (`convex`, `@convex-dev/auth`) added to `apps/web`.

> Second slice of umbrella **Unit 11** (Auth: anonymous-local → account claim), after
> **11a** Convex Auth backend (#97, merged) → **11b** web auth UI + provider (this) →
> **11c** mobile auth UI + provider (device-bound).

## Goal
Wire the web client to the 11a Convex Auth backend so the app: (1) is wrapped in
`ConvexAuthProvider`; (2) **signs in anonymously by itself** once online + unauthenticated (the
online sync identity); (3) lets the user **claim** that anonymous identity into a Password account
and **sign back in** to an existing account from a header account menu + dialog; (4) **signs out**.
The app stays fully usable while signed-out/offline (invariant #1). After this unit the header
shows account state, claim/sign-in/sign-out work against the live dev deployment, and
`pnpm -w typecheck/test/lint` are green.

## Architecture notes (resolved — record, don't re-litigate)
- **Anonymous = the online sync identity; offline-first is untouched.** Convex Anonymous needs
  network, so on a first-offline launch there is simply no Convex session yet — the app reads,
  highlights, and captures progress entirely from the local store (invariant #1) and the outbox
  accumulates. A small `useAnonymousAuth` effect signs in anonymously when `isAuthenticated` is
  false, `isLoading` is false, and `navigator.onLine` — and retries on the `online` event. Convex
  Auth persists tokens in `localStorage`, so the anon session survives reloads.
- **Claim upgrades the SAME anonymous user.** "Create account" calls
  `signIn("password", { email, password, flow: "signUp" })` — Convex Auth links the Password
  account to the current anonymous user and preserves its user id, so anything already pushed (in
  #12) keeps its owner. "Sign in" (`flow: "signIn"`) switches to an existing account.
- **Non-destructive locally; data sync is #12.** Ownership is enforced server-side at push time
  via `ctx.auth` (11a decision) — there is **no `owner` field** and **no mutation signature
  change** here. The local Dexie store/outbox/clock are **untouched**; the reader/library/stats
  work identically regardless of auth state. Signing into a *different* existing account while
  holding local anon data is the merge case (UI = #14); 11b does not pull or merge remote data —
  that is #12. Invariants #1/#2 stay intact.
- **Auth never gates content.** Do **not** wrap pages in `<Authenticated>/<Unauthenticated>`; the
  whole app renders for anonymous users. Auth state is consumed only by the account menu/dialog.

## Implementation

### Dependencies (add to `apps/web`)
Resolve exact versions at install (`npm view <pkg> version`); **`convex` MUST be pinned to the
repo's `1.40.0`** (architecture.md) so the web app and `convex/` share one copy — do not take
registry-latest.
- `convex@1.40.0` — `ConvexReactClient`, `useQuery`, auth-state components.
- `@convex-dev/auth@0.0.94` — `ConvexAuthProvider`, `useAuthActions`, `useConvexAuth` (matches the
  backend pin from 11a; `@auth/core` comes transitively).

### Let the web client import the generated `api` — `convex/package.json` (edit)
The web app needs `api.users.currentUser`. Expose the generated module from the `@ember/convex`
package and depend on it as a workspace package (greppable, no cross-package relative climb):
- In `convex/package.json` add an `exports` map:
  ```jsonc
  "exports": {
    "./_generated/api": { "types": "./_generated/api.d.ts", "default": "./_generated/api.js" }
  }
  ```
- In `apps/web/package.json` add `"@ember/convex": "workspace:*"`.
- Import as `import { api } from "@ember/convex/_generated/api";`.
- **Codegen gate:** `convex/_generated/` is git-ignored, so web typecheck requires the generated
  files to exist locally first (run `npx convex dev --once` — already present from the 11a deploy).
  Treat this like the 11a deploy gate: documented, user-runnable, no headless substitute in CI yet.
  If the import resolver fights the workspace `exports`, fall back to a relative import of
  `../../convex/_generated/api.js` and note it — do not block on it.

### Convex client + provider — `src/convex/convex-client.ts` (new) + `src/main.tsx` (edit)
- `convex-client.ts`: `export const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);`
  Guard a missing URL with a clear thrown error (so a forgotten `.env.local` fails loudly in dev).
- `main.tsx`: wrap the tree in `<ConvexAuthProvider client={convex}>` — **outside** `ThemeProvider`/
  `StoreProvider` (auth is app-wide; store stays independent). The provider uses `localStorage` token
  storage by default (correct for web).

### Anonymous auto sign-in — `src/auth/use-anonymous-auth.ts` (new)
- Reads `useConvexAuth()`; when `!isLoading && !isAuthenticated && navigator.onLine`, call
  `void signIn("anonymous")` exactly once per online transition (guard with a ref so React Strict
  Mode's double-invoke doesn't double-fire). Add an `online` listener that retries when connectivity
  returns; clean it up on unmount. No UI — call this hook once high in the tree (e.g. in `App`).

### Identity hook — `src/auth/use-account.ts` (new) — the small contract the menu/dialog consume
- `const { isLoading, isAuthenticated } = useConvexAuth();`
- `const user = useQuery(api.users.currentUser);` → `{ _id, email, isAnonymous } | null | undefined`
  (`undefined` while loading).
- Return a derived view: `{ status: 'loading' | 'anonymous' | 'claimed', email }` where
  `claimed = isAuthenticated && user && !user.isAnonymous`. Keep it pure-ish/presentational so it
  can be unit-tested by mocking the two hooks.

### Account menu + dialog (the UI)
Vendor the shadcn primitives this needs (CLI `pnpm dlx shadcn@latest add dialog input label`) into
`src/components/ui/` — they inherit the existing token aliasing (04d), so they theme for free; the
vendored-file eslint override already covers `src/components/ui/**`.
- `src/auth/account-menu.tsx` — a control beside `ThemeControl` in `app-shell.tsx`:
  - `status==='anonymous'` → a quiet "Save your library" button that opens the dialog.
  - `status==='claimed'` → the email (truncated) + a "Sign out" item (`signOut()` from
    `useAuthActions()`); on sign-out the `useAnonymousAuth` effect re-anons on next online tick.
  - `status==='loading'` → a neutral placeholder (no layout shift).
- `src/auth/auth-dialog.tsx` — shadcn `Dialog` with email + password fields and a mode toggle:
  - default mode **Create account** → `signIn("password", { email, password, flow: "signUp" })`;
  - "Already have an account? Sign in" → **Sign in** mode → `flow: "signIn"`.
  - On success: close dialog + `toast.success` (warm voice: "Your library is saved." /
    "Welcome back."). On failure: catch the thrown error, show an **inline** field error +
    `toast.error` (no raw stack). Disable the submit button while pending; basic email/non-empty
    password validation before calling.
  - Accessibility: dialog has a title/description, focus trap (shadcn handles), labelled inputs,
    `type="email"`/`type="password"`, Enter submits, Esc closes. Honor `ui-context.md` tokens — no
    hardcoded colors (invariant #6).
- Wire `<AccountMenu />` into `app-shell.tsx` between the nav and `<ThemeControl />`.

### Env wiring — `apps/web/.env.example` (new) + USER gate
- Commit `apps/web/.env.example` with `VITE_CONVEX_URL=https://<your-deployment>.convex.cloud`
  (the root `.gitignore` already whitelists `!.env.example`).
- **USER setup gate (deployment-bound, like 11a):** the user creates `apps/web/.env.local` with the
  real dev URL (the `CONVEX_URL` value `npx convex dev` wrote to the **root** `.env.local` for
  deployment `necessary-warbler-246`). Vite only exposes `VITE_`-prefixed vars to the client, which
  is why a web-local copy is needed. `.env.local` stays git-ignored.

## Testing
No real network/client in jsdom. Component tests **mock** `@convex-dev/auth/react`
(`useAuthActions`, `useConvexAuth`) and `convex/react` (`useQuery`) with `vi.mock`, then assert
behavior:
- `account-menu`: anonymous → shows "Save your library", opens dialog; claimed → shows email +
  Sign out calls `signOut`; loading → neutral placeholder.
- `auth-dialog`: submit in create mode calls `signIn` with `flow:"signUp"` + entered creds; toggle
  → `flow:"signIn"`; rejected `signIn` shows inline error + no close; empty fields blocked.
- `use-anonymous-auth`: signs in once when unauthenticated+online; does **not** when offline or
  already authenticated; retries on `online` event (fake the hooks + `navigator.onLine`).
- Do **not** instantiate `ConvexReactClient` or mount `ConvexAuthProvider` in jsdom. The existing
  App/route tests must keep passing — since auth doesn't gate content and the menu degrades to a
  placeholder when the mocked hooks report loading, broad tests need no Convex provider; if any
  render path touches a convex hook, mock it at the test-file level.

## Verify when done
- [ ] `apps/web` has `convex@1.40.0` + `@convex-dev/auth@0.0.94`; `convex` is the same single
      version as `convex/` (no duplicate in the lockfile).
- [ ] `main.tsx` wraps the tree in `ConvexAuthProvider` over a `ConvexReactClient`; app still renders
      for an anonymous/offline user (no content gated behind auth).
- [ ] Account menu reflects loading/anonymous/claimed; dialog does signUp + signIn + signOut with
      inline error handling and warm toasts; all token-driven (invariant #6), a11y-clean.
- [ ] `useAnonymousAuth` signs in anonymously once when online+unauthenticated and retries on
      reconnect; never fires offline or when already authed.
- [ ] **No core/store/outbox/clock source changed; no `owner`/`userId` field; no mutation signature
      changed** (invariants #1/#2). Diff is `apps/web/` + the `convex/package.json` export line + docs.
- [ ] `pnpm -w typecheck` passes (requires `convex/_generated` present — codegen gate above).
- [ ] `pnpm -w test` passes (new auth tests green; existing web/route tests unaffected).
- [ ] `pnpm -w lint` clean (vendored shadcn `dialog/input/label` under the existing ui override).
- [ ] **USER browser-verify gate** (deployment-bound; before merge): with `apps/web/.env.local` set,
      `pnpm --filter @ember/web dev` → app loads as anonymous (header shows "Save your library");
      Create account → header flips to email; reload → still claimed; Sign out → back to anonymous;
      Sign in with those creds → claimed again; offline (DevTools) → app still fully usable, no auth
      errors block the UI.

## Dispatch
Standard route: Sonnet TDD executor builds `apps/web/` (provider wiring + `useAnonymousAuth` +
`use-account` + account menu + auth dialog + env example + the `convex/package.json` export line;
pure/mocked tests first) → **frontend-design** (account menu + dialog visual quality) →
**impeccable** (UX/a11y/visual audit of the new UI) → fresh-context **Opus reviewer** checks
invariant #1/#2 non-violation (store/outbox/clock untouched, no owner field, no mutation change),
that auth never gates content, the `@convex-dev/auth/react` wiring matches the library contract, the
single-convex-version pin, and token/a11y cleanliness → branch `feat/99-web-auth-ui`, commit, PR
"Closes #99" → USER runs the `.env.local` + browser-verify gate before merge. Next: 11c (mobile auth
UI + provider, device-bound).
