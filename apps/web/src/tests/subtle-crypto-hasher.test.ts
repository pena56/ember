import { describe, expect, it } from 'vitest';

import { subtleCryptoHasher } from '../store/subtle-crypto-hasher.js';

// Known SHA-256 vectors sourced from NIST / RFC 4634.

describe('subtleCryptoHasher', () => {
  it('hashes empty input correctly', async () => {
    const result = await subtleCryptoHasher.sha256Hex(new Uint8Array(0));
    expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes "abc" correctly', async () => {
    const bytes = new TextEncoder().encode('abc');
    const result = await subtleCryptoHasher.sha256Hex(bytes);
    expect(result).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('returns lowercase hex string of 64 characters', async () => {
    const bytes = new TextEncoder().encode('hello');
    const result = await subtleCryptoHasher.sha256Hex(bytes);
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });
});
