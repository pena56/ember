/**
 * Format a byte count into a human-readable string.
 * Uses base-10 KB/MB (1 KB = 1000 bytes) for consistency with how OS file managers display sizes.
 *
 * Mirrors apps/web/src/store/format-bytes.ts — hoisting into @ember/store is deferred.
 */
export function formatBytes(n: number): string {
  if (n < 1000) {
    return `${n} B`;
  }
  if (n < 1_000_000) {
    return `${(n / 1000).toFixed(1)} KB`;
  }
  return `${(n / 1_000_000).toFixed(1)} MB`;
}
