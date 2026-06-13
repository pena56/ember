/**
 * book-progress-list.tsx — per-book progress section for the Stats tab.
 *
 * Wraps a list of BookProgressRow items; warm empty state when no books.
 * Token-only styling (invariant #6).
 */

import { BookProgressRow } from './book-progress-row.js';
import { StatCard } from './stat-card.js';

// ── Props ──────────────────────────────────────────────────────────────────────

interface BookItem {
  docId: string;
  title: string;
  progressLabel: string | null;
  etaLabel: string | null;
  progressRatio: number | null;
}

interface BookProgressListProps {
  books: BookItem[];
}

// ── Component ──────────────────────────────────────────────────────────────────

export function BookProgressList({ books }: BookProgressListProps) {
  return (
    <StatCard title="Your books">
      {books.length === 0 ? (
        <p className="font-sans text-sm text-text-muted leading-relaxed">
          Books you&apos;ve opened will appear here with your progress.
        </p>
      ) : (
        <div>
          {books.map((book) => (
            <BookProgressRow key={book.docId} {...book} />
          ))}
        </div>
      )}
    </StatCard>
  );
}
