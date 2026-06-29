/**
 * push-control-state.test.ts — node, no native modules.
 *
 * Drives derivePushControlState across the four cases from spec §Tests.
 * Pure function — no imports from react-native or expo-notifications.
 */

import { describe, expect, it } from 'vitest';

import { derivePushControlState } from './push-control-state.js';

describe('derivePushControlState', () => {
  it('undetermined → enabled:false, primaryAction:request, needsSystemSettings:false', () => {
    const result = derivePushControlState({ permission: 'undetermined', hasToken: false });
    expect(result).toEqual({
      enabled: false,
      primaryAction: 'request',
      needsSystemSettings: false,
    });
  });

  it('granted + hasToken:true → enabled:true, primaryAction:none, needsSystemSettings:false', () => {
    const result = derivePushControlState({ permission: 'granted', hasToken: true });
    expect(result).toEqual({
      enabled: true,
      primaryAction: 'none',
      needsSystemSettings: false,
    });
  });

  it('granted + hasToken:false → enabled:false, primaryAction:request (re-acquire)', () => {
    const result = derivePushControlState({ permission: 'granted', hasToken: false });
    expect(result).toEqual({
      enabled: false,
      primaryAction: 'request',
      needsSystemSettings: false,
    });
  });

  it('denied → enabled:false, primaryAction:open-settings, needsSystemSettings:true', () => {
    const result = derivePushControlState({ permission: 'denied', hasToken: false });
    expect(result).toEqual({
      enabled: false,
      primaryAction: 'open-settings',
      needsSystemSettings: true,
    });
  });
});
