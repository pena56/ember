/**
 * derive-account-view.test.ts — loading/anonymous/claimed derivation.
 *
 * Mirrors the web use-account contract.
 */

import { describe, expect, it } from 'vitest';

import { deriveAccountView } from './derive-account-view.js';

describe('deriveAccountView', () => {
  it('returns loading when isLoading is true', () => {
    const result = deriveAccountView({ isLoading: true, isAuthenticated: false, user: undefined });
    expect(result.status).toBe('loading');
    expect(result.email).toBeUndefined();
  });

  it('returns loading when user is undefined (query pending)', () => {
    const result = deriveAccountView({ isLoading: false, isAuthenticated: true, user: undefined });
    expect(result.status).toBe('loading');
    expect(result.email).toBeUndefined();
  });

  it('returns anonymous when authenticated but user is null', () => {
    const result = deriveAccountView({ isLoading: false, isAuthenticated: false, user: null });
    expect(result.status).toBe('anonymous');
    expect(result.email).toBeUndefined();
  });

  it('returns anonymous when not authenticated', () => {
    const result = deriveAccountView({ isLoading: false, isAuthenticated: false, user: null });
    expect(result.status).toBe('anonymous');
  });

  it('returns anonymous when user.isAnonymous is true even if authenticated', () => {
    const result = deriveAccountView({
      isLoading: false,
      isAuthenticated: true,
      user: { isAnonymous: true, email: undefined },
    });
    expect(result.status).toBe('anonymous');
    expect(result.email).toBeUndefined();
  });

  it('returns claimed when authenticated + user + not anonymous', () => {
    const result = deriveAccountView({
      isLoading: false,
      isAuthenticated: true,
      user: { isAnonymous: false, email: 'test@example.com' },
    });
    expect(result.status).toBe('claimed');
    expect(result.email).toBe('test@example.com');
  });

  it('returns claimed with undefined email when email is not set', () => {
    const result = deriveAccountView({
      isLoading: false,
      isAuthenticated: true,
      user: { isAnonymous: false, email: undefined },
    });
    expect(result.status).toBe('claimed');
    expect(result.email).toBeUndefined();
  });
});
