/**
 * native-crypto-box.ts — AES-256-GCM CryptoBox binding for the mobile platform.
 *
 * Implements the CryptoBox port from @ember/core blob-sync using @noble/ciphers.
 * Layout: IV(12) ‖ ciphertext ‖ tag(16) — byte-identical to web's Web Crypto AES-GCM
 * so a blob encrypted on web decrypts on mobile and vice versa.
 *
 * - encrypt: fresh 12-byte IV from expo-crypto.getRandomBytes(12) (injected for tests)
 *            → gcm(key, iv).encrypt(plaintext) yields ciphertext ‖ tag
 *            → return IV ‖ ciphertext ‖ tag
 * - decrypt: split first 12 bytes as IV → gcm(key, iv).decrypt(rest)
 *
 * `loadBlobKey` decodes the base64 key with the existing `base64ToBytes` (NOT atob).
 *
 * Invariant: no key material ever leaves this module as plaintext bytes.
 */

import { gcm } from '@noble/ciphers/aes.js';

import type { CryptoBox } from '@ember/core';

import { base64ToBytes } from './base64.js';

const IV_BYTES = 12;

/**
 * Build a CryptoBox from a raw 32-byte key.
 *
 * @param key - 32-byte AES-256 key
 * @param getIv - injectable IV generator (defaults to expo-crypto.getRandomBytes).
 *   Injected in tests for deterministic output. Production passes undefined to use the default.
 */
export function createNativeCryptoBox(
  key: Uint8Array,
  getIv?: () => Uint8Array,
): CryptoBox {
  const getRandomIv = getIv ?? (() => {
    // Lazy-import expo-crypto so this file stays node-testable.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRandomBytes } = require('expo-crypto') as { getRandomBytes: (n: number) => Uint8Array };
    return getRandomBytes(IV_BYTES);
  });

  return {
    async encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
      const iv = getRandomIv();

      // gcm(key, iv).encrypt(plaintext) returns ciphertext ‖ tag (noble's convention).
      const ciphertextAndTag = gcm(key, iv).encrypt(plaintext);

      // Pack: IV ‖ ciphertext ‖ tag
      const out = new Uint8Array(IV_BYTES + ciphertextAndTag.byteLength);
      out.set(iv, 0);
      out.set(ciphertextAndTag, IV_BYTES);
      return out;
    },

    async decrypt(blob: Uint8Array): Promise<Uint8Array> {
      // Split: first 12 bytes = IV, rest = ciphertext ‖ tag
      const iv = blob.slice(0, IV_BYTES);
      const ciphertextAndTag = blob.slice(IV_BYTES);

      // gcm(key, iv).decrypt(ciphertextAndTag) verifies the tag and returns plaintext.
      return gcm(key, iv).decrypt(ciphertextAndTag);
    },
  };
}

/**
 * Load the per-user blob key from Convex (getOrCreateBlobKey), decode from
 * base64, and return the raw 32-byte key (kept in memory, never logged).
 *
 * Mirrors web's loadBlobKey but uses base64ToBytes instead of atob (not in RN).
 *
 * Called once per session; the result is cached in the hook ref.
 */
export async function loadBlobKey(
  client: { mutation: (ref: unknown, args?: unknown) => Promise<unknown> },
): Promise<Uint8Array> {
  // Lazy-import the api reference so this file stays off the convex-client
  // throw path when running in tests.
  const { api } = await import('@ember/convex/_generated/api');
  const result = (await client.mutation(
    (api as { files: { getOrCreateBlobKey: unknown } }).files.getOrCreateBlobKey,
  )) as { key: string };

  // Decode base64 key string → 32 raw bytes via existing base64ToBytes (NOT atob).
  return base64ToBytes(result.key);
}
