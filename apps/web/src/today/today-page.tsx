/**
 * today-page.tsx — the Today tab: one cohesive hero panel.
 *
 * A single floating panel over the ambient backdrop, composed of three bands
 * that read as one: the time-of-day greeting, the Continue Reading invitation,
 * and the habit band (streak ember + goal ring). No stacked cards — internal
 * hairline dividers carry the rhythm.
 *
 * Quiet, literary voice. No fake numbers. Token-only styling (invariant #6).
 */

import { useNavigate } from 'react-router';

import { ContinueReadingSection } from './continue-reading-card.js';
import { HabitBand } from './habit-header.js';
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

// ── Page ──────────────────────────────────────────────────────────────────────

export function TodayPage() {
  const navigate = useNavigate();
  const { items, loading } = useContinueReading();

  const greeting = getGreeting();
  const topItem  = items[0];

  function handleResume(docId: string) {
    void navigate(`/read/${docId}`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <div className="relative overflow-hidden rounded-lg border border-line bg-surface-raised shadow-float">
        {/* Ember atmosphere — a faint warm glow anchoring the panel to the field */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent opacity-[0.05] blur-2xl"
        />

        {/* Greeting — the panel's emotional anchor */}
        <header className="relative flex flex-col gap-2 px-7 pt-7 pb-6">
          <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight text-text text-balance">
            {greeting}
          </h1>
          <p className="font-sans text-sm text-text-muted">
            {formatDate()}
            {!loading && (
              <>
                <span className="mx-1.5 text-line" aria-hidden="true">·</span>
                {getSubtitle(items.length > 0)}
              </>
            )}
          </p>
        </header>

        {/* Continue reading — the primary invitation back into a book */}
        <section
          aria-label="Continue reading"
          className="relative border-t border-line px-7 py-6"
        >
          <ContinueReadingSection item={topItem} loading={loading} onResume={handleResume} />
        </section>

        {/* Habit — streak ember + today's goal ring */}
        <section
          aria-label="Reading habit"
          className="relative border-t border-line px-7 py-5"
        >
          <HabitBand />
        </section>
      </div>
    </div>
  );
}
