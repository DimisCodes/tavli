import { useState } from 'react';
import { Board } from './components/Board';
import { Controls } from './components/Controls';
import { JevPanel } from './components/JevPanel';
import { Inspector } from './components/Inspector';
import { RotatePrompt } from './components/RotatePrompt';
import { Scoreboard } from './components/Scoreboard';
import { useGame } from './game/useGame';
import { JEV_MODEL } from './jev/client';

export default function App() {
  const { state, legal, actions } = useGame();
  const [inspecting, setInspecting] = useState(false);
  // On phones the Jev panel is a sheet that slides up over the board; on wider screens it is a
  // column beside it and this state has no visible effect.
  const [sheetOpen, setSheetOpen] = useState(false);
  // The board wants landscape. Upright phones are asked to turn until they say otherwise;
  // a phone locked to portrait has to be able to get past this.
  const [upright, setUpright] = useState(false);

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
        <div className={`side-col${sheetOpen ? ' side-col--open' : ''}`}>
          <Controls state={state} actions={actions} onToggleJev={() => setSheetOpen((o) => !o)} />
          <JevPanel state={state} onInspect={() => setInspecting(true)} onClose={() => setSheetOpen(false)} />
        </div>
        {sheetOpen && <div className="sheet-backdrop" onClick={() => setSheetOpen(false)} aria-hidden="true" />}
      </main>

      {inspecting && <Inspector state={state} onClose={() => setInspecting(false)} />}
      {!upright && <RotatePrompt onDismiss={() => setUpright(true)} />}
    </div>
  );
}
