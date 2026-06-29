import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Scan for due, unclaimed notification intents every 5 minutes and Expo-push
// any that have an elected primary device (invariant #7 dedupe via the ledger).
crons.interval(
  "notification push sweep",
  { minutes: 5 },
  internal.notifications.runDueSweep,
  {},
);

export default crons;
