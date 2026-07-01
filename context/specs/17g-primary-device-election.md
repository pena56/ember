# Unit 17g: User-designated primary push device — convex election

Issue: #154 · Branch: feat/154-primary-device-election · Boundary: convex/
Route: **standard** — one boundary (convex), contained logic, no new dep, product resolved.
First slice of the split **explicit-primary** feature (user chose "user picks the device"):
**17g** convex schema + `setPrimaryDevice` + election honors the choice (this) → **17h** mobile
Settings device-picker → **17i** web Settings device-picker. This slice is server-only, no UI.

## Goal
Let the user's chosen device win the push election instead of the automatic recency heuristic.
Today `electPrimaryDevice` (convex/notifications.ts) picks the most-recently-active push-capable
device. This slice adds a **server-authoritative** per-device `isPrimary` flag, a mutation to set
it (exactly one primary per owner), and teaches the election to prefer the designated device —
falling back to the existing recency logic when nothing is designated or the choice is ineligible.
The device registry is already convex-authoritative (server-stamped `lastSeenAt`/`hasToken`), so
the designation lives there too — **not** in the local-first outbox. Device routing is infra, not
user document data, so invariants #1/#2 (source-of-truth / outbox+HLC) do not apply here.

### Resolved decisions (do NOT re-litigate)
- **"Primary" governs the async PUSH target only.** It changes only the cron `runDueSweep`
  election. Local/foreground delivery still claims the slot directly via `claimSlot` regardless of
  who is primary — a device the user is actively using should fire. Explicit-primary decides which
  device buzzes when nothing is in the foreground. Do NOT touch the `claimSlot` / local path.
- **The choice is a preference, honored when eligible.** If the designated device has no token
  (`hasToken === false`, e.g. lost token / web without push), the election **falls back to
  recency** among `hasToken` devices so a push still lands somewhere. Never return an
  `!hasToken` device as the push primary.
- **Exactly one primary per owner.** `setPrimaryDevice` is a Convex serializable transaction that
  sets the chosen device `true` and every other owner device `false` in the same mutation.
- **Invariant #7 unaffected.** At-most-once is still enforced by the ledger + a single election per
  (dedupeKey, day); this only changes *which* eligible device is chosen, never how many fire.
- **Server stays a dumb arbiter** (schema comment / invariant): no `@ember/core` import, no
  decision logic beyond routing. Election remains a pure, directly-unit-tested function.

## Implementation

### `convex/schema.ts` — `pushDevices`
- Add `isPrimary: v.boolean()` with a short comment: user-designated push target; server-owned,
  not synced via outbox; exactly one true per owner (enforced by `setPrimaryDevice`).

### `convex/notifications.ts`

**`electPrimaryDevice` (pure) — prefer the designated device**
- Widen the accepted `Pick<Doc<"pushDevices">, ...>` to also include `"isPrimary"` (both the param
  type and the return type).
- New logic: among `hasToken === true` devices, if any has `isPrimary === true`, return that one
  (there is at most one by construction; if somehow two, keep the existing tie-break — greatest
  `lastSeenAt`, then `deviceId` ascending — applied only to the `isPrimary` subset). Otherwise fall
  back to the current rule (greatest `lastSeenAt`, tie-break `deviceId` ascending) over all
  `hasToken` devices. Returns `null` when no device is push-eligible. Keep it allocation-light and
  comment the two-tier rule.

**`registerDevice` — default the flag**
- On INSERT, set `isPrimary: false`. On PATCH of an existing row, do **not** touch `isPrimary`
  (registration/heartbeat must never change the user's choice).

**`setPrimaryDevice` — new mutation**
```
export const setPrimaryDevice = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => { ... }
})
```
- `getAuthUserId`; throw `"Unauthenticated"` when null (match the file's existing pattern).
- Load the owner's devices (`by_owner`). If none matches `args.deviceId`, throw
  `"Unknown device"` (the client only offers the user's own registered devices; a miss is a bug).
- In the same handler, for each owner device: patch `isPrimary` to `(device.deviceId === args.deviceId)`
  — i.e. `true` on the chosen, `false` on the rest. Skip a patch if the value is already correct
  (minor; optional).
- Return `{ ok: true as const }`.
- Note: this does NOT require the chosen device to be `hasToken` — the user may designate a device
  before it finishes enabling push; the election's fallback covers the interim. (The client slice
  decides whether to visually gate ineligible devices.)

**`getNotificationState` — expose the flag**
- Add `isPrimary: d.isPrimary` to each mapped device object so the picker (17h/17i) can render the
  current selection. No secret exposure (still no raw tokens here).

**`runDueSweep`** — no change needed: it already calls `electPrimaryDevice(devices)` with full
device rows, which now include `isPrimary`. Confirm the `devices` query returns the whole row (it
does: `.collect()` on `by_owner`).

## Tests — `convex/notifications.test.ts`

Extend the existing suite (convex-test harness + `makeUser`). The pure-function cases can pass
device literals directly (now including `isPrimary`).

**`electPrimaryDevice` (pure):**
- Existing cases: add `isPrimary: false` to their device literals so they still compile and assert
  the recency fallback is unchanged when nothing is designated.
- New: a designated `isPrimary: true, hasToken: true` device wins even when another has a greater
  `lastSeenAt`.
- New: a designated device with `hasToken: false` is **ignored**; election falls back to the
  most-recently-active `hasToken` device.
- New: no designated device → identical to today (max `lastSeenAt` among `hasToken`).

**`setPrimaryDevice` (mutation, through the harness):**
- Register two devices for one owner; `setPrimaryDevice(deviceB)` → read state → exactly deviceB
  `isPrimary`, deviceA false.
- Switching primary (`setPrimaryDevice(deviceA)` after B) flips exactly one true and the other
  false (no two-primaries state).
- `setPrimaryDevice` with an unknown deviceId → throws `"Unknown device"`.
- Unauthenticated (no identity) → throws `"Unauthenticated"`.
- New inserts default `isPrimary: false` (register one device, read state, assert false before any
  set).

**End-to-end election in the sweep (optional but valuable, mirrors existing sweep tests):**
- Two `hasToken` devices, designate the *older-lastSeen* one primary, submit a due intent from
  each, run `runDueSweep` → the ledger `claimedByDeviceId` is the **designated** device (not the
  most-recent). Confirms the flag actually steers `runDueSweep`.

## Dependencies
- none (pure schema + convex function changes; convex-test already in place).

## Verify when done
- [ ] `electPrimaryDevice` prefers a `hasToken` designated device over a more-recent one; ignores a
      designated `!hasToken` device (falls back to recency); unchanged when none designated.
- [ ] `setPrimaryDevice` sets exactly one primary per owner; switching flips atomically; unknown
      device throws; unauthenticated throws.
- [ ] `registerDevice` inserts `isPrimary: false` and never mutates it on heartbeat.
- [ ] `getNotificationState` returns `isPrimary` per device; no raw token exposed.
- [ ] `runDueSweep` routes the push to the designated device (sweep e2e case).
- [ ] Invariant #7 intact (single election per key/day; ledger still the at-most-once gate);
      server imports no `@ember/core` and adds no decision logic beyond routing.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean

## Out of scope (later slices)
- The Settings **device-picker UI** — mobile **17h**, web **17i** (read `getNotificationState`,
  radio-select the primary, call `setPrimaryDevice`; decide whether to visually gate a device that
  is not yet `hasToken`).
- The **stale-intent claim-review** correctness gap (disabling a type after its intent was
  submitted should cancel the pending server intent) — a separate queued unit, unrelated to
  primary election.
