import { memo } from 'react';
import useLiveGameClock from '../../hooks/useLiveGameClock.js';

/**
 * Leaf that prints a game's shared live clock ("Q2 · 4:12") and, while the
 * clock is held for a known reason, a short broadcast-style reason.
 * Only this leaf re-renders each second. No live region: the ticking value is
 * not announced.
 */
function LiveGameClock({
  game, enabled = true, fallbackLabel = null, sampleIntervalMs = null, className = '', hideRoutineStoppages = false,
}) {
  const { label, stopReason } = useLiveGameClock(game, { enabled, fallbackLabel, sampleIntervalMs });
  const showReason = stopReason && (!hideRoutineStoppages || !['Incomplete', 'Out of bounds'].includes(stopReason));
  return (
    <span className={`live-game-clock${className ? ` ${className}` : ''}`}>
      <span className="live-game-clock__time">{label}</span>
      {showReason && <span className="live-game-clock__reason" data-reason={stopReason}>{stopReason}</span>}
    </span>
  );
}

export default memo(LiveGameClock);
