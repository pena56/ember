// expo-crypto-hasher.ts — expoCryptoHasher implements Hasher.
// The ONLY file in this project that imports expo-crypto.
//
// Not headless-testable (native module) — device-verified: the SHA-256 result is
// checked against a known vector on-device.

import { CryptoDigestAlgorithm, digest } from 'expo-crypto';

import type { Hasher } from '@ember/core';

/**
 * Convert an ArrayBuffer to a lowercase hex string.
 * Matches the shape used by web's subtleCryptoHasher.
 */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * expo-crypto–backed SHA-256 hasher.
 *
 * Stateless const object — safe to share across multiple import calls.
 */
export const expoCryptoHasher: Hasher = {
  async sha256Hex(bytes: Uint8Array): Promise<string> {
    // Cast to Uint8Array<ArrayBuffer> to satisfy expo-crypto's BufferSource constraint
    const buffer = await digest(CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>);
    return bufferToHex(buffer);
  },
};
