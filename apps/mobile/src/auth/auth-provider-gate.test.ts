/**
 * auth-provider-gate.test.ts — reducer: resetAuthClient increments the remount key.
 */

import { describe, expect, it } from 'vitest';

import { authKeyReducer } from './auth-provider-gate-reducer.js';

describe('authKeyReducer', () => {
  it('increments key by 1 on reset action', () => {
    expect(authKeyReducer(0, 'reset')).toBe(1);
  });

  it('increments from non-zero key', () => {
    expect(authKeyReducer(5, 'reset')).toBe(6);
  });

  it('each reset increments independently', () => {
    const key0 = 0;
    const key1 = authKeyReducer(key0, 'reset');
    const key2 = authKeyReducer(key1, 'reset');
    expect(key1).toBe(1);
    expect(key2).toBe(2);
  });
});
