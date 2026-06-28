import { describe, expect, it } from 'vitest';

import { encode, initialClock, tick } from '../hlc.js';
import {
  DEFAULT_TAG_COLOR,
  TAG_COLORS,
  editTag,
  makeTag,
  normalizeTagName,
  tagDedupeKey,
} from '../tag.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const hlc1 = tick(initialClock('node-a'), 1_000_000);
const hlc2 = tick(hlc1, 2_000_000);

// ---------------------------------------------------------------------------
// normalizeTagName
// ---------------------------------------------------------------------------

describe('normalizeTagName', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeTagName('  hello  ')).toBe('hello');
  });

  it('collapses internal whitespace to a single space', () => {
    expect(normalizeTagName('to  read')).toBe('to read');
  });

  it('collapses tabs and multiple spaces', () => {
    expect(normalizeTagName('foo\t\t bar')).toBe('foo bar');
  });

  it('is idempotent', () => {
    const result = normalizeTagName('  hello   world  ');
    expect(normalizeTagName(result)).toBe(result);
  });

  it('returns already-normalized name unchanged', () => {
    expect(normalizeTagName('hello world')).toBe('hello world');
  });
});

// ---------------------------------------------------------------------------
// tagDedupeKey
// ---------------------------------------------------------------------------

describe('tagDedupeKey', () => {
  it('lowercases the normalized name', () => {
    expect(tagDedupeKey('To Read')).toBe('to read');
  });

  it('is case-insensitive (To Read === to  read)', () => {
    expect(tagDedupeKey('To Read')).toBe(tagDedupeKey('to  read'));
  });

  it('collapses whitespace and lowercases together', () => {
    expect(tagDedupeKey('  Hello   World  ')).toBe('hello world');
  });

  it('is idempotent', () => {
    const key = tagDedupeKey('Science Fiction');
    expect(tagDedupeKey(key)).toBe(key);
  });
});

// ---------------------------------------------------------------------------
// makeTag
// ---------------------------------------------------------------------------

describe('makeTag', () => {
  it('stamps updatedAt to encode(hlc)', () => {
    const tag = makeTag({ id: 't-1', name: 'Fiction', createdAt: 1_000_000 }, { hlc: hlc1 });
    expect(tag.updatedAt).toBe(encode(hlc1));
  });

  it('preserves id and createdAt from args', () => {
    const tag = makeTag({ id: 't-1', name: 'Fiction', createdAt: 999_000 }, { hlc: hlc1 });
    expect(tag.id).toBe('t-1');
    expect(tag.createdAt).toBe(999_000);
  });

  it('normalizes the name', () => {
    const tag = makeTag({ id: 't-1', name: '  To  Read  ', createdAt: 1_000_000 }, { hlc: hlc1 });
    expect(tag.name).toBe('To Read');
  });

  it('defaults color to DEFAULT_TAG_COLOR (gray) when omitted', () => {
    const tag = makeTag({ id: 't-1', name: 'Fiction', createdAt: 1_000_000 }, { hlc: hlc1 });
    expect(tag.color).toBe(DEFAULT_TAG_COLOR);
    expect(tag.color).toBe('gray');
  });

  it('respects explicit color', () => {
    const tag = makeTag(
      { id: 't-1', name: 'Fiction', color: 'blue', createdAt: 1_000_000 },
      { hlc: hlc1 },
    );
    expect(tag.color).toBe('blue');
  });

  it('accepts all valid TAG_COLORS', () => {
    for (const color of TAG_COLORS) {
      expect(() =>
        makeTag({ id: 't-1', name: 'Test', color, createdAt: 1_000_000 }, { hlc: hlc1 }),
      ).not.toThrow();
    }
  });

  it('throws RangeError when name is empty after normalization', () => {
    expect(() =>
      makeTag({ id: 't-1', name: '   ', createdAt: 1_000_000 }, { hlc: hlc1 }),
    ).toThrowError(RangeError);
  });

  it('throws RangeError when name is an empty string', () => {
    expect(() =>
      makeTag({ id: 't-1', name: '', createdAt: 1_000_000 }, { hlc: hlc1 }),
    ).toThrowError(RangeError);
  });
});

// ---------------------------------------------------------------------------
// editTag
// ---------------------------------------------------------------------------

describe('editTag', () => {
  function baseTag() {
    return makeTag({ id: 't-1', name: 'Fiction', color: 'gray', createdAt: 1_000_000 }, { hlc: hlc1 });
  }

  it('returns a fresh object (does not mutate input)', () => {
    const tag = baseTag();
    const snapshot = JSON.parse(JSON.stringify(tag)) as typeof tag;
    editTag(tag, { name: 'Non-fiction' }, { hlc: hlc2 });
    expect(tag).toEqual(snapshot);
  });

  it('bumps updatedAt to encode(hlc2)', () => {
    const tag = baseTag();
    const edited = editTag(tag, { color: 'red' }, { hlc: hlc2 });
    expect(edited.updatedAt).toBe(encode(hlc2));
    expect(edited.updatedAt).not.toBe(tag.updatedAt);
  });

  it('preserves id and createdAt', () => {
    const tag = baseTag();
    const edited = editTag(tag, { name: 'Fantasy' }, { hlc: hlc2 });
    expect(edited.id).toBe(tag.id);
    expect(edited.createdAt).toBe(tag.createdAt);
  });

  it('updates name (normalized)', () => {
    const tag = baseTag();
    const edited = editTag(tag, { name: '  Fantasy  ' }, { hlc: hlc2 });
    expect(edited.name).toBe('Fantasy');
  });

  it('updates color', () => {
    const tag = baseTag();
    const edited = editTag(tag, { color: 'purple' }, { hlc: hlc2 });
    expect(edited.color).toBe('purple');
  });

  it('throws RangeError when patched name is empty after normalization', () => {
    const tag = baseTag();
    expect(() => editTag(tag, { name: '  ' }, { hlc: hlc2 })).toThrowError(RangeError);
  });

  it('leaves unpatched fields unchanged', () => {
    const tag = baseTag();
    const edited = editTag(tag, { color: 'amber' }, { hlc: hlc2 });
    expect(edited.name).toBe(tag.name);
  });
});
