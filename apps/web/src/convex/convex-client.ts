/**
 * convex-client.ts — singleton ConvexReactClient for the web app.
 *
 * Throws a clear error at module evaluation time if VITE_CONVEX_URL is not
 * set — so a forgotten .env.local fails loudly in dev instead of silently
 * connecting to nothing.
 */

import { ConvexReactClient } from 'convex/react';

const url = import.meta.env['VITE_CONVEX_URL'] as string | undefined;

if (!url) {
  throw new Error(
    '[Ember] VITE_CONVEX_URL is not set.\n' +
      'Create apps/web/.env.local with:\n' +
      '  VITE_CONVEX_URL=https://<your-deployment>.convex.cloud',
  );
}

export const convex = new ConvexReactClient(url);
