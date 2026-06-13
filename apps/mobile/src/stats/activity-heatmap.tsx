/**
 * activity-heatmap.tsx — trailing 365-day activity grid for the Stats tab.
 *
 * Week-column grid (7 rows), horizontally scrollable. Level 0 → bg-line;
 * levels 1–4 → accent color at increasing opacity (0.28/0.48/0.72/1.0).
 * No color-mix, no CSS var — all colors resolved via useResolveClassNames
 * (invariant #6 the RN way, mirrors goal-ring.tsx).
 *
 * Weekday derived via UTC arithmetic: new Date(day + 'T00:00:00Z').getUTCDay()
 * (0=Sun…6=Sat). Leading blank cells pad the first partial week.
 * accessibilityRole="image" on the grid wrapper; cells decorative (hidden from AT).
 */

import type { ColorValue } from 'react-native';
import { ScrollView, Text, View } from 'react-native';
import { useResolveClassNames } from 'uniwind';

import type { StatsView } from './present-stats.js';
import { StatCard } from './stat-card.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const CELL_SIZE = 10;
const CELL_MARGIN = 1;
const CELL_RADIUS = 2;
const OPACITY_BY_LEVEL: Record<1 | 2 | 3 | 4, number> = {
  1: 0.28,
  2: 0.48,
  3: 0.72,
  4: 1.0,
};

// Short month names for tick labels
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Types ─────────────────────────────────────────────────────────────────────

interface HeatmapCellData {
  day: string;
  level: 0 | 1 | 2 | 3 | 4;
  activeMs: number;
  label: string;
}

type WeekColumn = (HeatmapCellData | null)[];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Group heatmap cells into week columns (Sunday-first).
 * The first column may have leading nulls for padding.
 */
function groupIntoWeeks(cells: HeatmapCellData[]): WeekColumn[] {
  if (cells.length === 0) return [];

  const weeks: WeekColumn[] = [];
  let current: WeekColumn = [];

  // Pad leading blanks for the first day's weekday
  const firstDay = cells[0];
  if (firstDay !== undefined) {
    const firstDow = new Date(firstDay.day + 'T00:00:00Z').getUTCDay(); // 0=Sun
    for (let i = 0; i < firstDow; i++) {
      current.push(null);
    }
  }

  for (const cell of cells) {
    const dow = new Date(cell.day + 'T00:00:00Z').getUTCDay();
    // Start a new column on Sunday (except the very first iteration)
    if (dow === 0 && current.length > 0) {
      // Pad the outgoing column to 7 if needed
      while (current.length < 7) current.push(null);
      weeks.push(current);
      current = [];
    }
    current.push(cell);
  }

  // Flush last partial column
  if (current.length > 0) {
    while (current.length < 7) current.push(null);
    weeks.push(current);
  }

  return weeks;
}

/**
 * Determine if this week column starts a new month (for tick labels).
 * Returns the month name if the first non-null cell in the column
 * is the first occurrence of that month in the grid.
 */
function getMonthTick(week: WeekColumn, weekIndex: number, allWeeks: WeekColumn[]): string | null {
  const firstCell = week.find(c => c !== null);
  if (firstCell === null || firstCell === undefined) return null;

  const month = new Date(firstCell.day + 'T00:00:00Z').getUTCMonth();

  // Check if any previous week already showed this month
  for (let i = 0; i < weekIndex; i++) {
    const prevWeek = allWeeks[i];
    if (prevWeek === undefined) continue;
    const prevCell = prevWeek.find(c => c !== null);
    if (prevCell === null || prevCell === undefined) continue;
    const prevMonth = new Date(prevCell.day + 'T00:00:00Z').getUTCMonth();
    if (prevMonth === month) return null;
  }

  return MONTH_NAMES[month] ?? null;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ActivityHeatmapProps {
  view: StatsView;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ActivityHeatmap({ view }: ActivityHeatmapProps) {
  const accentColor = useResolveClassNames('bg-accent').backgroundColor as ColorValue;

  const activeDays = view.heatmap.cells.filter(c => c.level > 0).length;
  const a11yLabel = `Activity over the past year · ${activeDays.toString()} active ${activeDays === 1 ? 'day' : 'days'}`;

  const weeks = groupIntoWeeks(view.heatmap.cells);
  const columnWidth = CELL_SIZE + CELL_MARGIN * 2;

  return (
    <StatCard title="Activity" accessibilityLabel={a11yLabel}>
      <View
        accessibilityRole="image"
        accessibilityLabel={a11yLabel}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 2 }}
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {/* Month tick labels row */}
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              {weeks.map((week, wi) => {
                const tick = getMonthTick(week, wi, weeks);
                return (
                  <View key={wi} style={{ width: columnWidth, alignItems: 'flex-start' }}>
                    {tick !== null ? (
                      <Text style={{ fontSize: 8 }}
                        className="font-sans text-text-muted"
                      >
                        {tick}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>

            {/* Week columns */}
            <View style={{ flexDirection: 'row' }}>
              {weeks.map((week, wi) => (
                <View key={wi} style={{ flexDirection: 'column' }}>
                  {week.map((cell, di) => {
                    if (cell === null) {
                      // Blank spacer cell
                      return (
                        <View
                          key={di}
                          style={{
                            width: CELL_SIZE,
                            height: CELL_SIZE,
                            margin: CELL_MARGIN,
                            borderRadius: CELL_RADIUS,
                            backgroundColor: 'transparent',
                          }}
                        />
                      );
                    }

                    if (cell.level === 0) {
                      return (
                        <View
                          key={di}
                          style={{
                            width: CELL_SIZE,
                            height: CELL_SIZE,
                            margin: CELL_MARGIN,
                            borderRadius: CELL_RADIUS,
                          }}
                          className="bg-line"
                        />
                      );
                    }

                    const opacity = OPACITY_BY_LEVEL[cell.level as 1 | 2 | 3 | 4];
                    return (
                      <View
                        key={di}
                        style={{
                          width: CELL_SIZE,
                          height: CELL_SIZE,
                          margin: CELL_MARGIN,
                          borderRadius: CELL_RADIUS,
                          backgroundColor: accentColor,
                          opacity,
                        }}
                      />
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </StatCard>
  );
}
