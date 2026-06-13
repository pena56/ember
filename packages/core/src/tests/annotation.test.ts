import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HIGHLIGHT_COLOR,
  editAnnotation,
  makeAnnotation,
  type TextAnchor,
} from '../annotation.js';
import { encode, initialClock, tick } from '../hlc.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const hlc1 = tick(initialClock('node-a'), 1_000_000);
const hlc2 = tick(hlc1, 2_000_000);

const baseAnchor: TextAnchor = {
  kind: 'text',
  page: 1,
  startChar: 0,
  endChar: 10,
  quote: 'hello worl',
};

function makeHighlight(overrides: Partial<Parameters<typeof makeAnnotation>[0]> = {}) {
  return makeAnnotation(
    {
      id: 'ann-1',
      docId: 'doc-1',
      kind: 'highlight',
      anchor: baseAnchor,
      createdAt: 1_000_000,
      ...overrides,
    },
    { hlc: hlc1 },
  );
}

function makeNote(overrides: Partial<Parameters<typeof makeAnnotation>[0]> = {}) {
  return makeAnnotation(
    {
      id: 'ann-2',
      docId: 'doc-1',
      kind: 'note',
      anchor: baseAnchor,
      note: 'my note text',
      createdAt: 1_000_000,
      ...overrides,
    },
    { hlc: hlc1 },
  );
}

// ---------------------------------------------------------------------------
// makeAnnotation — highlight kind
// ---------------------------------------------------------------------------

describe('makeAnnotation — highlight', () => {
  it('defaults color to yellow when omitted', () => {
    const ann = makeHighlight();
    expect(ann.color).toBe(DEFAULT_HIGHLIGHT_COLOR);
    expect(ann.color).toBe('yellow');
  });

  it('keeps an explicit color', () => {
    const ann = makeHighlight({ color: 'pink' });
    expect(ann.color).toBe('pink');
  });

  it('keeps a real note', () => {
    const ann = makeHighlight({ note: 'important passage' });
    expect(ann.note).toBe('important passage');
  });

  it('drops an empty note', () => {
    const ann = makeHighlight({ note: '' });
    expect('note' in ann).toBe(false);
  });

  it('drops a whitespace-only note', () => {
    const ann = makeHighlight({ note: '   ' });
    expect('note' in ann).toBe(false);
  });

  it('sets updatedAt to encode(hlc)', () => {
    const ann = makeHighlight();
    expect(ann.updatedAt).toBe(encode(hlc1));
  });

  it('preserves createdAt from args', () => {
    const ann = makeHighlight({ createdAt: 999_888 });
    expect(ann.createdAt).toBe(999_888);
  });

  it('sets all expected fields', () => {
    const ann = makeHighlight();
    expect(ann.id).toBe('ann-1');
    expect(ann.docId).toBe('doc-1');
    expect(ann.kind).toBe('highlight');
    expect(ann.anchor).toEqual(baseAnchor);
  });
});

// ---------------------------------------------------------------------------
// makeAnnotation — note kind
// ---------------------------------------------------------------------------

describe('makeAnnotation — note kind', () => {
  it('creates a valid note annotation', () => {
    const ann = makeNote();
    expect(ann.kind).toBe('note');
    expect(ann.note).toBe('my note text');
    expect('color' in ann).toBe(false);
  });

  it('omits color on the record', () => {
    const ann = makeNote();
    expect('color' in ann).toBe(false);
  });

  it('throws RangeError when note is empty', () => {
    expect(() => makeNote({ note: '' })).toThrowError(RangeError);
  });

  it('throws RangeError when note is whitespace only', () => {
    expect(() => makeNote({ note: '   ' })).toThrowError(RangeError);
  });

  it('throws RangeError when color is provided on a note-kind', () => {
    expect(() => makeNote({ color: 'blue' })).toThrowError(RangeError);
  });

  it('sets updatedAt to encode(hlc)', () => {
    const ann = makeNote();
    expect(ann.updatedAt).toBe(encode(hlc1));
  });
});

// ---------------------------------------------------------------------------
// makeAnnotation — anchor validation
// ---------------------------------------------------------------------------

describe('makeAnnotation — anchor validation', () => {
  it('throws RangeError when page < 1', () => {
    expect(() =>
      makeHighlight({ anchor: { ...baseAnchor, page: 0 } }),
    ).toThrowError(RangeError);
  });

  it('throws RangeError when startChar < 0', () => {
    expect(() =>
      makeHighlight({ anchor: { ...baseAnchor, startChar: -1 } }),
    ).toThrowError(RangeError);
  });

  it('throws RangeError when startChar is non-integer', () => {
    expect(() =>
      makeHighlight({ anchor: { ...baseAnchor, startChar: 1.5 } }),
    ).toThrowError(RangeError);
  });

  it('throws RangeError when endChar is non-integer', () => {
    expect(() =>
      makeHighlight({ anchor: { ...baseAnchor, endChar: 5.5 } }),
    ).toThrowError(RangeError);
  });

  it('throws RangeError when endChar <= startChar (equal)', () => {
    expect(() =>
      makeHighlight({ anchor: { ...baseAnchor, startChar: 5, endChar: 5 } }),
    ).toThrowError(RangeError);
  });

  it('throws RangeError when endChar < startChar (inverted)', () => {
    expect(() =>
      makeHighlight({ anchor: { ...baseAnchor, startChar: 10, endChar: 5 } }),
    ).toThrowError(RangeError);
  });

  it('throws RangeError when anchor.kind is not text', () => {
    expect(() =>
      makeHighlight({ anchor: { ...baseAnchor, kind: 'pixelRect' as 'text' } }),
    ).toThrowError(RangeError);
  });

  it('valid range builds without error', () => {
    expect(() =>
      makeHighlight({ anchor: { ...baseAnchor, startChar: 0, endChar: 1 } }),
    ).not.toThrow();
  });

  it('preserves quote verbatim', () => {
    const ann = makeHighlight({ anchor: { ...baseAnchor, quote: 'exact text' } });
    expect(ann.anchor.quote).toBe('exact text');
  });
});

// ---------------------------------------------------------------------------
// editAnnotation
// ---------------------------------------------------------------------------

describe('editAnnotation', () => {
  it('changes color on a highlight and restamps updatedAt', () => {
    const ann = makeHighlight({ color: 'yellow' });
    const edited = editAnnotation(ann, { color: 'green' }, { hlc: hlc2 });
    expect(edited.color).toBe('green');
    expect(edited.updatedAt).toBe(encode(hlc2));
    expect(edited.updatedAt).not.toBe(ann.updatedAt);
  });

  it('sets a note on a highlight', () => {
    const ann = makeHighlight();
    const edited = editAnnotation(ann, { note: 'new note' }, { hlc: hlc2 });
    expect(edited.note).toBe('new note');
  });

  it('changes an existing note on a highlight', () => {
    const ann = makeHighlight({ note: 'old note' });
    const edited = editAnnotation(ann, { note: 'new note' }, { hlc: hlc2 });
    expect(edited.note).toBe('new note');
  });

  it('clears a highlight note with null', () => {
    const ann = makeHighlight({ note: 'will be cleared' });
    const edited = editAnnotation(ann, { note: null }, { hlc: hlc2 });
    expect('note' in edited).toBe(false);
  });

  it('clears a highlight note with an empty/whitespace string', () => {
    const ann = makeHighlight({ note: 'will be cleared' });
    const edited = editAnnotation(ann, { note: '   ' }, { hlc: hlc2 });
    expect('note' in edited).toBe(false);
  });

  it('updates a note-kind annotation note', () => {
    const ann = makeNote({ note: 'original' });
    const edited = editAnnotation(ann, { note: 'updated note' }, { hlc: hlc2 });
    expect(edited.note).toBe('updated note');
  });

  it('throws RangeError when emptying a note-kind note with empty string', () => {
    const ann = makeNote();
    expect(() => editAnnotation(ann, { note: '' }, { hlc: hlc2 })).toThrowError(RangeError);
  });

  it('throws RangeError when emptying a note-kind note with whitespace', () => {
    const ann = makeNote();
    expect(() => editAnnotation(ann, { note: '   ' }, { hlc: hlc2 })).toThrowError(RangeError);
  });

  it('throws RangeError when setting color on a note-kind', () => {
    const ann = makeNote();
    expect(() => editAnnotation(ann, { color: 'blue' }, { hlc: hlc2 })).toThrowError(RangeError);
  });

  it('does not mutate the input annotation', () => {
    const ann = makeHighlight({ color: 'yellow', note: 'keep' });
    const snapshot = JSON.parse(JSON.stringify(ann)) as typeof ann;
    editAnnotation(ann, { color: 'pink', note: 'changed' }, { hlc: hlc2 });
    expect(ann).toEqual(snapshot);
  });

  it('anchor is immutable (not in patch, preserved unchanged)', () => {
    const ann = makeHighlight();
    const edited = editAnnotation(ann, { color: 'blue' }, { hlc: hlc2 });
    expect(edited.anchor).toEqual(ann.anchor);
  });

  it('kind is immutable (preserved unchanged)', () => {
    const ann = makeHighlight();
    const edited = editAnnotation(ann, { color: 'blue' }, { hlc: hlc2 });
    expect(edited.kind).toBe('highlight');
  });

  it('createdAt is immutable (preserved unchanged)', () => {
    const ann = makeHighlight({ createdAt: 777_000 });
    const edited = editAnnotation(ann, { color: 'blue' }, { hlc: hlc2 });
    expect(edited.createdAt).toBe(777_000);
  });
});
