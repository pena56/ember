import { describe, expect, it } from 'vitest';

import { encode, initialClock, tick } from '../hlc.js';
import { makeReadingPosition, mergeReadingPosition } from '../reading-position.js';

// Two distinct HLC stamps with unambiguous ordering (different wall values)
const hlcA = tick(initialClock('node-a'), 1_000_000);
const hlcB = tick(initialClock('node-b'), 2_000_000);

describe('makeReadingPosition', () => {
  it('sets updatedAt to encode(hlc)', () => {
    const pos = makeReadingPosition({ id: 'doc1', page: 1, offset: 0.5, hlc: hlcA });
    expect(pos.updatedAt).toBe(encode(hlcA));
  });

  it('clamps offset above 1 down to 1', () => {
    const pos = makeReadingPosition({ id: 'doc1', page: 1, offset: 1.4, hlc: hlcA });
    expect(pos.offset).toBe(1);
  });

  it('clamps offset below 0 up to 0', () => {
    const pos = makeReadingPosition({ id: 'doc1', page: 1, offset: -0.2, hlc: hlcA });
    expect(pos.offset).toBe(0);
  });

  it('keeps offset within bounds unchanged', () => {
    const pos = makeReadingPosition({ id: 'doc1', page: 3, offset: 0.75, hlc: hlcA });
    expect(pos.offset).toBe(0.75);
  });

  it('truncates fractional page to integer', () => {
    const pos = makeReadingPosition({ id: 'doc1', page: 3.7, offset: 0, hlc: hlcA });
    expect(pos.page).toBe(3);
  });

  it('raises page 0 to 1', () => {
    const pos = makeReadingPosition({ id: 'doc1', page: 0, offset: 0, hlc: hlcA });
    expect(pos.page).toBe(1);
  });

  it('raises negative page to 1', () => {
    const pos = makeReadingPosition({ id: 'doc1', page: -5, offset: 0, hlc: hlcA });
    expect(pos.page).toBe(1);
  });

  it('maps all fields correctly', () => {
    const pos = makeReadingPosition({ id: 'doc-abc', page: 5, offset: 0.3, hlc: hlcA });
    expect(pos).toEqual({
      id: 'doc-abc',
      page: 5,
      offset: 0.3,
      updatedAt: encode(hlcA),
    });
  });
});

describe('mergeReadingPosition', () => {
  it('greater page wins regardless of offset', () => {
    const a = makeReadingPosition({ id: 'doc1', page: 10, offset: 0.1, hlc: hlcA });
    const b = makeReadingPosition({ id: 'doc1', page: 5, offset: 0.9, hlc: hlcB });
    expect(mergeReadingPosition(a, b)).toBe(a);
    expect(mergeReadingPosition(b, a)).toBe(a);
  });

  it('equal page — greater offset wins', () => {
    const a = makeReadingPosition({ id: 'doc1', page: 5, offset: 0.8, hlc: hlcA });
    const b = makeReadingPosition({ id: 'doc1', page: 5, offset: 0.3, hlc: hlcB });
    expect(mergeReadingPosition(a, b)).toBe(a);
    expect(mergeReadingPosition(b, a)).toBe(a);
  });

  it('equal page + offset — greater updatedAt (HLC) wins', () => {
    // hlcB has larger wall value so encode(hlcB) > encode(hlcA)
    const a = makeReadingPosition({ id: 'doc1', page: 5, offset: 0.5, hlc: hlcA });
    const b = makeReadingPosition({ id: 'doc1', page: 5, offset: 0.5, hlc: hlcB });
    expect(mergeReadingPosition(a, b)).toBe(b);
    expect(mergeReadingPosition(b, a)).toBe(b);
  });

  it('fully equal — returns a (stable tie)', () => {
    const a = makeReadingPosition({ id: 'doc1', page: 5, offset: 0.5, hlc: hlcA });
    const b = makeReadingPosition({ id: 'doc1', page: 5, offset: 0.5, hlc: hlcA });
    expect(mergeReadingPosition(a, b)).toBe(a);
  });

  it('idempotent — merge(a,a) === a', () => {
    const a = makeReadingPosition({ id: 'doc1', page: 5, offset: 0.5, hlc: hlcA });
    expect(mergeReadingPosition(a, a)).toBe(a);
  });

  it('commutative — merge(a,b) deep-equals merge(b,a) for page winner', () => {
    const a = makeReadingPosition({ id: 'doc1', page: 10, offset: 0.1, hlc: hlcA });
    const b = makeReadingPosition({ id: 'doc1', page: 3, offset: 0.9, hlc: hlcB });
    expect(mergeReadingPosition(a, b)).toEqual(mergeReadingPosition(b, a));
  });

  it('commutative — merge(a,b) deep-equals merge(b,a) for offset winner', () => {
    const a = makeReadingPosition({ id: 'doc1', page: 7, offset: 0.9, hlc: hlcA });
    const b = makeReadingPosition({ id: 'doc1', page: 7, offset: 0.2, hlc: hlcB });
    expect(mergeReadingPosition(a, b)).toEqual(mergeReadingPosition(b, a));
  });

  it('commutative — merge(a,b) deep-equals merge(b,a) for HLC winner', () => {
    const a = makeReadingPosition({ id: 'doc1', page: 5, offset: 0.5, hlc: hlcA });
    const b = makeReadingPosition({ id: 'doc1', page: 5, offset: 0.5, hlc: hlcB });
    expect(mergeReadingPosition(a, b)).toEqual(mergeReadingPosition(b, a));
  });
});
