import { describe, it } from 'vitest';
import { initialBoard, isHomeIndex, opponent, pipCount } from '../src/engine/board';
import { enumeratePlays, notation, planTurn } from '../src/engine/moves';
import { describePlay, heuristic } from '../src/engine/features';
import { decideDouble, decideMove, decideTake, type MatchContext } from '../src/jev/player';
import type { Board, Color, Dice } from '../src/engine/types';
import { installFetchProxy, openingRoll, roll, writeArtifact } from './harness';

installFetchProxy();

const JEV: Color = 'black';
const REF: Color = 'white';

/** Reference opponent: the deterministic linear evaluation from src/engine/features.ts. */
function referencePlay(board: Board, dice: Dice) {
  const cands = enumeratePlays(board, REF, dice);
  if (cands.length === 0) return null;
  return cands
    .map((c) => ({ ...c, score: heuristic(describePlay(c.board, REF, c.play)) }))
    .sort((a, b) => b.score - a.score)[0];
}

type Kind = 'single' | 'gammon' | 'backgammon' | 'dropped';

function winKind(board: Board, winner: Color): Kind {
  const loser = opponent(winner);
  if (board.off[loser] > 0) return 'single';
  const stuck = board.bar[loser] > 0 || board.points.some((p, i) => p && p.color === loser && isHomeIndex(winner, i));
  return stuck ? 'backgammon' : 'gammon';
}

/** A declined double is worth exactly the cube value, never a gammon multiple. */
function points(kind: Kind, cube: number): number {
  if (kind === 'dropped') return cube;
  return cube * (kind === 'gammon' ? 2 : kind === 'backgammon' ? 3 : 1);
}

interface GameOptions {
  /** Let the reference opponent double when far enough ahead, to exercise Jev's take decision. */
  refMayDouble: boolean;
}

async function playGame(gameNo: number, opts: GameOptions) {
  let board = initialBoard();
  const ctx: MatchContext = { cube: { value: 1, owner: null }, score: { white: 0, black: 0 }, matchTo: 5 };
  const turns: Record<string, unknown>[] = [];
  const cubeEvents: Record<string, unknown>[] = [];

  const opening = openingRoll();
  let turn: Color = opening[0] > opening[1] ? REF : JEV;
  let dice: Dice | null = opening;
  let refDoubled = false;
  let n = 0;
  let winner: Color | null = null;
  let kind: Kind | null = null;

  while (n < 500) {
    n++;
    if (turn === JEV) {
      if (dice === null && (ctx.cube.owner === null || ctx.cube.owner === JEV) && ctx.cube.value < 64) {
        const cd = await decideDouble(board, JEV, ctx);
        cubeEvents.push({
          game: gameNo,
          turn: n,
          kind: 'offer',
          probability: cd.probability,
          decision: cd.decision,
          jevPips: pipCount(board, JEV),
          refPips: pipCount(board, REF),
          jevOff: board.off[JEV],
          refOff: board.off[REF],
        });
        if (cd.decision) {
          const deficit = pipCount(board, REF) - pipCount(board, JEV);
          const take = deficit < 60;
          if (!take) {
            winner = JEV;
            kind = 'dropped';
            break;
          }
          ctx.cube = { value: ctx.cube.value * 2, owner: REF };
        }
      }
      const d: Dice = dice ?? roll();
      dice = null;
      const plan = planTurn(board, JEV, d);
      if (plan.total === 0) {
        turns.push({ game: gameNo, turn: n, who: 'jev', dice: d, play: 'no move', danced: board.bar[JEV] > 0 });
      } else {
        const dec = await decideMove(board, JEV, d, ctx);
        const byHeuristic = [...dec.candidates].sort((a, b) => b.heuristic - a.heuristic);
        turns.push({
          game: gameNo,
          turn: n,
          who: 'jev',
          dice: d,
          play: notation(JEV, dec.chosen.play),
          source: dec.source,
          probability: dec.chosen.probability,
          confidence: dec.confidence,
          legalPlays: dec.enumerated,
          sent: dec.sent,
          latencyMs: (dec.call?.latencyMs ?? 0) + (dec.read?.call.latencyMs ?? 0),
          cost: (dec.call?.response.usage.cost ?? 0) + (dec.read?.call.response.usage.cost ?? 0),
          inputTokens: (dec.call?.response.usage.input_tokens ?? 0) + (dec.read?.call.response.usage.input_tokens ?? 0),
          plan: dec.read?.plan.choice ?? null,
          standing: dec.read?.standing.score ?? null,
          riskAppetite: dec.read?.risk.score ?? null,
          riskWeight: dec.read?.riskWeight ?? null,
          threat: dec.read?.threat.score ?? null,
          heuristicRank: byHeuristic.findIndex((c) => c.id === dec.chosen.id),
          chosenId: dec.chosen.id,
          jevPipsBefore: pipCount(board, JEV),
          refPipsBefore: pipCount(board, REF),
          // Full candidate set so move quality can be re-analysed offline without new API calls.
          candidates: dec.candidates
            .filter((c) => !c.id.startsWith('–'))
            .map((c) => ({
              id: c.id,
              play: notation(JEV, c.play),
              probability: c.probability,
              pips: c.features.pip_count_after,
              shots: c.features.chance_of_being_hit_percent,
              eloss: c.features.expected_pip_loss_if_hit,
              blots: c.features.own_blots_after,
              hits: c.features.hits_opponent_blots,
              homePoints: c.features.home_board_points,
              prime: c.features.longest_prime,
              off: c.features.borne_off_after,
              race: c.features.no_contact_race,
              anchors: c.features.anchors_in_opponent_home,
            })),
        });
        board = dec.chosen.board;
      }
      if (board.off[JEV] === 15) {
        winner = JEV;
        kind = winKind(board, JEV);
        break;
      }
      turn = REF;
    } else {
      if (opts.refMayDouble && dice === null && !refDoubled && (ctx.cube.owner === null || ctx.cube.owner === REF)) {
        const lead = pipCount(board, JEV) - pipCount(board, REF);
        if (lead >= 25) {
          refDoubled = true;
          const cd = await decideTake(board, JEV, ctx);
          cubeEvents.push({
            game: gameNo,
            turn: n,
            kind: 'take',
            probability: cd.probability,
            decision: cd.decision,
            jevPips: pipCount(board, JEV),
            refPips: pipCount(board, REF),
            jevOff: board.off[JEV],
            refOff: board.off[REF],
          });
          if (!cd.decision) {
            winner = REF;
            kind = 'dropped';
            break;
          }
          ctx.cube = { value: ctx.cube.value * 2, owner: JEV };
        }
      }
      const d: Dice = dice ?? roll();
      dice = null;
      const best = referencePlay(board, d);
      if (!best) {
        turns.push({ game: gameNo, turn: n, who: 'ref', dice: d, play: 'no move' });
      } else {
        turns.push({ game: gameNo, turn: n, who: 'ref', dice: d, play: notation(REF, best.play) });
        board = best.board;
      }
      if (board.off[REF] === 15) {
        winner = REF;
        kind = winKind(board, REF);
        break;
      }
      turn = JEV;
    }
  }

  const jevTurns = turns.filter((t) => t.who === 'jev' && (t.source === 'jev' || t.source === 'gated'));
  const summary = {
    game: gameNo,
    winner,
    kind,
    cubeValue: ctx.cube.value,
    points: kind ? points(kind, ctx.cube.value) : 0,
    halfTurns: n,
    jevDecisions: jevTurns.length,
    jevDances: turns.filter((t) => t.who === 'jev' && t.danced).length,
    bySource: turns.filter((t) => t.who === 'jev' && t.source).reduce<Record<string, number>>((a, t) => {
      a[t.source as string] = (a[t.source as string] ?? 0) + 1;
      return a;
    }, {}),
    jevOff: board.off[JEV],
    refOff: board.off[REF],
    jevFinalPips: pipCount(board, JEV),
    refFinalPips: pipCount(board, REF),
    cost: jevTurns.reduce((a, t) => a + ((t.cost as number) ?? 0), 0),
    avgLatency: jevTurns.reduce((a, t) => a + ((t.latencyMs as number) ?? 0), 0) / (jevTurns.length || 1),
  };
  console.log(`game ${gameNo}: ${JSON.stringify(summary)}`);
  return { summary, turns, cubeEvents };
}

describe('full games against Jev', () => {
  it('plays two games to a finish and records every candidate Jev saw', async () => {
    const games = [];
    for (let i = 1; i <= 4; i++) games.push(await playGame(i, { refMayDouble: false }));
    console.log('artifact:', writeArtifact('games.json', games));
  });
});
