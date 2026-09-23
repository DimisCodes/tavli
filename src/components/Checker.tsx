import { motion } from 'framer-motion';
import type { Color } from '../engine/types';

interface Props {
  id: string;
  color: Color;
  style?: React.CSSProperties;
  badge?: number;
  flat?: boolean;
}

const spring = { type: 'spring', stiffness: 380, damping: 32, mass: 0.9 } as const;

export function Checker({ id, color, style, badge, flat }: Props) {
  return (
    <motion.div
      layoutId={id}
      layout
      transition={spring}
      className={`checker checker--${color}${flat ? ' checker--flat' : ''}`}
      style={style}
    >
      {badge && badge > 1 ? <span className="checker__badge">{badge}</span> : null}
    </motion.div>
  );
}
