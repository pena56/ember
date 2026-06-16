/**
 * should-sign-in-anonymously.test.ts — predicate truth table.
 *
 * True only when !isLoading && !isAuthenticated && online && !hasFired.
 * All other combinations return false.
 */

import { describe, expect, it } from 'vitest';

import { shouldSignInAnonymously } from './should-sign-in-anonymously.js';

describe('shouldSignInAnonymously', () => {
  it('returns true only when all conditions are met', () => {
    expect(
      shouldSignInAnonymously({ isLoading: false, isAuthenticated: false, online: true, hasFired: false }),
    ).toBe(true);
  });

  it('returns false when offline', () => {
    expect(
      shouldSignInAnonymously({ isLoading: false, isAuthenticated: false, online: false, hasFired: false }),
    ).toBe(false);
  });

  it('returns false when still loading', () => {
    expect(
      shouldSignInAnonymously({ isLoading: true, isAuthenticated: false, online: true, hasFired: false }),
    ).toBe(false);
  });

  it('returns false when already authenticated', () => {
    expect(
      shouldSignInAnonymously({ isLoading: false, isAuthenticated: true, online: true, hasFired: false }),
    ).toBe(false);
  });

  it('returns false when hasFired is true (ref guard)', () => {
    expect(
      shouldSignInAnonymously({ isLoading: false, isAuthenticated: false, online: true, hasFired: true }),
    ).toBe(false);
  });

  it('returns false when loading AND offline', () => {
    expect(
      shouldSignInAnonymously({ isLoading: true, isAuthenticated: false, online: false, hasFired: false }),
    ).toBe(false);
  });

  it('returns false when authenticated AND fired', () => {
    expect(
      shouldSignInAnonymously({ isLoading: false, isAuthenticated: true, online: true, hasFired: true }),
    ).toBe(false);
  });
});
