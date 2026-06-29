/**
 * Tests for convex/notifications.ts — notification device registry, intent
 * queue, atomic slot claim, and the cron due-sweep (Unit 16b).
 *
 * Auth mocking: identical to sync.test.ts / files.test.ts — insert a real users
 * row, then t.withIdentity({ subject: `${_id}|session1` }) so getAuthUserId
 * returns the real _id.
 *
 * Push component: we attempt to register the official
 * @convex-dev/expo-push-notifications component into the convex-test harness via
 * its shipped `/test` `register(t)` helper. When registered, the module-scope
 * `push.recordToken` / `push.sendPushNotification` calls run against the
 * component's own mock tables, so the full register/send path is headless.
 * If registration is unavailable, those component calls are the un-headless
 * seam — we still fully assert the ledger/intent/status state that commits in
 * the same transaction (the spec's stance: do NOT block the unit on
 * headless-pushing).
 */

import { PushNotifications } from "@convex-dev/expo-push-notifications";
import { register as registerPushComponent } from "@convex-dev/expo-push-notifications/test";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, components, internal } from "./_generated/api";
import { electPrimaryDevice, STALE_PUSH_MS } from "./notifications";
import schema from "./schema";

// Read-only handle to the component for asserting queued notifications.
const push = new PushNotifications<string>(components.pushNotifications);

const modules = import.meta.glob("./**/*.ts");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup() {
  const t = convexTest(schema, modules);
  // Register the push component so module-scope push.* calls have a backend.
  registerPushComponent(t);
  return t;
}

async function makeUser(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {});
  });
  const asUser = t.withIdentity({ subject: `${userId}|session1` });
  return { userId, asUser };
}

// ===========================================================================
// electPrimaryDevice (pure)
// ===========================================================================

test("electPrimaryDevice picks the max lastSeenAt among hasToken devices", () => {
  const primary = electPrimaryDevice([
    { deviceId: "a", hasToken: true, lastSeenAt: 100 },
    { deviceId: "b", hasToken: true, lastSeenAt: 300 },
    { deviceId: "c", hasToken: true, lastSeenAt: 200 },
  ]);
  expect(primary?.deviceId).toBe("b");
});

test("electPrimaryDevice ignores devices without a token", () => {
  const primary = electPrimaryDevice([
    { deviceId: "web", hasToken: false, lastSeenAt: 999 },
    { deviceId: "phone", hasToken: true, lastSeenAt: 1 },
  ]);
  expect(primary?.deviceId).toBe("phone");
});

test("electPrimaryDevice tie-breaks by deviceId ascending", () => {
  const primary = electPrimaryDevice([
    { deviceId: "zebra", hasToken: true, lastSeenAt: 500 },
    { deviceId: "apple", hasToken: true, lastSeenAt: 500 },
  ]);
  expect(primary?.deviceId).toBe("apple");
});

test("electPrimaryDevice returns null when no device has a token", () => {
  expect(
    electPrimaryDevice([
      { deviceId: "web1", hasToken: false, lastSeenAt: 10 },
      { deviceId: "web2", hasToken: false, lastSeenAt: 20 },
    ]),
  ).toBeNull();
  expect(electPrimaryDevice([])).toBeNull();
});

// ===========================================================================
// registerDevice
// ===========================================================================

test("registerDevice inserts a new device row", async () => {
  const t = setup();
  const { asUser } = await makeUser(t);

  const res = await asUser.mutation(api.notifications.registerDevice, {
    deviceId: "device-1",
    platform: "web",
  });
  expect(res).toEqual({ ok: true });

  const state = await asUser.query(api.notifications.getNotificationState, {});
  expect(state.devices).toHaveLength(1);
  expect(state.devices[0]).toMatchObject({
    deviceId: "device-1",
    platform: "web",
    hasToken: false,
  });
});

test("registerDevice upserts (no dup row) and refreshes platform + lastSeenAt", async () => {
  const t = setup();
  const { asUser } = await makeUser(t);

  await asUser.mutation(api.notifications.registerDevice, {
    deviceId: "device-1",
    platform: "web",
  });
  const first = await asUser.query(api.notifications.getNotificationState, {});
  const firstSeen = first.devices[0]!.lastSeenAt;

  await asUser.mutation(api.notifications.registerDevice, {
    deviceId: "device-1",
    platform: "ios",
  });

  const second = await asUser.query(api.notifications.getNotificationState, {});
  expect(second.devices).toHaveLength(1); // no duplicate
  expect(second.devices[0]!.platform).toBe("ios");
  expect(second.devices[0]!.lastSeenAt).toBeGreaterThanOrEqual(firstSeen);
});

test("registerDevice with an Expo token flips hasToken true", async () => {
  const t = setup();
  const { asUser } = await makeUser(t);

  // Register without a token first.
  await asUser.mutation(api.notifications.registerDevice, {
    deviceId: "phone",
    platform: "ios",
  });
  let state = await asUser.query(api.notifications.getNotificationState, {});
  expect(state.devices[0]!.hasToken).toBe(false);

  // Now record a token — hasToken flips true.
  await asUser.mutation(api.notifications.registerDevice, {
    deviceId: "phone",
    platform: "ios",
    expoPushToken: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  });
  state = await asUser.query(api.notifications.getNotificationState, {});
  expect(state.devices).toHaveLength(1);
  expect(state.devices[0]!.hasToken).toBe(true);
});

test("registerDevice without a token keeps a previously-recorded hasToken", async () => {
  const t = setup();
  const { asUser } = await makeUser(t);

  await asUser.mutation(api.notifications.registerDevice, {
    deviceId: "phone",
    platform: "android",
    expoPushToken: "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]",
  });
  // Heartbeat without a token must not clear hasToken.
  await asUser.mutation(api.notifications.registerDevice, {
    deviceId: "phone",
    platform: "android",
  });
  const state = await asUser.query(api.notifications.getNotificationState, {});
  expect(state.devices[0]!.hasToken).toBe(true);
});

test("registerDevice throws when unauthenticated", async () => {
  const t = setup();
  await expect(
    t.mutation(api.notifications.registerDevice, {
      deviceId: "x",
      platform: "web",
    }),
  ).rejects.toThrow();
});

// ===========================================================================
// submitIntent
// ===========================================================================

const baseIntent = {
  deviceId: "device-1",
  dedupeKey: "streak:2026-06-29",
  type: "streak",
  localDay: "2026-06-29",
  scheduledWall: 1_000_000,
  title: "Keep your streak alive",
  body: "Read a page today.",
};

test("submitIntent queues a pending intent", async () => {
  const t = setup();
  const { asUser, userId } = await makeUser(t);

  const res = await asUser.mutation(api.notifications.submitIntent, baseIntent);
  expect(res).toEqual({ accepted: true });

  const rows = await t.run((ctx) =>
    ctx.db
      .query("notificationIntents")
      .withIndex("by_owner_key", (q) =>
        q.eq("owner", userId).eq("dedupeKey", baseIntent.dedupeKey),
      )
      .collect(),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ status: "pending", title: baseIntent.title });
});

test("submitIntent upserts — replaces the device's prior plan for the key (no dup)", async () => {
  const t = setup();
  const { asUser, userId } = await makeUser(t);

  await asUser.mutation(api.notifications.submitIntent, baseIntent);
  await asUser.mutation(api.notifications.submitIntent, {
    ...baseIntent,
    title: "Updated copy",
    scheduledWall: 2_000_000,
  });

  const rows = await t.run((ctx) =>
    ctx.db
      .query("notificationIntents")
      .withIndex("by_owner_device_key", (q) =>
        q
          .eq("owner", userId)
          .eq("deviceId", baseIntent.deviceId)
          .eq("dedupeKey", baseIntent.dedupeKey),
      )
      .collect(),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    title: "Updated copy",
    scheduledWall: 2_000_000,
    status: "pending",
  });
});

test("submitIntent returns already-claimed (no row written) when slot is in the ledger", async () => {
  const t = setup();
  const { asUser, userId } = await makeUser(t);

  // Claim the slot first.
  await asUser.mutation(api.notifications.claimSlot, {
    dedupeKey: baseIntent.dedupeKey,
    deviceId: "other-device",
    via: "local",
  });

  const res = await asUser.mutation(api.notifications.submitIntent, baseIntent);
  expect(res).toEqual({ accepted: false, reason: "already-claimed" });

  const rows = await t.run((ctx) =>
    ctx.db
      .query("notificationIntents")
      .withIndex("by_owner_key", (q) =>
        q.eq("owner", userId).eq("dedupeKey", baseIntent.dedupeKey),
      )
      .collect(),
  );
  expect(rows).toHaveLength(0); // nothing written
});

test("submitIntent throws when unauthenticated", async () => {
  const t = setup();
  await expect(
    t.mutation(api.notifications.submitIntent, baseIntent),
  ).rejects.toThrow();
});

// ===========================================================================
// claimSlot
// ===========================================================================

test("claimSlot: first caller wins and cancels that key's pending intents", async () => {
  const t = setup();
  const { asUser, userId } = await makeUser(t);

  await asUser.mutation(api.notifications.submitIntent, baseIntent);

  const res = await asUser.mutation(api.notifications.claimSlot, {
    dedupeKey: baseIntent.dedupeKey,
    deviceId: "device-1",
    via: "local",
  });
  expect(res).toEqual({ won: true });

  // The pending intent for this key is now canceled.
  const intents = await t.run((ctx) =>
    ctx.db
      .query("notificationIntents")
      .withIndex("by_owner_key", (q) =>
        q.eq("owner", userId).eq("dedupeKey", baseIntent.dedupeKey),
      )
      .collect(),
  );
  expect(intents[0]!.status).toBe("canceled");

  // Ledger records the via.
  const state = await asUser.query(api.notifications.getNotificationState, {});
  expect(state.ledger).toHaveLength(1);
  expect(state.ledger[0]).toMatchObject({
    dedupeKey: baseIntent.dedupeKey,
    claimedByDeviceId: "device-1",
    deliveredVia: "local",
  });
});

test("claimSlot: second caller loses and learns who claimed it", async () => {
  const t = setup();
  const { asUser } = await makeUser(t);

  await asUser.mutation(api.notifications.claimSlot, {
    dedupeKey: baseIntent.dedupeKey,
    deviceId: "first",
    via: "suppressed",
  });

  const second = await asUser.mutation(api.notifications.claimSlot, {
    dedupeKey: baseIntent.dedupeKey,
    deviceId: "second",
    via: "local",
  });
  expect(second).toEqual({
    won: false,
    claimedBy: "first",
    via: "suppressed",
  });
});

test("claimSlot records via:suppressed", async () => {
  const t = setup();
  const { asUser } = await makeUser(t);

  await asUser.mutation(api.notifications.claimSlot, {
    dedupeKey: baseIntent.dedupeKey,
    deviceId: "device-1",
    via: "suppressed",
  });
  const state = await asUser.query(api.notifications.getNotificationState, {});
  expect(state.ledger[0]!.deliveredVia).toBe("suppressed");
});

test("claimSlot throws when unauthenticated", async () => {
  const t = setup();
  await expect(
    t.mutation(api.notifications.claimSlot, {
      dedupeKey: "k",
      deviceId: "d",
      via: "local",
    }),
  ).rejects.toThrow();
});

// ===========================================================================
// runDueSweep
// ===========================================================================

/** Insert a pending intent directly with a chosen scheduledWall. */
async function seedIntent(
  t: ReturnType<typeof convexTest>,
  owner: string,
  overrides: Partial<{
    deviceId: string;
    dedupeKey: string;
    scheduledWall: number;
    title: string;
    body: string;
  }> = {},
) {
  await t.run((ctx) =>
    ctx.db.insert("notificationIntents", {
      owner: owner as never,
      deviceId: overrides.deviceId ?? "phone",
      dedupeKey: overrides.dedupeKey ?? "streak:2026-06-29",
      type: "streak",
      localDay: "2026-06-29",
      scheduledWall: overrides.scheduledWall ?? Date.now() - 1000,
      title: overrides.title ?? "Hi",
      body: overrides.body ?? "Body",
      status: "pending",
    }),
  );
}

test("runDueSweep: due unclaimed intent + elected primary → push ledger row, sent, siblings canceled", async () => {
  const t = setup();
  const { userId, asUser } = await makeUser(t);

  // Two push-capable devices; "phone-new" is more recently active → primary.
  // Register them through the authed path so the primary's Expo token is
  // recorded in the push component and the send exercises a genuine queue
  // (registerDevice stamps lastSeenAt = Date.now()).
  await asUser.mutation(api.notifications.registerDevice, {
    deviceId: "phone-old",
    platform: "ios",
    expoPushToken: "ExponentPushToken[oooooooooooooooooooooo]",
  });
  await asUser.mutation(api.notifications.registerDevice, {
    deviceId: "phone-new",
    platform: "android",
    expoPushToken: "ExponentPushToken[nnnnnnnnnnnnnnnnnnnnnn]",
  });
  // Make phone-new the most-recently-active → elected primary.
  await t.run(async (ctx) => {
    const newDev = await ctx.db
      .query("pushDevices")
      .withIndex("by_owner_device", (q) =>
        q.eq("owner", userId).eq("deviceId", "phone-new"),
      )
      .unique();
    await ctx.db.patch(newDev!._id, { lastSeenAt: Date.now() + 1000 });
  });

  // The primary submitted an intent for the key; a sibling device too.
  await seedIntent(t, userId, { deviceId: "phone-new" });
  await seedIntent(t, userId, { deviceId: "phone-old" });

  const summary = await t.mutation(internal.notifications.runDueSweep, {});
  expect(summary.pushed).toBe(1);

  const ledger = await t.run((ctx) =>
    ctx.db
      .query("notificationLedger")
      .withIndex("by_owner_key", (q) =>
        q.eq("owner", userId).eq("dedupeKey", "streak:2026-06-29"),
      )
      .collect(),
  );
  expect(ledger).toHaveLength(1);
  expect(ledger[0]).toMatchObject({
    deliveredVia: "push",
    claimedByDeviceId: "phone-new", // elected primary
  });

  const intents = await t.run((ctx) =>
    ctx.db
      .query("notificationIntents")
      .withIndex("by_owner_key", (q) =>
        q.eq("owner", userId).eq("dedupeKey", "streak:2026-06-29"),
      )
      .collect(),
  );
  const chosen = intents.find((i) => i.deviceId === "phone-new")!;
  const sibling = intents.find((i) => i.deviceId === "phone-old")!;
  expect(chosen.status).toBe("sent");
  expect(sibling.status).toBe("canceled");

  // The push actually queued a notification in the component for the primary.
  const notifs = await t.run((ctx) =>
    push.getNotificationsForUser(ctx, { userId: "phone-new" }),
  );
  expect(notifs.length).toBeGreaterThanOrEqual(1);
});

test("runDueSweep: skips and cancels stale intents (> STALE_PUSH_MS late), no push", async () => {
  const t = setup();
  const { userId } = await makeUser(t);

  await t.run((ctx) =>
    ctx.db.insert("pushDevices", {
      owner: userId,
      deviceId: "phone",
      platform: "ios",
      hasToken: true,
      lastSeenAt: 1,
    }),
  );

  await seedIntent(t, userId, {
    scheduledWall: Date.now() - STALE_PUSH_MS - 60_000,
  });

  const summary = await t.mutation(internal.notifications.runDueSweep, {});
  expect(summary.pushed).toBe(0);

  const ledger = await t.run((ctx) =>
    ctx.db
      .query("notificationLedger")
      .withIndex("by_owner_key", (q) =>
        q.eq("owner", userId).eq("dedupeKey", "streak:2026-06-29"),
      )
      .collect(),
  );
  expect(ledger).toHaveLength(0); // no claim

  const intents = await t.run((ctx) =>
    ctx.db
      .query("notificationIntents")
      .withIndex("by_owner_key", (q) =>
        q.eq("owner", userId).eq("dedupeKey", "streak:2026-06-29"),
      )
      .collect(),
  );
  expect(intents[0]!.status).toBe("canceled");
});

test("runDueSweep: skips already-claimed keys and cancels their pending intents", async () => {
  const t = setup();
  const { userId } = await makeUser(t);

  await t.run((ctx) =>
    ctx.db.insert("pushDevices", {
      owner: userId,
      deviceId: "phone",
      platform: "ios",
      hasToken: true,
      lastSeenAt: 1,
    }),
  );
  // Slot already claimed (e.g. fired locally on another device).
  await t.run((ctx) =>
    ctx.db.insert("notificationLedger", {
      owner: userId,
      dedupeKey: "streak:2026-06-29",
      claimedByDeviceId: "watch",
      deliveredVia: "local",
      claimedAt: Date.now(),
    }),
  );
  await seedIntent(t, userId);

  const summary = await t.mutation(internal.notifications.runDueSweep, {});
  expect(summary.pushed).toBe(0);

  // Still only the original local ledger row — no push claim added.
  const ledger = await t.run((ctx) =>
    ctx.db
      .query("notificationLedger")
      .withIndex("by_owner_key", (q) =>
        q.eq("owner", userId).eq("dedupeKey", "streak:2026-06-29"),
      )
      .collect(),
  );
  expect(ledger).toHaveLength(1);
  expect(ledger[0]!.deliveredVia).toBe("local");

  const intents = await t.run((ctx) =>
    ctx.db
      .query("notificationIntents")
      .withIndex("by_owner_key", (q) =>
        q.eq("owner", userId).eq("dedupeKey", "streak:2026-06-29"),
      )
      .collect(),
  );
  expect(intents[0]!.status).toBe("canceled");
});

test("runDueSweep: leaves intents pending when owner has no push-eligible primary", async () => {
  const t = setup();
  const { userId } = await makeUser(t);

  // Web-only device — no token.
  await t.run((ctx) =>
    ctx.db.insert("pushDevices", {
      owner: userId,
      deviceId: "browser",
      platform: "web",
      hasToken: false,
      lastSeenAt: 5,
    }),
  );
  await seedIntent(t, userId);

  const summary = await t.mutation(internal.notifications.runDueSweep, {});
  expect(summary.pushed).toBe(0);

  const ledger = await t.run((ctx) =>
    ctx.db
      .query("notificationLedger")
      .withIndex("by_owner_key", (q) =>
        q.eq("owner", userId).eq("dedupeKey", "streak:2026-06-29"),
      )
      .collect(),
  );
  expect(ledger).toHaveLength(0); // nothing claimed

  const intents = await t.run((ctx) =>
    ctx.db
      .query("notificationIntents")
      .withIndex("by_owner_key", (q) =>
        q.eq("owner", userId).eq("dedupeKey", "streak:2026-06-29"),
      )
      .collect(),
  );
  expect(intents[0]!.status).toBe("pending"); // left for web to fire locally
});

test("runDueSweep: never touches a non-due intent (scheduledWall > now)", async () => {
  const t = setup();
  const { userId } = await makeUser(t);

  await t.run((ctx) =>
    ctx.db.insert("pushDevices", {
      owner: userId,
      deviceId: "phone",
      platform: "ios",
      hasToken: true,
      lastSeenAt: 1,
    }),
  );
  // Scheduled far in the future — not due.
  await seedIntent(t, userId, { scheduledWall: Date.now() + 10_000_000 });

  const summary = await t.mutation(internal.notifications.runDueSweep, {});
  expect(summary).toEqual({ pushed: 0, skipped: 0 });

  const intents = await t.run((ctx) =>
    ctx.db
      .query("notificationIntents")
      .withIndex("by_owner_key", (q) =>
        q.eq("owner", userId).eq("dedupeKey", "streak:2026-06-29"),
      )
      .collect(),
  );
  expect(intents[0]!.status).toBe("pending"); // untouched
});

// ===========================================================================
// Ownership isolation
// ===========================================================================

test("User B cannot see User A's devices or ledger", async () => {
  const t = setup();
  const { asUser: asUserA } = await makeUser(t);
  const { asUser: asUserB } = await makeUser(t);

  await asUserA.mutation(api.notifications.registerDevice, {
    deviceId: "a-device",
    platform: "ios",
  });
  await asUserA.mutation(api.notifications.claimSlot, {
    dedupeKey: "streak:2026-06-29",
    deviceId: "a-device",
    via: "local",
  });

  const stateB = await asUserB.query(api.notifications.getNotificationState, {});
  expect(stateB.devices).toHaveLength(0);
  expect(stateB.ledger).toHaveLength(0);
});

test("User B claiming the same dedupeKey does not collide with User A's claim", async () => {
  const t = setup();
  const { asUser: asUserA } = await makeUser(t);
  const { asUser: asUserB } = await makeUser(t);

  const a = await asUserA.mutation(api.notifications.claimSlot, {
    dedupeKey: "streak:2026-06-29",
    deviceId: "a-device",
    via: "local",
  });
  // Same key, different owner → B wins its OWN claim (owner-scoped ledger).
  const b = await asUserB.mutation(api.notifications.claimSlot, {
    dedupeKey: "streak:2026-06-29",
    deviceId: "b-device",
    via: "local",
  });
  expect(a).toEqual({ won: true });
  expect(b).toEqual({ won: true });
});

test("User B's submitIntent is unaffected by User A's ledger claim for the same key", async () => {
  const t = setup();
  const { asUser: asUserA } = await makeUser(t);
  const { asUser: asUserB } = await makeUser(t);

  await asUserA.mutation(api.notifications.claimSlot, {
    dedupeKey: baseIntent.dedupeKey,
    deviceId: "a-device",
    via: "local",
  });
  // B has no claim for the key, so its intent is accepted.
  const res = await asUserB.mutation(api.notifications.submitIntent, baseIntent);
  expect(res).toEqual({ accepted: true });
});

test("getNotificationState throws when unauthenticated", async () => {
  const t = setup();
  await expect(
    t.query(api.notifications.getNotificationState, {}),
  ).rejects.toThrow();
});
