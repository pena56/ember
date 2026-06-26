/**
 * storage-meter.tsx — quota usage progress bar for the library page.
 *
 * Reads useStorageUsage() and renders a labelled progress bar showing
 * how much of the 1 GB quota is used. Token-only — no hardcoded colors
 * (invariant #6). A11y: role="progressbar" + aria-valuenow/max/min.
 *
 * Behaviour:
 *  - Hidden (returns null) while usage is undefined (loading / unauthenticated).
 *  - Calm treatment below 80% quota.
 *  - Warm near-limit treatment (streak-lit token) at or above 80% quota.
 */

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
  const isNearLimit = ratio >= NEAR_LIMIT_RATIO;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Label row */}
      <div className="flex justify-between items-baseline">
        <span className="font-sans text-xs text-text-muted">
          Storage
        </span>
        <span
          className={[
            'font-sans text-xs',
            isNearLimit ? 'text-streak-lit' : 'text-text-muted',
          ].join(' ')}
        >
          {formatBytes(used)} of {formatBytes(quota)} used
        </span>
      </div>

      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={used}
        aria-valuemax={quota}
        aria-valuemin={0}
        aria-label={`${pct}% of storage used`}
        className="w-full h-1.5 rounded-full bg-line overflow-hidden"
      >
        <div
          data-near-limit={isNearLimit ? 'true' : 'false'}
          className={[
            'h-full rounded-full transition-all duration-500',
            isNearLimit ? 'bg-streak-lit' : 'bg-accent',
          ].join(' ')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
