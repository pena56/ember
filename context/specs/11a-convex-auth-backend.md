# Unit 11a: Convex Auth backend (anonymous + password providers, identity query)

Issue: #97 (umbrella #11) · Branch: feat/97-convex-auth-backend · Boundary: `convex/`
Route: standard — single boundary (`convex/`), new dep, well-trodden config + one query; product ambiguity resolved (provider/claim/scope all decided 2026-06-15).

> First slice of umbrella **Unit 11** (Auth: anonymous-local → account claim), which scored
> **complex → split by boundary** like 03/04/.../10: **11a** Convex Auth backend (this) →
> **11b** web auth UI + provider → **11c** mobile auth UI + provider (device-bound).

## Goal
Stand up the project's first real Convex backend code: `@convex-dev/auth` configured with an
**Anonymous** provider and a **Password** provider, `authTables` merged into the schema, auth
HTTP routes mounted, and a `currentUser` query that returns the authenticated user (or `null`).
After this unit, `pnpm -w typecheck` is green, `convex dev` deploys the auth-enabled schema, and
a client (11b/11c) can sign in anonymously and upgrade to a password account. No client UI here.

## Architecture notes (resolved — record, don't re-litigate)
- **Provider = Convex Auth** (`@convex-dev/auth`); **claim credential = Password** (email+password);
  **scope = identity layer only**. Cross-device *data* push/merge is **#12**; claim-as-data-merge UI
  is **#14**; file upload is **#13** — none of that is in 11.
- **Ownership is enforced server-side at push time, NOT by a local `owner` field.** The reconciler
  (#12) runs its push mutations as the authenticated Convex user, so `ctx.auth` scopes the data.
  → 11a (and 11b/11c) **must not** add an `owner`/`userId` field to core/store records or change any
  mutation signature. The local store and outbox are untouched by this whole umbrella. Invariants
  #1/#2 stay intact.
- **Anonymous = the online sync identity; offline-first is unaffected.** Convex's Anonymous provider
  needs network, so on a first-ever-offline launch there is simply no Convex session yet — the app
  is fully usable (invariant #1) and the outbox accumulates locally. The client (11b/11c) signs in
  anonymously once connectivity exists. **Claim** upgrades that *same* anonymous user to a Password
  account (Convex Auth preserves the user id), so already-pushed data keeps its owner. Signing into a
  *different existing* account is the merge case — deferred to #14.

## Implementation

### `convex/auth.ts` (new)
`convexAuth({ providers: [Anonymous, Password] })` and export `{ auth, signIn, signOut, store, isAuthenticated }`.
- `import Anonymous from "@convex-dev/auth/providers/Anonymous";`
- `import { Password } from "@convex-dev/auth/providers/Password";`
- Default `Password()` config (email+password); no custom profile/verification this unit (password
  reset email is out of scope — needs an email provider, deferred).

### `convex/http.ts` (new)
```ts
import { httpRouter } from "convex/server";
import { auth } from "./auth";
const http = httpRouter();
auth.addHttpRoutes(http);
export default http;
```

### `convex/schema.ts` (edit)
Merge the auth tables into the (currently empty) schema:
```ts
import { defineSchema } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
export default defineSchema({ ...authTables });
```
No app tables yet — those land in #12. (`authTables` provides `users`, `authAccounts`,
`authSessions`, `authRefreshTokens`, `authVerificationCodes`, `authVerifiers`, `authRateLimits`.)

### `convex/auth.config.ts` (generated/confirmed by setup)
The `npx @convex-dev/auth` setup writes this (Convex provider keyed on `CONVEX_SITE_URL`,
`applicationID: "convex"`). Commit it; do not hand-author the JWT material.

### `convex/users.ts` (new) — the consumer-facing contract 11b/11c import
- `currentUser` **query**: `const userId = await getAuthUserId(ctx)` (from `@convex-dev/auth/server`);
  return `null` if no `userId`, else `ctx.db.get(userId)` projected to a safe shape
  `{ _id, email, isAnonymous }` (`isAnonymous` = no `email`/`authAccounts` of provider `password` —
  simplest: `email == null`). This is how a client tells "anonymous vs claimed".
- Keep it a pure query (no writes); arg validator `{}` (Convex eslint plugin requires explicit args).

### Account-bound setup step (USER runs once — like the EAS/Cloudflare secrets convention)
This unit's backend cannot deploy until the deployment has auth keys. Document in the tracker and
PR body that the user must run, in repo root (or `convex/`):
1. `npx @convex-dev/auth` — interactive; mints `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` env vars on the
   dev deployment and creates/updates `convex/auth.config.ts`.
2. `npx convex dev` (or `pnpm --filter @ember/convex dev`) — pushes the auth-enabled schema; confirm
   no schema errors and the `users`/`currentUser` function appears in the dashboard.
The executor builds the code; the **user** performs the deployment + reports success (this unit's
equivalent of a device-verify gate — there is no headless way to mint deployment JWT keys).

## Dependencies
Install in `convex/` (the package that owns the backend). Resolve exact versions at install time
(`npm view <pkg> version`); values below verified against the live registry 2026-06-15:
- `@convex-dev/auth@0.0.94` — Convex Auth library (providers, `authTables`, `getAuthUserId`, http routes).
- `@auth/core@0.41.2` — required peer of `@convex-dev/auth` (Auth.js core; provider primitives).
- `convex` stays at the repo-pinned **1.40.0** (architecture.md) — do not bump to registry-latest 1.41.0.

## Verify when done
- [ ] `convex/auth.ts`, `http.ts`, `users.ts` exist; `schema.ts` spreads `...authTables`; `auth.config.ts` committed.
- [ ] `currentUser` returns `null` unauthenticated and a `{ _id, email, isAnonymous }` projection when authed.
- [ ] No core/store/outbox source changed; no mutation signature gained an `owner`/`userId` arg (invariants #1/#2).
- [ ] `pnpm -w typecheck` passes (incl. `convex/` `tsc --noEmit`).
- [ ] `pnpm -w test` passes (no new tests required — config + one query; convex-test harness deferred).
- [ ] `pnpm -w lint` clean (incl. `@convex-dev/eslint-plugin` arg-validator/query-misuse rules on the new files).
- [ ] **USER setup gate:** `npx @convex-dev/auth` run + `convex dev` deploys the auth schema with no errors;
      `currentUser` visible in the Convex dashboard. (No headless substitute — JWT keys are deployment-bound.)
- [ ] No invariant in architecture.md violated (#1 offline-first untouched; #2 outbox unchanged).

## Dispatch
Standard route: Sonnet executor builds `convex/` (config + query; no UI, so no frontend-design/impeccable)
→ fresh-context Opus reviewer checks invariant #1/#2 non-violation (no owner field, store untouched),
Convex-eslint cleanliness, and that the Anonymous+Password+`authTables`+http wiring matches the
`@convex-dev/auth` contract → branch `feat/97-convex-auth-backend`, commit, PR "Closes #97" → USER runs
the setup/deploy gate before merge. Next: 11b (web auth UI + provider).
