/**
 * native-crypto-box.test.ts — AES-256-GCM CryptoBox for mobile (node env).
 *
 * Injects a mocked getRandomBytes so tests are deterministic. Verifies:
 *  (1) round-trip: encrypt → decrypt yields original plaintext.
 *  (2) IV uniqueness: two encrypts with different mocked IVs produce different ciphertext.
 *  (3) tamper → decrypt throws.
 *  (4) cross-platform layout: fixed key + IV → known split (IV(12) ‖ ciphertext ‖ tag(16)),
 *      byte-identical to web's Web Crypto AES-GCM layout.
 */

import { gcm } from '@noble/ciphers/aes.js';
import { describe, expect, it } from 'vitest';

import { createNativeCryptoBox } from '../store/native-crypto-box.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const IV_BYTES = 12;

/** Build a deterministic 32-byte key from a seed byte. */
function makeKey(seed: number): Uint8Array {
  return new Uint8Array(32).fill(seed);
}

/** Build a deterministic 12-byte IV from a seed byte. */
function makeIv(seed: number): Uint8Array {
  return new Uint8Array(IV_BYTES).fill(seed);
}

/**
 * Create a CryptoBox with a mocked getRandomBytes that always returns ivBytes.
 */
function makeBox(keyBytes: Uint8Array, ivBytes: Uint8Array) {
  return createNativeCryptoBox(keyBytes, () => ivBytes);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('createNativeCryptoBox', () => {
  it('(1) round-trip: decrypt(encrypt(plaintext)) === plaintext', async () => {
    const key = makeKey(0x42);
    const iv = makeIv(0x01);
    const box = makeBox(key, iv);
    const plaintext = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const ciphertext = await box.encrypt(plaintext);
    const recovered = await box.decrypt(ciphertext);

    expect(recovered).toEqual(plaintext);
  });

  it('(2) IV uniqueness: two different IVs produce different ciphertexts', async () => {
    const key = makeKey(0x11);
    const plaintext = new Uint8Array([10, 20, 30]);

    const box1 = makeBox(key, makeIv(0xaa));
    const box2 = makeBox(key, makeIv(0xbb));

    const ct1 = await box1.encrypt(plaintext);
    const ct2 = await box2.encrypt(plaintext);

    // They share the same key + plaintext but different IVs → different output.
    expect(ct1).not.toEqual(ct2);
  });

  it('(3) tamper → decrypt throws', async () => {
    const key = makeKey(0x55);
    const iv = makeIv(0x02);
    const box = makeBox(key, iv);
    const plaintext = new Uint8Array([0, 1, 2, 3]);

    const ciphertext = await box.encrypt(plaintext);
    // Flip a byte in the ciphertext body (after the 12-byte IV).
    const tampered = new Uint8Array(ciphertext);
    tampered[IV_BYTES]! ^= 0xff;

    await expect(box.decrypt(tampered)).rejects.toThrow();
  });

  it('(4a) layout: output is exactly IV(12) ‖ ciphertext‖tag(16)', async () => {
    const key = makeKey(0xab);
    const iv = makeIv(0xcd);
    const plaintext = new Uint8Array([1, 2, 3]);
    const box = makeBox(key, iv);

    const out = await box.encrypt(plaintext);

    // First 12 bytes must equal the IV we provided.
    expect(out.slice(0, IV_BYTES)).toEqual(iv);

    // The rest must equal noble's own encrypt output (which appends tag).
    const expectedTail = gcm(key, iv).encrypt(plaintext);
    expect(out.slice(IV_BYTES)).toEqual(expectedTail);

    // Total length: 12 (IV) + plaintext.length + 16 (GCM tag).
    expect(out.byteLength).toBe(IV_BYTES + plaintext.length + 16);
  });

  it('(4b) cross-platform parity: produces same layout as web AES-GCM (decrypt a hand-crafted noble vector)', async () => {
    // Build the "web-produced" ciphertext using noble directly (same algorithm as
    // Web Crypto AES-GCM). If native-crypto-box can decrypt it, the layouts are compatible.
    const key = makeKey(0x99);
    const iv = makeIv(0x77);
    const plaintext = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"

    // Simulate what web crypto would produce: noble gcm output = ciphertext ‖ tag.
    const nobleCt = gcm(key, iv).encrypt(plaintext);
    // Pack as IV ‖ ciphertext ‖ tag (web layout).
    const webProduced = new Uint8Array(IV_BYTES + nobleCt.byteLength);
    webProduced.set(iv, 0);
    webProduced.set(nobleCt, IV_BYTES);

    // Native box must be able to decrypt the web-produced blob.
    const box = makeBox(key, iv); // IV param is only used for encrypt; decrypt reads it from blob.
    const recovered = await box.decrypt(webProduced);
    expect(recovered).toEqual(plaintext);
  });
});
