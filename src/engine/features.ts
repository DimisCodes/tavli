import type { Board, Color, Play } from './types';
import { indexFromPoint, isHomeIndex, isRace, opponent, pipsFromIndex } from './board';
import { blotHitRolls, notation } from './moves';

/**
 * Facts about a candidate play, written for Jev.
 *
 * The important design decision here is that risk is priced in pips, the same unit as
 * reward. Measurement showed that giving Jev a bare "17 of 36 rolls hit you" made it refuse
 * every exposed play, because the number sounds alarming and nothing it was given said what
 * being hit would actually cost. `expected_pip_loss_if_hit` is directly comparable to
 * `pip_count_after`, so a play that gains 8 pips at a cost of 3 is visibly worth it.
 */
export interface BaseFeatures {
  moves: string;
  pip_count_after: number;
  hits_opponent_blots: number;
  opponent_checkers_on_bar_after: number;
  own_blots_after: number;
  points_held: number;
  home_board_points: number;
  longest_prime: number;
  anchors_in_opponent_home: number;
  checkers_still_in_opponent_home: number;
  back_checkers_split: boolean;
  builders_bearing_on_unmade_points: number;
  biggest_stack: number;
  borne_off_after: number;
  no_contact_race: boolean;
}

export interface PlayFeatures extends BaseFeatures {
  chance_of_being_hit_percent: number;
  expected_pip_loss_if_hit: number;
  worst_case_pip_loss_if_hit: number;
  opponent_home_board_points: number;
}

export function longestPrime(b: Board, color: Color): number {
  let best = 0;
  let run = 0;
  for (let i = 0; i < 24; i++) {
    const p = b.points[i];
    if (p && p.color === color && p.count >= 2) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

/** Points the given colour holds inside its own home board, 0 to 6. */
export function homeBoardPoints(b: Board, color: Color): number {
  let n = 0;
  for (let p = 1; p <= 6; p++) {
    const s = b.points[indexFromPoint(color, p)];
    if (s && s.color === color && s.count >= 2) n++;
  }
  return n;
}

/** Spare checkers within one die of a valuable point this colour has not made yet. */
function buildersOnUnmadePoints(b: Board, color: Color): number {
  const wanted = [7, 5, 4, 3, 6].filter((p) => {
    const s = b.points[indexFromPoint(color, p)];
    return !(s && s.color === color && s.count >= 2);
  });
  let n = 0;
  for (const target of wanted) {
    const ti = indexFromPoint(color, target);
    b.points.forEach((s, i) => {
      if (!s || s.color !== color) return;
      const dist = color === 'white' ? i - ti : ti - i;
      if (dist >= 1 && dist <= 6) n += Math.min(s.count, 2);
    });
  }
  return n;
}

function baseFeatures(after: Board, color: Color, play: Play): BaseFeatures {
  const opp = opponent(color);
  let blots = 0;
  let points = 0;
  let anchors = 0;
  let back = 0;
  let biggest = 0;
  const backPoints: number[] = [];
  after.points.forEach((p, i) => {
    if (!p || p.color !== color) return;
    if (p.count === 1) blots++;
    if (p.count >= 2) {
      points++;
      if (isHomeIndex(opp, i)) anchors++;
    }
    if (isHomeIndex(opp, i)) {
      back += p.count;
      backPoints.push(i);
    }
    biggest = Math.max(biggest, p.count);
  });
  return {
    moves: notation(color, play),
    pip_count_after: after.points.reduce(
      (a, p, i) => a + (p && p.color === color ? p.count * pipsFromIndex(color, i) : 0),
      after.bar[color] * 25,
    ),
    hits_opponent_blots: play.filter((s) => s.hit).length,
    opponent_checkers_on_bar_after: after.bar[opp],
    own_blots_after: blots,
    points_held: points,
    home_board_points: homeBoardPoints(after, color),
    longest_prime: longestPrime(after, color),
    anchors_in_opponent_home: anchors,
    checkers_still_in_opponent_home: back,
    back_checkers_split: backPoints.length > 1,
    builders_bearing_on_unmade_points: buildersOnUnmadePoints(after, color),
    biggest_stack: biggest,
    borne_off_after: after.off[color],
    no_contact_race: isRace(after),
  };
}

/** Cheap facts only. Used to pre-rank a long candidate list before pricing risk. */
export const describePlayCheap = baseFeatures;

/** Full facts including the cost of exposure, which needs a per-blot roll count. */
export function describePlay(after: Board, color: Color, play: Play): PlayFeatures {
  const base = baseFeatures(after, color, play);
  return { ...base, ...priceRisk(after, color) };
}

/** Turn exposure into pips: probability of being hit multiplied by the pips that costs. */
export function priceRisk(after: Board, color: Color) {
  const rolls = blotHitRolls(after, color);
  let expected = 0;
  let worst = 0;
  let anyRolls = 0;
  for (const [idx, count] of Object.entries(rolls)) {
    const i = Number(idx);
    const cost = 25 - pipsFromIndex(color, i);
    expected += (count / 36) * cost;
    if (count > 0) worst = Math.max(worst, cost);
    anyRolls = Math.max(anyRolls, count);
  }
  // A checker on the bar is already lost ground; count re-entry risk against a strong board.
  return {
    chance_of_being_hit_percent: Math.round((anyRolls / 36) * 100),
    expected_pip_loss_if_hit: Math.round(expected * 10) / 10,
    worst_case_pip_loss_if_hit: worst,
    opponent_home_board_points: homeBoardPoints(after, opponent(color)),
  };
}

/**
 * Deterministic evaluation used to pre-rank long candidate lists and as an offline fallback.
 * Risk enters as expected pips lost, scaled by how punishing the opponent's board is, so it
 * trades off against the pip gain instead of vetoing every exposed play.
 */
export function heuristic(f: PlayFeatures): number {
  const boardDanger = 1 + f.opponent_home_board_points * 0.35;
  return (
    -f.pip_count_after +
    f.hits_opponent_blots * 16 +
    f.opponent_checkers_on_bar_after * 5 +
    f.points_held * 3 +
    f.home_board_points * 6 +
    f.longest_prime * 5 +
    f.anchors_in_opponent_home * 6 +
    f.builders_bearing_on_unmade_points * 1.2 -
    f.expected_pip_loss_if_hit * boardDanger * 1.6 -
    Math.max(0, f.biggest_stack - 3) * 2 +
    f.borne_off_after * 14 -
    f.checkers_still_in_opponent_home * 1.2
  );
}

/** Cheap pre-ranking that does not need per-blot risk pricing. */
export function roughScore(f: BaseFeatures): number {
  return (
    -f.pip_count_after +
    f.hits_opponent_blots * 16 +
    f.points_held * 3 +
    f.home_board_points * 6 +
    f.longest_prime * 5 +
    f.anchors_in_opponent_home * 6 +
    f.builders_bearing_on_unmade_points * 1.2 -
    f.own_blots_after * 2 +
    f.borne_off_after * 14
  );
}
