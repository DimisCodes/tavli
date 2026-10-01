import { useEffect, useState } from 'react';

/**
 * Phones held upright get a vertical board: two columns of twelve points instead of two rows.
 * A 24-point board scaled to 360px gives 17px checkers, so the layout changes rather than the scale.
 * Landscape phones and anything wider keep the horizontal board.
 */
export const PORTRAIT_PHONE = '(max-width: 760px) and (orientation: portrait)';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
