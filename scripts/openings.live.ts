import { describe, it } from 'vitest';
import { initialBoard, pipCount } from '../src/engine/board';
import { notation } from '../src/engine/moves';
import { decideMove } from '../src/jev/player';
import { installFetchProxy, writeArtifact } from './harness';
import type { Dice } from '../src/engine/types';

installFetchProxy();

/**
 * The fifteen distinct opening rolls. Backgammon opening theory is settled by decades of
 * rollouts, so these are objective tests: `best` is the top rollout play, `ok` are plays
 * within a small equity margin that a strong player would not be criticised for.
 */
const OPENINGS: { dice: Dice; best: string[]; ok: string[]; note: string }[] = [
  { dice: [3, 1], best: ['8/5 6/5'], ok: [], note: 'make the 5-point; strongest opening in the game' },
  { dice: [6, 1], best: ['13/7 8/7'], ok: [], note: 'make the bar point' },
  { dice: [4, 2], best: ['8/4 6/4'], ok: [], note: 'make the 4-point' },
  { dice: [5, 3], best: ['8/3 6/3'], ok: ['13/8 13/10'], note: 'make the 3-point' },
  { dice: [6, 5], best: ['24/13'], ok: [], note: "lover's leap, run to safety" },
  { dice: [6, 4], best: ['24/18 13/9'], ok: ['8/2 6/2', '24/14'], note: 'split and build, or make the 2-point' },
  { dice: [6, 3], best: ['24/18 13/10'], ok: ['24/15'], note: 'split to the 18 and build' },
  { dice: [6, 2], best: ['24/18 13/11'], ok: ['13/5'], note: 'split, or run one checker to the 5-point' },
  { dice: [5, 4], best: ['24/20 13/8'], ok: ['13/8 13/9'], note: 'make the advanced anchor point' },
  { dice: [5, 2], best: ['13/8 13/11'], ok: ['24/22 13/8'], note: 'two down, or split' },
  { dice: [5, 1], best: ['24/23 13/8'], ok: ['13/8 6/5'], note: 'split the back checkers' },
  { dice: [4, 3], best: ['24/20 13/10'], ok: ['13/10 13/9', '24/21 13/9'], note: 'split or two builders' },
  { dice: [4, 1], best: ['24/23 13/9'], ok: ['13/9 6/5'], note: 'split, or slot the 5-point' },
  { dice: [3, 2], best: ['13/11 13/10'], ok: ['24/21 13/11'], note: 'two builders, or split' },
  { dice: [2, 1], best: ['24/23 13/11'], ok: ['13/11 6/5'], note: 'split, or slot the 5-point' },
];

const ctx = { cube: { value: 1, owner: null }, score: { white: 0, black: 0 }, matchTo: 5 } as const;

/** Compare two plays ignoring the order the checkers moved in. */
const same = (a: string, b: string) => a.split(' ').sort().join(' ') === b.split(' ').sort().join(' ');

describe('Jev opening-roll benchmark', () => {
  it('chooses textbook opening plays', async () => {
    const rows: Record<string, unknown>[] = [];
    for (const o of OPENINGS) {
      const board = initialBoard();
      const d = await decideMove(board, 'black', o.dice, { ...ctx, cube: { value: 1, owner: null } });
      const chosen = notation('black', d.chosen.play);
      const grade = o.best.some((p) => same(p, chosen))
        ? 'best'
        : o.ok.some((p) => same(p, chosen))
          ? 'ok'
          : 'error';
      const byHeuristic = [...d.candidates].sort((a, b) => b.heuristic - a.heuristic);
      const heuristicPick = notation('black', byHeuristic[0].play);
      rows.push({
        roll: `${o.dice[0]}-${o.dice[1]}`,
        chosen,
        grade,
        best: o.best[0],
        confidence: d.confidence,
        probability: d.chosen.probability,
        legalPlays: d.enumerated,
        sent: d.sent,
        latencyMs: d.call?.latencyMs ?? null,
        plan: d.read?.plan.choice ?? null,
        standing: d.read?.standing.score ?? null,
        heuristicPick,
        source: d.source,
        pipsAfter: pipCount(d.chosen.board, 'black'),
        note: o.note,
      });
      const mark = grade === 'best' ? 'BEST ' : grade === 'ok' ? 'ok   ' : 'ERROR';
      console.log(
        `${mark} ${o.dice[0]}-${o.dice[1]}  chose ${chosen.padEnd(14)} (best ${o.best[0].padEnd(14)})  ` +
          `p=${(d.chosen.probability * 100).toFixed(0)}% conf=${(d.confidence * 100).toFixed(0)}% ` +
          `plan=${d.plan?.choice ?? '-'} ${d.call?.latencyMs ?? 0}ms`,
      );
    }
    const counts = rows.reduce<Record<string, number>>((a, r) => {
      a[r.grade as string] = (a[r.grade as string] ?? 0) + 1;
      return a;
    }, {});
    console.log('SUMMARY', JSON.stringify(counts));
    console.log('artifact:', writeArtifact('openings.json', rows));
  });
});
