import { motion } from 'framer-motion';
import type { CubeState } from '../jev/player';

export function Cube({ cube }: { cube: CubeState }) {
  const pos = cube.owner === 'black' ? 'top' : cube.owner === 'white' ? 'bottom' : 'center';
  return (
    <motion.div
      layout
      className={`cube cube--${pos}`}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      title={cube.owner ? `Cube owned by ${cube.owner === 'white' ? 'you' : 'Jev'}` : 'Cube centered'}
    >
      <span className="cube__value">{cube.value === 1 ? 64 : cube.value}</span>
    </motion.div>
  );
}
