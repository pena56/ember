import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '../theme/theme-provider.js';
import { useTheme } from '../theme/use-theme.js';

// ── helpers ────────────────────────────────────────────────────────────────────

function makeMatchMedia(prefersDark: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// Minimal consumer component that exposes theme context via test ids
function ThemeConsumer() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button
        data-testid="set-warm-dark"
        onClick={() => {
          setPreference('warm-dark');
        }}
      >
        warm-dark
      </button>
      <button
        data-testid="set-system"
        onClick={() => {
          setPreference('system');
        }}
      >
        system
      </button>
    </div>
  );
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['appTheme'];
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('defaults to system preference and resolves from matchMedia (light)', () => {
    window.matchMedia = makeMatchMedia(false);

    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(getByTestId('preference').textContent).toBe('system');
    expect(getByTestId('resolved').textContent).toBe('warm-light');
    expect(document.documentElement.dataset['appTheme']).toBe('warm-light');
  });

  it('defaults to system preference and resolves from matchMedia (dark)', () => {
    window.matchMedia = makeMatchMedia(true);

    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(getByTestId('preference').textContent).toBe('system');
    expect(getByTestId('resolved').textContent).toBe('warm-dark');
    expect(document.documentElement.dataset['appTheme']).toBe('warm-dark');
  });

  it('setPreference("warm-dark") sets data-app-theme and writes localStorage', () => {
    window.matchMedia = makeMatchMedia(false);

    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    act(() => {
      fireEvent.click(getByTestId('set-warm-dark'));
    });

    expect(document.documentElement.dataset['appTheme']).toBe('warm-dark');
    expect(localStorage.getItem('ember-app-theme')).toBe('warm-dark');
    expect(getByTestId('preference').textContent).toBe('warm-dark');
    expect(getByTestId('resolved').textContent).toBe('warm-dark');
  });

  it('reads initial preference from localStorage', () => {
    localStorage.setItem('ember-app-theme', 'warm-dark');
    window.matchMedia = makeMatchMedia(false);

    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(getByTestId('preference').textContent).toBe('warm-dark');
    expect(getByTestId('resolved').textContent).toBe('warm-dark');
    expect(document.documentElement.dataset['appTheme']).toBe('warm-dark');
  });

  it('useTheme throws when used outside ThemeProvider', () => {
    const OriginalConsoleError = console.error;
    console.error = vi.fn();

    expect(() => render(<ThemeConsumer />)).toThrow();

    console.error = OriginalConsoleError;
  });
});
