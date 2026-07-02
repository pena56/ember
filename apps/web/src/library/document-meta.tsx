/**
 * document-meta.tsx — small shared bits for the row + card: date formatting, the
 * sync badge, and a reading-progress bar.
 *
 * The sync badge keeps its warm, reassuring copy (never alarming). Progress is
 * derived from the reading position + pageCount; when pageCount is unknown we
 * show a page label without a bar (no fake ratios — invariant #1).
 *
 * Token-only styling (invariant #6).
 */

import type { SyncState } from './use-library.js';

export function formatDocDate(epochMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(epochMs));
}

// ── Sync badge ──────────────────────────────────────────────────────────────

export function SyncBadge({
  syncState,
  onRetrySync,
}: {
  syncState: SyncState;
  onRetrySync?: () => void;
}) {
  if (syncState === 'synced' || syncState === 'pending') {
    // 'pending' is transient; keep the row quiet rather than flashing "Syncing…".
    return null;
  }

  if (syncState === 'over-file-cap') {
    return (
      <span className="font-sans text-xs text-text-muted leading-tight">
        Too large to sync — kept on this device
      </span>
    );
  }

  // over-quota
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-sans text-xs text-text-muted leading-tight">
        Storage full — kept on this device
      </span>
      {onRetrySync !== undefined && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRetrySync();
          }}
          className={[
            'pointer-events-auto self-start font-sans text-xs text-accent underline-offset-2 hover:underline',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-sm',
          ].join(' ')}
        >
          Try again
        </button>
      )}
    </span>
  );
}

// ── Reading progress ─────────────────────────────────────────────────────────

/** Compute a clamped 0..1 ratio, or null when pageCount is unknown. */
export function progressRatio(page: number | undefined, pageCount: number | undefined): number | null {
  if (page === undefined || pageCount === undefined || pageCount <= 0) return null;
  return Math.min(1, Math.max(0, page / pageCount));
}

export function ProgressBar({ ratio }: { ratio: number }) {
  const pct = Math.round(ratio * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${pct.toString()}% read`}
      className="h-1 w-full overflow-hidden rounded-full bg-line"
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct.toString()}%` }} />
    </div>
  );
}
