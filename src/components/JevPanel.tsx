import { AnimatePresence, motion } from 'framer-motion';
import { notation } from '../engine/moves';
import { JEV, type GameState } from '../game/state';
import { GAME_PLANS, type RankedCandidate, type ScoreRead } from '../jev/player';

const pct = (p: number) => `${Math.round(p * 100)}%`;
const money = (c: number) => (c < 0.01 ? `$${c.toFixed(5)}` : `$${c.toFixed(3)}`);

function ConfidenceRing({ value, label }: { value: number; label: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" title={`${label}: ${pct(value)}`}>
      <svg viewBox="0 0 56 56" width="56" height="56">
        <circle cx="28" cy="28" r={r} className="ring__track" />
        <motion.circle
          cx="28"
          cy="28"
          r={r}
          className="ring__fill"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </svg>
      <span className="ring__value">{Math.round(value * 100)}</span>
      <span className="ring__label">{label}</span>
    </div>
  );
}

function ScoreMeter({ read, low, high }: { read: ScoreRead; low: string; high: string }) {
  const n = read.levels.length;
  const pos = (read.score / (n - 1)) * 100;
  return (
    <div className="meter">
      <div className="meter__track">
        {read.levels.map((l, i) => (
          <span key={l} className="meter__seg" style={{ opacity: 0.22 + (read.probabilities[String(i)] ?? 0) * 0.78 }} />
        ))}
        <motion.span
          className="meter__marker"
          initial={false}
          animate={{ left: `${pos}%` }}
          transition={{ type: 'spring', stiffness: 140, damping: 20 }}
        />
      </div>
      <div className="meter__labels">
        <span>{low}</span>
        <span>{high}</span>
      </div>
      <p className="meter__read">{read.levels[Math.round(read.score)]}</p>
    </div>
  );
}

function CandidateRow({ c, chosen, rank }: { c: RankedCandidate; chosen: boolean; rank: number }) {
  const f = c.features;
  return (
    <motion.li
      layout
      className={`cand${chosen ? ' cand--chosen' : ''}`}
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.04 }}
    >
      <div className="cand__head">
        <span className="cand__id mono">{c.id}</span>
        <span className="cand__moves mono">{notation(JEV, c.play)}</span>
        <span className="cand__prob mono">{pct(c.probability)}</span>
      </div>
      <div className="cand__bar">
        <motion.span
          className="cand__fill"
          initial={{ width: 0 }}
          animate={{ width: pct(c.probability) }}
          transition={{ type: 'spring', stiffness: 110, damping: 20, delay: 0.1 + rank * 0.04 }}
        />
      </div>
      <div className="cand__facts">
        {c.reason && <span className="cand__tag">{c.reason}</span>}
        <span>{f.pip_count_after} pips</span>
        <span className={f.expected_pip_loss_if_hit > 4 ? 'cand__fact--warn' : undefined}>
          risks {f.expected_pip_loss_if_hit} pips
        </span>
        {f.hits_opponent_blots > 0 && <span className="cand__fact--hot">hits {f.hits_opponent_blots}</span>}
        {f.home_board_points > 0 && <span>{f.home_board_points} home pts</span>}
        {f.longest_prime >= 3 && <span>{f.longest_prime}-prime</span>}
        {f.borne_off_after > 0 && <span>{f.borne_off_after} off</span>}
      </div>
    </motion.li>
  );
}

interface Props {
  state: GameState;
  onInspect: () => void;
  /** Closes the panel when it is shown as a sheet on phones. Hidden on wider layouts. */
  onClose?: () => void;
}

export function JevPanel({ state, onInspect, onClose }: Props) {
  const { jev } = state;
  const move = jev.move;
  const read = move?.read;
  const thinking = jev.status === 'thinking';
  const stats = jev.stats;
  const avgMs = stats.calls ? Math.round(stats.latencyMs / stats.calls) : 0;

  return (
    <aside className="jev-panel">
      {onClose && (
        <div className="sheet-handle" onClick={onClose} role="button" aria-label="Close Jev's analysis">
          <span />
        </div>
      )}
      <header className="jev-panel__head">
        <span className={`jev-avatar${thinking ? ' jev-avatar--thinking' : ''}`} />
        <div className="jev-panel__id">
          <h2 className="jev-panel__title">Jev</h2>
          <p className="jev-panel__sub">System One decision model · TypeSafe</p>
        </div>
        <span className={`pill pill--${jev.status}`}>
          {jev.status === 'thinking' ? 'deciding' : jev.status === 'error' ? 'offline' : jev.status === 'done' ? 'ready' : 'idle'}
        </span>
      </header>

      {!move && !jev.cube && (
        <div className="jev-panel__intro">
          <p>
            Jev does not write text. It takes the board as JSON plus typed questions and answers with
            <em> calibrated probabilities</em>.
          </p>
          <ol>
            <li>Jev reads the position first: the plan, how much risk is worth taking, how dangerous white is.</li>
            <li>Code prices every legal play, turning exposure into pips, and shortlists eight genuinely different options.</li>
            <li>Jev picks the move, returning a probability for each option.</li>
          </ol>
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {move && (
          <motion.section
            key={`${state.gameNumber}-${move.call?.response.id ?? move.read?.call.response.id ?? move.chosen.id}`}
            className="decision"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="decision__top">
              <div className="decision__lead">
                <span className="eyebrow">Chosen play</span>
                <div className="decision__play mono">{notation(JEV, move.chosen.play)}</div>
                <div className="decision__meta">
                  {(move.source === 'jev' || move.source === 'gated') && (
                    <>
                      <span>
                        {(move.read?.call.latencyMs ?? 0) + (move.call?.latencyMs ?? 0)} ms over{' '}
                        {move.read ? 2 : 1} calls
                      </span>
                      <span className="dot" />
                      <span>
                        {move.enumerated} legal, {move.sent} shortlisted
                      </span>
                    </>
                  )}
                  {move.source === 'gated' && (
                    <span className="warn">Low confidence, so the deterministic evaluation decided</span>
                  )}
                  {move.source === 'solver' && <span>No contact left. Race solved exactly in code.</span>}
                  {move.source === 'forced' && <span>Only legal play, no call needed</span>}
                  {move.source === 'fallback' && <span className="warn">Jev unavailable · heuristic fallback</span>}
                </div>
              </div>
              {(move.source === 'jev' || move.source === 'gated') && (
                <ConfidenceRing value={move.confidence} label="confidence" />
              )}
            </div>

            {move.source === 'fallback' && move.error && <p className="decision__error mono">{move.error}</p>}

            {read && (
              <div className="reads">
                <div className="read">
                  <span className="eyebrow">Game plan</span>
                  <div className="read__value">
                    <span className="chip chip--jev">{read.plan.choice.replace(/_/g, ' ')}</span>
                    <span className="read__conf mono">{pct(read.plan.confidence)}</span>
                  </div>
                  <p className="read__desc">{String(GAME_PLANS[read.plan.choice] ?? '')}</p>
                </div>
                <div className="read">
                  <span className="eyebrow">
                    Risk worth taking <span className="read__hint mono">weight {read.riskWeight}</span>
                  </span>
                  <ScoreMeter read={read.risk} low="Play safe" high="Take risks" />
                </div>
                <div className="read">
                  <span className="eyebrow">White's threat</span>
                  <ScoreMeter read={read.threat} low="Harmless" high="Dangerous" />
                </div>
                <div className="read">
                  <span className="eyebrow">Position read</span>
                  <ScoreMeter read={read.standing} low="Jev losing" high="Jev winning" />
                </div>
              </div>
            )}

            {(move.source === 'jev' || move.source === 'gated') && (
              <div className="cands">
                <span className="eyebrow">Probability over the shortlist</span>
                <ul className="cands__list">
                  {move.candidates.slice(0, 8).map((c, i) => (
                    <CandidateRow key={c.id} c={c} chosen={c.id === move.chosen.id} rank={i} />
                  ))}
                </ul>
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      {jev.cube && (
        <section className="cube-read">
          <span className="eyebrow">{jev.cube.kind === 'offer' ? 'Should Jev double?' : 'Should Jev take?'}</span>
          <div className="cube-read__row">
            <div className="cube-read__bar">
              <motion.span
                className="cube-read__fill"
                initial={{ width: 0 }}
                animate={{ width: pct(jev.cube.probability) }}
                transition={{ type: 'spring', stiffness: 110, damping: 20 }}
              />
              <span className="cube-read__threshold" style={{ left: jev.cube.kind === 'offer' ? '45%' : '50%' }} />
            </div>
            <span className="mono">{pct(jev.cube.probability)}</span>
            <span className={`chip ${jev.cube.decision ? 'chip--jev' : 'chip--muted'}`}>
              {jev.cube.kind === 'offer' ? (jev.cube.decision ? 'doubles' : 'holds') : jev.cube.decision ? 'takes' : 'drops'}
            </span>
          </div>
          {jev.cube.call && (
            <p className="cube-read__meta">
              Noul answer in {jev.cube.call.latencyMs} ms · threshold {jev.cube.kind === 'offer' ? '45%' : '50%'}
            </p>
          )}
        </section>
      )}

      <footer className="jev-panel__foot">
        <div className="stats">
          <div>
            <span className="stats__v mono">{stats.calls}</span>
            <span className="stats__k">calls</span>
          </div>
          <div>
            <span className="stats__v mono">{avgMs}</span>
            <span className="stats__k">avg ms</span>
          </div>
          <div>
            <span className="stats__v mono">{(stats.inputTokens / 1000).toFixed(1)}k</span>
            <span className="stats__k">tokens</span>
          </div>
          <div>
            <span className="stats__v mono">{money(stats.cost)}</span>
            <span className="stats__k">spent</span>
          </div>
        </div>
        <button
          className="btn btn--ghost btn--sm"
          onClick={onInspect}
          disabled={!move?.call && !move?.read?.call && !jev.cube?.call}
        >
          Inspect JSON
        </button>
      </footer>

      <details className="log">
        <summary>Game log</summary>
        <ul>
          {[...state.log].reverse().map((e) => (
            <li key={e.id} className={`log__item log__item--${e.who}`}>
              <span className="log__who">{e.who === 'white' ? 'You' : e.who === 'black' ? 'Jev' : '—'}</span>
              <span>{e.text}</span>
            </li>
          ))}
        </ul>
      </details>
    </aside>
  );
}
