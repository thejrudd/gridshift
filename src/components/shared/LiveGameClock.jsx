import { memo } from 'react';
import useLiveGameClock from '../../hooks/useLiveGameClock.js';

/**
 * Leaf that prints a game's shared live clock ("Q2 · 4:12") and, while the
 * clock is held for a known reason, a short broadcast-style reason beside it.
 * Only this leaf re-renders each second. No live region: the ticking value is
 * not announced.
 */
function LiveGameClock({ game, enabled = true, fallbackLabel = null, sampleIntervalMs = null, className = '' }) {
  const { label, stopReason } = useLiveGameClock(game, { enabled, fallbackLabel, sampleIntervalMs });
  return (
    <span className={`live-game-clock${className ? ` ${className}` : ''}`}>
      <span className="live-game-clock__time">{label}</span>
      {stopReason && <span className="live-game-clock__reason">{stopReason}</span>}
    </span>
  );
}

export default memo(LiveGameClock);
