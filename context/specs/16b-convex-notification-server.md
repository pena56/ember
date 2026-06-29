# Unit 16b: Convex notification server — device registry, delivery ledger, scheduled Expo push

Issue: #133 (umbrella #16) · Branch: feat/133-convex-notification-server · Boundary: `convex/`
Route: standard — one boundary, well-trodden Convex fn/schema/cron logic, all forks resolved; no
new dep (`convex-test` present from 12a; Expo push via raw `fetch`). No core/store/apps change.

Second slice of umbrella **#16** (Notification engine), split by boundary like 13a–d / 12a–d:
**16a** pure core engine (MERGED) → **16b** Convex server (this) → **16c** web wiring → **16d**
mobile wiring (device-bound). 16a decides *what/when* on-device; **16b is the dumb arbiter+relay**
— it imports **no** `@ember/core` logic.

## Goal
A deployed Convex backend that lets an authed user: **register/heartbeat a device** (push token +
liveness), **submit the day's notification intent** (the `selected` plan 16a computed on-device),
**atomically claim a (type, local-day) slot** so a notification fires on at most one device
(invariant #7), and — via a **cron** — **Expo-push** any due, unclaimed intent to the user's
**elected primary mobile device**. Server stores opaque client-built copy; it runs no decision
logic and no `@ember/core` import.

## Resolved forks (2026-06-29, with user)
- **Client decides, server relays + dedupes.** 16a's engine runs on-device (16c/d); the client
  submits its `selected` plan as an *intent* and the server only schedules/relays + dedupes. Keeps
  the decision single-sourced (respects #5) and preserves Convex's isolation from `@ember/core`
  (mirrors `sync.ts`, which re-implements LWW rather than importing core).
- **Expo push only (mobile).** Server push targets devices with an `expoPushToken`. Web (16c) uses
  local scheduled notifications + the shared ledger claim — **no** server push to browsers, no
  VAPID. The ledger still dedupes across web + mobile.
- **Most-recently-active device wins** election: among the owner's push-capable devices, the one
  with the greatest `lastSeenAt` is primary (deterministic tie-break by `deviceId` ascending).
- **Suppress-if-read** is client-driven: when the on-device engine resolves a slot (fired locally,
  or goal met ⇒ suppressed), the client calls `claimSlot(via:'local'|'suppressed')`, which also
  cancels any pending intent so the cron won't push.

## Implementation

### `convex/schema.ts` — add three owner-scoped tables (keep `...authTables`, `records`, `syncState`, `blobs`, `userKeys`)
```ts
pushDevices: defineTable({
  owner: v.id("users"),
  deviceId: v.string(),            // stable client device id (web-clock / native id, unit 04b/03c)
  platform: v.union(v.literal("ios"), v.literal("android"), v.literal("web")),
  expoPushToken: v.optional(v.string()), // absent for web; presence ⇒ push-eligible
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
`Date.now()` is allowed here — the no-`Date.now()` rule is a `@ember/core` purity invariant only;
this is the server runtime.

Constants: `export const STALE_PUSH_MS = 2 * 60 * 60 * 1000;` (drop a due intent more than 2h late
— the day's window has passed; client will have suppressed/relit).

**`electPrimaryDevice(devices)` — pure, exported, unit-tested directly**
Input `pushDevices`-shaped rows. Filter to those with a non-empty `expoPushToken`; return the one
with max `lastSeenAt`, tie-break by `deviceId` ascending; `null` if none push-eligible.

- **`registerDevice = mutation({ deviceId, platform, expoPushToken? })`** — upsert by
  `by_owner_device`: patch `platform`/`expoPushToken`/`lastSeenAt: Date.now()` if the row exists,
  else insert. This is both registration and the liveness heartbeat (16c/d call it on launch +
  foreground). Returns `{ ok: true }`.

- **`submitIntent = mutation({ deviceId, dedupeKey, type, localDay, scheduledWall, title, body })`**
  — the client's "I plan to deliver this." First check `notificationLedger` `by_owner_key` for
  `dedupeKey`: if already claimed, **don't** create a pending intent — return
  `{ accepted: false, reason: "already-claimed" }`. Else upsert by `by_owner_device_key`
  (replace the device's prior plan for this key; reset `status: "pending"`). Returns
  `{ accepted: true }`. Idempotent.

- **`claimSlot = mutation({ dedupeKey, deviceId, via })`** where `via: v.union(v.literal("local"),
  v.literal("suppressed"))` — the atomic dedupe primitive (invariant #7). Convex mutations are
  serializable transactions, so read-then-insert is race-free:
  1. Look up `notificationLedger` `by_owner_key` for `dedupeKey`. If a row exists → return
     `{ won: false, claimedBy: row.claimedByDeviceId, via: row.deliveredVia }`.
  2. Else insert `{ owner, dedupeKey, claimedByDeviceId: deviceId, deliveredVia: via, claimedAt:
     Date.now() }`, then **cancel** every `notificationIntents` row for `(owner, dedupeKey)`
     (`by_owner_key`) by patching `status: "canceled"` (so the cron skips them). Return
     `{ won: true }`.

- **`claimAndCollectDuePushes = internalMutation({})`** — the cron's transactional core (all DB
  work here; the action only does the network `fetch`). `now = Date.now()`:
  1. Load pending due intents: `by_status_scheduled` where `status === "pending"` and
     `scheduledWall <= now` (`.take(200)`).
  2. Group by `owner`. For each owner, load `pushDevices` `by_owner` → `primary =
     electPrimaryDevice(devices)`.
  3. For each distinct `dedupeKey` in the owner's due set (process once per key):
     - **Stale:** if `now - scheduledWall > STALE_PUSH_MS` → patch all that key's due intents to
       `"canceled"`, skip (no push, no ledger claim — a fresh day re-plans).
     - **Already claimed:** if `notificationLedger` `by_owner_key` has the key → cancel the key's
       pending intents, skip.
     - **No primary:** if `primary === null` (web-only user, no push token) → leave intents
       pending (web fires locally + claims), skip.
     - Else **claim + send:** pick the intent for this key (prefer one submitted by `primary.deviceId`,
       else the most-recent due intent for the key); insert a ledger row `{ deliveredVia: "push",
       claimedByDeviceId: primary.deviceId, claimedAt: now }`; patch the chosen intent `status:
       "sent"` and cancel sibling intents for the key; collect `{ token: primary.expoPushToken!,
       title, body }`.
  4. Return the collected message array.

- **`sweepDuePushes = internalAction({})`** — thin: `const msgs = await ctx.runMutation(internal.
  notifications.claimAndCollectDuePushes, {})`; if empty, return. Else POST to Expo in batches of
  ≤100: `fetch("https://exp.host/--/api/v2/push/send", { method:"POST", headers:{ "Content-Type":
  "application/json" }, body: JSON.stringify(batch.map(m => ({ to: m.token, title: m.title, body:
  m.body, sound: "default" }))) })`. Delivery is **at-most-once** (slot is marked `sent`/claimed
  before the network call so a retry can't double-fire); a failed POST drops that nudge — acceptable
  for v1, note it. No new dep — raw `fetch`, no `expo-server-sdk`.

- **`getNotificationState = query({})`** (small, for 16c/d + the device-verify screen) → returns the
  owner's `pushDevices` (id, platform, hasToken, lastSeenAt) + today-ish `notificationLedger` rows
  (owner-scoped). Read-only, no secrets (omit the raw token; expose `hasToken: boolean`).

### `convex/crons.ts` (new)
```ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval("notification push sweep", { minutes: 5 }, internal.notifications.sweepDuePushes, {});
export default crons;
```

### Ownership isolation
Every row carries `owner`; every fn derives `owner` from `ctx.auth` and touches only its own rows.
The cron's internal mutation groups strictly by `owner`. User B can never register against, read the
ledger of, claim, or receive a push for User A. Server complement of invariant #1 on unit-11 auth.

## Dependencies
- none new. `convex@1.40.0`, `@convex-dev/auth@0.0.94`, `convex-test@0.0.53` + `@edge-runtime/vm`
  already present (11a/12a/13a). Expo push = raw `fetch` (no `expo-server-sdk`). No core/store/apps
  change.

## Verify when done
- [ ] `electPrimaryDevice` (pure): picks max `lastSeenAt` among token-bearing devices, tie-break by
      `deviceId`; `null` when none has a token.
- [ ] `registerDevice` inserts then upserts (token/platform/`lastSeenAt` refreshed, no dup row).
- [ ] `submitIntent` upserts a pending intent and replaces the device's prior plan for the key;
      returns `{ accepted:false, reason:"already-claimed" }` (no row written) when the slot is
      already in the ledger.
- [ ] `claimSlot`: first caller `{ won:true }` and cancels that key's pending intents; second caller
      `{ won:false, claimedBy }`; `via` recorded (`local`/`suppressed`).
- [ ] `claimAndCollectDuePushes`: returns a push msg for a due unclaimed intent to the elected
      primary, writes a `deliveredVia:"push"` ledger row + marks the intent `sent`; **skips & cancels
      stale** (`> STALE_PUSH_MS` late) intents; **skips already-claimed** keys; **leaves pending** when
      the owner has no push-eligible primary; never returns a non-due (`scheduledWall > now`) intent.
- [ ] Ownership isolation: User B cannot see/claim/receive User A's intents, ledger, or devices; all
      public fns throw when unauthenticated.
- [ ] `pnpm -w typecheck` passes (`v`-validated args; `@convex-dev/eslint-plugin` clean)
- [ ] `pnpm -w test` passes (new `convex/notifications.test.ts` via `convex-test`; election helper
      tested directly; the `fetch` in `sweepDuePushes` is NOT unit-tested — assert the collecting
      mutation instead, the action is a thin wrapper)
- [ ] `pnpm -w lint` clean
- [ ] No invariant violated — esp. **#1** (Convex off the read path; notifications are a relay, not a
      data source), **#2** (intents/ledger/devices are direct authed calls **by design**, NOT outbox
      mutations — the same exception class as 13a file metadata; nothing here syncs through `records`),
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
`npx convex dev --once` at repo root → push the 3 tables (`pushDevices`, `notificationIntents`,
`notificationLedger`, 6 indexes) **and register the cron** to dev `necessary-warbler-246` — same
gate class as 11a/12a/13a; no headless substitute for a real schema+cron push. Confirm the deploy is
clean, the tables appear, and the "notification push sweep" cron is listed in the dashboard.
