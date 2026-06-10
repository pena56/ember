// base64.ts — pure base64 → bytes decode. Engine-agnostic (no `atob`, which isn't
// in the mobile TS lib / not guaranteed across RN engines). Used to turn a picked
// file's base64 contents (read via expo-file-system/legacy) into a Uint8Array.

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Reverse lookup: ASCII code → 6-bit value (-1 for non-base64 chars, e.g. '=', newlines).
const LOOKUP = new Int8Array(128).fill(-1);
for (let i = 0; i < CHARS.length; i++) {
  LOOKUP[CHARS.charCodeAt(i)] = i;
}

/**
 * Encode raw bytes to a base64 string. Standard bit-accumulator encoder.
 * Avoids `btoa(String.fromCharCode(...bytes))` which is slow and can OOM for
 * large PDFs (builds an intermediate binary string). This implementation writes
 * the output character-by-character with no intermediate allocations beyond the
 * result string itself.
 *
 * Exported so the WebView bridge can encode PDF bytes before postMessage.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const len = bytes.length;
  // Output length: ceil(len / 3) * 4 chars
  const out: string[] = [];

  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < len ? bytes[i + 1]! : 0;
    const b2 = i + 2 < len ? bytes[i + 2]! : 0;

    out.push(CHARS[(b0 >> 2) & 0x3f]!);
    out.push(CHARS[((b0 << 4) | (b1 >> 4)) & 0x3f]!);
    out.push(i + 1 < len ? CHARS[((b1 << 2) | (b2 >> 6)) & 0x3f]! : '=');
    out.push(i + 2 < len ? CHARS[b2 & 0x3f]! : '=');
  }

  return out.join('');
}

/**
 * Decode a base64 string to raw bytes. Ignores whitespace and padding; tolerates
 * unpadded input. Standard bit-accumulator decoder — correct for arbitrary binary.
 */
export function base64ToBytes(base64: string): Uint8Array {
  // First pass: count valid sextets so we can size the output exactly.
  // `code < 128` guarantees the LOOKUP index is in range (length 128).
  let count = 0;
  for (let i = 0; i < base64.length; i++) {
    const code = base64.charCodeAt(i);
    if (code < 128 && LOOKUP[code]! >= 0) count++;
  }

  const bytes = new Uint8Array((count * 6) >> 3); // floor(bits / 8)
  let bitBuffer = 0;
  let bitCount = 0;
  let p = 0;
  for (let i = 0; i < base64.length; i++) {
    const code = base64.charCodeAt(i);
    const value = code < 128 ? LOOKUP[code]! : -1;
    if (value < 0) continue;
    bitBuffer = (bitBuffer << 6) | value;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[p++] = (bitBuffer >> bitCount) & 0xff;
    }
  }
  return bytes;
}
