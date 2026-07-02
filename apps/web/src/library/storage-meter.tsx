/**
 * storage-meter.tsx — quota usage card for the library page.
 *
 * Reads useStorageUsage() and renders a labelled progress bar showing how much of
 * the quota is used, plus the amount free. Token-only — no hardcoded colors
 * (invariant #6). A11y: role="progressbar" + aria-valuenow/max/min.
 *
 * Behaviour:
 *  - Hidden (returns null) while usage is undefined (loading / unauthenticated).
 *  - Calm treatment below 80% quota; warm near-limit treatment (streak-lit) at/above.
 */

import { HardDrive } from 'lucide-react';

import { formatBytes } from '../store/format-bytes.js';
import { useStorageUsage } from '../sync/use-storage-usage.js';

/** 80% threshold for near-limit amber treatment. */
const NEAR_LIMIT_RATIO = 0.8;

export function StorageMeter() {
  const usage = useStorageUsage();

  if (usage === undefined) return null;

  const { used, quota } = usage;
  const ratio = quota > 0 ? Math.min(used / quota, 1) : 0;
  const pct = Math.round(ratio * 100);
  const free = Math.max(0, quota - used);
  const isNearLimit = ratio >= NEAR_LIMIT_RATIO;

  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-line bg-surface-raised shadow-float-sm px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HardDrive className="size-4 text-text-muted" aria-hidden="true" />
          <span className="font-sans text-sm font-medium text-text">Storage</span>
        </div>
        <span
          className={[
            'font-sans text-xs tabular-nums',
            isNearLimit ? 'text-streak-lit' : 'text-text-muted',
          ].join(' ')}
        >
          {formatBytes(used)} of {formatBytes(quota)}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={used}
        aria-valuemax={quota}
        aria-valuemin={0}
        aria-label={`${pct.toString()}% of storage used`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-line"
      >
        <div
          data-near-limit={isNearLimit ? 'true' : 'false'}
          className={[
            'h-full rounded-full transition-all duration-500',
            isNearLimit ? 'bg-streak-lit' : 'bg-accent',
          ].join(' ')}
          style={{ width: `${pct.toString()}%` }}
        />
      </div>

      <div className="flex items-center justify-between font-sans text-xs text-text-muted">
        <span>{pct}% used</span>
        <span>{formatBytes(free)} free</span>
      </div>
    </div>
  );
}
