/**
 * book-progress-row.tsx — one row in the per-book progress list.
 *
 * Title (Inter), thin progress bar (progressRatio; indeterminate/empty bar when null),
 * subtitle line: "64% · ~2h left" / "100% · Finished" / title-only when both null.
 * Token-only styling (invariant #6).
 */

// ── Props ──────────────────────────────────────────────────────────────────────

interface BookProgressRowProps {
  docId: string;
  title: string;
  progressLabel: string | null;
  etaLabel: string | null;
  progressRatio: number | null;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function BookProgressRow({
  title,
  progressLabel,
  etaLabel,
  progressRatio,
}: BookProgressRowProps) {
  const isFinished = etaLabel === 'Finished';
  const hasProgress = progressLabel !== null || etaLabel !== null;

  // Build subtitle
  let subtitle: string | null = null;
  if (progressLabel && etaLabel) {
    subtitle = `${progressLabel} · ${etaLabel}`;
  } else if (progressLabel) {
    subtitle = progressLabel;
  } else if (etaLabel) {
    subtitle = etaLabel;
  }

  // Bar fill width
  const barWidth = progressRatio !== null ? `${(progressRatio * 100).toFixed(1)}%` : '0%';
  const isIndeterminate = progressRatio === null;

  return (
    <div className="flex flex-col gap-1.5 py-3 border-b border-line last:border-b-0">
      {/* Title + subtitle row */}
      <div className="flex items-start justify-between gap-3">
        <span
          className={`font-sans text-sm font-medium leading-snug min-w-0 truncate ${
            isFinished ? 'text-text-muted' : 'text-text'
          }`}
          title={title}
        >
          {title}
        </span>
        {hasProgress && subtitle && (
          <span
            className="font-sans text-xs leading-snug shrink-0 tabular-nums text-text-muted"
          >
            {subtitle}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div
        className="relative h-1 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--color-line)' }}
        role="progressbar"
        aria-label={`${title}: ${subtitle ?? 'progress unknown'}`}
        aria-valuenow={progressRatio !== null ? Math.round(progressRatio * 100) : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {isIndeterminate ? (
          /* No pageCount — show a quiet empty track */
          null
        ) : (
          <div
            className="absolute inset-y-0 left-0 rounded-full motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out"
            style={{
              width: barWidth,
              backgroundColor: isFinished
                ? 'var(--color-text-muted)'
                : 'var(--color-accent)',
            }}
          />
        )}
      </div>
    </div>
  );
}
