import type { Board, Color, PointStack } from './types';

export const opponent = (c: Color): Color => (c === 'white' ? 'black' : 'white');

export function initialBoard(): Board {
  const points: (PointStack | null)[] = Array(24).fill(null);
  const put = (idx: number, color: Color, count: number) => {
    points[idx] = { color, count };
  };
  // Standard setup. White: 24-point(2), 13-point(5), 8-point(3), 6-point(5)
  put(23, 'white', 2);
  put(12, 'white', 5);
  put(7, 'white', 3);
  put(5, 'white', 5);
  // Black mirrors: index 0(2), 11(5), 16(3), 18(5)
  put(0, 'black', 2);
  put(11, 'black', 5);
  put(16, 'black', 3);
  put(18, 'black', 5);
  return { points, bar: { white: 0, black: 0 }, off: { white: 0, black: 0 } };
}

export function cloneBoard(b: Board): Board {
  return {
    points: b.points.map((p) => (p ? { ...p } : null)),
    bar: { ...b.bar },
    off: { ...b.off },
  };
}

/** Distance a checker on index `idx` must travel to bear off, for `color`. */
export function pipsFromIndex(color: Color, idx: number): number {
  return color === 'white' ? idx + 1 : 24 - idx;
}

/** Point number from the mover's own perspective (1..24). */
export function pointNumber(color: Color, idx: number): number {
  return pipsFromIndex(color, idx);
}

/** Index from the mover's own point number. */
export function indexFromPoint(color: Color, point: number): number {
  return color === 'white' ? point - 1 : 24 - point;
}

export function pipCount(b: Board, color: Color): number {
  let total = b.bar[color] * 25;
  b.points.forEach((p, i) => {
    if (p && p.color === color) total += p.count * pipsFromIndex(color, i);
  });
  return total;
}

export function isHomeIndex(color: Color, idx: number): boolean {
  return color === 'white' ? idx <= 5 : idx >= 18;
}

export function allInHome(b: Board, color: Color): boolean {
  if (b.bar[color] > 0) return false;
  return b.points.every((p, i) => !p || p.color !== color || isHomeIndex(color, i));
}

export function boardKey(b: Board): string {
  const pts = b.points.map((p) => (p ? (p.color === 'white' ? 'w' : 'b') + p.count : '.')).join(',');
  return `${pts}|${b.bar.white},${b.bar.black}|${b.off.white},${b.off.black}`;
}

export function checkersOn(b: Board, color: Color): number {
  let n = b.bar[color] + b.off[color];
  b.points.forEach((p) => {
    if (p && p.color === color) n += p.count;
  });
  return n;
}

/** True when no checker of either side can still be blocked or hit by the other. */
export function isRace(b: Board): boolean {
  if (b.bar.white > 0 || b.bar.black > 0) return false;
  let whiteRear = -1; // white's rearmost checker sits at the highest index
  let blackRear = 24; // black's rearmost checker sits at the lowest index
  b.points.forEach((p, i) => {
    if (!p) return;
    if (p.color === 'white') whiteRear = Math.max(whiteRear, i);
    if (p.color === 'black') blackRear = Math.min(blackRear, i);
  });
  return whiteRear < blackRear;
}
