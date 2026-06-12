/**
 * select-continue-reading.test.ts — pure unit tests for the join/sort selector.
 * No DOM, no React.
 */

import { describe, expect, it } from 'vitest';

import type { Document, ReadingPosition } from '@ember/core';

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
