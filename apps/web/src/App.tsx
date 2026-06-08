import type { ThemePreference } from './theme/resolve-app-theme.js';
import { useTheme } from './theme/use-theme.js';

const PREFERENCES: ThemePreference[] = ['system', 'warm-light', 'warm-dark'];

const LABELS: Record<ThemePreference, string> = {
  system: 'System',
  'warm-light': 'Light',
  'warm-dark': 'Dark',
};

export default function App() {
  const { preference, setPreference } = useTheme();

  return (
    <main className="min-h-screen bg-surface text-text flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="font-serif text-5xl font-semibold tracking-tight text-text">Ember</h1>
      <p className="font-sans text-base text-text-muted max-w-sm text-center text-balance">
        Your local-first reading companion. Open a book and build a streak.
      </p>

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
              'font-sans text-sm px-4 py-2 transition-colors',
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
    </main>
  );
}
