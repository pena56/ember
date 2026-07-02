/**
 * library-view-toggle.tsx — segmented list ⇄ grid switch.
 *
 * Icon-only segmented control; the active segment is accent-tinted. Each button
 * carries aria-pressed + an aria-label so the control is fully announced.
 *
 * Token-only styling (invariant #6).
 */

import { LayoutGrid, List } from 'lucide-react';

import type { ViewMode } from './use-view-mode.js';

interface LibraryViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const OPTIONS: { mode: ViewMode; label: string; Icon: typeof List }[] = [
  { mode: 'grid', label: 'Grid view', Icon: LayoutGrid },
  { mode: 'list', label: 'List view', Icon: List },
];

export function LibraryViewToggle({ mode, onChange }: LibraryViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="Library layout"
      className="inline-flex items-center gap-0.5 rounded-sm border border-line bg-surface-raised p-0.5"
    >
      {OPTIONS.map(({ mode: m, label, Icon }) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={() => { onChange(m); }}
            className={[
              'flex items-center justify-center size-7 rounded-[6px] transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
              active
                ? 'bg-accent/10 text-accent'
                : 'text-text-muted hover:text-text hover:bg-surface',
            ].join(' ')}
          >
            <Icon className="size-4" strokeWidth={active ? 2.25 : 2} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
