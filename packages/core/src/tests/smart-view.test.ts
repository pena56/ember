import { describe, expect, it } from 'vitest';

import { encode, initialClock, tick } from '../hlc.js';
import {
  BUILT_IN_SMART_VIEWS,
  deriveReadingState,
  editSmartView,
  evaluateSmartView,
  makeSmartView,
  type LibraryEntry,
  type SmartViewQuery,
} from '../smart-view.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const hlc1 = tick(initialClock('node-a'), 1_000_000);
const hlc2 = tick(hlc1, 2_000_000);

function makeView(overrides: Partial<Parameters<typeof makeSmartView>[0]> = {}) {
  return makeSmartView(
    {
      id: 'sv-1',
      name: 'My View',
      query: {},
      createdAt: 1_000_000,
      ...overrides,
    },
    { hlc: hlc1 },
  );
}

// ---------------------------------------------------------------------------
// makeSmartView / editSmartView
// ---------------------------------------------------------------------------

describe('makeSmartView', () => {
  it('stamps updatedAt to encode(hlc)', () => {
    const view = makeView();
    expect(view.updatedAt).toBe(encode(hlc1));
  });

  it('preserves id and createdAt', () => {
    const view = makeView({ id: 'sv-99', createdAt: 777_000 });
    expect(view.id).toBe('sv-99');
    expect(view.createdAt).toBe(777_000);
  });

  it('trims name', () => {
    const view = makeView({ name: '  My View  ' });
    expect(view.name).toBe('My View');
  });

  it('throws RangeError when name is empty after trim', () => {
    expect(() => makeView({ name: '   ' })).toThrowError(RangeError);
  });

  it('throws RangeError when name is an empty string', () => {
    expect(() => makeView({ name: '' })).toThrowError(RangeError);
  });

  it('accepts empty query (no constraint)', () => {
    expect(() => makeView({ query: {} })).not.toThrow();
  });

  it('accepts tagIds with tagMatch', () => {
    expect(() =>
      makeView({ query: { tagIds: ['t-1'], tagMatch: 'all' } }),
    ).not.toThrow();
  });

  it('accepts state-only query', () => {
    expect(() => makeView({ query: { state: 'in-progress' } })).not.toThrow();
  });

  it('accepts untaggedOnly:true alone', () => {
    expect(() => makeView({ query: { untaggedOnly: true } })).not.toThrow();
  });

  it('throws RangeError when untaggedOnly:true with non-empty tagIds', () => {
    expect(() =>
      makeView({ query: { untaggedOnly: true, tagIds: ['t-1'] } }),
    ).toThrowError(RangeError);
  });

  it('does NOT throw when untaggedOnly:true with empty tagIds array', () => {
    // empty array means no constraint — compatible with untaggedOnly
    expect(() =>
      makeView({ query: { untaggedOnly: true, tagIds: [] } }),
    ).not.toThrow();
  });
});

describe('editSmartView', () => {
  it('returns a fresh object (does not mutate input)', () => {
    const view = makeView();
    const snapshot = JSON.parse(JSON.stringify(view)) as typeof view;
    editSmartView(view, { name: 'Changed' }, { hlc: hlc2 });
    expect(view).toEqual(snapshot);
  });

  it('bumps updatedAt to encode(hlc2)', () => {
    const view = makeView();
    const edited = editSmartView(view, { name: 'New Name' }, { hlc: hlc2 });
    expect(edited.updatedAt).toBe(encode(hlc2));
    expect(edited.updatedAt).not.toBe(view.updatedAt);
  });

  it('preserves id and createdAt', () => {
    const view = makeView({ id: 'sv-42', createdAt: 888_000 });
    const edited = editSmartView(view, { name: 'X' }, { hlc: hlc2 });
    expect(edited.id).toBe('sv-42');
    expect(edited.createdAt).toBe(888_000);
  });

  it('updates name (trimmed)', () => {
    const view = makeView();
    const edited = editSmartView(view, { name: '  New Name  ' }, { hlc: hlc2 });
    expect(edited.name).toBe('New Name');
  });

  it('updates query', () => {
    const view = makeView({ query: {} });
    const edited = editSmartView(view, { query: { state: 'finished' } }, { hlc: hlc2 });
    expect(edited.query.state).toBe('finished');
  });

  it('throws RangeError when patched name is empty', () => {
    const view = makeView();
    expect(() => editSmartView(view, { name: '' }, { hlc: hlc2 })).toThrowError(RangeError);
  });

  it('throws RangeError when patched query has untaggedOnly:true with non-empty tagIds', () => {
    const view = makeView();
    expect(() =>
      editSmartView(view, { query: { untaggedOnly: true, tagIds: ['t-1'] } }, { hlc: hlc2 }),
    ).toThrowError(RangeError);
  });

  it('leaves unpatched fields unchanged', () => {
    const view = makeView({ query: { state: 'unread' } });
    const edited = editSmartView(view, { name: 'Renamed' }, { hlc: hlc2 });
    expect(edited.query).toEqual(view.query);
  });
});

// ---------------------------------------------------------------------------
// deriveReadingState
// ---------------------------------------------------------------------------

describe('deriveReadingState', () => {
  it('returns "unread" when position is undefined', () => {
    expect(deriveReadingState({ pageCount: 10 }, undefined)).toBe('unread');
  });

  it('returns "unread" when position is undefined even without pageCount', () => {
    expect(deriveReadingState({}, undefined)).toBe('unread');
  });

  it('returns "finished" when page >= pageCount (exact boundary)', () => {
    expect(deriveReadingState({ pageCount: 5 }, { page: 5 })).toBe('finished');
  });

  it('returns "finished" when page > pageCount', () => {
    expect(deriveReadingState({ pageCount: 5 }, { page: 6 })).toBe('finished');
  });

  it('returns "in-progress" when page < pageCount', () => {
    expect(deriveReadingState({ pageCount: 10 }, { page: 3 })).toBe('in-progress');
  });

  it('returns "in-progress" when position exists but pageCount is unknown', () => {
    expect(deriveReadingState({}, { page: 3 })).toBe('in-progress');
  });

  it('returns "in-progress" when pageCount is undefined (never finished without count)', () => {
    expect(deriveReadingState({}, { page: 100 })).toBe('in-progress');
  });
});

// ---------------------------------------------------------------------------
// evaluateSmartView — fixture library
// ---------------------------------------------------------------------------

// Fixture: 5 docs at different importedAt, pageCount, tags, positions
// doc-1: newest, tagged [t-red], in-progress (page 2 of 10)
// doc-2: 2nd, tagged [t-red, t-blue], finished (page 5 of 5)
// doc-3: 3rd, tagged [t-blue], unread (no position)
// doc-4: 4th, no tags, in-progress (page 1 of 20)
// doc-5: oldest, no tags, unread (no position)

const ENTRIES: LibraryEntry[] = [
  { id: 'doc-1', importedAt: 5_000, pageCount: 10, tagIds: ['t-red'], position: { page: 2 } },
  {
    id: 'doc-2',
    importedAt: 4_000,
    pageCount: 5,
    tagIds: ['t-red', 't-blue'],
    position: { page: 5 },
  },
  { id: 'doc-3', importedAt: 3_000, pageCount: 8, tagIds: ['t-blue'] },
  { id: 'doc-4', importedAt: 2_000, pageCount: 20, tagIds: [], position: { page: 1 } },
  { id: 'doc-5', importedAt: 1_000, tagIds: [] },
];

describe('evaluateSmartView — empty query', () => {
  it('returns all docs, newest-first (importedAt DESC)', () => {
    const ids = evaluateSmartView({}, ENTRIES);
    expect(ids).toEqual(['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5']);
  });

  it('returns [] for an empty library', () => {
    expect(evaluateSmartView({}, [])).toEqual([]);
  });
});

describe('evaluateSmartView — deterministic ordering', () => {
  it('tiebreaks by id ASC when importedAt is equal', () => {
    const entries: LibraryEntry[] = [
      { id: 'doc-b', importedAt: 1_000, tagIds: [] },
      { id: 'doc-a', importedAt: 1_000, tagIds: [] },
    ];
    const ids = evaluateSmartView({}, entries);
    // importedAt equal → id ASC → doc-a before doc-b, but we want DESC importedAt first
    // Both have same importedAt so id ASC tiebreak: doc-a < doc-b
    expect(ids).toEqual(['doc-a', 'doc-b']);
  });
});

describe('evaluateSmartView — untaggedOnly', () => {
  it('returns only docs with zero tags', () => {
    const ids = evaluateSmartView({ untaggedOnly: true }, ENTRIES);
    expect(ids).toEqual(['doc-4', 'doc-5']);
  });
});

describe('evaluateSmartView — tagMatch:any (default)', () => {
  it('returns docs with at least one of the tagIds (implicit any)', () => {
    const ids = evaluateSmartView({ tagIds: ['t-red'] }, ENTRIES);
    expect(ids).toContain('doc-1');
    expect(ids).toContain('doc-2');
    expect(ids).not.toContain('doc-3');
    expect(ids).not.toContain('doc-4');
  });

  it('tagMatch:"any" explicit — docs with >=1 matching tag', () => {
    const ids = evaluateSmartView({ tagIds: ['t-red', 't-blue'], tagMatch: 'any' }, ENTRIES);
    expect(ids).toEqual(['doc-1', 'doc-2', 'doc-3']);
  });
});

describe('evaluateSmartView — tagMatch:all', () => {
  it('returns only docs that have ALL specified tags', () => {
    const ids = evaluateSmartView({ tagIds: ['t-red', 't-blue'], tagMatch: 'all' }, ENTRIES);
    expect(ids).toEqual(['doc-2']);
  });

  it('single tag with all — same as any', () => {
    const ids = evaluateSmartView({ tagIds: ['t-blue'], tagMatch: 'all' }, ENTRIES);
    expect(ids).toContain('doc-2');
    expect(ids).toContain('doc-3');
  });

  it('returns [] when no doc has all specified tags', () => {
    const ids = evaluateSmartView({ tagIds: ['t-red', 't-blue', 't-nonexistent'], tagMatch: 'all' }, ENTRIES);
    expect(ids).toEqual([]);
  });
});

describe('evaluateSmartView — state filter', () => {
  it('filters to unread docs only', () => {
    const ids = evaluateSmartView({ state: 'unread' }, ENTRIES);
    expect(ids).toEqual(['doc-3', 'doc-5']);
  });

  it('filters to in-progress docs only', () => {
    const ids = evaluateSmartView({ state: 'in-progress' }, ENTRIES);
    expect(ids).toEqual(['doc-1', 'doc-4']);
  });

  it('filters to finished docs only', () => {
    const ids = evaluateSmartView({ state: 'finished' }, ENTRIES);
    expect(ids).toEqual(['doc-2']);
  });
});

describe('evaluateSmartView — combined filters (AND)', () => {
  it('tag + state ANDs: t-red AND in-progress', () => {
    const ids = evaluateSmartView({ tagIds: ['t-red'], state: 'in-progress' }, ENTRIES);
    expect(ids).toEqual(['doc-1']);
  });

  it('tag + state ANDs: t-red AND finished', () => {
    const ids = evaluateSmartView({ tagIds: ['t-red'], state: 'finished' }, ENTRIES);
    expect(ids).toEqual(['doc-2']);
  });

  it('tagMatch:all + state: t-red+t-blue AND finished', () => {
    const ids = evaluateSmartView(
      { tagIds: ['t-red', 't-blue'], tagMatch: 'all', state: 'finished' },
      ENTRIES,
    );
    expect(ids).toEqual(['doc-2']);
  });

  it('untaggedOnly + state:unread', () => {
    const ids = evaluateSmartView({ untaggedOnly: true, state: 'unread' }, ENTRIES);
    expect(ids).toEqual(['doc-5']);
  });
});

describe('evaluateSmartView — empty tagIds treated as no tag constraint', () => {
  it('empty tagIds array → no tag constraint (same as empty query)', () => {
    const ids = evaluateSmartView({ tagIds: [] }, ENTRIES);
    expect(ids).toEqual(['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5']);
  });
});

// ---------------------------------------------------------------------------
// BUILT_IN_SMART_VIEWS
// ---------------------------------------------------------------------------

describe('BUILT_IN_SMART_VIEWS', () => {
  it('includes "all", "untagged", "in-progress", "finished", "recently-added"', () => {
    const keys = BUILT_IN_SMART_VIEWS.map((v) => v.key);
    expect(keys).toContain('all');
    expect(keys).toContain('untagged');
    expect(keys).toContain('in-progress');
    expect(keys).toContain('finished');
    expect(keys).toContain('recently-added');
  });

  it('"all" view returns all docs', () => {
    const allView = BUILT_IN_SMART_VIEWS.find((v) => v.key === 'all')!;
    const ids = evaluateSmartView(allView.query, ENTRIES);
    expect(ids).toHaveLength(ENTRIES.length);
  });

  it('"untagged" view returns only untagged docs', () => {
    const view = BUILT_IN_SMART_VIEWS.find((v) => v.key === 'untagged')!;
    const ids = evaluateSmartView(view.query, ENTRIES);
    expect(ids).toEqual(['doc-4', 'doc-5']);
  });

  it('"in-progress" view returns in-progress docs', () => {
    const view = BUILT_IN_SMART_VIEWS.find((v) => v.key === 'in-progress')!;
    const ids = evaluateSmartView(view.query, ENTRIES);
    expect(ids).toEqual(['doc-1', 'doc-4']);
  });

  it('"finished" view returns finished docs', () => {
    const view = BUILT_IN_SMART_VIEWS.find((v) => v.key === 'finished')!;
    const ids = evaluateSmartView(view.query, ENTRIES);
    expect(ids).toEqual(['doc-2']);
  });

  it('"recently-added" view returns all docs newest-first (ordering is the feature)', () => {
    const view = BUILT_IN_SMART_VIEWS.find((v) => v.key === 'recently-added')!;
    const ids = evaluateSmartView(view.query, ENTRIES);
    expect(ids[0]).toBe('doc-1'); // newest
    expect(ids[ids.length - 1]).toBe('doc-5'); // oldest
  });

  it('each built-in view has a non-empty name', () => {
    for (const view of BUILT_IN_SMART_VIEWS) {
      expect(view.name.trim().length).toBeGreaterThan(0);
    }
  });

  it('each built-in view has a unique key', () => {
    const keys = BUILT_IN_SMART_VIEWS.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ---------------------------------------------------------------------------
// evaluateSmartView — SmartViewQuery type smoke test
// ---------------------------------------------------------------------------

describe('evaluateSmartView — query shape coverage', () => {
  it('accepts SmartViewQuery with all optional fields present', () => {
    const q: SmartViewQuery = {
      tagIds: ['t-1'],
      tagMatch: 'all',
      state: 'unread',
      untaggedOnly: false,
    };
    expect(() => evaluateSmartView(q, [])).not.toThrow();
  });
});
