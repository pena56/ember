// Near-duplicate detection — pure functions, no platform APIs.
// Invariant #1: no platform API import; no @ember/store import.

import type { Document } from './document.js';

// Known ebook/document file extensions. Only these are stripped from a trailing dotted token,
// so legitimate dotted titles ("Vol.II", "Catch.22", "Book.2024") survive intact and don't
// manufacture false-positive duplicate candidates.
const KNOWN_EXTENSION = /\.(?:pdf|epub|mobi|azw3|txt|docx|cbz|cbr)$/;

/**
 * Normalize a document title for duplicate detection.
 * Steps (applied in order):
 *   1. Lowercase
 *   2. Trim leading/trailing whitespace
 *   3. Collapse internal whitespace (spaces, tabs, etc.) to a single space
 *   4. Strip a trailing KNOWN ebook/doc extension token only (allowlist — see KNOWN_EXTENSION)
 * Deterministic and idempotent.
 */
export function normalizeTitle(title: string): string {
  // Step 1 & 2: lowercase and trim
  let s = title.toLowerCase().trim();

  // Step 3: collapse internal whitespace to single space
  s = s.replace(/\s+/g, ' ');

  // Step 4: strip trailing extension only if it is on the known allowlist (case-insensitive via
  // the prior lowercase). Arbitrary dotted tokens are preserved.
  s = s.replace(KNOWN_EXTENSION, '');

  // Re-trim in case the extension removal left trailing spaces or punctuation
  s = s.trim();

  return s;
}

/**
 * A candidate duplicate pair. Always has aId < bId lexicographically for stability.
 */
export type DuplicatePair = {
  aId: string;
  bId: string;
};

/**
 * Options for duplicate detection.
 */
export type DetectDuplicatesOptions = {
  /** Size band: |aSize - bSize| <= sizeBand * max(aSize, bSize). Default 0.15 (±15%). */
  sizeBand?: number;
};

const DEFAULT_SIZE_BAND = 0.15;

/**
 * Pure. Detect near-duplicate candidates in a list of documents.
 * A pair is a near-duplicate when:
 *   - distinct ids
 *   - equal normalizeTitle
 *   - |aSize - bSize| <= sizeBand * max(aSize, bSize)
 *
 * Returns pairs sorted by (aId, bId) ascending. O(n²) — libraries are small.
 */
export function detectDuplicates(
  docs: ReadonlyArray<Pick<Document, 'id' | 'title' | 'byteSize'>>,
  opts?: DetectDuplicatesOptions,
): DuplicatePair[] {
  const band = opts?.sizeBand ?? DEFAULT_SIZE_BAND;
  const pairs: DuplicatePair[] = [];

  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const a = docs[i]!;
      const b = docs[j]!;

      // Must have distinct ids
      if (a.id === b.id) continue;

      // Equal normalized title
      if (normalizeTitle(a.title) !== normalizeTitle(b.title)) continue;

      // Size within band
      const maxSize = Math.max(a.byteSize, b.byteSize);
      const diff = Math.abs(a.byteSize - b.byteSize);
      if (diff > band * maxSize) continue;

      // Stable pair: smaller id first
      const aId = a.id < b.id ? a.id : b.id;
      const bId = a.id < b.id ? b.id : a.id;
      pairs.push({ aId, bId });
    }
  }

  // Sort by (aId, bId) ascending
  pairs.sort((p, q) => {
    if (p.aId !== q.aId) return p.aId < q.aId ? -1 : 1;
    return p.bId < q.bId ? -1 : 1;
  });

  // Dedup (shouldn't have duplicates from the loop, but guard anyway)
  const seen = new Set<string>();
  return pairs.filter((p) => {
    const key = `${p.aId}:${p.bId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
