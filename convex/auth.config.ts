// This file is normally generated/confirmed by running `npx @convex-dev/auth`
// (an interactive CLI that mints JWT_PRIVATE_KEY, JWKS, and SITE_URL on your
// Convex deployment).  It is hand-authored here so that `tsc --noEmit` passes
// before the user runs the setup gate.
//
// USER GATE: run `npx @convex-dev/auth` from the repo root (or convex/).
// That command will confirm this file is already correct or overwrite it with
// deployment-specific values.  Then run `npx convex dev` to push the schema.

export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
