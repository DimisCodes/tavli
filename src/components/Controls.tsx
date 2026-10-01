import { AnimatePresence, motion } from 'framer-motion';
import { notation } from '../engine/moves';
import { canDouble, HUMAN, JEV, turnComplete, type GameState } from '../game/state';
import type { GameActions } from '../game/useGame';

function message(state: GameState): string {
  switch (state.phase) {
    case 'opening':
      return 'Roll one die each. Higher die starts and plays both.';
    case 'to_roll':
      if (state.turn === HUMAN) return canDouble(state, HUMAN) ? 'Your turn. Roll, or offer a double first.' : 'Your turn. Roll the dice.';
      return 'Jev is about to roll.';
    case 'moving':
      if (turnComplete(state)) return 'All dice played. End your turn when you are happy with it.';
      if (state.remaining.length === 1) return `One die left: ${state.remaining[0]}.`;
      return state.selected !== null ? 'Choose a destination point.' : `Move your checkers: ${state.remaining.join(' and ')}.`;
    case 'no_move':
      return state.turn === HUMAN ? 'You have no legal move. Passing.' : 'Jev has no legal move. Passing.';
    case 'jev_cube':
      return 'Jev is weighing the doubling cube.';
    case 'jev_thinking':
      return 'Jev is judging every legal play.';
    case 'jev_moving':
      return state.jev.move ? `Jev plays ${notation(JEV, state.jev.move.chosen.play)}` : 'Jev moves.';
    case 'human_doubled':
      return `You doubled to ${state.cube.value * 2}. Jev is deciding whether to take.`;
    case 'jev_doubled':
      return `Jev doubles to ${state.cube.value * 2}. Take and play on, or drop and concede ${state.cube.value}.`;
    case 'game_over':
      return state.result?.matchOver ? 'The match is decided.' : 'Game over.';
  }
}

interface Props {
  state: GameState;
  actions: GameActions;
  /** Opens the Jev panel as a sheet. Only rendered as a button on phone layouts (see CSS). */
  onToggleJev?: () => void;
}

export function Controls({ state, actions, onToggleJev }: Props) {
  const humanRoll = state.phase === 'to_roll' && state.turn === HUMAN;
  const moving = state.phase === 'moving' && state.turn === HUMAN;
  const busy =
    ['jev_cube', 'jev_thinking', 'jev_moving', 'human_doubled', 'no_move'].includes(state.phase) ||
    (state.phase === 'to_roll' && state.turn === JEV);

  return (
    <div className="controls">
      <div className="controls__status">
        <span className={`turn-dot turn-dot--${state.turn}${busy ? ' turn-dot--busy' : ''}`} />
        <AnimatePresence mode="wait">
          <motion.p
            key={message(state)}
            className="controls__message"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {message(state)}
          </motion.p>
        </AnimatePresence>
        {onToggleJev && (
          <button className="jev-toggle" onClick={onToggleJev} aria-label="Show Jev's analysis">
            <span className={`jev-toggle__dot jev-toggle__dot--${state.jev.status}`} />
            Jev
          </button>
        )}
      </div>

      <div className="controls__buttons">
        {state.phase === 'opening' && (
          <button className="btn btn--primary" onClick={actions.rollOpening}>
            Roll for the start
          </button>
        )}

        {humanRoll && (
          <>
            <button className="btn btn--primary" onClick={actions.roll}>
              Roll
            </button>
            {canDouble(state, HUMAN) && (
              <button className="btn btn--ghost" onClick={actions.offerDouble}>
                Double to {state.cube.value * 2}
              </button>
            )}
          </>
        )}

        {moving && (
          <>
            <button className="btn btn--ghost" onClick={actions.undo} disabled={state.history.length === 0}>
              Undo
            </button>
            <button
              className={`btn btn--primary${turnComplete(state) ? ' btn--pulse' : ''}`}
              onClick={actions.endTurn}
              disabled={!turnComplete(state)}
            >
              End turn
            </button>
          </>
        )}

        {state.phase === 'jev_doubled' && (
          <>
            <button className="btn btn--primary" onClick={actions.take}>
              Take
            </button>
            <button className="btn btn--danger" onClick={actions.drop}>
              Drop
            </button>
          </>
        )}

        {state.phase === 'game_over' && (
          <button className="btn btn--primary" onClick={actions.newGame}>
            {state.result?.matchOver ? 'New match' : 'Next game'}
          </button>
        )}

        {state.phase !== 'opening' && state.phase !== 'game_over' && (
          <button className="btn btn--text" onClick={actions.newMatch}>
            Restart match
          </button>
        )}
      </div>
    </div>
  );
}
