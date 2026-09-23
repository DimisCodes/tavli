import type { GameState } from '../game/state';

export function Scoreboard({ state }: { state: GameState }) {
  return (
    <div className="scoreboard" aria-label="Match score">
      <div className="scoreboard__side scoreboard__side--human">
        <span className="scoreboard__name">You</span>
        <span className="scoreboard__pts">{state.score.white}</span>
      </div>
      <div className="scoreboard__mid">
        <span>Match to {state.matchTo}</span>
        <span className="scoreboard__sep">·</span>
        <span>Game {state.gameNumber}</span>
      </div>
      <div className="scoreboard__side scoreboard__side--jev">
        <span className="scoreboard__pts">{state.score.black}</span>
        <span className="scoreboard__name">Jev</span>
      </div>
    </div>
  );
}
