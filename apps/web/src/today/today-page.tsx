/**
 * today-page.tsx — the Today tab: time-of-day greeting + Continue Reading card.
 *
 * Quiet, literary voice. No streak ember, no goal ring, no fake numbers.
 * Centered max-w-2xl column matching LibraryPage.
 *
 * Design: warm editorial — generous vertical rhythm, Fraunces greeting as the
 * page's emotional anchor, soft date/time line in muted Inter.
 */

import { useNavigate } from 'react-router';

import { ContinueReadingCard } from './continue-reading-card.js';
import { useContinueReading } from './use-continue-reading.js';

// ── Greeting ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5)  return 'Still up?';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Quiet evening';
}

function getSubtitle(hasItems: boolean): string {
  if (hasItems) return 'Pick up where you left off.';
  return 'A good day to begin something new.';
}

function formatDate(): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div
      className="flex items-center justify-center py-16"
      role="status"
      aria-label="Loading your reading progress"
    >
      <div className="w-5 h-5 rounded-full border-2 border-line border-t-accent motion-safe:animate-spin" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function TodayPage() {
  const navigate = useNavigate();
  const { items, loading } = useContinueReading();

  const greeting  = getGreeting();
  const topItem   = items[0];

  function handleResume(docId: string) {
    void navigate(`/read/${docId}`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-10">

      {/* Greeting block */}
      <div className="flex flex-col gap-1.5">
        {/* Date — quiet, muted, contextual */}
        <p className="font-sans text-xs font-medium uppercase tracking-[0.14em] text-text-muted">
          {formatDate()}
        </p>

        <h1 className="font-serif text-4xl font-semibold text-text leading-tight tracking-tight">
          {greeting}
        </h1>

        {!loading && (
          <p className="font-sans text-sm text-text-muted mt-0.5">
            {getSubtitle(items.length > 0)}
          </p>
        )}
      </div>

      {/* Thin section separator */}
      <div className="h-px w-12 bg-line" aria-hidden="true" />

      {/* Continue Reading */}
      {loading ? (
        <Spinner />
      ) : (
        <section aria-label="Continue reading">
          <ContinueReadingCard item={topItem} onResume={handleResume} />
        </section>
      )}
    </div>
  );
}
