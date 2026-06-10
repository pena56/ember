// Text-layer geometry shape + normalizer — pure functions, no platform APIs.
// Invariant: core imports no platform API (code-standards). No pdf.js import.

/**
 * A bounding box expressed as fractions of the page dimensions (0..1).
 * Origin: top-left corner of the page; x grows right, y grows down.
 */
export type NormalizedBox = {
  x: number;      // left edge / page width
  y: number;      // top edge / page height
  width: number;  // run width / page width
  height: number; // run height / page height
};

/**
 * Geometry for one pdf.js TextContent item (a single text run).
 * All items returned by pdf.js are preserved in order (including empty/hasEOL
 * spacing items) so that a later char-offset reconstruction (unit 10) is faithful.
 */
export type TextItemGeometry = {
  index: number;       // 0-based reading-order position on the page
  str: string;         // verbatim text of the run (may be empty for spacing items)
  box: NormalizedBox;
};

/** Normalized geometry for an entire page. pageNumber is 1-based. */
export type PageTextGeometry = {
  pageNumber: number;
  items: TextItemGeometry[];
};

// ---------------------------------------------------------------------------
// Input projections (structural port — no pdf.js import; mirrors Hasher/SqliteDriver pattern).
// The platform layer (apps/web 05c-2, apps/mobile 05c-3) builds these from pdf.js and passes them in.
// ---------------------------------------------------------------------------

/**
 * Minimal projection of a pdf.js TextItem.
 * `width`/`height` and `transform` are taken at the scale-1 viewport (PDF user space, bottom-left origin).
 * `transform` is [a, b, c, d, e, f]; the run origin is (e, f) = (transform[4], transform[5]).
 * NOTE: rotation/skew handling (non-identity a/b/c/d) is OUT of 05c-1.
 */
export type RawTextItem = {
  str: string;
  width: number;
  height: number;
  transform: [number, number, number, number, number, number];
};

/**
 * Minimal projection of a pdf.js PageViewport at scale=1.
 * Dimensions are in PDF user-space points, bottom-left origin.
 */
export type RawPageViewport = {
  width: number;
  height: number;
};

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * Converts raw pdf.js text items into device-independent, scale-independent
 * normalized geometry. Both web and mobile clients call this same pure function
 * so identical geometry is guaranteed by construction (parity property for 05c-2/05c-3).
 *
 * Coordinate model: each box is expressed as fractions of the page dimensions (0..1),
 * top-left origin, y growing down. The PDF bottom-left origin is flipped here.
 *
 * Assumptions / known limitations (05c-1):
 * - Non-rotated text only (transform[0]=a, transform[3]=d are the scale; b/c shear ignored).
 *   Document/text rotation and skew handling is deferred to a later slice.
 * - viewport.width / viewport.height == 0 is guarded: emits zeroed boxes to avoid NaN/Infinity.
 */
export function normalizePageText(
  pageNumber: number,
  viewport: RawPageViewport,
  rawItems: readonly RawTextItem[],
): PageTextGeometry {
  const safeW = viewport.width === 0;
  const safeH = viewport.height === 0;

  const items: TextItemGeometry[] = rawItems.map((raw, index) => {
    const left = raw.transform[4];      // e — x origin in PDF user space
    const baseline = raw.transform[5];  // f — baseline y in PDF user space (bottom-left)
    const w = raw.width;
    const h = raw.height;

    // Flip from bottom-left PDF origin to top-left origin.
    const topPdf = viewport.height - (baseline + h);

    const box: NormalizedBox = {
      x: safeW ? 0 : left / viewport.width,
      y: safeH ? 0 : topPdf / viewport.height,
      width: safeW ? 0 : w / viewport.width,
      height: safeH ? 0 : h / viewport.height,
    };

    return { index, str: raw.str, box };
  });

  return { pageNumber, items };
}
