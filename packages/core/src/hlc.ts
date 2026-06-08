// Hybrid Logical Clock — pure functions, no Date.now() inside (caller passes physicalNow).
// Invariant: HLC is the *only* ordering source; never use Date.now() for ordering (code-standards).

export type Hlc = {
  wall: number; // ms epoch
  counter: number;
  node: string;
};

// Counter overflow (> 8 digits) is out of scope — realistic per-ms event counts are far below 99_999_999.

/** Create a zero clock for a new node. */
export function initialClock(node: string): Hlc {
  return { wall: 0, counter: 0, node };
}

/**
 * Local event: advance the clock.
 * wall = max(prev.wall, physicalNow)
 * counter = wall === prev.wall ? prev.counter + 1 : 0
 */
export function tick(prev: Hlc, physicalNow: number): Hlc {
  const wall = Math.max(prev.wall, physicalNow);
  const counter = wall === prev.wall ? prev.counter + 1 : 0;
  return { wall, counter, node: prev.node };
}

/**
 * Receive a remote stamp and merge with the local clock.
 * wall = max(local.wall, remote.wall, physicalNow)
 * counter rules (first matching branch):
 *   - wall === local.wall === remote.wall  → max(local.counter, remote.counter) + 1
 *   - wall === local.wall                  → local.counter + 1
 *   - wall === remote.wall                 → remote.counter + 1
 *   - else                                 → 0
 */
export function receive(local: Hlc, remote: Hlc, physicalNow: number): Hlc {
  const wall = Math.max(local.wall, remote.wall, physicalNow);
  let counter: number;
  if (wall === local.wall && wall === remote.wall) {
    counter = Math.max(local.counter, remote.counter) + 1;
  } else if (wall === local.wall) {
    counter = local.counter + 1;
  } else if (wall === remote.wall) {
    counter = remote.counter + 1;
  } else {
    counter = 0;
  }
  return { wall, counter, node: local.node };
}

/**
 * Total order: wall → counter → node (lexicographic tiebreak so the order is
 * deterministic across devices even when wall and counter collide).
 */
export function compare(a: Hlc, b: Hlc): -1 | 0 | 1 {
  if (a.wall !== b.wall) return a.wall < b.wall ? -1 : 1;
  if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1;
  if (a.node !== b.node) return a.node < b.node ? -1 : 1;
  return 0;
}

// Padding widths — chosen so encode output is lexicographically sortable AND
// agrees with compare(). 15 digits covers ms-epoch until ~year 33658;
// 8 digits covers 99_999_999 events/ms (realistic max is single-digits).
const WALL_PAD = 15;
const COUNTER_PAD = 8;

/**
 * Encode to a lexicographically-sortable string.
 * Format: <wall 15 digits>-<counter 8 digits>-<node>
 * INVARIANT: encode(a) < encode(b)  ⟺  compare(a, b) === -1
 */
export function encode(h: Hlc): string {
  return (
    h.wall.toString().padStart(WALL_PAD, '0') +
    '-' +
    h.counter.toString().padStart(COUNTER_PAD, '0') +
    '-' +
    h.node
  );
}

/** Inverse of encode; round-trips through encode(parse(s)) === s. */
export function parse(s: string): Hlc {
  const firstDash = s.indexOf('-');
  const secondDash = s.indexOf('-', firstDash + 1);
  const wall = parseInt(s.slice(0, firstDash), 10);
  const counter = parseInt(s.slice(firstDash + 1, secondDash), 10);
  const node = s.slice(secondDash + 1);
  return { wall, counter, node };
}
