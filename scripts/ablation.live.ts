import { describe, it } from 'vitest';
import { indexFromPoint, initialBoard } from '../src/engine/board';
import { notation } from '../src/engine/moves';
import { priceCandidates, shortlist } from '../src/jev/player';
import { JEV_MODEL, systemOne, type ChoiceAnswer, type Structured } from '../src/jev/client';
import type { Board, Dice } from '../src/engine/types';
import { installFetchProxy, writeArtifact } from './harness';

installFetchProxy();

/**
 * Attribution experiment. The opening benchmark measures the whole system (features +
 * instructions + Jev). These variants change exactly one thing at a time so we can tell
 * whether the errors come from how we ask or from Jev's judgement.
 */

const OPENINGS: { dice: Dice; best: string[]; ok: string[] }[] = [
  { dice: [3, 1], best: ['8/5 6/5'], ok: [] },
  { dice: [6, 1], best: ['13/7 8/7'], ok: [] },
  { dice: [4, 2], best: ['8/4 6/4'], ok: [] },
  { dice: [5, 3], best: ['8/3 6/3'], ok: ['13/8 13/10'] },
  { dice: [6, 5], best: ['24/13'], ok: [] },
  { dice: [6, 4], best: ['24/18 13/9'], ok: ['8/2 6/2', '24/14'] },
  { dice: [6, 3], best: ['24/18 13/10'], ok: ['24/15'] },
  { dice: [6, 2], best: ['24/18 13/11'], ok: ['13/5'] },
  { dice: [5, 4], best: ['24/20 13/8'], ok: ['13/8 13/9'] },
  { dice: [5, 2], best: ['13/8 13/11'], ok: ['24/22 13/8'] },
  { dice: [5, 1], best: ['24/23 13/8'], ok: ['13/8 6/5'] },
  { dice: [4, 3], best: ['24/20 13/10'], ok: ['13/10 13/9', '24/21 13/9'] },
  { dice: [4, 1], best: ['24/23 13/9'], ok: ['13/9 6/5'] },
  { dice: [3, 2], best: ['13/11 13/10'], ok: ['24/21 13/11'] },
  { dice: [2, 1], best: ['24/23 13/11'], ok: ['13/11 6/5'] },
];

const same = (a: string, b: string) => a.split(' ').sort().join(' ') === b.split(' ').sort().join(' ');

const RULES: Structured = {
  game: 'Backgammon, standard rules, opening position.',
  you_play: 'black',
  numbering:
    "Points are numbered from black's perspective: black moves from 24 down toward 1 and bears off from 1-6. Black's two back checkers start on the 24-point inside white's home board.",
  notation: "'13/8' moves a checker from point 13 to point 8. '(2)' means two checkers made the same move.",
};

/** A: the instructions currently shipped in src/jev/player.ts — safety-first framing. */
const INSTRUCTIONS_A: Structured = {
  question: 'Which candidate play is the strongest for black with this roll?',
  how_to_judge: [
    'Every candidate is legal and already fully described in `candidate_plays`; compare their facts.',
    'Safety first when white can hit: fewer blots and fewer opponent_hitting_rolls_of_36 unless a hit or a new key point clearly pays for the risk.',
    'Hitting white blots gains tempo, especially when black holds several home-board points.',
    'Making home-board points and extending a prime blocks white and is very valuable.',
    'In a no-contact race, only pip_count_after and safe bearing off matter.',
    'When bearing off, take checkers off and avoid leaving a blot within reach of white checkers.',
  ],
};

/** B: balanced framing. Same facts, no safety-first ranking, standard strategy instead. */
const INSTRUCTIONS_B: Structured = {
  question: 'Which candidate play gives black the best winning chances with this roll?',
  how_to_judge: [
    'Every candidate is legal and already fully described in `candidate_plays`; compare their facts.',
    'Judge the whole position, not one number. Pip count alone does not decide a play while contact remains.',
    'Making valuable points (the 5-point, 4-point and bar point) and building a prime is worth more than saving a few pips.',
    'Placing spare checkers where they bear on points black still wants to make is valuable, even when that leaves a checker exposed.',
    'A checker that can be hit is only a real cost when the opponent gains by hitting it; weigh opponent_hitting_rolls_of_36 against what the play achieves.',
    'Moving the back checkers out of the opponent home board, or splitting them to fight for an anchor, matters early.',
    'Stacking many checkers on one point wastes them.',
    'In a no-contact race, only pip_count_after and safe bearing off matter.',
  ],
};

/** Extra descriptive facts an opening decision needs and the shipped feature set omits. */
function extraFeatures(after: Board) {
  const at = (p: number) => after.points[indexFromPoint('black', p)];
  const mine = (p: number) => {
    const s = at(p);
    return s && s.color === 'black' ? s.count : 0;
  };
  const backPoints = [19, 20, 21, 22, 23, 24].filter((p) => mine(p) > 0);
  let builders = 0;
  for (let p = 7; p <= 13; p++) builders += mine(p);
  const wants = [7, 5, 4].filter((p) => mine(p) < 2);
  let stacked = 0;
  for (let p = 1; p <= 24; p++) stacked = Math.max(stacked, mine(p));
  return {
    back_checkers_points: backPoints,
    back_checkers_split: backPoints.length > 1,
    spare_builders_in_outfield: builders,
    key_points_still_unmade: wants,
    biggest_stack: stacked,
  };
}

type Variant = 'A' | 'B' | 'C';

async function runVariant(v: Variant) {
  const rows: Record<string, unknown>[] = [];
  for (const o of OPENINGS) {
    const board = initialBoard();
    const { priced } = priceCandidates(board, 'black', o.dice);
    const sent = shortlist(priced, 1.6);
    const criteria: Record<string, Structured> = {};
    for (const c of sent) {
      criteria[c.id] = v === 'C' ? { ...c.features, ...extraFeatures(c.board) } : { ...c.features };
    }
    const call = await systemOne({
      model: JEV_MODEL,
      state: { rules: RULES, dice: o.dice, opening_position: 'standard starting position', candidate_plays: criteria },
      questions: {
        best_play: {
          type: 'choice',
          instructions: v === 'A' ? INSTRUCTIONS_A : INSTRUCTIONS_B,
          criteria,
        },
      },
    });
    const ans = call.response.answers.best_play as ChoiceAnswer;
    const picked = sent.find((c) => c.id === ans.choice) ?? sent[0];
    const chosen = notation('black', picked.play);
    const grade = o.best.some((p) => same(p, chosen)) ? 'best' : o.ok.some((p) => same(p, chosen)) ? 'ok' : 'error';
    rows.push({
      variant: v,
      roll: `${o.dice[0]}-${o.dice[1]}`,
      chosen,
      best: o.best[0],
      grade,
      confidence: ans.confidence,
      probability: ans.probabilities[ans.choice],
      latencyMs: call.latencyMs,
      cost: call.response.usage.cost ?? 0,
    });
    console.log(`${v} ${o.dice[0]}-${o.dice[1]} ${grade.padEnd(5)} ${chosen.padEnd(16)} best=${o.best[0]}`);
  }
  return rows;
}

describe('instruction and feature ablation', () => {
  it('measures variant A (shipped), B (balanced wording), C (balanced + opening facts)', async () => {
    const all: Record<string, unknown>[] = [];
    for (const v of ['A', 'B', 'C'] as Variant[]) {
      const rows = await runVariant(v);
      all.push(...rows);
      const counts = rows.reduce<Record<string, number>>((a, r) => {
        a[r.grade as string] = (a[r.grade as string] ?? 0) + 1;
        return a;
      }, {});
      console.log(`VARIANT ${v}`, JSON.stringify(counts));
    }
    console.log('artifact:', writeArtifact('ablation.json', all));
  });
});
