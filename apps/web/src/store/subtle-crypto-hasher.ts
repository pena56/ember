import type { Hasher } from '@ember/core';

/**
 * SHA-256 hasher backed by the Web Crypto API (`crypto.subtle`).
 *
 * Available in all modern browsers and in Node/vitest's globalThis.
 * No platform state — safe to share as a singleton.
 */
export const subtleCryptoHasher: Hasher = {
  async sha256Hex(bytes: Uint8Array): Promise<string> {
    // Cast to ArrayBuffer-backed Uint8Array as required by the SubtleCrypto typings.
    const buffer = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  },
};
