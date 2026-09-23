import type { Board, Color, Dice, From, Play, Step, To } from './types';
import { allInHome, boardKey, cloneBoard, opponent, pipsFromIndex, pointNumber } from './board';

export function expandDice(d: Dice): number[] {
  return d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : [d[0], d[1]];
}

function canLand(b: Board, color: Color, idx: number): boolean {
  const p = b.points[idx];
  return !p || p.color === color || p.count === 1;
}

function isHit(b: Board, color: Color, idx: number): boolean {
  const p = b.points[idx];
  return !!p && p.color !== color && p.count === 1;
}

/** Every legal single-checker move for one die, ignoring the "use both dice" rule. */
export function singleSteps(b: Board, color: Color, die: number): Step[] {
  const steps: Step[] = [];
  if (b.bar[color] > 0) {
    const idx = color === 'white' ? 24 - die : die - 1;
    if (canLand(b, color, idx)) steps.push({ from: 'bar', to: idx, die, hit: isHit(b, color, idx) });
    return steps;
  }
  const home = allInHome(b, color);
  for (let i = 0; i < 24; i++) {
    const p = b.points[i];
    if (!p || p.color !== color) continue;
    const target = color === 'white' ? i - die : i + die;
    if (target >= 0 && target <= 23) {
      if (canLand(b, color, target)) steps.push({ from: i, to: target, die, hit: isHit(b, color, target) });
    } else if (home) {
      const pips = pipsFromIndex(color, i);
      if (pips === die) {
        steps.push({ from: i, to: 'off', die, hit: false });
      } else if (pips < die) {
        const hasFurther = b.points.some((q, j) => q && q.color === color && pipsFromIndex(color, j) > pips);
        if (!hasFurther) steps.push({ from: i, to: 'off', die, hit: false });
      }
    }
  }
  return steps;
}

export function applyStep(b: Board, color: Color, s: Step): Board {
  const nb = cloneBoard(b);
  if (s.from === 'bar') {
    nb.bar[color]--;
  } else {
    const p = nb.points[s.from]!;
    p.count--;
    if (p.count === 0) nb.points[s.from] = null;
  }
  if (s.to === 'off') {
    nb.off[color]++;
  } else {
    const p = nb.points[s.to];
    if (p && p.color !== color) {
      nb.points[s.to] = { color, count: 1 };
      nb.bar[opponent(color)]++;
    } else if (p) {
      p.count++;
    } else {
      nb.points[s.to] = { color, count: 1 };
    }
  }
  return nb;
}

export function applyPlay(b: Board, color: Color, play: Play): Board {
  return play.reduce((acc, s) => applyStep(acc, color, s), b);
}

type Memo = Map<string, number>;

function diceKey(dice: number[]): string {
  return [...dice].sort().join('');
}

function without(dice: number[], k: number): number[] {
  return dice.filter((_, j) => j !== k);
}

/** Maximum number of the given dice that can legally be played from this position. */
export function maxPlayable(b: Board, color: Color, dice: number[], memo: Memo = new Map()): number {
  if (dice.length === 0) return 0;
  const key = boardKey(b) + '|' + diceKey(dice);
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  let best = 0;
  const tried = new Set<number>();
  outer: for (let k = 0; k < dice.length; k++) {
    const d = dice[k];
    if (tried.has(d)) continue;
    tried.add(d);
    const rest = without(dice, k);
    for (const s of singleSteps(b, color, d)) {
      best = Math.max(best, 1 + maxPlayable(applyStep(b, color, s), color, rest, memo));
      if (best === dice.length) break outer;
    }
  }
  memo.set(key, best);
  return best;
}

export interface TurnPlan {
  /** How many dice must be played this turn (0 = no legal move). */
  total: number;
  dice: number[];
  /** When only one die can be played and both could be played alone, the larger is compulsory. */
  forcedDie?: number;
}

export function planTurn(b: Board, color: Color, dice: Dice): TurnPlan {
  const expanded = expandDice(dice);
  const total = maxPlayable(b, color, expanded);
  let forcedDie: number | undefined;
  if (total === 1 && dice[0] !== dice[1]) {
    const larger = Math.max(dice[0], dice[1]);
    if (singleSteps(b, color, larger).length > 0) forcedDie = larger;
  }
  return { total, dice: expanded, forcedDie };
}

/**
 * Steps a player may take next, given dice still unused and how many steps were already made,
 * such that a full legal play of `plan.total` steps remains reachable.
 */
export function legalNextSteps(
  b: Board,
  color: Color,
  remaining: number[],
  stepsUsed: number,
  plan: TurnPlan,
): Step[] {
  const need = plan.total - stepsUsed;
  if (need <= 0) return [];
  const memo: Memo = new Map();
  const out: Step[] = [];
  const tried = new Set<number>();
  for (let k = 0; k < remaining.length; k++) {
    const d = remaining[k];
    if (tried.has(d)) continue;
    tried.add(d);
    if (stepsUsed === 0 && plan.forcedDie !== undefined && d !== plan.forcedDie) continue;
    const rest = without(remaining, k);
    for (const s of singleSteps(b, color, d)) {
      if (1 + maxPlayable(applyStep(b, color, s), color, rest, memo) >= need) out.push(s);
    }
  }
  return out;
}

export interface Candidate {
  board: Board;
  play: Play;
}

/** All complete legal plays, one per distinct resulting position. */
export function enumeratePlays(b: Board, color: Color, dice: Dice): Candidate[] {
  const plan = planTurn(b, color, dice);
  if (plan.total === 0) return [];
  const results = new Map<string, Candidate>();
  const visited = new Set<string>();

  const dfs = (board: Board, remaining: number[], play: Play) => {
    if (play.length === plan.total) {
      const k = boardKey(board);
      if (!results.has(k)) results.set(k, { board, play });
      return;
    }
    const stateKey = boardKey(board) + '|' + diceKey(remaining);
    if (visited.has(stateKey)) return;
    visited.add(stateKey);
    const tried = new Set<number>();
    for (let k = 0; k < remaining.length; k++) {
      const d = remaining[k];
      if (tried.has(d)) continue;
      tried.add(d);
      if (play.length === 0 && plan.forcedDie !== undefined && d !== plan.forcedDie) continue;
      const rest = without(remaining, k);
      for (const s of singleSteps(board, color, d)) {
        dfs(applyStep(board, color, s), rest, [...play, s]);
      }
    }
  };
  dfs(b, plan.dice, []);
  return [...results.values()];
}

/**
 * Standard notation from the mover's perspective, e.g. "13/8 6/1*" or "bar/22 13/9(2)".
 * A checker that moves twice is written as one move, so 24/18 followed by 18/13 reads 24/13.
 */
export function notation(color: Color, play: Play): string {
  if (play.length === 0) return 'no move';
  const segments: { from: From; to: To; hit: boolean }[] = [];
  for (const s of play) {
    let extended = false;
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      if (seg.to !== 'off' && seg.to === s.from) {
        seg.to = s.to;
        seg.hit = seg.hit || s.hit;
        extended = true;
        break;
      }
    }
    if (!extended) segments.push({ from: s.from, to: s.to, hit: s.hit });
  }
  const label = (seg: { from: From; to: To; hit: boolean }) => {
    const from = seg.from === 'bar' ? 'bar' : String(pointNumber(color, seg.from));
    const to = seg.to === 'off' ? 'off' : String(pointNumber(color, seg.to));
    return `${from}/${to}${seg.hit ? '*' : ''}`;
  };
  const counts = new Map<string, number>();
  for (const seg of segments) {
    const l = label(seg);
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return [...counts.entries()].map(([l, n]) => (n > 1 ? `${l}(${n})` : l)).join(' ');
}

/** Whether `color` (to move with these dice) could hit at least one enemy blot. */
export function canHit(b: Board, color: Color, dice: number[]): boolean {
  const visited = new Set<string>();
  const dfs = (board: Board, remaining: number[]): boolean => {
    if (remaining.length === 0) return false;
    const key = boardKey(board) + '|' + diceKey(remaining);
    if (visited.has(key)) return false;
    visited.add(key);
    const tried = new Set<number>();
    for (let k = 0; k < remaining.length; k++) {
      const d = remaining[k];
      if (tried.has(d)) continue;
      tried.add(d);
      const rest = without(remaining, k);
      for (const s of singleSteps(board, color, d)) {
        if (s.hit) return true;
        if (rest.length && dfs(applyStep(board, color, s), rest)) return true;
      }
    }
    return false;
  };
  return dfs(b, dice);
}

/** Which of the given target indices `color` can hit with these dice. */
function hitTargets(b: Board, color: Color, dice: number[], targets: Set<number>): Set<number> {
  const found = new Set<number>();
  const visited = new Set<string>();
  const dfs = (board: Board, remaining: number[]) => {
    if (remaining.length === 0 || found.size === targets.size) return;
    const key = boardKey(board) + '|' + diceKey(remaining);
    if (visited.has(key)) return;
    visited.add(key);
    const tried = new Set<number>();
    for (let k = 0; k < remaining.length; k++) {
      const d = remaining[k];
      if (tried.has(d)) continue;
      tried.add(d);
      const rest = without(remaining, k);
      for (const s of singleSteps(board, color, d)) {
        if (s.to !== 'off' && targets.has(s.to)) found.add(s.to);
        if (rest.length) dfs(applyStep(board, color, s), rest);
      }
    }
  };
  dfs(b, dice);
  return found;
}

/**
 * For each blot belonging to `mover`, how many of the 36 rolls let the opponent hit that
 * specific blot. Knowing which blot is exposed, and not just that something is, lets the
 * risk of a play be priced in pips rather than left as a bare shot count.
 */
export function blotHitRolls(b: Board, mover: Color): Record<number, number> {
  const blots: number[] = [];
  b.points.forEach((p, i) => {
    if (p && p.color === mover && p.count === 1) blots.push(i);
  });
  const out: Record<number, number> = {};
  for (const i of blots) out[i] = 0;
  if (blots.length === 0) return out;
  const targets = new Set(blots);
  const opp = opponent(mover);
  for (let a = 1; a <= 6; a++) {
    for (let c = a; c <= 6; c++) {
      const weight = a === c ? 1 : 2;
      for (const idx of hitTargets(b, opp, expandDice([a, c]), targets)) out[idx] += weight;
    }
  }
  return out;
}

/** Of the 36 possible rolls, how many let the opponent of `mover` hit a blot next turn. */
export function hittingRolls(b: Board, mover: Color): number {
  const opp = opponent(mover);
  let total = 0;
  for (let a = 1; a <= 6; a++) {
    for (let c = a; c <= 6; c++) {
      const dice: Dice = [a, c];
      if (canHit(b, opp, expandDice(dice))) total += a === c ? 1 : 2;
    }
  }
  return total;
}
