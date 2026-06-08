import { describe, expect, it } from 'vitest';

import { compare, encode, initialClock, parse, receive, tick } from '../hlc.js';

describe('HLC – tick', () => {
  it('advances counter within the same millisecond', () => {
    const t0 = initialClock('node-a');
    const t1 = tick(t0, 1000);
    const t2 = tick(t1, 1000); // same physical ms
    expect(t1.wall).toBe(1000);
    expect(t1.counter).toBe(0);
    expect(t2.wall).toBe(1000);
    expect(t2.counter).toBe(1);
  });

  it('resets counter when wall clock advances', () => {
    const t0 = initialClock('node-a');
    const t1 = tick(t0, 1000);
    const t2 = tick(t1, 2000); // physical ms advanced
    expect(t2.wall).toBe(2000);
    expect(t2.counter).toBe(0);
  });

  it('uses max(prev.wall, physicalNow)', () => {
    const t0 = { wall: 5000, counter: 3, node: 'node-a' };
    const t1 = tick(t0, 1000); // physicalNow < prev.wall → wall stays at 5000
    expect(t1.wall).toBe(5000);
    expect(t1.counter).toBe(4);
  });

  it('preserves node', () => {
    const t0 = initialClock('my-node');
    const t1 = tick(t0, 100);
    expect(t1.node).toBe('my-node');
  });
});

describe('HLC – receive', () => {
  it('branch: wall = local = remote = physicalNow → counter = max(lc,rc)+1', () => {
    const local = { wall: 1000, counter: 2, node: 'a' };
    const remote = { wall: 1000, counter: 5, node: 'b' };
    const result = receive(local, remote, 1000);
    expect(result.wall).toBe(1000);
    expect(result.counter).toBe(6); // max(2,5)+1
  });

  it('branch: wall = local.wall > remote.wall and >= physicalNow → local.counter+1', () => {
    const local = { wall: 2000, counter: 3, node: 'a' };
    const remote = { wall: 1000, counter: 9, node: 'b' };
    const result = receive(local, remote, 1500);
    expect(result.wall).toBe(2000);
    expect(result.counter).toBe(4);
  });

  it('branch: wall = remote.wall > local.wall and >= physicalNow → remote.counter+1', () => {
    const local = { wall: 1000, counter: 3, node: 'a' };
    const remote = { wall: 2000, counter: 7, node: 'b' };
    const result = receive(local, remote, 1500);
    expect(result.wall).toBe(2000);
    expect(result.counter).toBe(8);
  });

  it('branch: physicalNow > both walls → counter = 0', () => {
    const local = { wall: 1000, counter: 3, node: 'a' };
    const remote = { wall: 1200, counter: 7, node: 'b' };
    const result = receive(local, remote, 5000);
    expect(result.wall).toBe(5000);
    expect(result.counter).toBe(0);
  });

  it('preserves node from local', () => {
    const local = { wall: 1000, counter: 0, node: 'local-node' };
    const remote = { wall: 1000, counter: 0, node: 'remote-node' };
    const result = receive(local, remote, 1000);
    expect(result.node).toBe('local-node');
  });
});

describe('HLC – compare', () => {
  it('orders by wall first', () => {
    const a = { wall: 1000, counter: 5, node: 'a' };
    const b = { wall: 2000, counter: 0, node: 'a' };
    expect(compare(a, b)).toBe(-1);
    expect(compare(b, a)).toBe(1);
  });

  it('orders by counter when wall is equal', () => {
    const a = { wall: 1000, counter: 0, node: 'a' };
    const b = { wall: 1000, counter: 1, node: 'a' };
    expect(compare(a, b)).toBe(-1);
    expect(compare(b, a)).toBe(1);
  });

  it('orders by node (lexicographic) when wall and counter equal', () => {
    const a = { wall: 1000, counter: 0, node: 'aaa' };
    const b = { wall: 1000, counter: 0, node: 'bbb' };
    expect(compare(a, b)).toBe(-1);
    expect(compare(b, a)).toBe(1);
  });

  it('returns 0 for identical clocks', () => {
    const a = { wall: 1000, counter: 3, node: 'x' };
    expect(compare(a, a)).toBe(0);
  });

  it('is a total order (transitivity spot-check)', () => {
    const a = { wall: 1000, counter: 0, node: 'a' };
    const b = { wall: 1000, counter: 1, node: 'a' };
    const c = { wall: 1000, counter: 2, node: 'a' };
    expect(compare(a, b)).toBe(-1);
    expect(compare(b, c)).toBe(-1);
    expect(compare(a, c)).toBe(-1);
  });
});

describe('HLC – encode / parse round-trip', () => {
  it('parse(encode(h)) === h for various clocks', () => {
    const clocks = [
      { wall: 0, counter: 0, node: 'node-a' },
      { wall: 1_000_000, counter: 42, node: 'node-b' },
      { wall: 999_999_999_999_999, counter: 99_999_999, node: 'z' },
    ];
    for (const h of clocks) {
      expect(parse(encode(h))).toEqual(h);
    }
  });
});

describe('HLC – encode↔compare agreement', () => {
  it('encode string order agrees with compare for crafted pairs', () => {
    const pairs: [{ wall: number; counter: number; node: string }, { wall: number; counter: number; node: string }][] =
      [
        [
          { wall: 1000, counter: 0, node: 'a' },
          { wall: 2000, counter: 0, node: 'a' },
        ],
        [
          { wall: 1000, counter: 0, node: 'a' },
          { wall: 1000, counter: 1, node: 'a' },
        ],
        [
          { wall: 1000, counter: 0, node: 'aaa' },
          { wall: 1000, counter: 0, node: 'bbb' },
        ],
        [
          { wall: 0, counter: 0, node: 'a' },
          { wall: 1, counter: 0, node: 'a' },
        ],
        [
          { wall: 999_999_999_999_998, counter: 0, node: 'a' },
          { wall: 999_999_999_999_999, counter: 0, node: 'a' },
        ],
      ];

    for (const [a, b] of pairs) {
      const cmpResult = compare(a, b);
      const encA = encode(a);
      const encB = encode(b);
      if (cmpResult === -1) {
        expect(encA < encB).toBe(true);
      } else if (cmpResult === 1) {
        expect(encA > encB).toBe(true);
      } else {
        expect(encA).toBe(encB);
      }
    }
  });
});

describe('HLC – initialClock', () => {
  it('creates a zero clock with the given node', () => {
    const h = initialClock('my-device');
    expect(h).toEqual({ wall: 0, counter: 0, node: 'my-device' });
  });
});
