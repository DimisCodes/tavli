import fs from 'node:fs';
import { describe, it } from 'vitest';
import { initialBoard } from '../src/engine/board';
import { notation } from '../src/engine/moves';
import { priceCandidates, shortlist } from '../src/jev/player';
import type { Dice } from '../src/engine/types';

/** Offline: print exactly the facts Jev is shown for a few openings it gets wrong. */
describe('feature diagnostic', () => {
  it('dumps candidate facts for the problem openings', () => {
    const out: string[] = [];
    const log = (s: string) => out.push(s);
    for (const dice of [[6, 5], [2, 1], [5, 1]] as Dice[]) {
      const { priced } = priceCandidates(initialBoard(), 'black', dice);
      const list = shortlist(priced, 1.6);
      log(`=== opening ${dice[0]}-${dice[1]} ===`);
      for (const c of list.sort((a, b) => b.score - a.score)) {
        const f = c.features;
        log(
          `${notation('black', c.play).padEnd(15)} score=${c.score.toFixed(1).padStart(7)} ` +
            `pips=${f.pip_count_after} blots=${f.own_blots_after} hit%=${f.chance_of_being_hit_percent} ` +
            `Eloss=${f.expected_pip_loss_if_hit} worst=${f.worst_case_pip_loss_if_hit} ` +
            `oppHome=${f.opponent_home_board_points} back=${f.checkers_still_in_opponent_home} ` +
            `split=${f.back_checkers_split} builders=${f.builders_bearing_on_unmade_points} ` +
            `homePts=${f.home_board_points} stack=${f.biggest_stack} [${c.reason}]`,
        );
      }
    }
    fs.writeFileSync('reports/inspect.txt', out.join('\n'));
  });
});
