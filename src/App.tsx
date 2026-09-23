import { useState } from 'react';
import { Board } from './components/Board';
import { Controls } from './components/Controls';
import { JevPanel } from './components/JevPanel';
import { Inspector } from './components/Inspector';
import { Scoreboard } from './components/Scoreboard';
import { useGame } from './game/useGame';
import { JEV_MODEL } from './jev/client';

export default function App() {
  const { state, legal, actions } = useGame();
  const [inspecting, setInspecting] = useState(false);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__title">Tavli</span>
          <span className="brand__vs">vs</span>
          <span className="brand__jev">Jev</span>
        </div>
        <Scoreboard state={state} />
        <a className="model-badge" href="https://openrouter.ai/~typesafe/jev-latest" target="_blank" rel="noreferrer">
          <span className="model-badge__dot" />
          <span className="mono">{JEV_MODEL}</span>
          <span className="model-badge__via">via OpenRouter</span>
        </a>
      </header>

      <main className="stage">
        <section className="table-col">
          <Board state={state} legal={legal} onClickLocation={actions.clickLocation} actions={actions} />
        </section>
        {/* Controls sit beside the board rather than under it. The board is width-limited on a
            typical screen, so a full-width row below it costs vertical space for nothing. */}
        <div className="side-col">
          <Controls state={state} actions={actions} />
          <JevPanel state={state} onInspect={() => setInspecting(true)} />
        </div>
      </main>

      {inspecting && <Inspector state={state} onClose={() => setInspecting(false)} />}
    </div>
  );
}
