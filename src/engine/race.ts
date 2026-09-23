import type { Board, Color, Dice, Play } from './types';
import { isHomeIndex, isRace, pipsFromIndex } from './board';
import { enumeratePlays } from './moves';

/**
 * Once neither side can hit the other the position is a pure computation, so code owns it.
 * This follows TypeSafe's own guidance: keep deterministic work in code and call the model
 * only where the system needs judgement. Measurement showed Jev left checkers on the board
 * in 2 of 4 countable bear-off decisions; this removes that class of error entirely.
 */

export interface RaceEvaluation {
  play: Play;
  board: Board;
  score: number;
  bornOff: number;
  pips: number;
  gaps: number;
  wastage: number;
}

/** Empty points below the highest occupied point, which cost rolls later in the bear-off. */
function homeGaps(b: Board, color: Color): number {
  let highest = 0;
  for (let p = 6; p >= 1; p--) {
    const idx = color === 'white' ? p - 1 : 24 - p;
    const s = b.points[idx];
    if (s && s.color === color) {
      highest = p;
      break;
    }
  }
  let gaps = 0;
  for (let p = 1; p < highest; p++) {
    const idx = color === 'white' ? p - 1 : 24 - p;
    const s = b.points[idx];
    if (!s || s.color !== color) gaps++;
  }
  return gaps;
}

/** Checkers stacked beyond three on one point are wasted pips in a race. */
function stackWaste(b: Board, color: Color): number {
  let waste = 0;
  b.points.forEach((p) => {
    if (p && p.color === color && p.count > 3) waste += p.count - 3;
  });
  return waste;
}

/** Checkers still outside the home board; each must cross in before it can come off. */
function crossovers(b: Board, color: Color): number {
  let n = 0;
  b.points.forEach((p, i) => {
    if (p && p.color === color && !isHomeIndex(color, i)) n += p.count;
  });
  return n;
}

export function evaluateRacePlay(after: Board, color: Color, play: Play): RaceEvaluation {
  let pips = 0;
  after.points.forEach((p, i) => {
    if (p && p.color === color) pips += p.count * pipsFromIndex(color, i);
  });
  const bornOff = after.off[color];
  const gaps = homeGaps(after, color);
  const wastage = stackWaste(after, color);
  // Taking checkers off dominates everything; then pips, then a clean home board.
  const score = bornOff * 1000 - pips * 8 - gaps * 14 - wastage * 6 - crossovers(after, color) * 3;
  return { play, board: after, score, bornOff, pips, gaps, wastage };
}

/** True when no contact remains, so the position can be played out deterministically. */
export const isSolvableRace = (b: Board): boolean => isRace(b);

export function solveRace(b: Board, color: Color, dice: Dice): RaceEvaluation[] {
  return enumeratePlays(b, color, dice)
    .map((c) => evaluateRacePlay(c.board, color, c.play))
    .sort((a, b2) => b2.score - a.score);
}
