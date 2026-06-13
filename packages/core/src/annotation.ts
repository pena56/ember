// Annotation model — syncable, mutable, UUID-keyed record.
// Pure functions; no Date.now(), no uuid/crypto (caller supplies id/time/hlc).
// Invariant: core imports no platform API (code-standards).

import type { Hlc } from './hlc.js';
import { encode } from './hlc.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Text-anchor kind discriminator.
 * Only 'text' (char-offset based) is implemented in this unit.
 * 'pixelRect' is reserved for a later unit (scanned/no-text PDFs).
 */
export type AnchorKind = 'text';

/** The four highlight fill colours surfaced in the palette. */
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

export const HIGHLIGHT_COLORS: readonly HighlightColor[] = ['yellow', 'green', 'blue', 'pink'];

export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = 'yellow';

/** Annotation kind discriminator. */
export type AnnotationKind = 'highlight' | 'note';

/**
 * A text-range anchor on a page.
 * `page` is 1-based; `[startChar, endChar)` are char offsets into the
 * page's concatenated text as produced by `buildPageText` (no separators).
 * `quote` is a snapshot of the selected substring for display / future re-anchoring.
 */
export type TextAnchor = {
  kind: 'text';
  page: number;
  startChar: number;
  endChar: number;
  quote: string;
};

/**
 * A syncable annotation record.
 * - `highlight`: colored fill over a text range (optional note).
 * - `note`: standalone anchored note/pin (no color, note text required).
 * `updatedAt` is an encoded HLC string (LWW last-write-wins tiebreak).
 */
export type Annotation = {
  id: string;
  docId: string;
  kind: AnnotationKind;
  anchor: TextAnchor;
  color?: HighlightColor;
  note?: string;
  createdAt: number;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateAnchor(anchor: TextAnchor): void {
  if (anchor.kind !== 'text') {
    throw new RangeError(`anchor.kind must be 'text'; got '${anchor.kind as string}'`);
  }
  if (anchor.page < 1) {
    throw new RangeError(`anchor.page must be >= 1; got ${anchor.page}`);
  }
  if (!Number.isInteger(anchor.startChar) || anchor.startChar < 0) {
    throw new RangeError(
      `anchor.startChar must be a non-negative integer; got ${anchor.startChar}`,
    );
  }
  if (!Number.isInteger(anchor.endChar)) {
    throw new RangeError(`anchor.endChar must be an integer; got ${anchor.endChar}`);
  }
  if (anchor.endChar <= anchor.startChar) {
    throw new RangeError(
      `anchor.endChar (${anchor.endChar}) must be > anchor.startChar (${anchor.startChar})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new Annotation record.
 * Pure: validates the anchor and kind-specific rules, no clock/uuid calls, no mutation.
 */
export function makeAnnotation(
  args: {
    id: string;
    docId: string;
    kind: AnnotationKind;
    anchor: TextAnchor;
    color?: HighlightColor;
    note?: string;
    createdAt: number;
  },
  ctx: { hlc: Hlc },
): Annotation {
  validateAnchor(args.anchor);

  if (args.kind === 'highlight') {
    const color: HighlightColor = args.color ?? DEFAULT_HIGHLIGHT_COLOR;
    const trimmedNote = args.note?.trim();
    const annotation: Annotation = {
      id: args.id,
      docId: args.docId,
      kind: 'highlight',
      anchor: args.anchor,
      color,
      createdAt: args.createdAt,
      updatedAt: encode(ctx.hlc),
    };
    if (trimmedNote) {
      annotation.note = trimmedNote;
    }
    return annotation;
  }

  // kind === 'note'
  if (args.color !== undefined) {
    throw new RangeError("'note' kind annotations must not have a color");
  }
  const trimmedNote = args.note?.trim();
  if (!trimmedNote) {
    throw new RangeError("'note' kind annotations require a non-empty note text");
  }
  return {
    id: args.id,
    docId: args.docId,
    kind: 'note',
    anchor: args.anchor,
    note: trimmedNote,
    createdAt: args.createdAt,
    updatedAt: encode(ctx.hlc),
  };
}

// ---------------------------------------------------------------------------
// Updater
// ---------------------------------------------------------------------------

/**
 * Return a new Annotation with the applied patch and a fresh `updatedAt` stamp.
 * Pure: does not mutate `annotation`. Anchor/kind/createdAt are immutable.
 *
 * `patch.note === null` clears the note (highlight only).
 * Empty/whitespace note on a `note`-kind → RangeError (delete instead).
 * Color on a `note`-kind → RangeError.
 */
export function editAnnotation(
  annotation: Annotation,
  patch: { color?: HighlightColor; note?: string | null },
  ctx: { hlc: Hlc },
): Annotation {
  if (annotation.kind === 'note' && patch.color !== undefined) {
    throw new RangeError("Cannot set color on a 'note' kind annotation");
  }

  // Build the updated record (shallow copy — no mutation of input)
  const updated: Annotation = {
    ...annotation,
    updatedAt: encode(ctx.hlc),
  };

  // Apply color patch (highlight only — already guarded above)
  if (patch.color !== undefined) {
    updated.color = patch.color;
  }

  // Apply note patch
  if (patch.note !== undefined) {
    if (patch.note === null) {
      // null → clear note (highlight only; note-kind guard would trigger above anyway)
      delete updated.note;
    } else {
      const trimmed = patch.note.trim();
      if (annotation.kind === 'note' && !trimmed) {
        throw new RangeError(
          "Cannot empty a 'note' kind annotation's text — delete it instead",
        );
      }
      if (trimmed) {
        updated.note = trimmed;
      } else {
        // whitespace/empty on a highlight → clear
        delete updated.note;
      }
    }
  }

  return updated;
}
