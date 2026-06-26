/**
 * native-crypto-box.test.ts — AES-256-GCM CryptoBox for mobile (node env).
 *
 * Injects a mocked getRandomBytes so tests are deterministic. Verifies:
 *  (1) round-trip: encrypt → decrypt yields original plaintext.
 *  (2) IV uniqueness: two encrypts with different mocked IVs produce different ciphertext.
 *  (3) tamper → decrypt throws.
 *  (4) cross-platform layout: fixed key + IV → known split (IV(12) ‖ ciphertext ‖ tag(16)),
 *      byte-identical to web's Web Crypto AES-GCM layout.
 *  (4c) independent vector: round-trips a frozen AES-256-GCM blob produced by Node's
 *      own crypto (the same standard Web Crypto implements) — pins cross-device parity
 *      to an implementation other than noble itself.
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

/** Decode a hex string to bytes. */
function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Build a key/IV with sequential bytes starting at `start` (e.g. 0x00,0x01,…). */
function rangeBytes(length: number, start: number): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => start + i);
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

  it('(4c) independent vector: round-trips an AES-256-GCM blob made by Node crypto', async () => {
    // Frozen vector produced by Node's crypto.createCipheriv('aes-256-gcm', …) —
    // the SAME standard Web Crypto implements — laid out as IV(12) ‖ ciphertext ‖ tag(16).
    // Pins cross-device parity to an implementation independent of noble itself.
    const key = rangeBytes(32, 0x00); // 00..1f
    const iv = rangeBytes(IV_BYTES, 0x40); // 40..4b
    const plaintext = new TextEncoder().encode('ember blob-sync cross-device vector');
    const blob = fromHex(
      '404142434445464748494a4b87d4cc46541ce56fa2a63a45e20a707b1ab43d2fc4186b46012e2d80b76588b8ec67812ad3c4707a281b50c676f5f0c96e561f',
    );

    // 1. The native box decrypts the independently-produced blob → original plaintext.
    const box = makeBox(key, iv);
    expect(await box.decrypt(blob)).toEqual(plaintext);

    // 2. Encrypting the same plaintext with the same IV reproduces the exact blob
    //    (byte-for-byte) → mobile output is consumable by web and vice versa.
    expect(await box.encrypt(plaintext)).toEqual(blob);
  });
});
