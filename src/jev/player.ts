/**
 * Jev as a backgammon player.
 *
 * Division of labour follows TypeSafe's "how to build with System One" guidance:
 *   - Code owns everything deterministic: rules, legal plays, feature extraction, the race.
 *   - Jev owns the judgement: how much risk the position is worth, what plan fits, which
 *     play is best, and the cube.
 *
 * A turn with contact costs two calls. The first reads the position, the second picks the
 * move from a shortlist that code built using that read. They have to be separate calls:
 * questions inside one request are evaluated independently and in parallel, so an answer
 * from one cannot inform another.
 */
import type { Board, Color, Dice, Play } from '../engine/types';
import { opponent, pipCount, pointNumber, isRace } from '../engine/board';
import { enumeratePlays } from '../engine/moves';
import { solveRace } from '../engine/race';
import {
  describePlay,
  describePlayCheap,
  homeBoardPoints,
  longestPrime,
  priceRisk,
  roughScore,
  heuristic,
  type PlayFeatures,
} from '../engine/features';
import {
  JEV_MODEL,
  systemOne,
  type ChoiceAnswer,
  type JevCall,
  type NoulAnswer,
  type ScoreAnswer,
  type Structured,
  type SystemOneRequest,
} from './client';

/** How many plays get full risk pricing, and how many reach Jev. */
export const RISK_PRICED = 20;
export const SHORTLIST = 8;

/**
 * Cube thresholds. 0.65 was the original guess; measurement over 59 live double decisions
 * showed Jev's doubling probability tracks the position but peaks around 0.43, so the old
 * threshold was unreachable and it never doubled once.
 */
export const DOUBLE_THRESHOLD = 0.45;
export const TAKE_THRESHOLD = 0.5;

/**
 * Confidence-gated routing, the pattern TypeSafe documents for exactly this situation.
 * Over 38 logged decisions Jev's correct picks averaged 0.89 confidence and its mistakes
 * averaged 0.41, so a spread-out distribution is a reliable signal that it is guessing.
 * Below this floor the deterministic evaluation decides instead. Jev still sets the risk
 * appetite that evaluation uses, so its judgement shapes the move either way.
 */
export const CONFIDENCE_FLOOR = 0.5;

export interface CubeState {
  value: number;
  owner: Color | null;
}

export interface MatchContext {
  cube: CubeState;
  score: Record<Color, number>;
  matchTo: number;
}

export interface RankedCandidate {
  id: string;
  play: Play;
  board: Board;
  features: PlayFeatures;
  score: number;
  probability: number;
  /** Why this play was put in front of Jev, shown in the UI. */
  reason?: string;
}

export interface ScoreRead {
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
  levels: string[];
}

export interface PlanRead {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface PositionRead {
  plan: PlanRead;
  risk: ScoreRead;
  threat: ScoreRead;
  standing: ScoreRead;
  riskWeight: number;
  call: JevCall;
}

export interface MoveDecision {
  source: 'jev' | 'gated' | 'forced' | 'solver' | 'fallback';
  chosen: RankedCandidate;
  candidates: RankedCandidate[];
  enumerated: number;
  sent: number;
  confidence: number;
  read?: PositionRead;
  call?: JevCall;
  error?: string;
}

export interface CubeDecision {
  kind: 'offer' | 'take';
  probability: number;
  decision: boolean;
  call?: JevCall;
  error?: string;
}

export const GAME_PLANS: Record<string, Structured> = {
  race: 'Contact is gone or nearly gone; win by rolling home faster.',
  holding: "Keep an anchor in the opponent's board and wait for a shot while staying safe.",
  priming: "Build consecutive blocking points in front of the opponent's back checkers.",
  blitz: 'Attack loose checkers, keep the opponent on the bar and close the home board.',
  back_game: 'Well behind in the race; hold two deep anchors and hope to hit late.',
  bear_off: 'All checkers are home; bear off as fast and as safely as possible.',
};

export const RISK_LEVELS = [
  'Play as safely as possible. Being hit now would be close to losing the game.',
  'Lean safe. Only accept exposure for a clear, concrete gain.',
  'Balanced. Ordinary exposure is an acceptable price for an ordinary gain.',
  'Lean aggressive. Being hit costs little here, so contest points and leave builders.',
  'Take large risks. Black is losing the quiet game and needs to create chances.',
];

export const THREAT_LEVELS = [
  'White has no threats. Its board is weak and its checkers are not coordinated.',
  'White has minor threats but cannot punish a mistake much.',
  'White has real threats: some home-board points and builders aimed at black.',
  'White is dangerous: a strong board, and being hit would cost black a lot of ground.',
  'White is about to trap or close out black. Almost any exposure loses the game.',
];

export const STANDING_LEVELS = [
  'Black is losing clearly',
  'Black is somewhat behind',
  'Roughly even',
  'Black is somewhat ahead',
  'Black is winning clearly',
];

const RULES_FOR_JEV: Structured = {
  game: 'Backgammon, standard rules, doubling cube in play.',
  you_play: 'black',
  numbering:
    "Points are numbered from black's perspective. Black moves from 24 down toward 1 and bears off from points 1-6 (black's home board). White moves the opposite way and bears off from 19-24 (white's home board, where black's back checkers start on 24).",
  notation:
    "'13/8' moves a checker from point 13 to 8. '*' marks a hit that sends a white checker to the bar. 'bar/20' enters from the bar. '(2)' means two checkers made the same move.",
  glossary: {
    blot: 'A single checker alone on a point; it can be hit if white lands on it.',
    expected_pip_loss_if_hit:
      'The cost of exposure, already converted into pips: chance of being hit multiplied by the ground that checker would lose. Compare it directly against pip_count_after. A play that gains more pips than it risks is usually good.',
    opponent_home_board_points:
      "How many points white holds in its home board, 0 to 6. The higher this is, the longer black stays on the bar after a hit, so the same pip risk hurts more.",
    point_held: 'Two or more checkers on a point; white cannot land there.',
    prime: "Consecutive held points that block white's back checkers.",
    anchor: "A point black holds inside white's home board (19-24), giving black a safe landing spot.",
    builders_bearing_on_unmade_points:
      'Spare checkers within one die of a valuable point black has not made yet. More builders means more chances to make key points next turn.',
    pip_count: 'Total distance all checkers still need to travel; lower is closer to winning a race.',
  },
};

function positionForJev(board: Board, color: Color): Structured {
  const opp = opponent(color);
  const mine: Record<string, number> = {};
  const theirs: Record<string, number> = {};
  board.points.forEach((p, i) => {
    if (!p) return;
    const point = String(pointNumber(color, i));
    if (p.color === color) mine[point] = p.count;
    else theirs[point] = p.count;
  });
  return {
    black_checkers_by_point: mine,
    white_checkers_by_point: theirs,
    black_on_bar: board.bar[color],
    white_on_bar: board.bar[opp],
    black_borne_off: board.off[color],
    white_borne_off: board.off[opp],
    black_pip_count: pipCount(board, color),
    white_pip_count: pipCount(board, opp),
    black_home_board_points: homeBoardPoints(board, color),
    white_home_board_points: homeBoardPoints(board, opp),
    black_longest_prime: longestPrime(board, color),
    white_longest_prime: longestPrime(board, opp),
    no_contact_race: isRace(board),
  };
}

function matchForJev(ctx: MatchContext): Structured {
  return {
    cube_value: ctx.cube.value,
    cube_owner: ctx.cube.owner ?? 'centered',
    score: { black: ctx.score.black, white: ctx.score.white },
    match_to: ctx.matchTo,
  };
}

function label(i: number): string {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * What Jev is shown for each play.
 *
 * `chance_of_being_hit_percent` and `worst_case_pip_loss_if_hit` are deliberately withheld.
 * Measurement showed Jev keys on whichever number looks most alarming, so a bare 61% chance
 * of being hit outvoted a correctly priced cost of 0.6 pips and it declined free plays.
 * Only the priced figure goes in, because that is the one that is comparable to the reward.
 * Both fields stay on PlayFeatures for the interface and for analysis.
 */
function featuresForJev(f: PlayFeatures): Structured {
  const { chance_of_being_hit_percent, worst_case_pip_loss_if_hit, ...rest } = f;
  void chance_of_being_hit_percent;
  void worst_case_pip_loss_if_hit;
  return { ...rest };
}

const readScore = (a: ScoreAnswer | undefined, levels: string[]): ScoreRead =>
  a
    ? { score: a.score, confidence: a.confidence, probabilities: a.probabilities, levels }
    : { score: 2, confidence: 0, probabilities: {}, levels };

/** Risk appetite 0 to 4 maps to how heavily expected pip loss is weighed. */
export const riskWeightFor = (appetite: number): number =>
  Math.round((2.6 - 0.525 * Math.max(0, Math.min(4, appetite))) * 100) / 100;

function scoreWith(f: PlayFeatures, riskWeight: number): number {
  const danger = 1 + f.opponent_home_board_points * 0.35;
  return (
    -f.pip_count_after +
    f.hits_opponent_blots * 16 +
    f.opponent_checkers_on_bar_after * 5 +
    f.points_held * 3 +
    f.home_board_points * 6 +
    f.longest_prime * 5 +
    f.anchors_in_opponent_home * 6 +
    f.builders_bearing_on_unmade_points * 1.2 -
    f.expected_pip_loss_if_hit * danger * riskWeight -
    Math.max(0, f.biggest_stack - 3) * 2 +
    f.borne_off_after * 14 -
    f.checkers_still_in_opponent_home * 1.2
  );
}

interface Priced {
  play: Play;
  board: Board;
  features: PlayFeatures;
}

/** Price every plausible play, cheaply first and then fully for the most promising ones. */
export function priceCandidates(board: Board, color: Color, dice: Dice): { priced: Priced[]; enumerated: number } {
  const all = enumeratePlays(board, color, dice);
  const cheap = all
    .map((c) => ({ ...c, base: describePlayCheap(c.board, color, c.play) }))
    .sort((a, b) => roughScore(b.base) - roughScore(a.base));
  const priced = cheap.slice(0, RISK_PRICED).map((c) => ({
    play: c.play,
    board: c.board,
    features: { ...c.base, ...priceRisk(c.board, color) } as PlayFeatures,
  }));
  return { priced, enumerated: all.length };
}

/**
 * Build the menu Jev chooses from. Taking the top N by one score hides whole styles of play,
 * which is how the first version ended up offering only quiet moves. This keeps the best
 * plays by the weighted score and then guarantees the most aggressive, the safest, the best
 * point-maker and the best racer are all on the list, whatever the score says.
 */
export function shortlist(priced: Priced[], riskWeight: number): RankedCandidate[] {
  const scored = priced
    .map((c) => ({ ...c, score: scoreWith(c.features, riskWeight) }))
    .sort((a, b) => b.score - a.score);

  const picked: { c: (typeof scored)[number]; reason: string }[] = [];
  const add = (c: (typeof scored)[number] | undefined, reason: string) => {
    if (!c || picked.some((p) => p.c === c) || picked.length >= SHORTLIST) return;
    picked.push({ c, reason });
  };
  const bestBy = (fn: (f: PlayFeatures) => number) =>
    scored.reduce<(typeof scored)[number] | undefined>(
      (a, c) => (!a || fn(c.features) > fn(a.features) ? c : a),
      undefined,
    );

  scored.slice(0, 4).forEach((c, i) => add(c, i === 0 ? 'top rated' : 'well rated'));
  add(
    bestBy((f) => f.hits_opponent_blots * 100 + f.opponent_checkers_on_bar_after),
    'most aggressive',
  );
  add(
    bestBy((f) => -f.expected_pip_loss_if_hit),
    'safest',
  );
  add(
    bestBy((f) => f.home_board_points * 10 + f.longest_prime),
    'best structure',
  );
  add(
    bestBy((f) => f.borne_off_after * 100 - f.pip_count_after),
    'best race',
  );
  add(
    bestBy((f) => f.builders_bearing_on_unmade_points),
    'most builders',
  );
  for (const c of scored) add(c, 'alternative');

  // Randomise presentation so Jev's pick cannot lean on list position.
  return shuffle(picked).map((p, i) => ({
    id: label(i),
    play: p.c.play,
    board: p.c.board,
    features: p.c.features,
    score: p.c.score,
    probability: 0,
    reason: p.reason,
  }));
}

/** Stage one: ask Jev to read the position before any play is put in front of it. */
export async function readPosition(board: Board, color: Color, ctx: MatchContext): Promise<PositionRead> {
  const request: SystemOneRequest = {
    model: JEV_MODEL,
    state: { rules: RULES_FOR_JEV, match: matchForJev(ctx), position: positionForJev(board, color) },
    questions: {
      plan: {
        type: 'choice',
        instructions: 'Which game plan best fits black in this position right now?',
        criteria: GAME_PLANS,
      },
      risk: {
        type: 'score',
        instructions: {
          question: 'How much risk should black be willing to accept on this turn?',
          guidance:
            "Judge the cost of being hit, not just the chance of it. A weak white home board and few white builders make exposure cheap. A strong white board makes it expensive.",
        },
        criteria: RISK_LEVELS,
      },
      threat: {
        type: 'score',
        instructions: "How dangerous is white's position to black right now?",
        criteria: THREAT_LEVELS,
      },
      standing: {
        type: 'score',
        instructions: 'How does black stand in the game overall, counting race, structure and threats?',
        criteria: STANDING_LEVELS,
      },
    },
  };
  const call = await systemOne(request);
  const a = call.response.answers;
  const plan = a.plan as ChoiceAnswer | undefined;
  const risk = readScore(a.risk as ScoreAnswer | undefined, RISK_LEVELS);
  return {
    plan: plan
      ? { choice: plan.choice, confidence: plan.confidence, probabilities: plan.probabilities }
      : { choice: 'holding', confidence: 0, probabilities: {} },
    risk,
    threat: readScore(a.threat as ScoreAnswer | undefined, THREAT_LEVELS),
    standing: readScore(a.standing as ScoreAnswer | undefined, STANDING_LEVELS),
    riskWeight: riskWeightFor(risk.score),
    call,
  };
}

export async function decideMove(
  board: Board,
  color: Color,
  dice: Dice,
  ctx: MatchContext,
): Promise<MoveDecision> {
  // No contact left: the position is a computation, so code plays it out exactly.
  if (isRace(board)) {
    const solved = solveRace(board, color, dice);
    if (solved.length === 0) throw new Error('decideMove called with no legal plays');
    const cands: RankedCandidate[] = solved.map((r, i) => ({
      id: label(i),
      play: r.play,
      board: r.board,
      features: describePlay(r.board, color, r.play),
      score: r.score,
      probability: i === 0 ? 1 : 0,
      reason: i === 0 ? 'race solved in code' : undefined,
    }));
    let read: PositionRead | undefined;
    try {
      read = await readPosition(board, color, ctx);
    } catch {
      read = undefined;
    }
    return {
      source: 'solver',
      chosen: cands[0],
      candidates: cands,
      enumerated: solved.length,
      sent: 0,
      confidence: 1,
      read,
    };
  }

  const { priced, enumerated } = priceCandidates(board, color, dice);
  if (priced.length === 0) throw new Error('decideMove called with no legal plays');
  if (priced.length === 1) {
    const only: RankedCandidate = {
      id: 'A',
      play: priced[0].play,
      board: priced[0].board,
      features: priced[0].features,
      score: 0,
      probability: 1,
      reason: 'only legal play',
    };
    return { source: 'forced', chosen: only, candidates: [only], enumerated, sent: 0, confidence: 1 };
  }

  let read: PositionRead | undefined;
  try {
    read = await readPosition(board, color, ctx);
  } catch {
    read = undefined;
  }
  const riskWeight = read?.riskWeight ?? 1.6;
  const list = shortlist(priced, riskWeight);

  const criteria: Record<string, Structured> = {};
  for (const c of list) criteria[c.id] = featuresForJev(c.features);

  const request: SystemOneRequest = {
    model: JEV_MODEL,
    state: {
      rules: RULES_FOR_JEV,
      match: matchForJev(ctx),
      dice,
      position_before_move: positionForJev(board, color),
      your_read_of_this_position: read
        ? {
            plan: read.plan.choice,
            risk_you_judged_acceptable: RISK_LEVELS[Math.round(read.risk.score)],
            white_threat_level: THREAT_LEVELS[Math.round(read.threat.score)],
          }
        : null,
      candidate_plays: criteria,
    },
    questions: {
      best_play: {
        type: 'choice',
        instructions: {
          question: 'Which of these plays is strongest for black with this roll?',
          how_to_judge: [
            'Every candidate is legal and fully described in `candidate_plays`; compare their facts.',
            'Risk is already priced in pips. Compare `expected_pip_loss_if_hit` against what the play gains in position and pips, and prefer the better trade rather than the smaller risk.',
            'Scale that comparison by `opponent_home_board_points`: with a weak white board, exposure is cheap and worth taking for a good point or a hit.',
            'Making home-board points, extending a prime and holding an anchor all have lasting value that outlives a few pips.',
            'Builders are what make future points; leaving spare checkers where they bear on unmade points is usually better than stacking them safely.',
            'Hitting gains tempo and costs white ground, and is strongest when black already has home-board points.',
            'Prefer the play that matches the read in `your_read_of_this_position`.',
          ],
        },
        criteria,
      },
    },
  };

  try {
    const call = await systemOne(request);
    const best = call.response.answers.best_play as ChoiceAnswer;
    const withProbs = list.map((c) => ({ ...c, probability: best.probabilities?.[c.id] ?? 0 }));
    const picked = withProbs.find((c) => c.id === best.choice) ?? withProbs[0];
    const gated = best.confidence < CONFIDENCE_FLOOR;
    const chosen = gated ? [...withProbs].sort((a, b) => b.score - a.score)[0] : picked;
    withProbs.sort((a, b) => b.probability - a.probability || b.score - a.score);
    return {
      source: gated ? 'gated' : 'jev',
      chosen,
      candidates: withProbs,
      enumerated,
      sent: list.length,
      confidence: best.confidence,
      read,
      call,
    };
  } catch (e) {
    const byScore = [...list].sort((a, b) => heuristic(b.features) - heuristic(a.features));
    return {
      source: 'fallback',
      chosen: byScore[0],
      candidates: byScore,
      enumerated,
      sent: list.length,
      confidence: 0,
      read,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function cubeQuestion(
  kind: 'offer' | 'take',
  board: Board,
  color: Color,
  ctx: MatchContext,
): Promise<CubeDecision> {
  const isOffer = kind === 'offer';
  const request: SystemOneRequest = {
    model: JEV_MODEL,
    state: {
      rules: RULES_FOR_JEV,
      match: matchForJev(ctx),
      position: positionForJev(board, color),
      situation: isOffer
        ? "It is black's turn and black may offer the doubling cube before rolling."
        : `White has offered the doubling cube; accepting plays on for ${ctx.cube.value * 2} points, declining loses ${ctx.cube.value} point(s) now.`,
    },
    questions: {
      decision: {
        type: 'noul',
        instructions: isOffer
          ? 'Should black offer the doubling cube now?'
          : 'Should black accept (take) this double rather than resign the game?',
        criteria: isOffer
          ? {
              true: 'Black is ahead enough that doubling gains value: a real pip or structural lead, or white is in trouble. White should still have a reason to accept.',
              false: 'Black is behind, level, or so far ahead that white would simply decline; keep the cube where it is.',
            }
          : {
              true: 'Black still has a real chance, roughly one game in four or better, so playing on for double stakes is right.',
              false: 'Black is very likely to lose, possibly a gammon; giving up one point now is cheaper.',
            },
      },
    },
  };
  try {
    const call = await systemOne(request);
    const p = (call.response.answers.decision as NoulAnswer).noul;
    return { kind, probability: p, decision: p >= (isOffer ? DOUBLE_THRESHOLD : TAKE_THRESHOLD), call };
  } catch (e) {
    return { kind, probability: isOffer ? 0 : 1, decision: !isOffer, error: e instanceof Error ? e.message : String(e) };
  }
}

export const decideDouble = (board: Board, color: Color, ctx: MatchContext) => cubeQuestion('offer', board, color, ctx);
export const decideTake = (board: Board, color: Color, ctx: MatchContext) => cubeQuestion('take', board, color, ctx);
