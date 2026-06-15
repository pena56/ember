/**
 * claim-reload.test.ts — finishAuthWithReload / consumePendingAuthToast.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { consumePendingAuthToast, finishAuthWithReload } from '../auth/claim-reload.js';

describe('claim-reload', () => {
  let reload: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    sessionStorage.clear();
    reload = vi.fn();
    originalLocation = window.location;
    // jsdom can't navigate; swap in a stub location so reload() is observable.
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, reload },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, configurable: true });
    sessionStorage.clear();
  });

  it('finishAuthWithReload stashes the message and reloads', () => {
    finishAuthWithReload('Your library is saved.');
    expect(reload).toHaveBeenCalledTimes(1);
    // The toast survives the reload via sessionStorage.
    expect(consumePendingAuthToast()).toBe('Your library is saved.');
  });

  it('consumePendingAuthToast clears the message after reading (one-shot)', () => {
    finishAuthWithReload('Welcome back.');
    expect(consumePendingAuthToast()).toBe('Welcome back.');
    // Second read is empty — toast shows once, not on every load.
    expect(consumePendingAuthToast()).toBeNull();
  });

  it('consumePendingAuthToast returns null when nothing is pending', () => {
    expect(consumePendingAuthToast()).toBeNull();
  });
});
