// LivePlayerSheet.jsx — the player drill-in.
//
// Deliberately unlike the broadcast hero: a flat record card with a framed
// portrait at true aspect and the fantasy team's colour only as a top edge
// accent. Then the pace strip, the scoring math, the box score, and the
// player's own plays.

import { useState } from 'react';
import { LivePosChip } from './LiveAtoms.jsx';
import { buildLiveBoxScore, getLiveImageSources, getLiveKindMeta } from './liveVisuals.js';
import useSheetHistory from '../../../hooks/useSheetHistory.js';
import { buildFantasyScoringBreakdown } from '../../../utils/fantasyBreakdownRows.js';
import { getSleeperPlayerName, getTeamAbbr } from '../../../utils/liveScoringFeed.js';
import { getCompanionInitials } from '../../../utils/companionAssetVisuals.js';
import { withAlpha } from '../../../utils/fantasyTeamIdentity.js';

const TABS = [['scoring', 'Scoring'], ['box', 'Box score'], ['plays', 'Plays']];

function formatPoints(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : '0.0';
}

function formatSigned(value) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? '+' : '−'}${Math.abs(numeric).toFixed(1)}`;
}

/** Framed portrait: headshot → NFL mark → initials. */
function Portrait({ player, size }) {
  const [failed, setFailed] = useState({ key: '', count: 0 });
  const { urls, logoIndex } = getLiveImageSources(player);
  const key = urls.join('|');
  const index = failed.key === key ? failed.count : 0;
  const url = urls[index] ?? null;
  const isMark = logoIndex >= 0 && index >= logoIndex;
  return (
    <span className="fl-phead__frame" style={{ width: size, height: size }} aria-hidden="true">
      {url ? (
        <img
          src={url}
          alt=""
          draggable="false"
          className={isMark ? 'is-mark' : ''}
          onError={() => setFailed({ key, count: index + 1 })}
        />
      ) : (
        <span className="fl-phead__initials">{getCompanionInitials(getSleeperPlayerName(player))}</span>
      )}
    </span>
  );
}

export default function LivePlayerSheet({
  entry,
  side,
  glance,
  events = [],
  scoringSettings,
  liveActive = false,
  selectedEventId = null,
  embedded = false,
  onClose,
  onViewPlayer = null,
}) {
  const player = entry.row.player ?? {};
  const position = String(player.position ?? 'FLEX').toUpperCase();
  const playerEvents = events.flatMap((event) => {
    if (event.hiddenFromFeed) return [];
    const contributor = event.contributors?.find((candidate) => (
      String(candidate.playerId) === String(entry.id)
    )) ?? (String(event.playerId) === String(entry.id) ? event : null);
    return contributor ? [{ event, points: contributor.pts ?? event.pts }] : [];
  });
  // Arriving from a feed play opens on that play; otherwise the scoring math.
  // Reset during render rather than in an effect so switching players never
  // paints one player's tab against another's data.
  const defaultTab = selectedEventId ? 'plays' : 'scoring';
  const [tabState, setTabState] = useState({ for: entry.id, id: defaultTab });
  if (tabState.for !== entry.id) setTabState({ for: entry.id, id: defaultTab });
  const tab = tabState.for === entry.id ? tabState.id : defaultTab;
  const setTab = (id) => setTabState({ for: entry.id, id });
  useSheetHistory(!embedded, onClose);

  const name = getSleeperPlayerName(player);
  const teamAbbr = getTeamAbbr(player.team) || 'FA';
  const stats = entry.row.detailStats ?? entry.row.mappedStats ?? entry.row.sleeperStats ?? null;
  const pace = entry.pace;
  const breakdown = stats
    ? buildFantasyScoringBreakdown(stats, scoringSettings, position, { authoritativeTotal: pace.points })
    : { rows: [], total: pace.points };
  const boxScore = buildLiveBoxScore(stats, position);
  const ceiling = Math.max(pace.points, pace.pace, pace.projected, pace.liveProjected, 1) * 1.02;

  return (
    <div className={`fl-sheet${embedded ? ' is-embedded' : ''}`}>
      <div className="fl-phead" style={{ '--fl-team': side.palette[0] }}>
        <button
          type="button"
          className="fl-phead__back"
          onClick={onClose}
          aria-label={embedded ? 'Close player breakdown' : 'Back to feed'}
        >
          ‹ {embedded ? 'Close' : 'Back to feed'}
        </button>
        <div className="fl-phead__row">
          <Portrait player={player} size="var(--fl-detail-portrait)" />
          <div className="fl-phead__meta">
            <div className="fl-phead__chips">
              <LivePosChip position={position} />
              <span
                className="fl-phead__team"
                style={{ background: withAlpha(side.palette[0], 0.22), color: side.palette[0] }}
              >
                {side.isMine ? 'Your team' : side.name}
              </span>
            </div>
            <div className="fl-phead__name">{name}</div>
            <div className="fl-phead__sub">
              <span>{teamAbbr}</span>
              {glance && (
                <>
                  <span className="fl-phead__d" aria-hidden="true">·</span>
                  {glance.live && <i className="fl-live-dot" aria-hidden="true" />}
                  <span>{glance.clock}</span>
                  <span className="fl-phead__d" aria-hidden="true">·</span>
                  <span>{glance.score}</span>
                </>
              )}
            </div>
          </div>
          <div className="fl-phead__big">
            <span className="fl-phead__v">{formatPoints(pace.points)}</span>
            <span className="fl-phead__l">Points</span>
          </div>
        </div>
        <div className="fl-phead__strip">
          <span><b>{formatPoints(pace.projected)}</b><span>Projected</span></span>
          <span><b>{formatPoints(pace.pace)}</b><span>Pace now</span></span>
          <span>
            <b style={{ color: pace.vsPace >= 0 ? 'var(--color-accent-green)' : 'var(--color-accent-red)' }}>
              {formatSigned(pace.vsPace)}
            </b>
            <span>vs pace</span>
          </span>
          <span><b>{formatPoints(pace.liveProjected)}</b><span>Live proj</span></span>
        </div>
      </div>

      {/* Points filled against the pace marker: left of the notch is behind. */}
      <div className="fl-ptrack" aria-hidden="true">
        <i style={{ width: `${(pace.points / ceiling) * 100}%`, background: side.palette[0] }} />
        <u style={{ left: `${(pace.pace / ceiling) * 100}%` }} />
      </div>

      <div className="fl-ptabs" role="tablist" aria-label="Player detail sections">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'is-active' : ''}
            onClick={() => setTab(id)}
          >
            {label}{id === 'plays' && playerEvents.length ? ` · ${playerEvents.length}` : ''}
          </button>
        ))}
      </div>

      <div className="fl-pbody">
        {!pace.started ? (
          <div className="fl-empty">Hasn&rsquo;t played yet{glance?.clock ? ` — ${glance.clock}` : ''}</div>
        ) : tab === 'scoring' ? (
          breakdown.rows.length ? (
            <>
              {breakdown.rows.map((row) => (
                <div className="fl-brow" key={row.key}>
                  <span>
                    <span className="fl-brow__l">{row.label}</span>
                    {row.statVal != null && <span className="fl-brow__d">{row.statVal}</span>}
                  </span>
                  <span
                    className="fl-brow__p"
                    style={{ color: row.pts < 0 ? 'var(--color-accent-red)' : 'var(--color-label)' }}
                  >
                    {formatSigned(row.pts)}
                  </span>
                </div>
              ))}
              <div className="fl-brow is-total">
                <span className="fl-brow__l">Live total</span>
                <span className="fl-brow__p" style={{ color: side.palette[0] }}>{formatPoints(breakdown.total)}</span>
              </div>
            </>
          ) : (
            <div className="fl-empty">
              {stats
                ? 'No scoring components yet'
                : liveActive
                  ? 'Waiting on this week’s stat line'
                  : 'No stat line for this week'}
            </div>
          )
        ) : tab === 'box' ? (
          boxScore.length ? (
            <div className="fl-pstats">
              {boxScore.map(([label, value]) => (
                <span className="fl-pstats__s" key={label}>
                  <b>{value}</b>
                  <span>{label}</span>
                </span>
              ))}
            </div>
          ) : (
            <div className="fl-empty">No counting stats yet</div>
          )
        ) : (
          playerEvents.length ? (
            playerEvents.map(({ event, points }) => (
              <div className={`fl-brow${selectedEventId === event.id ? ' is-selected' : ''}`} key={event.id}>
                <span className="fl-brow__play">
                  <i style={{ background: getLiveKindMeta(event.kind).color }} aria-hidden="true" />
                  <span>
                    <span className="fl-brow__l">{event.desc}</span>
                    {event.glance?.clock && <span className="fl-brow__d">{event.glance.clock}</span>}
                  </span>
                </span>
                <span
                  className="fl-brow__p"
                  style={{ color: (Number(points) || 0) >= 0 ? 'var(--color-accent-green)' : 'var(--color-accent-red)' }}
                >
                  {formatSigned(points)}
                </span>
              </div>
            ))
          ) : (
            <div className="fl-empty">No scoring plays yet</div>
          )
        )}

        {onViewPlayer && (
          <button type="button" className="fl-sheet__more" onClick={() => onViewPlayer(entry.id, { mode: 'fantasy' })}>
            Full player page ›
          </button>
        )}
        <div className="fl-feed__tail" aria-hidden="true" />
      </div>
    </div>
  );
}
