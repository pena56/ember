/**
 * format-title.ts — display-only cleanup of a document title derived from a
 * filename.
 *
 * Imported titles are raw filenames (download-site prefixes, underscores,
 * filename-style hyphen separators) which read poorly on screen. This makes
 * them look like book titles. It is DISPLAY-ONLY — the stored `Document.title`
 * is untouched (a proper import-time normalization is a separate follow-up).
 *
 * Pure: no React / RN deps, unit-tested without rendering.
 */

// Common "downloaded from" prefix on pirated PDFs, e.g. "_OceanofPDF.com_…".
const SITE_PREFIX = /^_?(?:www\.)?oceanofpdf\.com_?/i;

export function formatBookTitle(raw: string): string {
  const cleaned = raw
    .replace(SITE_PREFIX, '')   // drop the download-site prefix
    .replace(/\.pdf$/i, '')     // drop a trailing extension, if present
    .replace(/_+/g, ' ')        // underscores → spaces
    .replace(/\s+/g, ' ')       // collapse runs of whitespace
    .replace(/ - /g, ' — ') // filename separator " - " → em dash (leaves Spider-Man intact)
    .trim();

  // Never return an empty string — fall back to the trimmed original.
  return cleaned.length > 0 ? cleaned : raw.trim();
}
