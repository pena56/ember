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
});
