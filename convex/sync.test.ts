/**
 * Tests for convex/sync.ts — push mutation and pull query.
 *
 * Auth mocking strategy:
 *   getAuthUserId() from @convex-dev/auth does:
 *     const identity = await ctx.auth.getUserIdentity();
 *     const [userId] = identity.subject.split("|");
 *     return userId;
 *
 *   So we:
 *     1. Use t.run() to insert a users row → get its _id (a valid Convex Id<"users">)
 *     2. Call t.withIdentity({ subject: `${_id}|session1` }) so getAuthUserId returns the real _id
 *
 *   This avoids any deep mocking and produces a fully valid owner Id that
 *   passes Convex's schema validation on insert.
 *
 *   modules must be passed explicitly from this file because import.meta.glob
 *   is a Vite/vitest transform and only resolves correctly when called from
 *   within the test file's module context (not from within convex-test's bundle).
 */

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
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

// ---------------------------------------------------------------------------
// push — insert + LWW
// ---------------------------------------------------------------------------

test("authed push inserts a new record", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  const result = await asUser.mutation(api.sync.push, {
    entries: [
      {
        id: "entry-1",
        hlc: "2024-01-01T00:00:00.000Z|0|device1",
        collection: "pages",
        recordId: "page-1",
        op: "put",
        payload: { title: "Hello" },
      },
    ],
  });

  expect(result.acked).toEqual(["entry-1"]);

  // Verify the record was written
  const { entries } = await asUser.query(api.sync.pull, { cursor: 0 });
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    collection: "pages",
    recordId: "page-1",
    op: "put",
  });
});

test("re-push with lower HLC is rejected (LWW)", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  // Push higher HLC first
  await asUser.mutation(api.sync.push, {
    entries: [
      {
        id: "entry-1",
        hlc: "2024-01-02T00:00:00.000Z|0|device1",
        collection: "pages",
        recordId: "page-1",
        op: "put",
        payload: { title: "Second write" },
      },
    ],
  });

  // Push lower HLC — should be rejected (not overwrite)
  const result = await asUser.mutation(api.sync.push, {
    entries: [
      {
        id: "entry-2",
        hlc: "2024-01-01T00:00:00.000Z|0|device1",
        collection: "pages",
        recordId: "page-1",
        op: "put",
        payload: { title: "First write — should lose" },
      },
    ],
  });

  // Still acked even though superseded
  expect(result.acked).toEqual(["entry-2"]);

  const { entries } = await asUser.query(api.sync.pull, { cursor: 0 });
  expect(entries).toHaveLength(1);
  // Payload should still reflect the higher-HLC write
  expect(entries[0]?.payload).toMatchObject({ title: "Second write" });
});

test("re-push with higher HLC wins (LWW)", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  // Push lower HLC first
  await asUser.mutation(api.sync.push, {
    entries: [
      {
        id: "entry-1",
        hlc: "2024-01-01T00:00:00.000Z|0|device1",
        collection: "pages",
        recordId: "page-1",
        op: "put",
        payload: { title: "Old" },
      },
    ],
  });

  // Push higher HLC — should win
  await asUser.mutation(api.sync.push, {
    entries: [
      {
        id: "entry-2",
        hlc: "2024-01-02T00:00:00.000Z|0|device1",
        collection: "pages",
        recordId: "page-1",
        op: "put",
        payload: { title: "New" },
      },
    ],
  });

  const { entries } = await asUser.query(api.sync.pull, { cursor: 0 });
  expect(entries).toHaveLength(1);
  expect(entries[0]?.payload).toMatchObject({ title: "New" });
});

test("op:delete writes a tombstone — deleted:true, no doc", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  await asUser.mutation(api.sync.push, {
    entries: [
      {
        id: "entry-1",
        hlc: "2024-01-01T00:00:00.000Z|0|device1",
        collection: "pages",
        recordId: "page-1",
        op: "delete",
      },
    ],
  });

  const { entries } = await asUser.query(api.sync.pull, { cursor: 0 });
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    op: "delete",
  });
  expect(entries[0]?.payload).toBeUndefined();
});

// ---------------------------------------------------------------------------
// push — acked includes superseded entries
// ---------------------------------------------------------------------------

test("push returns every submitted entry id in acked, including LWW-superseded ones", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  // Push a high HLC to win the LWW
  await asUser.mutation(api.sync.push, {
    entries: [
      {
        id: "winner",
        hlc: "2024-01-03T00:00:00.000Z|0|device1",
        collection: "pages",
        recordId: "page-1",
        op: "put",
        payload: { title: "Winner" },
      },
    ],
  });

  // Now push two entries: one superseded (lower HLC), one for a different recordId
  const result = await asUser.mutation(api.sync.push, {
    entries: [
      {
        id: "superseded",
        hlc: "2024-01-01T00:00:00.000Z|0|device1",
        collection: "pages",
        recordId: "page-1",
        op: "put",
        payload: { title: "Loser" },
      },
      {
        id: "new-record",
        hlc: "2024-01-02T00:00:00.000Z|0|device1",
        collection: "pages",
        recordId: "page-2",
        op: "put",
        payload: { title: "Other" },
      },
    ],
  });

  // Both entry ids must appear in acked
  expect(result.acked).toContain("superseded");
  expect(result.acked).toContain("new-record");
  expect(result.acked).toHaveLength(2);
});

test("same-batch duplicate key: in-loop read sees prior same-batch write (one row, higher wins)", async () => {
  const t = convexTest(schema, modules);
  const { asUser, userId } = await makeUser(t);

  // Two entries for the SAME key in ONE batch, lower HLC first then higher.
  // The in-loop `existing` read for the second entry MUST see the first entry's
  // write (Convex reads-your-writes within a mutation), otherwise the second
  // entry would INSERT a duplicate row for the same key instead of patching it.
  const result = await asUser.mutation(api.sync.push, {
    entries: [
      {
        id: "lower",
        hlc: "2024-01-01T00:00:00.000Z|0|device1",
        collection: "pages",
        recordId: "page-1",
        op: "put",
        payload: { title: "Lower" },
      },
      {
        id: "higher",
        hlc: "2024-01-02T00:00:00.000Z|0|device1",
        collection: "pages",
        recordId: "page-1",
        op: "put",
        payload: { title: "Higher" },
      },
    ],
  });

  // Both entry ids acked
  expect(result.acked).toEqual(["lower", "higher"]);

  // Exactly ONE records row exists for the key — the second write patched the
  // first rather than inserting a duplicate. This is the property that silently
  // regresses if the in-loop read does not see the prior same-batch write.
  const rows = await t.run(async (ctx) => {
    return await ctx.db
      .query("records")
      .withIndex("by_owner_key", (q) =>
        q
          .eq("owner", userId)
          .eq("collection", "pages")
          .eq("recordId", "page-1"),
      )
      .collect();
  });
  expect(rows).toHaveLength(1);
  // The higher-HLC entry won LWW.
  expect(rows[0]?.doc).toMatchObject({ title: "Higher" });
  expect(rows[0]?.hlc).toBe("2024-01-02T00:00:00.000Z|0|device1");

  // pull surfaces exactly one entry for the key (no phantom duplicate seq).
  const { entries } = await asUser.query(api.sync.pull, { cursor: 0 });
  const forKey = entries.filter(
    (e) => e.collection === "pages" && e.recordId === "page-1",
  );
  expect(forKey).toHaveLength(1);
  expect(forKey[0]?.payload).toMatchObject({ title: "Higher" });
});

test("empty entries array: authed push returns acked:[] and does not throw", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  const result = await asUser.mutation(api.sync.push, { entries: [] });
  expect(result.acked).toEqual([]);

  const { entries } = await asUser.query(api.sync.pull, { cursor: 0 });
  expect(entries).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// pull — cursor semantics
// ---------------------------------------------------------------------------

test("pull returns only serverSeq > cursor, ascending, and advances the cursor", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  // Push 3 records
  await asUser.mutation(api.sync.push, {
    entries: [
      { id: "e1", hlc: "2024-01-01T00:00:00.000Z|0|d1", collection: "c", recordId: "r1", op: "put", payload: { n: 1 } },
      { id: "e2", hlc: "2024-01-02T00:00:00.000Z|0|d1", collection: "c", recordId: "r2", op: "put", payload: { n: 2 } },
      { id: "e3", hlc: "2024-01-03T00:00:00.000Z|0|d1", collection: "c", recordId: "r3", op: "put", payload: { n: 3 } },
    ],
  });

  // Pull all from 0
  const first = await asUser.query(api.sync.pull, { cursor: 0 });
  expect(first.entries).toHaveLength(3);
  expect(first.cursor).toBe(3);

  // serverSeqs are ascending
  const seqs = first.entries.map((e) => e.serverSeq);
  expect(seqs).toEqual([...seqs].sort((a, b) => a - b));

  // Pull with cursor at first entry — should return remaining 2
  const second = await asUser.query(api.sync.pull, { cursor: first.entries[0]!.serverSeq });
  expect(second.entries).toHaveLength(2);
  expect(second.cursor).toBe(3);

  // Pull from latest cursor — nothing new
  const empty = await asUser.query(api.sync.pull, { cursor: first.cursor });
  expect(empty.entries).toHaveLength(0);
  expect(empty.cursor).toBe(first.cursor); // cursor doesn't regress
});

test("pull limit returns exactly N rows ascending; follow-up pull returns the remainder", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  // Push 5 records → serverSeqs 1..5
  await asUser.mutation(api.sync.push, {
    entries: [
      { id: "e1", hlc: "2024-01-01T00:00:00.000Z|0|d", collection: "c", recordId: "r1", op: "put", payload: { n: 1 } },
      { id: "e2", hlc: "2024-01-02T00:00:00.000Z|0|d", collection: "c", recordId: "r2", op: "put", payload: { n: 2 } },
      { id: "e3", hlc: "2024-01-03T00:00:00.000Z|0|d", collection: "c", recordId: "r3", op: "put", payload: { n: 3 } },
      { id: "e4", hlc: "2024-01-04T00:00:00.000Z|0|d", collection: "c", recordId: "r4", op: "put", payload: { n: 4 } },
      { id: "e5", hlc: "2024-01-05T00:00:00.000Z|0|d", collection: "c", recordId: "r5", op: "put", payload: { n: 5 } },
    ],
  });

  // First page: limit 2 → exactly 2 rows ascending, cursor at the 2nd row's serverSeq
  const page1 = await asUser.query(api.sync.pull, { cursor: 0, limit: 2 });
  expect(page1.entries).toHaveLength(2);
  const seqs1 = page1.entries.map((e) => e.serverSeq);
  expect(seqs1).toEqual([...seqs1].sort((a, b) => a - b));
  expect(page1.cursor).toBe(page1.entries[1]!.serverSeq);

  // Follow-up from that cursor returns the remaining 3 rows
  const page2 = await asUser.query(api.sync.pull, { cursor: page1.cursor, limit: 2 });
  expect(page2.entries).toHaveLength(2);
  expect(page2.entries[0]!.serverSeq).toBeGreaterThan(page1.cursor);

  const page3 = await asUser.query(api.sync.pull, { cursor: page2.cursor, limit: 2 });
  expect(page3.entries).toHaveLength(1);

  // All 5 accounted for, no overlap, ascending across pages
  const allSeqs = [...page1.entries, ...page2.entries, ...page3.entries].map((e) => e.serverSeq);
  expect(allSeqs).toEqual([1, 2, 3, 4, 5]);
});

test("pull from 0 after several pushes replays all records in order", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await makeUser(t);

  await asUser.mutation(api.sync.push, {
    entries: [
      { id: "a", hlc: "2024-01-01T00:00:00.000Z|0|d", collection: "col", recordId: "r1", op: "put", payload: { v: 1 } },
      { id: "b", hlc: "2024-01-02T00:00:00.000Z|0|d", collection: "col", recordId: "r2", op: "put", payload: { v: 2 } },
    ],
  });
  await asUser.mutation(api.sync.push, {
    entries: [
      { id: "c", hlc: "2024-01-03T00:00:00.000Z|0|d", collection: "col", recordId: "r3", op: "put", payload: { v: 3 } },
    ],
  });

  const { entries } = await asUser.query(api.sync.pull, { cursor: 0 });
  expect(entries).toHaveLength(3);
  // Ascending by serverSeq
  for (let i = 1; i < entries.length; i++) {
    expect(entries[i]!.serverSeq).toBeGreaterThan(entries[i - 1]!.serverSeq);
  }
});

// ---------------------------------------------------------------------------
// Ownership isolation
// ---------------------------------------------------------------------------

test("User B's pull never returns User A's rows", async () => {
  const t = convexTest(schema, modules);
  const { asUser: asUserA } = await makeUser(t);
  const { asUser: asUserB } = await makeUser(t);

  // User A pushes a record
  await asUserA.mutation(api.sync.push, {
    entries: [
      {
        id: "a-entry",
        hlc: "2024-01-01T00:00:00.000Z|0|device1",
        collection: "pages",
        recordId: "page-1",
        op: "put",
        payload: { owner: "A" },
      },
    ],
  });

  // User B pulls — should see nothing
  const { entries } = await asUserB.query(api.sync.pull, { cursor: 0 });
  expect(entries).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Unauthenticated access
// ---------------------------------------------------------------------------

test("unauthenticated push throws", async () => {
  const t = convexTest(schema, modules);

  await expect(
    t.mutation(api.sync.push, {
      entries: [
        {
          id: "e1",
          hlc: "2024-01-01T00:00:00.000Z|0|d",
          collection: "c",
          recordId: "r",
          op: "put",
        },
      ],
    }),
  ).rejects.toThrow();
});

test("unauthenticated pull throws", async () => {
  const t = convexTest(schema, modules);

  await expect(t.query(api.sync.pull, { cursor: 0 })).rejects.toThrow();
});
