import { getAuthUserId } from "@convex-dev/auth/server";
import { PushNotifications } from "@convex-dev/expo-push-notifications";
import { v } from "convex/values";

import { components } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";

// The official Expo push relay component, keyed by deviceId: every elected push
// targets a specific device's token, never a fan-out to all the owner's devices.
// `components.pushNotifications` is only populated in _generated after the
// component is registered AND a deploy/codegen runs against the deployment.
const push = new PushNotifications<string>(components.pushNotifications);

// A due intent more than this far past its scheduledWall is dropped (canceled,
// not pushed): the day's window has passed; a fresh day will re-plan/re-light.
export const STALE_PUSH_MS = 2 * 60 * 60 * 1000; // 2h

// ---------------------------------------------------------------------------
// electPrimaryDevice — pure, exported, unit-tested directly
// ---------------------------------------------------------------------------

/**
 * Most-recently-active push-capable device wins. Filter to hasToken === true;
 * return the one with the greatest lastSeenAt, tie-break by deviceId ascending.
 * Returns null when no device is push-eligible (e.g. a web-only user).
 */
export function electPrimaryDevice(
  devices: Pick<Doc<"pushDevices">, "deviceId" | "hasToken" | "lastSeenAt">[],
): Pick<Doc<"pushDevices">, "deviceId" | "hasToken" | "lastSeenAt"> | null {
  let best:
    | Pick<Doc<"pushDevices">, "deviceId" | "hasToken" | "lastSeenAt">
    | null = null;
  for (const d of devices) {
    if (!d.hasToken) continue;
    if (best === null) {
      best = d;
      continue;
    }
    if (
      d.lastSeenAt > best.lastSeenAt ||
      (d.lastSeenAt === best.lastSeenAt && d.deviceId < best.deviceId)
    ) {
      best = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// registerDevice — registration + liveness heartbeat (16c/d call on launch +
// foreground). Upsert by (owner, deviceId). Recording an Expo token flips
// hasToken true and stores the raw token in the component (never in our schema).
// ---------------------------------------------------------------------------

export const registerDevice = mutation({
  args: {
    deviceId: v.string(),
    platform: v.union(
      v.literal("ios"),
      v.literal("android"),
      v.literal("web"),
    ),
    expoPushToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await getAuthUserId(ctx);
    if (owner === null) {
      throw new Error("Unauthenticated");
    }

    const now = Date.now();

    // Record the raw token in the component (not in our schema) when provided.
    if (args.expoPushToken !== undefined) {
      await push.recordToken(ctx, {
        userId: args.deviceId,
        pushToken: args.expoPushToken,
      });
    }

    const existing = await ctx.db
      .query("pushDevices")
      .withIndex("by_owner_device", (q) =>
        q.eq("owner", owner).eq("deviceId", args.deviceId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        platform: args.platform,
        // Flip hasToken true when a token was recorded; otherwise keep prior.
        hasToken: args.expoPushToken !== undefined ? true : existing.hasToken,
        lastSeenAt: now,
      });
    } else {
      await ctx.db.insert("pushDevices", {
        owner,
        deviceId: args.deviceId,
        platform: args.platform,
        hasToken: args.expoPushToken !== undefined,
        lastSeenAt: now,
      });
    }

    return { ok: true as const };
  },
});

// ---------------------------------------------------------------------------
// submitIntent — the client's "I plan to deliver this." Upsert by
// (owner, deviceId, dedupeKey); rejected (no row written) if the slot is
// already claimed in the ledger. Idempotent.
// ---------------------------------------------------------------------------

export const submitIntent = mutation({
  args: {
    deviceId: v.string(),
    dedupeKey: v.string(),
    type: v.string(),
    localDay: v.string(),
    scheduledWall: v.number(),
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await getAuthUserId(ctx);
    if (owner === null) {
      throw new Error("Unauthenticated");
    }

    // If the slot is already in the ledger, don't queue a pending intent.
    const claimed = await ctx.db
      .query("notificationLedger")
      .withIndex("by_owner_key", (q) =>
        q.eq("owner", owner).eq("dedupeKey", args.dedupeKey),
      )
      .unique();
    if (claimed) {
      return { accepted: false as const, reason: "already-claimed" as const };
    }

    const existing = await ctx.db
      .query("notificationIntents")
      .withIndex("by_owner_device_key", (q) =>
        q
          .eq("owner", owner)
          .eq("deviceId", args.deviceId)
          .eq("dedupeKey", args.dedupeKey),
      )
      .unique();

    const fields = {
      owner,
      deviceId: args.deviceId,
      dedupeKey: args.dedupeKey,
      type: args.type,
      localDay: args.localDay,
      scheduledWall: args.scheduledWall,
      title: args.title,
      body: args.body,
      status: "pending" as const,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("notificationIntents", fields);
    }

    return { accepted: true as const };
  },
});

// ---------------------------------------------------------------------------
// claimSlot — the atomic dedupe primitive (invariant #7). Convex mutations are
// serializable transactions, so this read-then-insert is race-free. First
// caller wins; later callers lose. Winning cancels the key's pending intents
// so the cron won't push.
// ---------------------------------------------------------------------------

export const claimSlot = mutation({
  args: {
    dedupeKey: v.string(),
    deviceId: v.string(),
    via: v.union(v.literal("local"), v.literal("suppressed")),
  },
  handler: async (ctx, args) => {
    const owner = await getAuthUserId(ctx);
    if (owner === null) {
      throw new Error("Unauthenticated");
    }

    const existing = await ctx.db
      .query("notificationLedger")
      .withIndex("by_owner_key", (q) =>
        q.eq("owner", owner).eq("dedupeKey", args.dedupeKey),
      )
      .unique();

    if (existing) {
      return {
        won: false as const,
        claimedBy: existing.claimedByDeviceId,
        via: existing.deliveredVia,
      };
    }

    await ctx.db.insert("notificationLedger", {
      owner,
      dedupeKey: args.dedupeKey,
      claimedByDeviceId: args.deviceId,
      deliveredVia: args.via,
      claimedAt: Date.now(),
    });

    // Cancel every pending/queued intent for this key so the cron skips them.
    const intents = await ctx.db
      .query("notificationIntents")
      .withIndex("by_owner_key", (q) =>
        q.eq("owner", owner).eq("dedupeKey", args.dedupeKey),
      )
      .collect();
    for (const intent of intents) {
      if (intent.status === "pending") {
        await ctx.db.patch(intent._id, { status: "canceled" });
      }
    }

    return { won: true as const };
  },
});

// ---------------------------------------------------------------------------
// runDueSweep — the cron's transactional core. The component's
// sendPushNotification runs INSIDE this mutation, so the ledger claim and the
// queued push commit (or roll back) together — stronger at-most-once than a
// post-commit network call.
// ---------------------------------------------------------------------------

export const runDueSweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let pushed = 0;
    let skipped = 0;

    // 1. Load pending due intents.
    const due = await ctx.db
      .query("notificationIntents")
      .withIndex("by_status_scheduled", (q) =>
        q.eq("status", "pending").lte("scheduledWall", now),
      )
      .take(200);

    // 2. Group by owner.
    const byOwner = new Map<string, Doc<"notificationIntents">[]>();
    for (const intent of due) {
      const list = byOwner.get(intent.owner) ?? [];
      list.push(intent);
      byOwner.set(intent.owner, list);
    }

    for (const [owner, intents] of byOwner) {
      const ownerId = owner as Doc<"notificationIntents">["owner"];

      const devices = await ctx.db
        .query("pushDevices")
        .withIndex("by_owner", (q) => q.eq("owner", ownerId))
        .collect();
      const primary = electPrimaryDevice(devices);

      // 3. Group the owner's due intents by dedupeKey; process each key once.
      const byKey = new Map<string, Doc<"notificationIntents">[]>();
      for (const intent of intents) {
        const list = byKey.get(intent.dedupeKey) ?? [];
        list.push(intent);
        byKey.set(intent.dedupeKey, list);
      }

      for (const [dedupeKey, keyIntents] of byKey) {
        const oldestScheduled = Math.min(
          ...keyIntents.map((i) => i.scheduledWall),
        );

        // Stale: drop (cancel) without pushing — the day's window has passed.
        if (now - oldestScheduled > STALE_PUSH_MS) {
          for (const intent of keyIntents) {
            await ctx.db.patch(intent._id, { status: "canceled" });
          }
          skipped += 1;
          continue;
        }

        // Already claimed (local/suppressed/prior push): cancel pending, skip.
        const ledgerRow = await ctx.db
          .query("notificationLedger")
          .withIndex("by_owner_key", (q) =>
            q.eq("owner", ownerId).eq("dedupeKey", dedupeKey),
          )
          .unique();
        if (ledgerRow) {
          for (const intent of keyIntents) {
            await ctx.db.patch(intent._id, { status: "canceled" });
          }
          skipped += 1;
          continue;
        }

        // No push-eligible primary (e.g. web-only user): leave pending — web
        // fires locally and claims the slot itself.
        if (primary === null) {
          skipped += 1;
          continue;
        }

        // Claim + send: prefer the intent submitted by the primary device,
        // else the most-recently-scheduled due intent for the key.
        const chosen =
          keyIntents.find((i) => i.deviceId === primary.deviceId) ??
          keyIntents.reduce((a, b) =>
            b.scheduledWall >= a.scheduledWall ? b : a,
          );

        await ctx.db.insert("notificationLedger", {
          owner: ownerId,
          dedupeKey,
          claimedByDeviceId: primary.deviceId,
          deliveredVia: "push",
          claimedAt: now,
        });

        await ctx.db.patch(chosen._id, { status: "sent" });
        for (const intent of keyIntents) {
          if (intent._id !== chosen._id) {
            await ctx.db.patch(intent._id, { status: "canceled" });
          }
        }

        // allowUnregisteredTokens: tolerate a device that has no token recorded
        // in the component (returns null instead of throwing). The ledger claim
        // + `sent` mark stand regardless — matching at-most-once: a fresh day
        // re-plans if delivery never lands.
        await push.sendPushNotification(ctx, {
          userId: primary.deviceId,
          notification: { title: chosen.title, body: chosen.body },
          allowUnregisteredTokens: true,
        });

        pushed += 1;
      }
    }

    return { pushed, skipped };
  },
});

// ---------------------------------------------------------------------------
// getNotificationState — small read-only query for 16c/d + device-verify
// screen. No secrets (raw tokens are never stored here).
// ---------------------------------------------------------------------------

export const getNotificationState = query({
  args: {},
  handler: async (ctx) => {
    const owner = await getAuthUserId(ctx);
    if (owner === null) {
      throw new Error("Unauthenticated");
    }

    const devices = await ctx.db
      .query("pushDevices")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .collect();

    const ledger = await ctx.db
      .query("notificationLedger")
      .withIndex("by_owner_key", (q) => q.eq("owner", owner))
      .collect();

    return {
      devices: devices.map((d) => ({
        deviceId: d.deviceId,
        platform: d.platform,
        hasToken: d.hasToken,
        lastSeenAt: d.lastSeenAt,
      })),
      ledger: ledger.map((l) => ({
        dedupeKey: l.dedupeKey,
        claimedByDeviceId: l.claimedByDeviceId,
        deliveredVia: l.deliveredVia,
        claimedAt: l.claimedAt,
      })),
    };
  },
});
