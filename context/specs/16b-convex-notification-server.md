# Unit 16b: Convex notification server — device registry, delivery ledger, scheduled Expo push

Issue: #133 (umbrella #16) · Branch: feat/133-convex-notification-server · Boundary: `convex/`
Route: standard — one boundary, well-trodden Convex fn/schema/cron logic, all forks resolved.
**One new dep: the official `@convex-dev/expo-push-notifications` component** (0.3.1; peer
`convex ^1.24.8`, we're on 1.40.0) — it is the supported, batteries-included relay; no `@ember/core`,
no core/store/apps change.

Second slice of umbrella **#16** (Notification engine), split by boundary like 13a–d / 12a–d:
**16a** pure core engine (MERGED) → **16b** Convex server (this) → **16c** web wiring → **16d**
mobile wiring (device-bound). 16a decides *what/when* on-device; **16b is the dumb arbiter+relay**
— it imports **no** `@ember/core` logic.

## Goal
A deployed Convex backend that lets an authed user: **register/heartbeat a device** (records its
Expo push token + liveness), **submit the day's notification intent** (the `selected` plan 16a
computed on-device), **atomically claim a (type, local-day) slot** so a notification fires on at most
one device (invariant #7), and — via a **cron** — **Expo-push** any due, unclaimed intent to the
user's **elected primary mobile device** through the official component. Server stores opaque
client-built copy; it runs no decision logic and no `@ember/core` import.

## Resolved forks (2026-06-29, with user)
- **Client decides, server relays + dedupes.** 16a's engine runs on-device (16c/d); the client
  submits its `selected` plan as an *intent* and the server only schedules/relays + dedupes. Keeps
  the decision single-sourced (respects #5) and preserves Convex's isolation from `@ember/core`
  (mirrors `sync.ts`, which re-implements LWW rather than importing core).
- **Use the official `@convex-dev/expo-push-notifications` component for the relay** (user direction,
  2026-06-29) instead of a hand-rolled `fetch` to `exp.host`. The component owns: token storage,
  batching (≤100/request), exponential-backoff retry, delivery receipts/status, and expired/invalid
  token cleanup. **We still own** scheduling (the due-scan cron), primary-device election, and the
  invariant-#7 ledger — the component has no concept of "one device per (type, day)". We key the
  component by **`deviceId`** (`new PushNotifications<string>(…)`): every elected push targets a
  specific device's token, never a fan-out to all the user's devices.
- **Expo push only (mobile).** Push targets devices that recorded an Expo token. Web (16c) uses local
  scheduled notifications + the shared ledger claim — **no** server push to browsers, no VAPID. The
  ledger still dedupes across web + mobile.
- **Most-recently-active device wins** election: among the owner's push-capable devices
  (`hasToken === true`), the one with the greatest `lastSeenAt` is primary (deterministic tie-break
  by `deviceId` ascending).
- **Suppress-if-read** is client-driven: when the on-device engine resolves a slot (fired locally, or
  goal met ⇒ suppressed), the client calls `claimSlot(via:'local'|'suppressed')`, which also cancels
  any pending intent so the cron won't push.

## Implementation

### `convex/convex.config.ts` (new) — register the component
```ts
import { defineApp } from "convex/server";
import pushNotifications from "@convex-dev/expo-push-notifications/convex.config.js";

const app = defineApp();
app.use(pushNotifications); // optionally { name: "pushNotifications" } — default name is fine
export default app;
```
The component installs its own tables/functions under its namespace on deploy — we do **not** define
token tables ourselves. (Optional, deferred: `EXPO_ACCESS_TOKEN` env for signed push — not required
for v1; note it at the deploy gate.)

### `convex/schema.ts` — add three owner-scoped tables (keep `...authTables`, `records`, `syncState`, `blobs`, `userKeys`)
```ts
pushDevices: defineTable({
  owner: v.id("users"),
  deviceId: v.string(),            // stable client device id (web-clock / native id, unit 04b/03c)
  platform: v.union(v.literal("ios"), v.literal("android"), v.literal("web")),
  hasToken: v.boolean(),           // true once an Expo token was recorded; the push-eligibility flag
                                   // (raw token lives in the component, not here — #1/no-secret leak)
  lastSeenAt: v.number(),          // server-stamped each register/heartbeat — the election key
})
  .index("by_owner", ["owner"])
  .index("by_owner_device", ["owner", "deviceId"]),

notificationIntents: defineTable({
  owner: v.id("users"),
  deviceId: v.string(),            // device that submitted this intent
  dedupeKey: v.string(),           // `${type}:${localDay}` (16a) — the invariant #7 unit
  type: v.string(),                // NotificationType (opaque string here)
  localDay: v.string(),
  scheduledWall: v.number(),       // absolute wall-ms epoch the client wants it delivered
  title: v.string(),               // client-built copy (warm voice, localized) — server is dumb
  body: v.string(),
  status: v.union(v.literal("pending"), v.literal("sent"), v.literal("canceled")),
})
  .index("by_owner_device_key", ["owner", "deviceId", "dedupeKey"])
  .index("by_owner_key", ["owner", "dedupeKey"])
  .index("by_status_scheduled", ["status", "scheduledWall"]), // cron due-scan

notificationLedger: defineTable({
  owner: v.id("users"),
  dedupeKey: v.string(),           // `${type}:${localDay}` — fires on at most one device (#7)
  claimedByDeviceId: v.string(),
  deliveredVia: v.union(v.literal("local"), v.literal("push"), v.literal("suppressed")),
  claimedAt: v.number(),
})
  .index("by_owner_key", ["owner", "dedupeKey"]),
```

### `convex/notifications.ts` — pure helper + 3 public fns + 1 internal mutation
All public fns authed via `getAuthUserId` (throw `"Unauthenticated"` on `null`). **Server time:**
`Date.now()` is allowed here — the no-`Date.now()` rule is a `@ember/core` purity invariant only.

Construct the component client once at module scope:
```ts
import { PushNotifications } from "@convex-dev/expo-push-notifications";
import { components } from "./_generated/api";
const push = new PushNotifications<string>(components.pushNotifications); // keyed by deviceId
```

Constants: `export const STALE_PUSH_MS = 2 * 60 * 60 * 1000;` (drop a due intent more than 2h late —
the day's window has passed; client will have suppressed/relit).

**`electPrimaryDevice(devices)` — pure, exported, unit-tested directly**
Input `pushDevices`-shaped rows. Filter to `hasToken === true`; return the one with max `lastSeenAt`,
tie-break by `deviceId` ascending; `null` if none push-eligible.

- **`registerDevice = mutation({ deviceId, platform, expoPushToken? })`** — upsert by
  `by_owner_device`. If `expoPushToken` provided: `await push.recordToken(ctx, { userId: deviceId,
  pushToken: expoPushToken })` and set `hasToken: true`; else leave `hasToken` as-is (web devices
  pass none). Patch `platform`/`hasToken`/`lastSeenAt: Date.now()` if the row exists, else insert.
  This is both registration and the liveness heartbeat (16c/d call it on launch + foreground).
  Returns `{ ok: true }`.

- **`submitIntent = mutation({ deviceId, dedupeKey, type, localDay, scheduledWall, title, body })`**
  — the client's "I plan to deliver this." First check `notificationLedger` `by_owner_key` for
  `dedupeKey`: if already claimed, **don't** create a pending intent — return
  `{ accepted: false, reason: "already-claimed" }`. Else upsert by `by_owner_device_key` (replace
  the device's prior plan for this key; reset `status: "pending"`). Returns `{ accepted: true }`.
  Idempotent.

- **`claimSlot = mutation({ dedupeKey, deviceId, via })`** where `via: v.union(v.literal("local"),
  v.literal("suppressed"))` — the atomic dedupe primitive (invariant #7). Convex mutations are
  serializable transactions, so read-then-insert is race-free:
  1. Look up `notificationLedger` `by_owner_key` for `dedupeKey`. If a row exists → return
     `{ won: false, claimedBy: row.claimedByDeviceId, via: row.deliveredVia }`.
  2. Else insert `{ owner, dedupeKey, claimedByDeviceId: deviceId, deliveredVia: via, claimedAt:
     Date.now() }`, then **cancel** every `notificationIntents` row for `(owner, dedupeKey)`
     (`by_owner_key`) by patching `status: "canceled"` (so the cron skips them). Return
     `{ won: true }`.

- **`runDueSweep = internalMutation({})`** — the cron's transactional core. Because the component's
  `sendPushNotification` is itself called *inside a mutation*, the ledger claim and the queued push
  commit (or roll back) together — no separate action, stronger at-most-once than a post-commit
  network call. `now = Date.now()`:
  1. Load pending due intents: `by_status_scheduled` where `status === "pending"` and
     `scheduledWall <= now` (`.take(200)`).
  2. Group by `owner`. For each owner, load `pushDevices` `by_owner` → `primary =
     electPrimaryDevice(devices)`.
  3. For each distinct `dedupeKey` in the owner's due set (process once per key):
     - **Stale:** if `now - scheduledWall > STALE_PUSH_MS` → patch all that key's due intents to
       `"canceled"`, skip (no push, no ledger claim — a fresh day re-plans).
     - **Already claimed:** if `notificationLedger` `by_owner_key` has the key → cancel the key's
       pending intents, skip.
     - **No primary:** if `primary === null` (web-only user, no push token) → leave intents pending
       (web fires locally + claims), skip.
     - Else **claim + send:** pick the intent for this key (prefer one submitted by
       `primary.deviceId`, else the most-recent due intent for the key); insert a ledger row
       `{ deliveredVia: "push", claimedByDeviceId: primary.deviceId, claimedAt: now }`; patch the
       chosen intent `status: "sent"` and cancel sibling intents for the key; then
       `await push.sendPushNotification(ctx, { userId: primary.deviceId, notification: { title,
       body } })`. (Returns `null` if the device is unregistered/paused in the component — tolerate;
       the ledger claim + `sent` mark stand, matching at-most-once.)
  4. Return a small summary (e.g. `{ pushed: number, skipped: number }`) for observability/tests.

- **`getNotificationState = query({})`** (small, for 16c/d + the device-verify screen) → returns the
  owner's `pushDevices` (id, platform, `hasToken`, lastSeenAt) + recent owner-scoped
  `notificationLedger` rows. Read-only, no secrets (no raw token is ever stored here).

### `convex/crons.ts` (new)
```ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval("notification push sweep", { minutes: 5 }, internal.notifications.runDueSweep, {});
export default crons;
```

### Ownership isolation
Every row carries `owner`; every fn derives `owner` from `ctx.auth` and touches only its own rows.
`runDueSweep` groups strictly by `owner` and only ever sends to a `deviceId` elected from that
owner's own `pushDevices`. User B can never register against, read the ledger of, claim, or receive a
push for User A. Server complement of invariant #1 on unit-11 auth.

## Dependencies
- **New:** `@convex-dev/expo-push-notifications@0.3.1` → add to `convex/package.json` dependencies
  (run `pnpm --filter @ember/convex add @convex-dev/expo-push-notifications@0.3.1`). It generates a
  component entry consumed via `components.pushNotifications` after a deploy/codegen.
- Already present (11a/12a/13a): `convex@1.40.0`, `@convex-dev/auth@0.0.94`, `convex-test@0.0.53` +
  `@edge-runtime/vm`. No core/store/apps change.

## Verify when done
- [ ] `electPrimaryDevice` (pure): picks max `lastSeenAt` among `hasToken` devices, tie-break by
      `deviceId`; `null` when none has a token.
- [ ] `registerDevice` inserts then upserts (platform/`hasToken`/`lastSeenAt` refreshed, no dup row);
      recording a token flips `hasToken` true and calls `push.recordToken`.
- [ ] `submitIntent` upserts a pending intent and replaces the device's prior plan for the key;
      returns `{ accepted:false, reason:"already-claimed" }` (no row written) when the slot is
      already in the ledger.
- [ ] `claimSlot`: first caller `{ won:true }` and cancels that key's pending intents; second caller
      `{ won:false, claimedBy }`; `via` recorded (`local`/`suppressed`).
- [ ] `runDueSweep`: for a due unclaimed intent with an elected primary, writes a `deliveredVia:
      "push"` ledger row + marks the intent `sent` + cancels siblings (the `push.sendPushNotification`
      call is the one line not asserted headlessly — see note); **skips & cancels stale**
      (`> STALE_PUSH_MS` late); **skips already-claimed** keys; **leaves pending** when the owner has
      no push-eligible primary; never touches a non-due (`scheduledWall > now`) intent.
- [ ] Ownership isolation: User B cannot see/claim/receive User A's intents, ledger, or devices; all
      public fns throw when unauthenticated.
- [ ] `pnpm -w typecheck` passes (`v`-validated args; `@convex-dev/eslint-plugin` clean)
- [ ] `pnpm -w test` passes — new `convex/notifications.test.ts` via `convex-test`, **registering the
      push component** per its README/`convex-test` component support (`t.registerComponent` /
      passing the component schema). Test our table mutations (claim/cancel/ledger/status/stale/
      no-primary/isolation) + `electPrimaryDevice` directly. If component registration under
      `convex-test` proves unsupported in 0.0.53, treat `push.sendPushNotification` as the
      un-headless seam (same stance as the old raw `fetch`): assert paths through the ledger/intent
      state and the `electPrimaryDevice === null` (no-send) branch, and verify the send at the deploy
      gate / 16d device acceptance. Do **not** block the unit on headless-pushing.
- [ ] `pnpm -w lint` clean
- [ ] No invariant violated — esp. **#1** (Convex off the read path; notifications are a relay, not a
      data source; raw tokens never stored in our schema), **#2** (intents/ledger/devices are direct
      authed calls **by design**, NOT outbox mutations — same exception class as 13a file metadata),
      **#5** (no merge/decision logic — server imports no `@ember/core`), **#7** (the ledger's
      `(owner, dedupeKey)` claim is the single enforcement point that a (type, local-day) fires once).

## Deferred to 16c / 16d (do NOT solve here)
- **16c (web):** register the browser device (no token), run 16a engine → `submitIntent`, schedule a
  local Notification at `scheduledWall`, `claimSlot('local')` on fire / `claimSlot('suppressed')` when
  goal met; permission UX. No server push received.
- **16d (mobile, device-bound):** `expo-notifications` permission + `getExpoPushTokenAsync` →
  `registerDevice(token)`; local `scheduleNotificationAsync` at `scheduledWall`; receive server Expo
  push when backgrounded; `claimSlot` on local fire / suppress; notification handler. Device-bound
  acceptance (tokens + real push can't be headlessly verified) per the 02d/13d convention.
- **#17 Settings:** quiet-hours / enabled-types / explicit-primary overrides (16b uses
  most-recently-active election; settings can later override).

## USER deploy gate (deployment-bound, before merge)
`npx convex dev --once` at repo root → installs the `@convex-dev/expo-push-notifications` component
(its tables/functions), pushes our 3 tables (`pushDevices`, `notificationIntents`,
`notificationLedger`, 5 indexes) **and registers the cron** to dev `necessary-warbler-246` — same
gate class as 11a/12a/13a; no headless substitute for a real schema+component+cron push. Confirm the
deploy is clean, the tables + the component appear, and the "notification push sweep" cron is listed
in the dashboard. (Optional: set `EXPO_ACCESS_TOKEN` for signed push later — not required for v1.)
