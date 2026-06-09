import { describe, expect, it } from 'vitest';

import { base64ToBytes } from '../store/base64.js';

// Independent ground-truth encoder (charAt → always defined; no node Buffer dep).
const ENC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytesToBase64(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const b0 = b[i]!;
    const has1 = i + 1 < b.length;
    const has2 = i + 2 < b.length;
    const b1 = has1 ? b[i + 1]! : 0;
    const b2 = has2 ? b[i + 2]! : 0;
    out += ENC.charAt(b0 >> 2);
    out += ENC.charAt(((b0 & 3) << 4) | (b1 >> 4));
    out += has1 ? ENC.charAt(((b1 & 15) << 2) | (b2 >> 6)) : '=';
    out += has2 ? ENC.charAt(b2 & 63) : '=';
  }
  return out;
}

describe('base64ToBytes', () => {
  it('decodes a known vector ("abc" → YWJj)', () => {
    expect(Array.from(base64ToBytes('YWJj'))).toEqual([97, 98, 99]);
  });

  it('decodes empty input to an empty array', () => {
    expect(base64ToBytes('')).toHaveLength(0);
  });

  it('handles all padding lengths (1 and 2 bytes remainder)', () => {
    // Buffer is ground truth (node only — test env).
    expect(Array.from(base64ToBytes('YQ=='))).toEqual([97]); // "a"
    expect(Array.from(base64ToBytes('YWI='))).toEqual([97, 98]); // "ab"
  });

  it('ignores whitespace / newlines in the input', () => {
    expect(Array.from(base64ToBytes('YW\nJj'))).toEqual([97, 98, 99]);
  });

  it('round-trips arbitrary binary bytes (all remainder lengths)', () => {
    for (let n = 0; n < 260; n++) {
      const original = new Uint8Array(n);
      for (let i = 0; i < n; i++) original[i] = (i * 37 + n) & 0xff;
      const b64 = bytesToBase64(original);
      expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(original));
    }
  });
});
