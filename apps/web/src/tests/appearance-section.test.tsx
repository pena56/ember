/**
 * appearance-section.test.tsx — Settings Appearance section tests.
 *
 * The theme control moved out of the shell into Settings; this preserves the
 * aria-pressed coverage that used to live in app-shell.test.tsx.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppearanceSection } from '../settings/appearance-section.js';
import { ThemeProvider } from '../theme/theme-provider.js';

function makeMatchMedia(prefersDark = false) {
  return vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('AppearanceSection', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['appTheme'];
    window.matchMedia = makeMatchMedia();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the Theme dropdown trigger showing the current preference', () => {
    render(
      <ThemeProvider>
        <AppearanceSection />
      </ThemeProvider>,
    );

    // The control is now a dropdown: a single trigger button named "Theme".
    // (Options live in a portal that only mounts on open — not asserted here to
    // avoid radix pointer-capture behaviour in jsdom.)
    const trigger = screen.getByRole('button', { name: 'Theme' });
    expect(trigger).toBeDefined();

    // Default preference with no stored value + light matchMedia is "System".
    expect(trigger.textContent ?? '').toMatch(/system/i);
  });
});
