// Smart-view model + pure evaluator — no platform APIs.
// Invariant #1: no platform API import; no @ember/store import.
// Invariant #2: updatedAt is an encoded HLC, equal to the outbox entry hlc.
// Invariant #5: evaluateSmartView is the ONLY "what's in a view" logic in core;
//               clients must not invent filtering logic.

import type { Document } from './document.js';
import type { Hlc } from './hlc.js';
import { encode } from './hlc.js';

// ---------------------------------------------------------------------------
// Collection key
// ---------------------------------------------------------------------------

export const SMART_VIEWS_COLLECTION = 'smart-views';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-document reading progress state, derived from position + pageCount. */
export type ReadingState = 'unread' | 'in-progress' | 'finished';

/**
 * A saved/built-in filter.
 * `tagIds` empty/absent ⇒ no tag constraint.
 * `state` absent ⇒ any state.
 * `untaggedOnly` and non-empty `tagIds` are mutually exclusive (RangeError).
 */
export type SmartViewQuery = {
  tagIds?: string[];
  /** default 'any'; only meaningful when tagIds is non-empty. */
  tagMatch?: 'all' | 'any';
  state?: ReadingState;
  /** true ⇒ only docs with zero tags (mutually exclusive with non-empty tagIds). */
  untaggedOnly?: boolean;
};

/**
 * A user-defined saved smart view, syncable.
 * `updatedAt` is an encoded HLC string (LWW last-write-wins, invariant #2).
 */
export type SmartView = {
  id: string;         // caller-supplied UUID
  name: string;       // trimmed, non-empty
  query: SmartViewQuery;
  createdAt: number;
  updatedAt: string;  // encoded HLC (== outbox entry hlc, invariant #2)
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new RangeError('SmartView name must be non-empty after trimming');
  }
  return trimmed;
}

function validateQuery(query: SmartViewQuery): void {
  if (query.untaggedOnly && query.tagIds && query.tagIds.length > 0) {
    throw new RangeError(
      'SmartViewQuery: untaggedOnly:true is mutually exclusive with non-empty tagIds',
    );
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new SmartView record.
 * Pure: normalizes and validates name, validates query, stamps updatedAt = encode(hlc).
 * Throws RangeError on empty name or invalid query (untaggedOnly + non-empty tagIds).
 */
export function makeSmartView(
  args: { id: string; name: string; query: SmartViewQuery; createdAt: number },
  ctx: { hlc: Hlc },
): SmartView {
  const name = validateName(args.name);
  validateQuery(args.query);

  return {
    id: args.id,
    name,
    query: { ...args.query },
    createdAt: args.createdAt,
    updatedAt: encode(ctx.hlc),
  };
}

// ---------------------------------------------------------------------------
// Updater
// ---------------------------------------------------------------------------

/**
 * Return a new SmartView with the applied patch and a fresh `updatedAt` stamp.
 * Pure: does not mutate `view`. id/createdAt are immutable.
 * Throws RangeError on invalid name or invalid query.
 */
export function editSmartView(
  view: SmartView,
  patch: { name?: string; query?: SmartViewQuery },
  ctx: { hlc: Hlc },
): SmartView {
  const name = patch.name !== undefined ? validateName(patch.name) : view.name;
  const query = patch.query !== undefined ? { ...patch.query } : view.query;

  if (patch.query !== undefined) {
    validateQuery(query);
  }

  return {
    ...view,
    name,
    query,
    updatedAt: encode(ctx.hlc),
  };
}

// ---------------------------------------------------------------------------
// Built-in views (constants — NOT stored; clients render these alongside saved ones)
// ---------------------------------------------------------------------------

/** A built-in (non-stored) smart view constant shipped with core. */
export type BuiltInSmartView = { key: string; name: string; query: SmartViewQuery };

/**
 * The canonical list of built-in smart views.
 * 'all' / 'recently-added' use an empty query (ordering by importedAt DESC is the feature).
 * Clients render these + user-saved SmartViews; evaluateSmartView handles both.
 */
export const BUILT_IN_SMART_VIEWS: readonly BuiltInSmartView[] = [
  { key: 'all', name: 'All', query: {} },
  { key: 'untagged', name: 'Untagged', query: { untaggedOnly: true } },
  { key: 'in-progress', name: 'In Progress', query: { state: 'in-progress' } },
  { key: 'finished', name: 'Finished', query: { state: 'finished' } },
  { key: 'recently-added', name: 'Recently Added', query: {} },
];

// ---------------------------------------------------------------------------
// Reading-state derivation (pure)
// ---------------------------------------------------------------------------

/**
 * Derive the reading state for a document from its pageCount and current position.
 * - unread: no position recorded.
 * - finished: pageCount is known AND position.page >= pageCount.
 * - in-progress: has a position but not known-finished (covers unknown pageCount).
 *
 * Pure. Never returns 'finished' without a known pageCount.
 */
export function deriveReadingState(
  doc: Pick<Document, 'pageCount'>,
  position: { page: number } | undefined,
): ReadingState {
  if (position === undefined) {
    return 'unread';
  }
  if (doc.pageCount !== undefined && position.page >= doc.pageCount) {
    return 'finished';
  }
  return 'in-progress';
}

// ---------------------------------------------------------------------------
// Library entry projection
// ---------------------------------------------------------------------------

/**
 * The minimal per-doc projection the client assembles before calling evaluateSmartView.
 * (doc ⨝ its live doc-tags ⨝ its reading position)
 */
export type LibraryEntry = {
  id: string;           // documentId
  importedAt: number;
  pageCount?: number;
  /** Resolved from the doc's live (non-deleted/tombstoned) doc-tags. */
  tagIds: string[];
  position?: { page: number };
};

// ---------------------------------------------------------------------------
// Evaluator (Invariant #5: the ONLY "what's in a view" logic in core)
// ---------------------------------------------------------------------------

/**
 * Pure. Returns the matching documentIds from `entries`, deterministically ordered:
 * importedAt DESC, then id ASC as a tiebreaker (newest-first — matches the Library /
 * "recently-added" ordering).
 *
 * All active filters AND together:
 * - tag filter: tagIds non-empty → 'any' (≥1 match) or 'all' (every tag present).
 * - untaggedOnly: only entries with zero tagIds.
 * - state: derived via deriveReadingState, must match.
 *
 * Empty query ⇒ all docs (no constraint). Empty library ⇒ [].
 */
export function evaluateSmartView(
  query: SmartViewQuery,
  entries: ReadonlyArray<LibraryEntry>,
): string[] {
  const hasTagFilter = Array.isArray(query.tagIds) && query.tagIds.length > 0;
  const tagMatch = query.tagMatch ?? 'any';

  const matched = entries.filter((entry) => {
    // untaggedOnly filter
    if (query.untaggedOnly) {
      if (entry.tagIds.length !== 0) return false;
    }

    // tag filter
    if (hasTagFilter) {
      const tagIds = query.tagIds!;
      const entryTagSet = new Set(entry.tagIds);
      if (tagMatch === 'all') {
        if (!tagIds.every((tid) => entryTagSet.has(tid))) return false;
      } else {
        // 'any' (default)
        if (!tagIds.some((tid) => entryTagSet.has(tid))) return false;
      }
    }

    // state filter
    if (query.state !== undefined) {
      const state = deriveReadingState(entry, entry.position);
      if (state !== query.state) return false;
    }

    return true;
  });

  // Deterministic sort: importedAt DESC, id ASC tiebreak
  matched.sort((a, b) => {
    if (b.importedAt !== a.importedAt) return b.importedAt - a.importedAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return matched.map((e) => e.id);
}
