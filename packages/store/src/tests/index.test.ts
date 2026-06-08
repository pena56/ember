import { describe, expect, it } from 'vitest';

import { STORE_VERSION } from '../index.js';

describe('@ember/store', () => {
  it('exports STORE_VERSION', () => {
    expect(STORE_VERSION).toBe('0.0.1');
  });
});
