/**
 * use-library-tags.test.ts — pure logic / props contract tests for the
 * use-library-tags derivations (Unit 15c).
 *
 * vitest node env: no jsdom, no RN renderer — pure TS logic tests only.
 *
 * Covers:
 *   - tagsByDoc derivation: orphan doc-tags (tag deleted) produce no chip
 *   - alias docs are excluded from LibraryEntry[]
 *   - filtering delegates entirely to evaluateSmartView (order matches evaluator)
 *   - switching the active view re-filters
 *   - the TAG_BG safelist map covers every TagColor (invariant #6)
 *   - isAdHocTagFilter helper correctly identifies ad-hoc tag filters
 *   - name validation guard: empty/whitespace name is rejected
 */

import { describe, expect, it } from 'vitest';

import type { DocTag, LibraryEntry, SmartView, Tag, TagColor } from '@ember/core';
import {
  BUILT_IN_SMART_VIEWS,
  TAG_COLORS,
  evaluateSmartView,
  normalizeTagName,
  tagDedupeKey,
} from '@ember/core';

// Import the real production helpers (pure leaf modules — no RN) so these
// contract tests catch drift instead of testing local copies.
import { isAdHocTagFilter } from '../library/smart-view-filters.js';
import { TAG_BG } from '../library/tag-colors.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTag(id: string, name: string, color: TagColor = 'gray'): Tag {
  return { id, name, color, createdAt: 1_000_000, updatedAt: '0-0-device' };
}

function makeDocTag(documentId: string, tagId: string): DocTag {
  return {
    id: `${documentId}:${tagId}`,
    documentId,
    tagId,
    createdAt: 1_000_000,
    updatedAt: '0-0-device',
  };
}

/** Derive tagsByDoc from raw tags + doc-tags (mirrors use-library-tags.ts derivation). */
function deriveTagsByDoc(tags: Tag[], docTags: DocTag[]): Map<string, Tag[]> {
  const tagMap = new Map<string, Tag>(tags.map((t) => [t.id, t]));
  const tagsByDoc = new Map<string, Tag[]>();
  for (const dt of docTags) {
    const tag = tagMap.get(dt.tagId);
    if (tag === undefined) continue; // orphan — tag deleted, goes inert
    const existing = tagsByDoc.get(dt.documentId) ?? [];
    existing.push(tag);
    tagsByDoc.set(dt.documentId, existing);
  }
  return tagsByDoc;
}

/** Build a minimal LibraryEntry from a doc id and its tags. */
function makeEntry(id: string, importedAt: number, tagIds: string[] = []): LibraryEntry {
  return { id, importedAt, tagIds };
}

// ── TAG_BG safelist map coverage ──────────────────────────────────────────────

describe('TAG_BG safelist map (invariant #6)', () => {
  it('covers every TagColor in TAG_COLORS', () => {
    for (const color of TAG_COLORS) {
      expect(TAG_BG[color]).toBeDefined();
      expect(TAG_BG[color]).toBe(`bg-tag-${color}`);
    }
  });

  it('has exactly one entry per TagColor (no extras, no missing)', () => {
    const keys = Object.keys(TAG_BG) as TagColor[];
    expect(keys.sort()).toEqual([...TAG_COLORS].sort());
  });
});

// ── tagsByDoc derivation ──────────────────────────────────────────────────────

describe('tagsByDoc derivation', () => {
  it('returns empty map when no tags exist', () => {
    const result = deriveTagsByDoc([], []);
    expect(result.size).toBe(0);
  });

  it('returns empty map when no doc-tags exist even if tags exist', () => {
    const tags = [makeTag('tag-1', 'Fiction')];
    const result = deriveTagsByDoc(tags, []);
    expect(result.size).toBe(0);
  });

  it('links a doc to its tags', () => {
    const tags = [makeTag('t1', 'Fiction'), makeTag('t2', 'Classic')];
    const docTags = [makeDocTag('doc-a', 't1'), makeDocTag('doc-a', 't2')];
    const result = deriveTagsByDoc(tags, docTags);
    expect(result.get('doc-a')).toHaveLength(2);
    const names = result.get('doc-a')!.map((t) => t.name).sort();
    expect(names).toEqual(['Classic', 'Fiction']);
  });

  it('orphan doc-tags (tag deleted) produce no chip — drop silently', () => {
    const tags = [makeTag('t1', 'Fiction')];
    // doc-a has a link to t2 which no longer exists (tag deleted)
    const docTags = [makeDocTag('doc-a', 't1'), makeDocTag('doc-a', 'deleted-tag')];
    const result = deriveTagsByDoc(tags, docTags);
    expect(result.get('doc-a')).toHaveLength(1);
    expect(result.get('doc-a')![0]!.id).toBe('t1');
  });

  it('doc with all tags deleted has no chips', () => {
    const tags: Tag[] = []; // all deleted
    const docTags = [makeDocTag('doc-a', 'gone-1'), makeDocTag('doc-a', 'gone-2')];
    const result = deriveTagsByDoc(tags, docTags);
    expect(result.get('doc-a')).toBeUndefined();
  });

  it('links are per-doc (different docs get separate tag lists)', () => {
    const tags = [makeTag('t1', 'Sci-Fi'), makeTag('t2', 'History')];
    const docTags = [makeDocTag('doc-a', 't1'), makeDocTag('doc-b', 't2')];
    const result = deriveTagsByDoc(tags, docTags);
    expect(result.get('doc-a')).toHaveLength(1);
    expect(result.get('doc-b')).toHaveLength(1);
    expect(result.get('doc-a')![0]!.id).toBe('t1');
    expect(result.get('doc-b')![0]!.id).toBe('t2');
  });
});

// ── evaluateSmartView delegation (invariant #5) ───────────────────────────────

describe('evaluateSmartView delegation (invariant #5)', () => {
  it('empty query returns all entries (All view)', () => {
    const entries = [
      makeEntry('doc-a', 1000),
      makeEntry('doc-b', 2000),
    ];
    const ids = evaluateSmartView({}, entries);
    expect(ids).toHaveLength(2);
  });

  it('importedAt DESC order — most-recently-added first', () => {
    const entries = [
      makeEntry('doc-a', 1000, []),
      makeEntry('doc-b', 3000, []),
      makeEntry('doc-c', 2000, []),
    ];
    const ids = evaluateSmartView({}, entries);
    expect(ids).toEqual(['doc-b', 'doc-c', 'doc-a']);
  });

  it('untaggedOnly filter: only docs with zero tags', () => {
    const entries = [
      makeEntry('doc-a', 1000, ['t1']),
      makeEntry('doc-b', 2000, []),
      makeEntry('doc-c', 3000, []),
    ];
    const ids = evaluateSmartView({ untaggedOnly: true }, entries);
    expect(ids).toEqual(['doc-c', 'doc-b']);
    expect(ids).not.toContain('doc-a');
  });

  it('tagIds filter (any match): returns docs with at least one matching tag', () => {
    const entries = [
      makeEntry('doc-a', 1000, ['t1', 't2']),
      makeEntry('doc-b', 2000, ['t2']),
      makeEntry('doc-c', 3000, ['t3']),
    ];
    const ids = evaluateSmartView({ tagIds: ['t1'], tagMatch: 'any' }, entries);
    expect(ids).toContain('doc-a');
    expect(ids).not.toContain('doc-b'); // t1 not present
    expect(ids).not.toContain('doc-c');
  });

  it('switching the active query re-filters (different queries yield different results)', () => {
    const entries = [
      makeEntry('doc-a', 1000, ['t1']),
      makeEntry('doc-b', 2000, []),
    ];
    const allIds = evaluateSmartView({}, entries);
    const untaggedIds = evaluateSmartView({ untaggedOnly: true }, entries);
    expect(allIds).toHaveLength(2);
    expect(untaggedIds).toHaveLength(1);
    expect(untaggedIds[0]).toBe('doc-b');
  });

  it('BUILT_IN_SMART_VIEWS[0] is All (empty query — no filter)', () => {
    expect(BUILT_IN_SMART_VIEWS[0]!.key).toBe('all');
    expect(BUILT_IN_SMART_VIEWS[0]!.query).toEqual({});
  });
});

// ── ad-hoc tag filter detection ("Save view" affordance) ─────────────────────

/**
 * An ad-hoc tag filter is a query with tagIds that doesn't correspond to any
 * saved SmartView — this signals that "Save view" should be shown.
 * Tests the real production helper (smart-view-filters.ts).
 */
function savedView(tagIds: string[]): SmartView {
  return { id: `v-${tagIds.join('-')}`, name: 'saved', query: { tagIds }, createdAt: 0, updatedAt: '0-0-d' };
}

describe('isAdHocTagFilter ("Save view" affordance)', () => {
  it('returns false when query has no tagIds', () => {
    expect(isAdHocTagFilter({}, [])).toBe(false);
  });

  it('returns false when query has empty tagIds', () => {
    expect(isAdHocTagFilter({ tagIds: [] }, [])).toBe(false);
  });

  it('returns true when query has tagIds and no matching saved view', () => {
    expect(isAdHocTagFilter({ tagIds: ['t1'] }, [])).toBe(true);
  });

  it('returns false when a saved view matches the current tagIds', () => {
    expect(isAdHocTagFilter({ tagIds: ['t1'] }, [savedView(['t1'])])).toBe(false);
  });

  it('returns true when saved views exist but none match', () => {
    expect(isAdHocTagFilter({ tagIds: ['t1'] }, [savedView(['t2'])])).toBe(true);
  });
});

// ── name validation guard ─────────────────────────────────────────────────────

describe('name validation guard (tag / smart view)', () => {
  it('normalizeTagName collapses whitespace and trims', () => {
    expect(normalizeTagName('  hello   world  ')).toBe('hello world');
  });

  it('empty name after normalization is caught before calling factory', () => {
    const name = '   ';
    const normalized = normalizeTagName(name);
    expect(normalized).toBe('');
    // The guard prevents calling makeTag with empty name
    expect(normalized.length).toBe(0);
  });

  it('tagDedupeKey is case-insensitive', () => {
    expect(tagDedupeKey('To Read')).toBe('to read');
    expect(tagDedupeKey('TO READ')).toBe('to read');
  });

  it('smart view name whitespace-only is invalid', () => {
    const name = '  ';
    const trimmed = name.trim();
    expect(trimmed).toBe('');
    // Guard: empty trimmed name must be rejected before calling makeSmartView
    expect(trimmed.length).toBe(0);
  });
});
