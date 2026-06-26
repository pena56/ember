/**
 * web-crypto-box.ts — AES-256-GCM CryptoBox binding for the web platform.
 *
 * Implements the CryptoBox port from @ember/core blob-sync using Web Crypto API.
 * - encrypt: fresh 12-byte IV per call → IV ‖ ciphertext
 * - decrypt: split first 12 bytes as IV, rest as ciphertext → plaintext
 *
 * The per-user key is imported once per session by loadBlobKey; the binding
 * holds a non-extractable CryptoKey thereafter.
 *
 * Invariant: no key material ever leaves this module as plaintext bytes.
 */

import type { CryptoBox } from '@ember/core';

const IV_BYTES = 12;
const ALGORITHM = 'AES-GCM' as const;

/**
 * Build a CryptoBox from a raw 32-byte key or a pre-imported CryptoKey.
 * Returns a Promise so callers can `await createWebCryptoBox(...)`.
 */
export async function createWebCryptoBox(
  keyInput: Uint8Array | CryptoKey,
): Promise<CryptoBox> {
  const key: CryptoKey =
    keyInput instanceof CryptoKey
      ? keyInput
      : await crypto.subtle.importKey(
          'raw',
          keyInput as unknown as ArrayBuffer,
          { name: ALGORITHM },
          false,
          ['encrypt', 'decrypt'],
        );

  return {
    async encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
      const iv = new Uint8Array(IV_BYTES);
      crypto.getRandomValues(iv);

      const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: ALGORITHM, iv },
          key,
          plaintext as unknown as ArrayBuffer,
        ),
      );

      // Prepend IV: IV ‖ ciphertext
      const out = new Uint8Array(IV_BYTES + ciphertext.byteLength);
      out.set(iv, 0);
      out.set(ciphertext, IV_BYTES);
      return out;
    },

    async decrypt(blob: Uint8Array): Promise<Uint8Array> {
      const iv = blob.slice(0, IV_BYTES);
      const ciphertext = blob.slice(IV_BYTES);

      return new Uint8Array(
        await crypto.subtle.decrypt(
          { name: ALGORITHM, iv },
          key,
          ciphertext as unknown as ArrayBuffer,
        ),
      );
    },
  };
}

/**
 * Load the per-user blob key from Convex (getOrCreateBlobKey), decode from
 * base64, and import as a non-extractable AES-GCM CryptoKey.
 *
 * Called once per session; the resulting CryptoKey is cached in the hook ref.
 */
export async function loadBlobKey(
  client: { mutation: (ref: unknown, args?: unknown) => Promise<unknown> },
): Promise<CryptoKey> {
  // Lazy-import the api reference so this file stays off the convex-client
  // throw path when running in tests.
  const { api } = await import('@ember/convex/_generated/api');
  const result = (await client.mutation((api as { files: { getOrCreateBlobKey: unknown } }).files.getOrCreateBlobKey)) as { key: string };

  // Decode base64 key string → 32 raw bytes
  const binaryStr = atob(result.key);
  const rawKey = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    rawKey[i] = binaryStr.charCodeAt(i);
  }

  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt'],
  );
}
