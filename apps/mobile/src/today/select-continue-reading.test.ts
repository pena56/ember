/**
 * select-continue-reading.test.ts — pure unit tests for the join/sort selector.
 * No DOM, no React.
 */

import { describe, expect, it } from 'vitest';

import type { Document, DuplicateDecision, ReadingPosition } from '@ember/core';

import { selectContinueReading } from './select-continue-reading.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDoc(id: string, title: string): Document {
  return {
    id,
    title,
    importedAt: Date.now(),
    filename: `${id}.pdf`,
    byteSize: 1000,
    contentType: 'application/pdf',
  };
}

function makePosition(id: string, page: number, updatedAt: string): ReadingPosition {
  return {
    id,
    page,
    offset: 0,
    updatedAt,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('selectContinueReading', () => {
  it('returns [] for empty inputs', () => {
    expect(selectContinueReading([], [])).toEqual([]);
  });

  it('returns [] when no positions', () => {
    const docs = [makeDoc('d1', 'Book One')];
    expect(selectContinueReading([], docs)).toEqual([]);
  });

  it('returns [] when positions have no matching documents (orphans dropped)', () => {
    const positions = [makePosition('missing-doc', 5, '2026-01-01T00:00:00.000Z')];
    expect(selectContinueReading(positions, [])).toEqual([]);
  });

  it('drops orphaned positions (no matching document)', () => {
    const positions = [
      makePosition('d1', 3, '2026-01-02T00:00:00.000Z'),
      makePosition('orphan', 7, '2026-01-03T00:00:00.000Z'), // no doc
    ];
    const docs = [makeDoc('d1', 'Book One')];

    const result = selectContinueReading(positions, docs);
    expect(result).toHaveLength(1);
    expect(result[0]!.docId).toBe('d1');
  });

  it('maps fields correctly (docId, title, page, updatedAt)', () => {
    const positions = [makePosition('d1', 5, '2026-01-01T00:00:00.000Z')];
    const docs = [makeDoc('d1', 'My Great Book')];

    const result = selectContinueReading(positions, docs);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      docId: 'd1',
      title: 'My Great Book',
      page: 5,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('sorts by updatedAt descending (most-recently-read first)', () => {
    const positions = [
      makePosition('d1', 1, '2026-01-01T00:00:00.000Z'),
      makePosition('d2', 2, '2026-01-03T00:00:00.000Z'),
      makePosition('d3', 3, '2026-01-02T00:00:00.000Z'),
    ];
    const docs = [
      makeDoc('d1', 'Book One'),
      makeDoc('d2', 'Book Two'),
      makeDoc('d3', 'Book Three'),
    ];

    const result = selectContinueReading(positions, docs);
    expect(result.map((r) => r.docId)).toEqual(['d2', 'd3', 'd1']);
  });

  it('returns the full sorted list (not just [0])', () => {
    const positions = [
      makePosition('d1', 1, '2026-01-01T00:00:00.000Z'),
      makePosition('d2', 2, '2026-01-02T00:00:00.000Z'),
    ];
    const docs = [makeDoc('d1', 'Book One'), makeDoc('d2', 'Book Two')];

    const result = selectContinueReading(positions, docs);
    expect(result).toHaveLength(2);
  });
});

// ── 14c: decisions arg — alias filtering ──────────────────────────────────────

describe('selectContinueReading — decisions (14c alias filtering)', () => {
  function makeDecision(
    aId: string,
    bId: string,
    canonicalId: string,
    decision: 'merged' | 'separate',
  ): DuplicateDecision {
    const aliasId = canonicalId === aId ? bId : aId;
    const min = aId < bId ? aId : bId;
    const max = aId < bId ? bId : aId;
    return {
      id: `${min}:${max}`,
      canonicalId,
      aliasId,
      decision,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  it('decisions defaults to [] — existing callers unaffected', () => {
    const positions = [makePosition('d1', 1, '2026-01-01T00:00:00.000Z')];
    const docs = [makeDoc('d1', 'Book One')];
    // Call without decisions arg — should not throw
    const result = selectContinueReading(positions, docs);
    expect(result).toHaveLength(1);
  });

  it('drops alias position when its canonical is a different doc', () => {
    const positions = [
      makePosition('d1', 1, '2026-01-01T00:00:00.000Z'), // canonical
      makePosition('d2', 2, '2026-01-02T00:00:00.000Z'), // alias → d1
    ];
    const docs = [makeDoc('d1', 'Book One'), makeDoc('d2', 'Book One')];
    const decisions = [makeDecision('d1', 'd2', 'd1', 'merged')];

    const result = selectContinueReading(positions, docs, decisions);
    expect(result).toHaveLength(1);
    expect(result[0]!.docId).toBe('d1');
  });

  it('keeps both positions when decision is separate (no alias)', () => {
    const positions = [
      makePosition('d1', 1, '2026-01-01T00:00:00.000Z'),
      makePosition('d2', 2, '2026-01-02T00:00:00.000Z'),
    ];
    const docs = [makeDoc('d1', 'Book One'), makeDoc('d2', 'Book One')];
    const decisions = [makeDecision('d1', 'd2', 'd1', 'separate')];

    // 'separate' — both are canonical, both should appear
    const result = selectContinueReading(positions, docs, decisions);
    expect(result).toHaveLength(2);
  });

  it('keeps canonical position when alias has no position', () => {
    const positions = [
      makePosition('d1', 5, '2026-01-05T00:00:00.000Z'),
    ];
    const docs = [makeDoc('d1', 'Book One'), makeDoc('d2', 'Book One')];
    const decisions = [makeDecision('d1', 'd2', 'd1', 'merged')];

    const result = selectContinueReading(positions, docs, decisions);
    expect(result).toHaveLength(1);
    expect(result[0]!.docId).toBe('d1');
  });

  it('empty decisions array produces same result as no decisions', () => {
    const positions = [makePosition('d1', 1, '2026-01-01T00:00:00.000Z')];
    const docs = [makeDoc('d1', 'Book One')];

    const withEmpty = selectContinueReading(positions, docs, []);
    const withDefault = selectContinueReading(positions, docs);
    expect(withEmpty).toEqual(withDefault);
  });
});
