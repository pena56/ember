/**
 * web-crypto-box.test.ts — AES-256-GCM CryptoBox binding.
 *
 * Tests:
 *  (1) round-trip: decrypt(encrypt(x)) === x
 *  (2) IV uniqueness: two encryptions of the same plaintext differ
 *  (3) tamper rejects: flipping a bit in the ciphertext causes decrypt to throw
 */

import { describe, expect, it } from 'vitest';

import { createWebCryptoBox } from '../store/web-crypto-box.js';

/** Generate a fresh random 32-byte raw key for each test. */
async function makeKey(): Promise<Uint8Array> {
  const key = new Uint8Array(32);
  crypto.getRandomValues(key);
  return key;
}

describe('createWebCryptoBox', () => {
  it('(1) round-trips bytes through encrypt then decrypt', async () => {
    const raw = await makeKey();
    const box = await createWebCryptoBox(raw);
    const plaintext = new TextEncoder().encode('hello blob-sync');

    const ciphertext = await box.encrypt(plaintext);
    const recovered = await box.decrypt(ciphertext);

    expect(Array.from(recovered)).toEqual(Array.from(plaintext));
  });

  it('(2) two encrypt calls of the same plaintext produce different ciphertexts (fresh IV)', async () => {
    const raw = await makeKey();
    const box = await createWebCryptoBox(raw);
    const plaintext = new Uint8Array([1, 2, 3, 4, 5]);

    const ct1 = await box.encrypt(plaintext);
    const ct2 = await box.encrypt(plaintext);

    // They should differ (different IVs)
    expect(ct1).not.toEqual(ct2);
  });

  it('(3) tampered ciphertext causes decrypt to reject', async () => {
    const raw = await makeKey();
    const box = await createWebCryptoBox(raw);
    const plaintext = new TextEncoder().encode('sensitive data');

    const ciphertext = await box.encrypt(plaintext);

    // Flip a byte in the ciphertext body (after the 12-byte IV)
    const tampered = new Uint8Array(ciphertext);
    const byteAt20 = tampered[20] ?? 0;
    tampered[20] = byteAt20 ^ 0xff;

    await expect(box.decrypt(tampered)).rejects.toThrow();
  });

  it('(4) accepts a pre-imported CryptoKey', async () => {
    const rawKey = await makeKey();
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      rawKey as unknown as ArrayBuffer,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    );
    const box = await createWebCryptoBox(cryptoKey);
    const plaintext = new TextEncoder().encode('works with CryptoKey too');

    const ciphertext = await box.encrypt(plaintext);
    const recovered = await box.decrypt(ciphertext);
    expect(Array.from(recovered)).toEqual(Array.from(plaintext));
  });
});
