import { LayoutGroup, AnimatePresence, motion } from 'framer-motion';
import type { CSSProperties } from 'react';
import type { Color, From, Step, To } from '../engine/types';
import { HUMAN, JEV, type GameState } from '../game/state';
import type { GameActions } from '../game/useGame';
import { PORTRAIT_PHONE, useMediaQuery } from '../game/useMediaQuery';
import { Checker } from './Checker';
import { Die } from './Dice';
import { Cube } from './Cube';

interface Props {
  state: GameState;
  legal: Step[];
  onClickLocation: (loc: From | To) => void;
  actions: GameActions;
}

const TOP_LEFT = [12, 13, 14, 15, 16, 17];
const TOP_RIGHT = [18, 19, 20, 21, 22, 23];
const BOTTOM_LEFT = [11, 10, 9, 8, 7, 6];
const BOTTOM_RIGHT = [5, 4, 3, 2, 1, 0];

/** Overlap is expressed as a CSS variable so the stylesheet can decide which axis it applies to. */
const overlapStyle = (o: number): CSSProperties | undefined =>
  o > 0 ? ({ ['--o' as string]: o } as CSSProperties) : undefined;

function Stack({ ids, color, top, capacity }: { ids: string[]; color: Color; top: boolean; capacity: number }) {
  const n = ids.length;
  const overlap = n > capacity ? (n - capacity) / (n - 1) : 0;
  return (
    <div className={`point__stack${top ? ' point__stack--top' : ''}`}>
      {ids.map((id, i) => (
        <Checker
          key={id}
          id={id}
          color={color}
          style={i > 0 ? overlapStyle(overlap) : undefined}
          badge={i === n - 1 && n > capacity ? n : undefined}
        />
      ))}
    </div>
  );
}

export function Board({ state, legal, onClickLocation }: Props) {
  // In the vertical layout checkers stack along the point's width, which fits one fewer.
  const vertical = useMediaQuery(PORTRAIT_PHONE);
  const capacity = vertical ? 4 : 5;

  const humanTurn = state.phase === 'moving' && state.turn === HUMAN;
  const sources = new Set<From>(humanTurn ? legal.map((s) => s.from) : []);
  const targets = new Set<To>(
    humanTurn && state.selected !== null ? legal.filter((s) => s.from === state.selected).map((s) => s.to) : [],
  );

  const renderPoint = (idx: number, top: boolean) => {
    const stack = state.stacks[`p${idx}`] ?? [];
    const color = state.board.points[idx]?.color;
    const cls = [
      'point',
      top ? 'point--top' : 'point--bottom',
      idx % 2 === (top ? 1 : 0) ? 'point--alt' : '',
      sources.has(idx) ? 'point--source' : '',
      state.selected === idx ? 'point--selected' : '',
      targets.has(idx) ? 'point--target' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <div key={idx} className={cls} onClick={() => onClickLocation(idx)} role="button" aria-label={`point ${idx + 1}`}>
        <div className="point__tri" />
        {color && <Stack ids={stack} color={color} top={top} capacity={capacity} />}
        <span className="point__num">{idx + 1}</span>
        {targets.has(idx) && <span className="point__hint" />}
      </div>
    );
  };

  const barWhite = state.stacks['bar-white'] ?? [];
  const barBlack = state.stacks['bar-black'] ?? [];
  const offWhite = state.stacks['off-white'] ?? [];
  const offBlack = state.stacks['off-black'] ?? [];

  const mover = state.turn;
  const rollKey = `${state.gameNumber}-${state.log.length}-${state.dice?.join('')}`;
  const showOpening = state.phase === 'opening' && state.openingRoll === null;
  const dice = state.dice;
  const usedFlags: boolean[] = (() => {
    if (!dice) return [];
    const all = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];
    const remaining = [...state.remaining];
    return all.map((d) => {
      const i = remaining.indexOf(d);
      if (i >= 0) {
        remaining.splice(i, 1);
        return false;
      }
      return true;
    });
  })();
  const isOpeningTurn =
    state.openingRoll !== null &&
    state.log.length <= 2 &&
    state.dice !== null &&
    state.dice[0] === state.openingRoll.white &&
    state.dice[1] === state.openingRoll.black &&
    state.steps.length === 0 &&
    state.phase !== 'to_roll';

  return (
    <LayoutGroup>
      <div className={`board board--${mover}-turn${vertical ? ' board--vertical' : ''}`}>
        <div className="board__frame">
          <div className="board__field">
            <div className="quadrant quadrant--tl">{TOP_LEFT.map((i) => renderPoint(i, true))}</div>
            <div
              className={`bar${sources.has('bar') ? ' bar--source' : ''}${state.selected === 'bar' ? ' bar--selected' : ''}`}
              onClick={() => onClickLocation('bar')}
              role="button"
              aria-label="bar"
            >
              <div className="bar__half bar__half--top">
                {barBlack.map((id, i) => (
                  <Checker key={id} id={id} color={JEV} style={i > 0 ? overlapStyle(0.55) : undefined} />
                ))}
              </div>
              <Cube cube={state.cube} />
              <div className="bar__half bar__half--bottom">
                {barWhite.map((id, i) => (
                  <Checker key={id} id={id} color={HUMAN} style={i > 0 ? overlapStyle(0.55) : undefined} />
                ))}
              </div>
            </div>
            <div className="quadrant quadrant--tr">{TOP_RIGHT.map((i) => renderPoint(i, true))}</div>
            <div className="quadrant quadrant--bl">{BOTTOM_LEFT.map((i) => renderPoint(i, false))}</div>
            <div className="quadrant quadrant--br">{BOTTOM_RIGHT.map((i) => renderPoint(i, false))}</div>

            <div className={`board__dice board__dice--${isOpeningTurn ? 'opening' : mover}`}>
              {dice &&
                !showOpening &&
                (isOpeningTurn ? (
                  <>
                    <div className="board__dice-side board__dice-side--left">
                      <Die value={dice[0]} color={HUMAN} rollKey={rollKey + 'w'} used={usedFlags[0]} />
                    </div>
                    <div className="board__dice-side board__dice-side--right">
                      <Die value={dice[1]} color={JEV} rollKey={rollKey + 'b'} used={usedFlags[1]} delay={0.08} />
                    </div>
                  </>
                ) : (
                  <div className="board__dice-pair">
                    <Die value={dice[0]} color={mover} rollKey={rollKey + 'a'} used={usedFlags[0]} />
                    <Die value={dice[1]} color={mover} rollKey={rollKey + 'b'} used={usedFlags[1]} delay={0.07} />
                  </div>
                ))}
            </div>
          </div>

          <div className="tray">
            <div className="tray__half tray__half--top" aria-label="Jev borne off">
              {offBlack.map((id) => (
                <Checker key={id} id={id} color={JEV} flat />
              ))}
              {offBlack.length > 0 && <span className="tray__count">{offBlack.length}</span>}
            </div>
            <div
              className={`tray__half tray__half--bottom${targets.has('off') ? ' tray__half--target' : ''}`}
              onClick={() => onClickLocation('off')}
              role="button"
              aria-label="bear off"
            >
              {offWhite.length > 0 && <span className="tray__count">{offWhite.length}</span>}
              {offWhite.map((id) => (
                <Checker key={id} id={id} color={HUMAN} flat />
              ))}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {state.phase === 'game_over' && state.result && (
            <motion.div className="board__overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div
                className={`result result--${state.result.winner}`}
                initial={{ y: 18, scale: 0.96, opacity: 0 }}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 240, damping: 22, delay: 0.1 }}
              >
                <span className="result__eyebrow">{state.result.matchOver ? 'Match over' : `Game ${state.gameNumber}`}</span>
                <h2 className="result__title">
                  {state.result.winner === HUMAN ? 'You win' : 'Jev wins'}
                  {state.result.kind !== 'single' && state.result.kind !== 'dropped' ? ` a ${state.result.kind}` : ''}
                </h2>
                <p className="result__points">
                  +{state.result.points} point{state.result.points === 1 ? '' : 's'}
                  {state.result.kind === 'dropped' ? ' · double declined' : ''}
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}
