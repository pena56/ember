/**
 * theme-control.tsx — shared ThemeControl component (extracted from library-page.tsx).
 * Renders the System / Light / Dark segmented toggle using the app theme tokens.
 * Behavior is unchanged from the original; it now lives here so the app-shell can use it.
 */

import type { ThemePreference } from './resolve-app-theme.js';
import { useTheme } from './use-theme.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const PREFERENCES: ThemePreference[] = ['system', 'warm-light', 'warm-dark'];
const LABELS: Record<ThemePreference, string> = {
  system: 'System',
  'warm-light': 'Light',
  'warm-dark': 'Dark',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ThemeControl() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      className="flex rounded-md overflow-hidden border border-line bg-surface-raised"
      role="group"
      aria-label="Theme"
    >
      {PREFERENCES.map((pref) => (
        <button
          key={pref}
          type="button"
          onClick={() => {
            setPreference(pref);
          }}
          aria-pressed={preference === pref}
          className={[
            'font-sans text-sm px-3 py-1.5 transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            preference === pref
              ? 'text-text border-b-2 border-accent font-medium'
              : 'text-text-muted hover:text-text border-b-2 border-transparent',
          ].join(' ')}
        >
          {LABELS[pref]}
        </button>
      ))}
    </div>
  );
}
