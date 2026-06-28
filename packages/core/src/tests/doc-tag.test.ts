import { describe, expect, it } from 'vitest';

import { docTagId, makeDocTag } from '../doc-tag.js';
import { encode, initialClock, tick } from '../hlc.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const hlc1 = tick(initialClock('node-a'), 1_000_000);

const DOC_A = 'doc-aaa';
const DOC_B = 'doc-bbb';
const TAG_X = 'tag-xxx';
const TAG_Y = 'tag-yyy';

// ---------------------------------------------------------------------------
// docTagId
// ---------------------------------------------------------------------------

describe('docTagId', () => {
  it('returns "${documentId}:${tagId}"', () => {
    expect(docTagId(DOC_A, TAG_X)).toBe(`${DOC_A}:${TAG_X}`);
  });

  it('is deterministic — same inputs yield same id', () => {
    expect(docTagId(DOC_A, TAG_X)).toBe(docTagId(DOC_A, TAG_X));
  });

  it('is NOT order-independent (doc before tag)', () => {
    expect(docTagId(DOC_A, TAG_X)).not.toBe(docTagId(TAG_X, DOC_A));
  });

  it('different (doc,tag) pairs → different ids', () => {
    expect(docTagId(DOC_A, TAG_X)).not.toBe(docTagId(DOC_A, TAG_Y));
    expect(docTagId(DOC_A, TAG_X)).not.toBe(docTagId(DOC_B, TAG_X));
    expect(docTagId(DOC_A, TAG_X)).not.toBe(docTagId(DOC_B, TAG_Y));
  });

  it('same (doc,tag) on two devices → same id (convergence)', () => {
    // Simulates two devices linking the same doc+tag independently
    const id1 = docTagId(DOC_A, TAG_X);
    const id2 = docTagId(DOC_A, TAG_X);
    expect(id1).toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// makeDocTag
// ---------------------------------------------------------------------------

describe('makeDocTag', () => {
  it('sets id to docTagId(documentId, tagId)', () => {
    const link = makeDocTag({ documentId: DOC_A, tagId: TAG_X, createdAt: 1_000_000 }, { hlc: hlc1 });
    expect(link.id).toBe(docTagId(DOC_A, TAG_X));
  });

  it('stamps updatedAt to encode(hlc)', () => {
    const link = makeDocTag({ documentId: DOC_A, tagId: TAG_X, createdAt: 1_000_000 }, { hlc: hlc1 });
    expect(link.updatedAt).toBe(encode(hlc1));
  });

  it('preserves documentId, tagId, and createdAt', () => {
    const link = makeDocTag({ documentId: DOC_A, tagId: TAG_X, createdAt: 999_000 }, { hlc: hlc1 });
    expect(link.documentId).toBe(DOC_A);
    expect(link.tagId).toBe(TAG_X);
    expect(link.createdAt).toBe(999_000);
  });

  it('same (doc,tag) produced on two calls → same id', () => {
    const link1 = makeDocTag({ documentId: DOC_A, tagId: TAG_X, createdAt: 1_000_000 }, { hlc: hlc1 });
    const link2 = makeDocTag({ documentId: DOC_A, tagId: TAG_X, createdAt: 2_000_000 }, { hlc: hlc1 });
    expect(link1.id).toBe(link2.id);
  });

  it('different (doc,tag) pairs → different ids', () => {
    const link1 = makeDocTag({ documentId: DOC_A, tagId: TAG_X, createdAt: 1_000_000 }, { hlc: hlc1 });
    const link2 = makeDocTag({ documentId: DOC_A, tagId: TAG_Y, createdAt: 1_000_000 }, { hlc: hlc1 });
    expect(link1.id).not.toBe(link2.id);
  });
});
