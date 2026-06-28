// Tag model — syncable, mutable, UUID-keyed record.
// Pure functions; no Date.now(), no uuid/crypto (caller supplies id/time/hlc).
// Invariant #1: core imports no platform API (code-standards).
// Invariant #2: updatedAt is an encoded HLC, equal to the outbox entry hlc.

import type { Hlc } from './hlc.js';
import { encode } from './hlc.js';

// ---------------------------------------------------------------------------
// Collection key
// ---------------------------------------------------------------------------

export const TAGS_COLLECTION = 'tags';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Fixed palette (token-friendly; 15b/15c map each to a `--color-tag-*` token). */
export type TagColor = 'gray' | 'red' | 'amber' | 'green' | 'blue' | 'purple';

export const TAG_COLORS: readonly TagColor[] = ['gray', 'red', 'amber', 'green', 'blue', 'purple'];

export const DEFAULT_TAG_COLOR: TagColor = 'gray';

/**
 * A syncable tag entity.
 * `updatedAt` is an encoded HLC string (LWW last-write-wins tiebreak, invariant #2).
 */
export type Tag = {
  id: string;         // caller-supplied UUID
  name: string;       // display name (trimmed, internal whitespace collapsed; never empty)
  color: TagColor;
  createdAt: number;
  updatedAt: string;  // encoded HLC (== outbox entry hlc, invariant #2)
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Trim and collapse internal whitespace to single spaces.
 * Pure. (Display normalization — not case-folded.)
 */
export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Case/space-insensitive key for dedupe.
 * "To Read" === "to  read" — both yield "to read".
 * Pure.
 */
export function tagDedupeKey(name: string): string {
  return normalizeTagName(name).toLowerCase();
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new Tag record.
 * Pure: normalizes name, throws RangeError when name is empty after normalization,
 * defaults color to DEFAULT_TAG_COLOR, stamps updatedAt = encode(hlc).
 */
export function makeTag(
  args: { id: string; name: string; color?: TagColor; createdAt: number },
  ctx: { hlc: Hlc },
): Tag {
  const name = normalizeTagName(args.name);
  if (!name) {
    throw new RangeError('Tag name must be non-empty after normalization');
  }

  return {
    id: args.id,
    name,
    color: args.color ?? DEFAULT_TAG_COLOR,
    createdAt: args.createdAt,
    updatedAt: encode(ctx.hlc),
  };
}

// ---------------------------------------------------------------------------
// Updater
// ---------------------------------------------------------------------------

/**
 * Return a new Tag with the applied patch and a fresh `updatedAt` stamp.
 * Pure: does not mutate `tag`. id/createdAt are immutable.
 * Throws RangeError if patched name is empty after normalization.
 */
export function editTag(
  tag: Tag,
  patch: { name?: string; color?: TagColor },
  ctx: { hlc: Hlc },
): Tag {
  // Validate patched name before building the updated record
  let name = tag.name;
  if (patch.name !== undefined) {
    name = normalizeTagName(patch.name);
    if (!name) {
      throw new RangeError('Tag name must be non-empty after normalization');
    }
  }

  return {
    ...tag,
    name,
    color: patch.color ?? tag.color,
    updatedAt: encode(ctx.hlc),
  };
}
