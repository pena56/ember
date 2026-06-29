import pushNotifications from "@convex-dev/expo-push-notifications/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(pushNotifications); // default component name: "pushNotifications"

export default app;
