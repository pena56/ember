/**
 * stat-card.tsx — shared section shell for the Stats dashboard.
 *
 * Mirrors the app-wide section grammar (see SettingsSection): a sentence-case
 * heading above a soft floating card, so Stats reads consistently with Settings
 * and Library. Renders a <section aria-label> so the document outline stays
 * meaningful for AT — the page no longer needs to wrap each stat in its own.
 *
 * Token-only styling (invariant #6). No uppercase tracked eyebrows.
 */

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils.js';

interface StatCardProps {
  title?: string;
  children: ReactNode;
  /** Grid placement / outer spacing (e.g. col-span). */
  className?: string;
  /** Overrides the card body padding when content needs its own rhythm. */
  cardClassName?: string;
}

export function StatCard({ title, children, className, cardClassName }: StatCardProps) {
  return (
    <section aria-label={title} className={cn('flex h-full flex-col gap-3', className)}>
      {title && (
        <h2 className="px-0.5 font-sans text-sm font-semibold leading-none text-text">
          {title}
        </h2>
      )}
      <div
        className={cn(
          'flex-1 rounded-md border border-line bg-surface-raised shadow-float-sm px-6 py-5',
          cardClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
