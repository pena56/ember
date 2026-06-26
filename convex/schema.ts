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
});
