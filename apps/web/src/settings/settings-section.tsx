/**
 * settings-section.tsx — shared shell for a Settings section.
 *
 * One consistent shape for every section: a sentence-case heading + optional
 * description, then a single grouping card. Consolidates what used to be four
 * near-identical hand-rolled shells (with tiny uppercase eyebrows) into one
 * pattern, so spacing, radius, and elevation stay identical across the page.
 *
 * Token-only styling (invariant #6 — no hardcoded colors).
 */

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils.js';

interface SettingsSectionProps {
  /** Sentence-case heading; also the section's accessible name. */
  title: string;
  /** Optional supporting line under the heading. */
  description?: string;
  /** Extra classes for the card (e.g. padding overrides). */
  cardClassName?: string;
  children: ReactNode;
}

export function SettingsSection({
  title,
  description,
  cardClassName,
  children,
}: SettingsSectionProps) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 px-0.5">
        <h2 className="font-sans text-sm font-semibold text-text leading-none">{title}</h2>
        {description && (
          <p className="font-sans text-sm leading-relaxed text-text-muted text-balance">
            {description}
          </p>
        )}
      </div>

      <div
        className={cn(
          'rounded-md border border-line bg-surface-raised shadow-float-sm overflow-hidden',
          cardClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
