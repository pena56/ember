/**
 * book-progress-list.tsx — per-book progress section for the Stats tab.
 *
 * All books with ≥1 session, most-recent read first (ordering done in the
 * presenter). Warm empty state when no books. Token-only styling (invariant #6).
 */

import { Text, View } from 'react-native';

import { BookProgressRow } from './book-progress-row.js';
import type { StatsView } from './present-stats.js';
import { StatCard } from './stat-card.js';

// ── Props ─────────────────────────────────────────────────────────────────────

interface BookProgressListProps {
  view: StatsView;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BookProgressList({ view }: BookProgressListProps) {
  const { books } = view;

  return (
    <StatCard title="Your books">
      {books.length === 0 ? (
        <Text className="font-sans text-sm text-text-muted leading-relaxed">
          Books you&apos;ve opened will appear here with your progress.
        </Text>
      ) : (
        <View className="-mb-3">
          {books.map((book, i) => (
            <BookProgressRow
              key={book.docId}
              title={book.title}
              progressLabel={book.progressLabel}
              etaLabel={book.etaLabel}
              progressRatio={book.progressRatio}
              isLast={i === books.length - 1}
            />
          ))}
        </View>
      )}
    </StatCard>
  );
}
