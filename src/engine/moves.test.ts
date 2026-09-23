import { describe, expect, it } from 'vitest';
import { initialBoard, pipCount } from './board';
import type { Board } from './types';
import { enumeratePlays, hittingRolls, legalNextSteps, notation, planTurn } from './moves';

const empty = (): Board => ({
  points: Array(24).fill(null),
  bar: { white: 0, black: 0 },
  off: { white: 0, black: 0 },
});

describe('backgammon engine', () => {
  it('starts at 167 pips each', () => {
    const b = initialBoard();
    expect(pipCount(b, 'white')).toBe(167);
    expect(pipCount(b, 'black')).toBe(167);
  });

  it('finds the classic 3-1 point-making play for white', () => {
    const plays = enumeratePlays(initialBoard(), 'white', [3, 1]);
    const names = plays.map((c) => notation('white', c.play));
    expect(names).toContain('8/5 6/5');
    expect(plays.length).toBeGreaterThan(5);
  });

  it('plays all four dice on doubles when possible', () => {
    const plays = enumeratePlays(initialBoard(), 'black', [6, 6]);
    expect(plays.every((c) => c.play.length === 4)).toBe(true);
    expect(plays.map((c) => notation('black', c.play))).toContain('24/18(2) 13/7(2)');
  });

  it('forces the larger die when only one die can be played', () => {
    const b = empty();
    // White: one checker on point 24 (idx 23), fourteen on point 6 (idx 5).
    b.points[23] = { color: 'white', count: 1 };
    b.points[5] = { color: 'white', count: 14 };
    // Black blocks idx 22 (1 away from idx 23), idx 17 (6 away), idx 4 (1 away from idx 5), idx 0 (5 away).
    b.points[22] = { color: 'black', count: 2 };
    b.points[17] = { color: 'black', count: 2 };
    b.points[4] = { color: 'black', count: 2 };
    b.points[0] = { color: 'black', count: 9 };
    // Dice 5-1: only the 5 can be played (idx 23 -> 18), after which the 1 is blocked everywhere.
    const plan = planTurn(b, 'white', [5, 1]);
    expect(plan.total).toBe(1);
    expect(plan.forcedDie).toBe(5);
    const steps = legalNextSteps(b, 'white', plan.dice, 0, plan);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((s) => s.die === 5)).toBe(true);
  });

  it('bears off with a higher die only from the highest occupied point', () => {
    const b = empty();
    b.points[3] = { color: 'white', count: 1 }; // point 4
    b.points[0] = { color: 'white', count: 2 }; // point 1
    b.off.white = 12;
    b.points[20] = { color: 'black', count: 15 };
    const plays = enumeratePlays(b, 'white', [6, 6]);
    const names = plays.map((c) => notation('white', c.play));
    expect(names).toContain('4/off 1/off(2)');
    expect(plays[0].play.length).toBe(3);
  });

  it('must enter from the bar before moving anything else', () => {
    const b = initialBoard();
    b.bar.white = 1;
    b.points[23] = { color: 'white', count: 1 };
    const plan = planTurn(b, 'white', [6, 2]);
    const first = legalNextSteps(b, 'white', plan.dice, 0, plan);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((s) => s.from === 'bar')).toBe(true);
  });

  it('writes one checker moving twice as a single move', () => {
    // Black plays 6-5 from the start: 24/18 then 18/13 is one checker, written 24/13.
    const plays = enumeratePlays(initialBoard(), 'black', [6, 5]);
    const names = plays.map((c) => notation('black', c.play));
    expect(names).toContain('24/13');
    expect(names).not.toContain('24/18 18/13');
    // Two separate checkers landing on the same point must stay separate.
    const threeOne = enumeratePlays(initialBoard(), 'black', [3, 1]).map((c) => notation('black', c.play));
    expect(threeOne).toContain('8/5 6/5');
  });

  it('counts hitting rolls for a blot 6 away from a single enemy checker', () => {
    const b = empty();
    b.points[10] = { color: 'white', count: 1 }; // white blot
    b.points[4] = { color: 'black', count: 1 }; // black checker 6 pips behind it
    b.points[0] = { color: 'black', count: 14 };
    b.points[23] = { color: 'white', count: 14 };
    // From idx 4: any 6 (11) + 5-1, 4-2 (2 each) + 3-3, 2-2 (1 each) = 17; from idx 0: 5-5 = 1. Total 18
    expect(hittingRolls(b, 'white')).toBe(18);
  });
});
