import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { From, Step, To } from '../engine/types';
import { decideDouble, decideMove, decideTake, type MatchContext } from '../jev/player';
import { canDouble, HUMAN, initialState, JEV, legalSteps, reducer, turnComplete } from './state';

const die = () => 1 + Math.floor(Math.random() * 6);

const JEV_STEP_MS = 620;
const JEV_ROLL_DELAY_MS = 700;
const NO_MOVE_MS = 1500;

export function useGame() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const ctx = useMemo<MatchContext>(
    () => ({ cube: state.cube, score: state.score, matchTo: state.matchTo }),
    [state.cube, state.score, state.matchTo],
  );

  // --- Jev's turn: cube decision, then roll -------------------------------------------------
  useEffect(() => {
    if (state.phase !== 'to_roll' || state.turn !== JEV) return;
    const gen = state.gen;
    if (canDouble(state, JEV) && !state.cubeChecked) {
      dispatch({ type: 'JEV_CUBE_START' });
      decideDouble(state.board, JEV, ctx).then((decision) => dispatch({ type: 'JEV_CUBE_RESULT', gen, decision }));
      return;
    }
    const t = setTimeout(() => dispatch({ type: 'ROLL', dice: [die(), die()] }), JEV_ROLL_DELAY_MS);
    return () => clearTimeout(t);
  }, [state.phase, state.turn, state.cubeChecked, state.gen]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Jev picks a play --------------------------------------------------------------------
  useEffect(() => {
    if (state.phase !== 'jev_thinking' || !state.dice) return;
    const gen = state.gen;
    const started = performance.now();
    decideMove(state.board, JEV, state.dice, ctx).then((decision) => {
      // Keep the "thinking" beat readable even when Jev answers in ~100ms.
      const wait = Math.max(0, 900 - (performance.now() - started));
      setTimeout(() => dispatch({ type: 'JEV_DECIDED', gen, decision }), wait);
    });
  }, [state.phase, state.gen]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Animate Jev's checkers one step at a time --------------------------------------------
  useEffect(() => {
    if (state.phase !== 'jev_moving') return;
    const pending = state.jev.pendingSteps.length;
    const t = setTimeout(
      () => dispatch({ type: pending > 0 ? 'JEV_STEP' : 'END_TURN' }),
      pending > 0 ? JEV_STEP_MS : JEV_STEP_MS + 200,
    );
    return () => clearTimeout(t);
  }, [state.phase, state.jev.pendingSteps.length]);

  // --- Nobody can move: pass automatically -------------------------------------------------
  useEffect(() => {
    if (state.phase !== 'no_move') return;
    const t = setTimeout(() => dispatch({ type: 'END_TURN' }), NO_MOVE_MS);
    return () => clearTimeout(t);
  }, [state.phase]);

  // --- Human doubled: Jev decides take/drop -----------------------------------------------
  useEffect(() => {
    if (state.phase !== 'human_doubled') return;
    const gen = state.gen;
    decideTake(state.board, JEV, ctx).then((decision) => dispatch({ type: 'JEV_TAKE_RESULT', gen, decision }));
  }, [state.phase, state.gen]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Human actions ------------------------------------------------------------------------
  const legal = useMemo(() => (state.turn === HUMAN ? legalSteps(state) : []), [state]);

  const rollOpening = useCallback(() => {
    let w = die();
    let b = die();
    while (w === b) {
      w = die();
      b = die();
    }
    dispatch({ type: 'OPENING_ROLL', white: w, black: b });
  }, []);

  const roll = useCallback(() => {
    const s = stateRef.current;
    if (s.phase === 'to_roll' && s.turn === HUMAN) dispatch({ type: 'ROLL', dice: [die(), die()] });
  }, []);

  const select = useCallback((from: From | null) => dispatch({ type: 'SELECT', from }), []);

  /** Click handling for a point, the bar, or the off tray. */
  const clickLocation = useCallback(
    (loc: From | To) => {
      const s = stateRef.current;
      if (s.phase !== 'moving' || s.turn !== HUMAN) return;
      const steps = legalSteps(s);
      const sources = new Set(steps.map((x) => x.from));
      if (s.selected !== null && loc !== s.selected) {
        const options = steps.filter((x) => x.from === s.selected && x.to === loc);
        if (options.length > 0) {
          const step: Step = options.reduce((a, b) => (a.die <= b.die ? a : b));
          dispatch({ type: 'MOVE', step });
          return;
        }
      }
      if (loc !== 'off' && sources.has(loc)) {
        dispatch({ type: 'SELECT', from: s.selected === loc ? null : loc });
      } else {
        dispatch({ type: 'SELECT', from: null });
      }
    },
    [],
  );

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const endTurn = useCallback(() => {
    if (turnComplete(stateRef.current)) dispatch({ type: 'END_TURN' });
  }, []);
  const offerDouble = useCallback(() => dispatch({ type: 'HUMAN_DOUBLE' }), []);
  const take = useCallback(() => dispatch({ type: 'HUMAN_TAKE' }), []);
  const drop = useCallback(() => dispatch({ type: 'HUMAN_DROP' }), []);
  const newGame = useCallback(() => dispatch({ type: 'NEW_GAME' }), []);
  const newMatch = useCallback(() => dispatch({ type: 'NEW_MATCH' }), []);

  return {
    state,
    legal,
    actions: { rollOpening, roll, select, clickLocation, undo, endTurn, offerDouble, take, drop, newGame, newMatch },
  };
}

export type GameActions = ReturnType<typeof useGame>['actions'];
