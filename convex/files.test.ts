/**
 * Tests for convex/files.ts — file storage server (Unit 13a).
 *
 * Auth mocking strategy: identical to sync.test.ts.
 *   getAuthUserId() from @convex-dev/auth splits identity.subject on "|" and
 *   returns the first segment. We insert a real users row, get its _id, then
 *   call t.withIdentity({ subject: `${_id}|session1` }).
 *
 * Storage: use t.run((ctx) => ctx.storage.store(new Blob([bytes]))) to mint
 *   a real storageId, then pass it to saveBlob.
 *
 * modules must be passed explicitly from this file because import.meta.glob
 * is a Vite/vitest transform and only resolves correctly when called from
 * within the test file's module context.
 */

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { FILE_CAP, USER_QUOTA } from "./files";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeUser(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {});
  });
  const asUser = t.withIdentity({ subject: `${userId}|session1` });
  return { userId, asUser };
}

/** Store bytes in Convex storage and return the storageId. */
async function storeBlob(
  t: ReturnType<typeof convexTest>,
  bytes: Uint8Array,
): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => {
    // Blob constructor requires ArrayBuffer (not SharedArrayBuffer), so we
    // slice() to get a plain ArrayBuffer regardless of the Uint8Array source.
    const storageId = await ctx.storage.store(
      new Blob([bytes.buffer.slice(0) as ArrayBuffer]),
    );
    return storageId as Id<"_storage">;
  });
}

// ---------------------------------------------------------------------------
// generateUploadUrl
// ---------------------------------------------------------------------------

test("generateUploadUrl (authed) returns a non-empty URL string", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  const url = await asUser.mutation(api.files.generateUploadUrl, {});
  expect(typeof url).toBe("string");
  expect(url.length).toBeGreaterThan(0);
});

test("generateUploadUrl throws when unauthenticated", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.files.generateUploadUrl, {})).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// saveBlob + getDownloadUrl roundtrip
// ---------------------------------------------------------------------------

test("saveBlob registers a blob and getDownloadUrl returns a non-null URL", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const storageId = await storeBlob(t, bytes);

  const result = await asUser.mutation(api.files.saveBlob, {
    contentId: "abc123",
    storageId,
  });
  expect(result).toEqual({ ok: true });

  const url = await asUser.query(api.files.getDownloadUrl, {
    contentId: "abc123",
  });
  expect(url).not.toBeNull();
  expect(typeof url).toBe("string");
});

test("getDownloadUrl returns null for an unknown contentId", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  const url = await asUser.query(api.files.getDownloadUrl, {
    contentId: "no-such-content",
  });
  expect(url).toBeNull();
});

test("saveBlob throws when unauthenticated", async () => {
  const t = convexTest(schema, modules);

  const bytes = new Uint8Array([1, 2, 3]);
  const storageId = await storeBlob(t, bytes);

  await expect(
    t.mutation(api.files.saveBlob, { contentId: "abc", storageId }),
  ).rejects.toThrow();
});

test("getDownloadUrl throws when unauthenticated", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.query(api.files.getDownloadUrl, { contentId: "abc" }),
  ).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// missing-upload: storageId that doesn't exist
// ---------------------------------------------------------------------------

test("saveBlob with non-existent storageId returns ok:false code:missing-upload", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  // Use a real storageId format but one that doesn't exist in storage
  // We store then delete it so it has the right shape but is gone
  const bytes = new Uint8Array([1]);
  const storageId = await storeBlob(t, bytes);
  // Delete the storage object so it's missing
  await t.run(async (ctx) => {
    await ctx.storage.delete(storageId);
  });

  const result = await asUser.mutation(api.files.saveBlob, {
    contentId: "missing",
    storageId,
  });
  expect(result).toEqual({ ok: false, code: "missing-upload" });
});

// ---------------------------------------------------------------------------
// over-file-cap: blob > FILE_CAP is rejected and storage object deleted
// ---------------------------------------------------------------------------

test("saveBlob rejects blob over FILE_CAP with over-file-cap and leaves usage unchanged", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  // Store a blob that is just over FILE_CAP
  const oversizedBytes = new Uint8Array(FILE_CAP + 1);
  const storageId = await storeBlob(t, oversizedBytes);

  const result = await asUser.mutation(api.files.saveBlob, {
    contentId: "big-file",
    storageId,
  });
  expect(result).toMatchObject({ ok: false, code: "over-file-cap" });

  // Usage must be unchanged (zero) — the blob was NOT registered
  const usage = await asUser.query(api.files.getStorageUsage, {});
  expect(usage.used).toBe(0);

  // The orphaned upload IS deleted — saveBlob returns (not throws), so the
  // ctx.storage.delete() commits. No storage leak.
  const orphanUrl = await t.run(async (ctx) => ctx.storage.getUrl(storageId));
  expect(orphanUrl).toBeNull();
});

// ---------------------------------------------------------------------------
// over-quota: used + size > USER_QUOTA → rejected + storage deleted
// ---------------------------------------------------------------------------

test("saveBlob rejects blob that would exceed USER_QUOTA with over-quota error", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await makeUser(t);

  // Fill up close to the quota by directly inserting a blobs row
  // (bypassing saveBlob to avoid storing 1 GB of real bytes in the test)
  const fakeStorageId = await storeBlob(t, new Uint8Array([0]));
  await t.run(async (ctx) => {
    await ctx.db.insert("blobs", {
      owner: userId,
      contentId: "existing-big-file",
      storageId: fakeStorageId,
      encryptedSize: USER_QUOTA - 10, // just 10 bytes under quota
    });
  });

  // Now try to save a blob that is 20 bytes — would push used to USER_QUOTA + 10
  const newBytes = new Uint8Array(20);
  const newStorageId = await storeBlob(t, newBytes);

  const result = await asUser.mutation(api.files.saveBlob, {
    contentId: "new-file",
    storageId: newStorageId,
  });
  expect(result).toMatchObject({ ok: false, code: "over-quota" });

  // Usage must still reflect only the pre-existing blobs (new-file was NOT registered)
  const usage = await asUser.query(api.files.getStorageUsage, {});
  expect(usage.used).toBe(USER_QUOTA - 10);

  // The orphaned upload IS deleted — saveBlob returns (not throws), so cleanup commits.
  const orphanUrl = await t.run(async (ctx) =>
    ctx.storage.getUrl(newStorageId),
  );
  expect(orphanUrl).toBeNull();
});

// ---------------------------------------------------------------------------
// re-upload of existing contentId replaces, not double-counts, frees old storage
// ---------------------------------------------------------------------------

test("re-uploading an existing contentId replaces the blob and frees the old storage", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  // First upload
  const bytes1 = new Uint8Array([1, 2, 3]);
  const storageId1 = await storeBlob(t, bytes1);
  await asUser.mutation(api.files.saveBlob, {
    contentId: "content-abc",
    storageId: storageId1,
  });

  const usageAfterFirst = await asUser.query(api.files.getStorageUsage, {});
  expect(usageAfterFirst.used).toBe(3);

  // Second upload — same contentId, different (larger) bytes
  const bytes2 = new Uint8Array([1, 2, 3, 4, 5]);
  const storageId2 = await storeBlob(t, bytes2);
  await asUser.mutation(api.files.saveBlob, {
    contentId: "content-abc",
    storageId: storageId2,
  });

  // Usage reflects new size only (no double-count)
  const usageAfterSecond = await asUser.query(api.files.getStorageUsage, {});
  expect(usageAfterSecond.used).toBe(5);

  // Old storage object is freed
  const oldUrl = await t.run(async (ctx) => ctx.storage.getUrl(storageId1));
  expect(oldUrl).toBeNull();

  // Download URL still works (now points to new storageId2)
  const url = await asUser.query(api.files.getDownloadUrl, {
    contentId: "content-abc",
  });
  expect(url).not.toBeNull();
});

test("re-upload of existing contentId does not double-count toward quota", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  // Store first version
  const bytes1 = new Uint8Array(100);
  const storageId1 = await storeBlob(t, bytes1);
  await asUser.mutation(api.files.saveBlob, {
    contentId: "doc-x",
    storageId: storageId1,
  });

  // Store second version — same contentId
  const bytes2 = new Uint8Array(200);
  const storageId2 = await storeBlob(t, bytes2);
  await asUser.mutation(api.files.saveBlob, {
    contentId: "doc-x",
    storageId: storageId2,
  });

  // Usage should be 200, not 300
  const usage = await asUser.query(api.files.getStorageUsage, {});
  expect(usage.used).toBe(200);
});

// ---------------------------------------------------------------------------
// getOrCreateBlobKey — minted once, stable
// ---------------------------------------------------------------------------

test("getOrCreateBlobKey mints a key on first call and returns the same key on subsequent calls", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  const result1 = await asUser.mutation(api.files.getOrCreateBlobKey, {});
  expect(typeof result1.key).toBe("string");
  expect(result1.key.length).toBeGreaterThan(0);

  const result2 = await asUser.mutation(api.files.getOrCreateBlobKey, {});
  expect(result2.key).toBe(result1.key);

  const result3 = await asUser.mutation(api.files.getOrCreateBlobKey, {});
  expect(result3.key).toBe(result1.key);
});

test("getOrCreateBlobKey throws when unauthenticated", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.files.getOrCreateBlobKey, {}),
  ).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// deleteBlob — removes row + storage, idempotent
// ---------------------------------------------------------------------------

test("deleteBlob removes the row and the storage object", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  const bytes = new Uint8Array([10, 20, 30]);
  const storageId = await storeBlob(t, bytes);
  await asUser.mutation(api.files.saveBlob, {
    contentId: "to-delete",
    storageId,
  });

  // Confirm it exists
  const urlBefore = await asUser.query(api.files.getDownloadUrl, {
    contentId: "to-delete",
  });
  expect(urlBefore).not.toBeNull();

  // Delete it
  await asUser.mutation(api.files.deleteBlob, { contentId: "to-delete" });

  // Row is gone — getDownloadUrl returns null
  const urlAfter = await asUser.query(api.files.getDownloadUrl, {
    contentId: "to-delete",
  });
  expect(urlAfter).toBeNull();

  // Storage object is also gone
  const storageUrl = await t.run(async (ctx) => ctx.storage.getUrl(storageId));
  expect(storageUrl).toBeNull();
});

test("deleteBlob is idempotent — second call is a no-op and does not throw", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  const bytes = new Uint8Array([1]);
  const storageId = await storeBlob(t, bytes);
  await asUser.mutation(api.files.saveBlob, {
    contentId: "idem-test",
    storageId,
  });

  await asUser.mutation(api.files.deleteBlob, { contentId: "idem-test" });
  // Second call should not throw
  await expect(
    asUser.mutation(api.files.deleteBlob, { contentId: "idem-test" }),
  ).resolves.not.toThrow();
});

test("deleteBlob on non-existent contentId is a no-op", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  await expect(
    asUser.mutation(api.files.deleteBlob, { contentId: "never-existed" }),
  ).resolves.not.toThrow();
});

test("deleteBlob throws when unauthenticated", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.files.deleteBlob, { contentId: "abc" }),
  ).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// getStorageUsage — accurate across register/replace/delete
// ---------------------------------------------------------------------------

test("getStorageUsage reflects register, replace, and delete accurately", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  // Initially zero
  const usage0 = await asUser.query(api.files.getStorageUsage, {});
  expect(usage0.used).toBe(0);
  expect(usage0.quota).toBe(USER_QUOTA);
  expect(usage0.fileCap).toBe(FILE_CAP);

  // Register first blob (10 bytes)
  const s1 = await storeBlob(t, new Uint8Array(10));
  await asUser.mutation(api.files.saveBlob, { contentId: "c1", storageId: s1 });
  const usage1 = await asUser.query(api.files.getStorageUsage, {});
  expect(usage1.used).toBe(10);

  // Register second blob (20 bytes)
  const s2 = await storeBlob(t, new Uint8Array(20));
  await asUser.mutation(api.files.saveBlob, { contentId: "c2", storageId: s2 });
  const usage2 = await asUser.query(api.files.getStorageUsage, {});
  expect(usage2.used).toBe(30);

  // Replace first blob with 15 bytes
  const s3 = await storeBlob(t, new Uint8Array(15));
  await asUser.mutation(api.files.saveBlob, { contentId: "c1", storageId: s3 });
  const usage3 = await asUser.query(api.files.getStorageUsage, {});
  expect(usage3.used).toBe(35); // 15 + 20

  // Delete second blob
  await asUser.mutation(api.files.deleteBlob, { contentId: "c2" });
  const usage4 = await asUser.query(api.files.getStorageUsage, {});
  expect(usage4.used).toBe(15); // only c1 remains
});

test("getStorageUsage throws when unauthenticated", async () => {
  const t = convexTest(schema, modules);
  await expect(t.query(api.files.getStorageUsage, {})).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// Cross-user isolation
// ---------------------------------------------------------------------------

test("User B cannot see User A's blob via getDownloadUrl", async () => {
  const t = convexTest(schema, modules);
  const { asUser: asUserA } = await makeUser(t);
  const { asUser: asUserB } = await makeUser(t);

  const bytes = new Uint8Array([1, 2, 3]);
  const storageId = await storeBlob(t, bytes);
  await asUserA.mutation(api.files.saveBlob, {
    contentId: "a-content",
    storageId,
  });

  // User B cannot see A's blob
  const url = await asUserB.query(api.files.getDownloadUrl, {
    contentId: "a-content",
  });
  expect(url).toBeNull();
});

test("User B's getStorageUsage does not count User A's blobs", async () => {
  const t = convexTest(schema, modules);
  const { asUser: asUserA } = await makeUser(t);
  const { asUser: asUserB } = await makeUser(t);

  const bytes = new Uint8Array(500);
  const storageId = await storeBlob(t, bytes);
  await asUserA.mutation(api.files.saveBlob, {
    contentId: "a-blob",
    storageId,
  });

  const usageB = await asUserB.query(api.files.getStorageUsage, {});
  expect(usageB.used).toBe(0);
});

test("User B cannot delete User A's blob", async () => {
  const t = convexTest(schema, modules);
  const { asUser: asUserA } = await makeUser(t);
  const { asUser: asUserB } = await makeUser(t);

  const bytes = new Uint8Array([1, 2, 3]);
  const storageId = await storeBlob(t, bytes);
  await asUserA.mutation(api.files.saveBlob, {
    contentId: "a-content",
    storageId,
  });

  // User B tries to delete A's content — should be a no-op (not found for B)
  await asUserB.mutation(api.files.deleteBlob, { contentId: "a-content" });

  // A's blob should still exist
  const url = await asUserA.query(api.files.getDownloadUrl, {
    contentId: "a-content",
  });
  expect(url).not.toBeNull();
});

test("User A and B each get their own distinct blob key", async () => {
  const t = convexTest(schema, modules);
  const { asUser: asUserA } = await makeUser(t);
  const { asUser: asUserB } = await makeUser(t);

  const { key: keyA } = await asUserA.mutation(
    api.files.getOrCreateBlobKey,
    {},
  );
  const { key: keyB } = await asUserB.mutation(
    api.files.getOrCreateBlobKey,
    {},
  );

  expect(typeof keyA).toBe("string");
  expect(typeof keyB).toBe("string");
  // Keys should be different (astronomically unlikely to collide)
  expect(keyA).not.toBe(keyB);
});
