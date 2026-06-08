import { describe, expect, it } from 'vitest';

import { TOKENS_VERSION } from '../index.js';

describe('@ember/tokens', () => {
  it('exports TOKENS_VERSION', () => {
    expect(TOKENS_VERSION).toBe('0.0.1');
  });
});
