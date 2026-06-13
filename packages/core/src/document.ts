// Document type + SHA-256 identity primitives — pure functions, no platform APIs.
// Invariant: core imports no platform API (code-standards).

/** Persisted document record. id is the lowercase-hex SHA-256 of the file bytes. */
export type Document = {
  id: string;
  title: string;
  filename: string;
  byteSize: number;
  contentType: string;
  importedAt: number; // physical ms supplied by caller — no Date.now() in core
  /** total number of pages, set once a reader has loaded the PDF (pdfjs numPages). Intrinsic to the
   *  bytes → same docId yields the same count on every device. Absent until a reader fills it in. */
  pageCount?: number;
};

/**
 * Platform capability port for SHA-256 hashing.
 * Real bindings (web SubtleCrypto, expo-crypto) arrive in 04b/04c.
 * Mirrors the 03c SqliteDriver port pattern.
 */
export interface Hasher {
  sha256Hex(bytes: Uint8Array): Promise<string>;
}

/**
 * Thin seam — every caller and test goes through this.
 * Returns the lowercase-hex SHA-256 of bytes as supplied by hasher.
 */
export async function computeDocumentId(bytes: Uint8Array, hasher: Hasher): Promise<string> {
  return hasher.sha256Hex(bytes);
}

/**
 * Return a copy of `doc` with `pageCount` set. Validates: pageCount must be an integer >= 1
 * (RangeError otherwise). Pure — never mutates the input. Idempotent in value: setting the same
 * count yields an equal record.
 */
export function withDocumentPageCount(doc: Document, pageCount: number): Document {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new RangeError(`pageCount must be an integer >= 1, got ${pageCount}`);
  }
  return { ...doc, pageCount };
}

/**
 * Pure factory for Document records.
 * title defaults to filename with its extension stripped (e.g. "report.pdf" → "report").
 */
export function makeDocument(args: {
  id: string;
  filename: string;
  byteSize: number;
  contentType: string;
  importedAt: number;
  title?: string;
}): Document {
  const defaultTitle = args.filename.includes('.')
    ? args.filename.slice(0, args.filename.lastIndexOf('.'))
    : args.filename;
  return {
    id: args.id,
    title: args.title ?? defaultTitle,
    filename: args.filename,
    byteSize: args.byteSize,
    contentType: args.contentType,
    importedAt: args.importedAt,
  };
}
