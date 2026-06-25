import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

export const push = mutation({
  args: {
    entries: v.array(
      v.object({
        id: v.string(),
        hlc: v.string(),
        collection: v.string(),
        recordId: v.string(),
        op: v.union(v.literal("put"), v.literal("delete")),
        payload: v.optional(v.any()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const owner = await getAuthUserId(ctx);
    if (owner === null) {
      throw new Error("Unauthenticated");
    }

    // Load or create the syncState row for this owner
    const syncStateRow = await ctx.db
      .query("syncState")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .unique();

    let seq = syncStateRow?.seq ?? 0;
    const acked: string[] = [];

    for (const entry of args.entries) {
      const existing = await ctx.db
        .query("records")
        .withIndex("by_owner_key", (q) =>
          q
            .eq("owner", owner)
            .eq("collection", entry.collection)
            .eq("recordId", entry.recordId),
        )
        .unique();

      // LWW: accept iff no existing row or incoming HLC is strictly greater
      if (!existing || entry.hlc > existing.hlc) {
        seq += 1;
        const patch = {
          owner,
          collection: entry.collection,
          recordId: entry.recordId,
          hlc: entry.hlc,
          serverSeq: seq,
          deleted: entry.op === "delete",
          doc: entry.op === "put" ? entry.payload : undefined,
        };
        if (existing) {
          await ctx.db.patch(existing._id, patch);
        } else {
          await ctx.db.insert("records", patch);
        }
      }

      // Always ack — superseded entries must be dropped from the outbox too
      acked.push(entry.id);
    }

    // Persist updated seq
    if (syncStateRow) {
      await ctx.db.patch(syncStateRow._id, { seq });
    } else {
      await ctx.db.insert("syncState", { owner, seq });
    }

    return { acked };
  },
});

export const pull = query({
  args: {
    cursor: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const owner = await getAuthUserId(ctx);
    if (owner === null) {
      throw new Error("Unauthenticated");
    }

    const rows = await ctx.db
      .query("records")
      .withIndex("by_owner_seq", (q) =>
        q.eq("owner", owner).gt("serverSeq", args.cursor),
      )
      .order("asc")
      .take(args.limit ?? 200);

    const entries = rows.map((row) => ({
      collection: row.collection,
      recordId: row.recordId,
      hlc: row.hlc,
      op: (row.deleted ? "delete" : "put") as "delete" | "put",
      payload: row.doc,
      serverSeq: row.serverSeq,
    }));

    return {
      entries,
      cursor: entries.length > 0 ? entries[entries.length - 1]!.serverSeq : args.cursor,
    };
  },
});
