import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  records: defineTable({
    owner: v.id("users"),
    collection: v.string(),
    recordId: v.string(),
    hlc: v.string(), // encoded HLC from the client entry; string-sort == HLC compare (03a)
    serverSeq: v.number(), // per-owner monotonic arrival order — the "Convex re-stamp" for pull
    deleted: v.boolean(), // tombstone (op:'delete' drops payload — outbox.ts already does this)
    doc: v.optional(v.any()),
  })
    .index("by_owner_key", ["owner", "collection", "recordId"])
    .index("by_owner_seq", ["owner", "serverSeq"]),

  syncState: defineTable({ owner: v.id("users"), seq: v.number() }).index(
    "by_owner",
    ["owner"],
  ),

  blobs: defineTable({
    owner: v.id("users"),
    contentId: v.string(), // = Document.id (sha256 hex of PLAINTEXT bytes, 04a)
    storageId: v.id("_storage"), // Convex-internal; never sent to clients
    encryptedSize: v.number(), // actual stored ciphertext byte length (quota unit)
  })
    .index("by_owner_content", ["owner", "contentId"])
    .index("by_owner", ["owner"]),

  userKeys: defineTable({
    owner: v.id("users"),
    key: v.string(), // base64 AES-256-GCM key
  }).index("by_owner", ["owner"]),

  // ---------------------------------------------------------------------------
  // Notification engine (16b) — owner-scoped device registry, intent queue, and
  // delivery ledger. Server is a dumb arbiter+relay: it imports no @ember/core
  // and runs no decision logic. Raw Expo tokens live in the push component, not
  // here (#1 — no secret leak); we only record push-eligibility via hasToken.
  // ---------------------------------------------------------------------------

  pushDevices: defineTable({
    owner: v.id("users"),
    deviceId: v.string(), // stable client device id (web-clock / native id, 04b/03c)
    platform: v.union(
      v.literal("ios"),
      v.literal("android"),
      v.literal("web"),
    ),
    hasToken: v.boolean(), // true once an Expo token was recorded; push-eligibility flag
    lastSeenAt: v.number(), // server-stamped each register/heartbeat — the election key
  })
    .index("by_owner", ["owner"])
    .index("by_owner_device", ["owner", "deviceId"]),

  notificationIntents: defineTable({
    owner: v.id("users"),
    deviceId: v.string(), // device that submitted this intent
    dedupeKey: v.string(), // `${type}:${localDay}` (16a) — the invariant #7 unit
    type: v.string(), // NotificationType (opaque string here)
    localDay: v.string(),
    scheduledWall: v.number(), // absolute wall-ms epoch the client wants delivery
    title: v.string(), // client-built copy (warm voice, localized) — server is dumb
    body: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("canceled"),
    ),
  })
    .index("by_owner_device_key", ["owner", "deviceId", "dedupeKey"])
    .index("by_owner_key", ["owner", "dedupeKey"])
    .index("by_status_scheduled", ["status", "scheduledWall"]), // cron due-scan

  notificationLedger: defineTable({
    owner: v.id("users"),
    dedupeKey: v.string(), // `${type}:${localDay}` — fires on at most one device (#7)
    claimedByDeviceId: v.string(),
    deliveredVia: v.union(
      v.literal("local"),
      v.literal("push"),
      v.literal("suppressed"),
    ),
    claimedAt: v.number(),
  }).index("by_owner_key", ["owner", "dedupeKey"]),
});
