import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

// Server is the single authority for these limits — clients read them via getStorageUsage.
export const FILE_CAP = 50 * 1024 * 1024; // 50 MB per file
export const USER_QUOTA = 1024 * 1024 * 1024; // 1 GB per user

// ---------------------------------------------------------------------------
// generateUploadUrl
// ---------------------------------------------------------------------------

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const owner = await getAuthUserId(ctx);
    if (owner === null) {
      throw new Error("Unauthenticated");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

// ---------------------------------------------------------------------------
// saveBlob
// ---------------------------------------------------------------------------

// saveBlob signals limit rejections by RETURNING a discriminated result, not by
// throwing. A Convex mutation is a transaction: a `throw` would roll back the
// ctx.storage.delete() cleanup, orphaning the just-uploaded ciphertext forever.
// Returning instead lets the cleanup delete COMMIT while still telling the client
// (13b/c/d) to keep the file local-only and not retry blindly — it branches on
// `result.ok` / `result.code`. Codes: "missing-upload" | "over-file-cap" | "over-quota".
export const saveBlob = mutation({
  args: {
    contentId: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    // 1. Auth
    const owner = await getAuthUserId(ctx);
    if (owner === null) {
      throw new Error("Unauthenticated");
    }

    // 2. Server-authoritative size — read from _storage system table
    const storageDoc = await ctx.db.system.get(args.storageId);
    if (storageDoc === null) {
      // Nothing uploaded to clean up.
      return { ok: false as const, code: "missing-upload" as const };
    }
    const size = storageDoc.size;

    // 3. Per-file cap check — delete the orphan (commits, since we return not throw)
    if (size > FILE_CAP) {
      await ctx.storage.delete(args.storageId);
      return {
        ok: false as const,
        code: "over-file-cap" as const,
        limit: FILE_CAP,
        attempted: size,
      };
    }

    // 4. Per-user quota check
    //    Sum encryptedSize over all blobs for this owner, EXCLUDING the existing
    //    row for this contentId (re-upload replaces, not adds).
    const allBlobs = await ctx.db
      .query("blobs")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .collect();

    const existingRow = allBlobs.find((b) => b.contentId === args.contentId);
    const used = allBlobs.reduce((acc, b) => {
      // Exclude the row being replaced so we don't double-count
      if (existingRow && b._id === existingRow._id) return acc;
      return acc + b.encryptedSize;
    }, 0);

    if (used + size > USER_QUOTA) {
      await ctx.storage.delete(args.storageId);
      return {
        ok: false as const,
        code: "over-quota" as const,
        limit: USER_QUOTA,
        used,
        attempted: size,
      };
    }

    // 5. Upsert by by_owner_content
    if (existingRow) {
      // Free old storage object before replacing (avoid orphan + double-count)
      await ctx.storage.delete(existingRow.storageId);
      await ctx.db.patch(existingRow._id, {
        storageId: args.storageId,
        encryptedSize: size,
      });
    } else {
      await ctx.db.insert("blobs", {
        owner,
        contentId: args.contentId,
        storageId: args.storageId,
        encryptedSize: size,
      });
    }

    // 6. Return ok
    return { ok: true as const };
  },
});

// ---------------------------------------------------------------------------
// getDownloadUrl
// ---------------------------------------------------------------------------

export const getDownloadUrl = query({
  args: {
    contentId: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await getAuthUserId(ctx);
    if (owner === null) {
      throw new Error("Unauthenticated");
    }

    const row = await ctx.db
      .query("blobs")
      .withIndex("by_owner_content", (q) =>
        q.eq("owner", owner).eq("contentId", args.contentId),
      )
      .unique();

    return row ? await ctx.storage.getUrl(row.storageId) : null;
  },
});

// ---------------------------------------------------------------------------
// getOrCreateBlobKey
// ---------------------------------------------------------------------------

export const getOrCreateBlobKey = mutation({
  args: {},
  handler: async (ctx) => {
    const owner = await getAuthUserId(ctx);
    if (owner === null) {
      throw new Error("Unauthenticated");
    }

    const existing = await ctx.db
      .query("userKeys")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .unique();

    if (existing) {
      return { key: existing.key };
    }

    // Generate a 256-bit AES-GCM key and encode as base64
    const rawKey = new Uint8Array(32);
    crypto.getRandomValues(rawKey);
    const key = btoa(String.fromCharCode(...rawKey));

    await ctx.db.insert("userKeys", { owner, key });
    return { key };
  },
});

// ---------------------------------------------------------------------------
// deleteBlob
// ---------------------------------------------------------------------------

export const deleteBlob = mutation({
  args: {
    contentId: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await getAuthUserId(ctx);
    if (owner === null) {
      throw new Error("Unauthenticated");
    }

    const row = await ctx.db
      .query("blobs")
      .withIndex("by_owner_content", (q) =>
        q.eq("owner", owner).eq("contentId", args.contentId),
      )
      .unique();

    if (!row) {
      // Idempotent — no-op if not found
      return;
    }

    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(row._id);
  },
});

// ---------------------------------------------------------------------------
// getStorageUsage
// ---------------------------------------------------------------------------

export const getStorageUsage = query({
  args: {},
  handler: async (ctx) => {
    const owner = await getAuthUserId(ctx);
    if (owner === null) {
      throw new Error("Unauthenticated");
    }

    const blobs = await ctx.db
      .query("blobs")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .collect();

    const used = blobs.reduce((acc, b) => acc + b.encryptedSize, 0);

    return { used, quota: USER_QUOTA, fileCap: FILE_CAP };
  },
});
