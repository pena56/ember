/**
 * activity-heatmap.tsx — trailing 365-day reading activity heatmap.
 *
 * Groups heatmap cells into week columns (Sun–Sat).
 * 5-step accent ramp: level 0 = line token; levels 1-4 = accent with increasing opacity.
 * role="img" + aria-label on the grid for a11y.
 * Horizontal scroll wrapper for narrow viewports.
 * Token-only styling (invariant #6).
 */

import { StatCard } from './stat-card.js';

// ── Types ──────────────────────────────────────────────────────────────────────

interface HeatmapCell {
  day: string;
  level: 0 | 1 | 2 | 3 | 4;
  activeMs: number;
  label: string;
}

interface ActivityHeatmapProps {
  cells: HeatmapCell[];
}

// ── Level → visual style ───────────────────────────────────────────────────────

/**
 * Returns the inline style for a cell based on its level.
 * Level 0 → line token (bg-line).
 * Levels 1–4 → accent token with increasing opacity.
 */
function cellStyle(level: 0 | 1 | 2 | 3 | 4): React.CSSProperties {
  if (level === 0) {
    return { backgroundColor: 'var(--color-line)' };
  }
  const opacities: Record<1 | 2 | 3 | 4, number> = { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1 };
  return {
    backgroundColor: `color-mix(in srgb, var(--color-accent) ${(opacities[level] * 100).toFixed(0)}%, transparent)`,
  };
}

// ── Month tick labels ──────────────────────────────────────────────────────────

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Component ──────────────────────────────────────────────────────────────────

export function ActivityHeatmap({ cells }: ActivityHeatmapProps) {
  if (cells.length === 0) {
    return (
      <StatCard title="Activity">
        <p className="font-sans text-sm text-text-muted">
          Your reading days will light up here.
        </p>
      </StatCard>
    );
  }

  // Determine weekday of the first cell (0=Sun, 6=Sat)
  const firstDay = cells[0]!.day;
  const firstWeekday = new Date(`${firstDay}T00:00:00Z`).getUTCDay();

  // Build week columns: array of 7-cell columns (null = blank padding)
  type MaybeCell = HeatmapCell | null;
  const weeks: MaybeCell[][] = [];
  let currentWeek: MaybeCell[] = Array.from({ length: firstWeekday }, () => null);

  for (const cell of cells) {
    currentWeek.push(cell);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  // Push final partial week (pad to 7)
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  // Build month tick positions (first week column index where a new month starts)
  const monthTicks: { weekIdx: number; label: string }[] = [];
  for (let w = 0; w < weeks.length; w++) {
    const week = weeks[w]!;
    for (const cell of week) {
      if (cell && cell.day.endsWith('-01')) {
        const month = parseInt(cell.day.slice(5, 7), 10) - 1;
        monthTicks.push({ weekIdx: w, label: MONTH_ABBR[month] ?? '' });
        break;
      }
    }
  }

  // Cell size + gap constants (in rem for consistency)
  const CELL_SIZE = 10; // px
  const CELL_GAP = 2;   // px

  return (
    <StatCard title="Activity">
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        {/* Month labels row */}
        {monthTicks.length > 0 && (
          <div
            className="flex mb-1.5"
            aria-hidden="true"
            style={{ gap: `${CELL_GAP.toString()}px` }}
          >
            {weeks.map((_, wIdx) => {
              const tick = monthTicks.find(t => t.weekIdx === wIdx);
              return (
                <div
                  key={wIdx}
                  style={{ width: `${CELL_SIZE.toString()}px`, flexShrink: 0 }}
                  className="font-sans text-[9px] text-text-muted leading-none"
                >
                  {tick ? tick.label : ''}
                </div>
              );
            })}
          </div>
        )}

        {/* Grid — role="img" for a11y */}
        <div
          role="img"
          aria-label="Reading activity over the past year"
          className="flex"
          style={{ gap: `${CELL_GAP.toString()}px` }}
        >
          {weeks.map((week, wIdx) => (
            <div
              key={wIdx}
              className="flex flex-col"
              style={{ gap: `${CELL_GAP.toString()}px` }}
            >
              {week.map((cell, dIdx) => (
                <div
                  key={dIdx}
                  title={cell?.label}
                  style={{
                    width: `${CELL_SIZE.toString()}px`,
                    height: `${CELL_SIZE.toString()}px`,
                    borderRadius: '2px',
                    flexShrink: 0,
                    ...(cell ? cellStyle(cell.level) : { backgroundColor: 'transparent' }),
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 mt-3" aria-hidden="true">
          <span className="font-sans text-[9px] text-text-muted">Less</span>
          {([0, 1, 2, 3, 4] as const).map(level => (
            <div
              key={level}
              style={{
                width: `${CELL_SIZE.toString()}px`,
                height: `${CELL_SIZE.toString()}px`,
                borderRadius: '2px',
                ...cellStyle(level),
              }}
            />
          ))}
          <span className="font-sans text-[9px] text-text-muted">More</span>
        </div>
      </div>
    </StatCard>
  );
}
