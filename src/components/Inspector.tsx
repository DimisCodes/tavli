import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { GameState } from '../game/state';
import type { JevCall } from '../jev/client';

export function Inspector({ state, onClose }: { state: GameState; onClose: () => void }) {
  const [side, setSide] = useState<'request' | 'response'>('request');
  const [which, setWhich] = useState(0);

  const calls = useMemo(() => {
    const out: { label: string; call: JevCall }[] = [];
    if (state.jev.move?.read?.call) out.push({ label: 'Position read', call: state.jev.move.read.call });
    if (state.jev.move?.call) out.push({ label: 'Move choice', call: state.jev.move.call });
    if (state.jev.cube?.call) out.push({ label: 'Cube', call: state.jev.cube.call });
    return out;
  }, [state.jev.move, state.jev.cube]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (calls.length === 0) return null;
  const active = calls[Math.min(which, calls.length - 1)];
  const body = side === 'request' ? active.call.request : active.call.response;

  return (
    <motion.div className="modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}>
      <motion.div
        className="modal__card"
        initial={{ y: 16, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <div className="modal__title">
            <h3>System One call</h3>
            <p className="mono">
              POST /api/v1/systemone · {active.call.response.model} · {active.call.latencyMs} ms
            </p>
          </div>
          <div className="modal__controls">
            {calls.length > 1 && (
              <div className="tabs">
                {calls.map((c, i) => (
                  <button key={c.label} className={i === which ? 'tab tab--on' : 'tab'} onClick={() => setWhich(i)}>
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            <div className="tabs">
              <button className={side === 'request' ? 'tab tab--on' : 'tab'} onClick={() => setSide('request')}>
                Request
              </button>
              <button className={side === 'response' ? 'tab tab--on' : 'tab'} onClick={() => setSide('response')}>
                Response
              </button>
            </div>
            <button className="btn btn--text" onClick={onClose} aria-label="Close">
              Close
            </button>
          </div>
        </header>
        <pre className="modal__json mono">{JSON.stringify(body, null, 2)}</pre>
      </motion.div>
    </motion.div>
  );
}
