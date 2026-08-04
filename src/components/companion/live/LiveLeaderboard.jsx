// LiveLeaderboard.jsx — the desktop right rail's default state: everyone in
// the matchup ranked by live points, with a bar showing the share. Selecting a
// row swaps the rail for that player's breakdown.

import { LiveAvatar } from './LiveAtoms.jsx';
import { getSleeperPlayerName, getTeamAbbr } from '../../../utils/liveScoringFeed.js';

export default function LiveLeaderboard({ performers = [], focusId = null, onOpenPlayer }) {
  const max = performers[0]?.entry.pace.points || 1;
  return (
    <>
      <div className="fl-lead__head">Top of the matchup · select for the breakdown</div>
      <div className="fl-lead__scroll">
        {performers.length === 0 && <div className="fl-empty">No starters to rank yet.</div>}
        {performers.map(({ entry, side }, index) => {
          const player = entry.row.player;
          const points = entry.pace.points;
          return (
            <button
              key={`${side.key}-${entry.id}`}
              type="button"
              className={`fl-leadrow${focusId === entry.id ? ' is-focused' : ''}`}
              onClick={() => onOpenPlayer?.(entry)}
            >
              <span className="fl-leadrow__rk">{index + 1}</span>
              <LiveAvatar player={player} size={38} className="fl-leadrow__av" />
              <span className="fl-leadrow__id">
                <span className="fl-leadrow__nm">{getSleeperPlayerName(player)}</span>
                <span className="fl-leadrow__mt">
                  <i style={{ background: side.palette[0] }} aria-hidden="true" />
                  {side.isMine ? 'You' : side.name}
                  <span className="fl-leadrow__sep" aria-hidden="true">·</span>
                  {String(player?.position ?? '').toUpperCase()} {getTeamAbbr(player?.team) || 'FA'}
                </span>
              </span>
              <span
                className="fl-leadrow__pv"
                style={{ color: points >= entry.pace.pace ? 'var(--color-label)' : 'var(--color-label-tertiary)' }}
              >
                {points.toFixed(1)}
              </span>
              <i className="fl-leadrow__bar" style={{ width: `${Math.max(0, (points / max) * 100)}%`, background: side.palette[0] }} aria-hidden="true" />
            </button>
          );
        })}
        <div className="fl-feed__tail" aria-hidden="true" />
      </div>
    </>
  );
}
