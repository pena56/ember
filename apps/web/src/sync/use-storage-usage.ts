/**
 * use-storage-usage.ts — thin useQuery wrapper over api.files.getStorageUsage.
 *
 * Returns BlobLimits { used, quota, fileCap } or undefined while loading /
 * unauthenticated. The query is gated on Convex auth via 'skip' (no try/catch
 * around a hook): unauthenticated → skipped → undefined; the meter hides itself.
 */

import { useConvexAuth, useQuery } from 'convex/react';

import { api } from '@ember/convex/_generated/api';
import type { BlobLimits } from '@ember/core';

export function useStorageUsage(): BlobLimits | undefined {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.files.getStorageUsage, isAuthenticated ? {} : 'skip') as
    | BlobLimits
    | undefined;
}
