import { motion } from 'framer-motion';
import type { Color } from '../engine/types';

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

interface DieProps {
  value: number;
  color: Color;
  used?: boolean;
  rollKey: string;
  delay?: number;
}

export function Die({ value, color, used, rollKey, delay = 0 }: DieProps) {
  return (
    <motion.div
      key={rollKey}
      className={`die die--${color}${used ? ' die--used' : ''}`}
      initial={{ rotate: -140 + Math.random() * 60, scale: 0.4, opacity: 0, y: -24 }}
      animate={{ rotate: -6 + Math.random() * 12, scale: 1, opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18, delay }}
      aria-label={`die showing ${value}`}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`die__pip${PIPS[value]?.includes(i) ? ' die__pip--on' : ''}`} />
      ))}
    </motion.div>
  );
}
