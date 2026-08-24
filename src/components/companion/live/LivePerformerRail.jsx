// LivePerformerRail.jsx — faces from both rosters ranked by live points. A
// selection opens the player's breakdown and isolates their plays in the feed.

import { LiveAvatar } from './LiveAtoms.jsx';
import { lastNameOf } from './liveVisuals.js';
import { getSleeperPlayerName } from '../../../utils/liveScoringFeed.js';

export default function LivePerformerRail({ performers = [], focusId = null, onSelect }) {
  if (!performers.length) return null;
  return (
    <div className="fl-rail" role="group" aria-label="Top performers">
      {performers.map(({ entry, side }) => {
        const name = getSleeperPlayerName(entry.row.player);
        const active = focusId === entry.id;
        return (
          <button
            key={`${side.key}-${entry.id}`}
            type="button"
            className={`fl-rail__pf${active ? ' is-active' : ''}`}
            style={{ '--fl-team': side.palette[0] }}
            onClick={() => onSelect?.(active ? null : entry.id)}
            aria-pressed={active}
            title={`${name} · ${side.name}`}
          >
            <LiveAvatar
              player={entry.row.player}
              size="var(--fl-rail-avatar)"
              initialsSize="var(--fl-rail-initials)"
              className="fl-rail__av"
            />
            <span className="fl-rail__pv">{entry.pace.points.toFixed(1)}</span>
            <span className="fl-rail__nm">{lastNameOf(name) || name}</span>
          </button>
        );
      })}
    </div>
  );
}
