interface Props {
  onDismiss: () => void;
}

/**
 * Portrait phones get this instead of the board. A backgammon board is twenty-four points wide; at
 * 360px that is fifteen pixels a point, which is not a game you can play with a thumb. The vertical
 * layout is still underneath for anyone whose phone is locked upright.
 */
export function RotatePrompt({ onDismiss }: Props) {
  return (
    <div className="rotate" role="dialog" aria-label="Turn your phone sideways">
      <div className="rotate__phone" aria-hidden="true">
        <span className="rotate__screen" />
      </div>
      <h2 className="rotate__title">Turn your phone</h2>
      <p className="rotate__body">
        A backgammon board is wide. Held sideways, Tavli gives you all twenty-four points at a size
        you can actually tap.
      </p>
      <button className="btn btn--text" onClick={onDismiss}>
        Play upright anyway
      </button>
    </div>
  );
}
