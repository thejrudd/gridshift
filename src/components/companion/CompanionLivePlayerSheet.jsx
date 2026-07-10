import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext.jsx';
import useSheetHistory from '../../hooks/useSheetHistory.js';
import { buildFantasyScoringBreakdown } from '../../utils/fantasyBreakdownRows.js';
import { getTeamVisualTheme } from '../../utils/teamVisualTheme.js';
import {
  getCompanionInitials,
  getCompanionPlayerImageUrls,
  getCompanionPositionColor,
  getPositionTextColor,
} from '../../utils/companionAssetVisuals.js';
import {
  EVENT_KIND_LABELS,
  getTeamAbbr,
} from '../../utils/liveScoringFeed.js';

function formatPoints(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : '0.0';
}

function formatEventTime(at) {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Player drill-in sheet for the Live tab. Renders as an overlay on mobile
 * and embedded inside the desktop rail (`embedded`).
 */
export default function CompanionLivePlayerSheet({
  row,
  glance,
  events = [],
  scoringSettings,
  teamName,
  isMine = false,
  liveActive = false,
  selectedEvent = null,
  onClose,
  onSelectEvent = null,
  embedded = false,
  onViewPlayer = null,
}) {
  const [tab, setTab] = useState('breakdown');
  const [imageFallback, setImageFallback] = useState({ key: '', index: 0 });
  const { darkMode } = useTheme();
  useSheetHistory(!embedded, onClose);
  const player = row?.player ?? {};
  const position = String(player.position ?? 'FLEX').toUpperCase();
  const positionColor = getCompanionPositionColor(position);
  const positionFg = getPositionTextColor(positionColor);
  const name = player.full_name || [player.first_name, player.last_name].filter(Boolean).join(' ') || 'Unknown Player';
  const teamAbbr = getTeamAbbr(player.team) || 'FA';
  const imageUrls = getCompanionPlayerImageUrls(player);
  const imageKey = imageUrls.join('|');
  const imageIndex = imageFallback.key === imageKey ? imageFallback.index : 0;
  const imageUrl = imageUrls[imageIndex] ?? null;
  const theme = getTeamVisualTheme(teamAbbr, darkMode);
  const hasGradient = Boolean(theme.gradient);
  const foreground = hasGradient ? theme.gradientForeground : 'var(--color-label)';
  const muted = hasGradient ? theme.gradientMuted : 'var(--color-label-secondary)';
  const hasLiveStats = Boolean(row?.mappedStats);
  const detailStats = row?.detailStats ?? row?.mappedStats ?? row?.sleeperStats ?? null;
  const playerEvents = events.filter((event) => event.playerId === row?.id);
  const activeEvent = selectedEvent?.playerId === row?.id ? selectedEvent : null;
  const selectedPlayStats = activeEvent?.stats ?? null;
  const points = activeEvent ? Number(activeEvent.pts) || 0 : Number(row?.points) || 0;
  const breakdownStats = selectedPlayStats ?? detailStats;
  const hasBreakdownStats = Boolean(breakdownStats);
  const breakdown = hasBreakdownStats
    ? buildFantasyScoringBreakdown(breakdownStats, scoringSettings, position, {
        authoritativeTotal: points,
        adjustmentLabel: activeEvent ? 'Play scoring adjustment' : 'Scoring adjustment',
        fallbackTotalLabel: activeEvent ? 'Play fantasy impact' : 'Fantasy Points',
      })
    : { rows: [], total: points };
  const canShowPlays = liveActive || hasLiveStats || playerEvents.length > 0;
  const activeTab = tab === 'plays' && !canShowPlays ? 'breakdown' : tab;
  const contextLabel = activeEvent ? 'Play impact' : 'Fantasy points';

  return (
    <div className={`companion-live-sheet${embedded ? ' is-embedded' : ''}`}>
      <div
        className="companion-live-sheet__hero"
        style={{
          background: hasGradient ? theme.gradient : undefined,
          color: foreground,
        }}
      >
        {hasGradient && (
          <span className="companion-live-sheet__hero-overlay" aria-hidden="true" style={{ background: theme.gradientOverlay }} />
        )}
        <div className="companion-live-sheet__hero-top">
          <button type="button" className="companion-live-sheet__back" onClick={onClose} aria-label="Back to feed">
            ‹
          </button>
        </div>
        <div className="companion-live-sheet__hero-main">
          <div className="companion-live-sheet__portrait" aria-hidden="true">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                onError={() => {
                  setImageFallback((current) => {
                    const currentIndex = current.key === imageKey ? current.index : 0;
                    return { key: imageKey, index: Math.min(currentIndex + 1, imageUrls.length) };
                  });
                }}
              />
            ) : (
              <span>{getCompanionInitials(name)}</span>
            )}
          </div>
          <div className="companion-live-sheet__id">
            <div className="companion-live-sheet__name">
              <span className="companion-live-pos-pill" style={{ background: positionColor, color: positionFg }}>
                {position}
              </span>
              {name}
            </div>
            <div className="companion-live-sheet__meta" style={{ color: muted }}>
              {teamAbbr}{teamName ? ` · ${isMine ? 'Your roster' : teamName}` : ''}
            </div>
          </div>
          <div className="companion-live-sheet__hero-points">
            <span style={{ color: muted }}>{contextLabel}</span>
            <strong>{formatPoints(points)}</strong>
          </div>
        </div>
      </div>

      <div className="companion-live-glancebar">
        <div>
          <span>NFL Game</span>
          <strong>{glance?.score ?? 'Schedule unavailable'}</strong>
        </div>
        <div>
          <span>{glance?.live ? 'Game Clock' : 'Game State'}</span>
          <strong className={glance?.live ? 'is-live' : ''}>
            {glance?.live && <i aria-hidden="true" />}
            {glance?.clock ?? 'Not available'}
          </strong>
        </div>
      </div>

      {activeEvent && (
        <div className="companion-live-glancebar">
          <div>
            <span>Selected Play</span>
            <strong>{activeEvent.desc}</strong>
          </div>
          <div>
            <span>Impact</span>
            <strong className={activeEvent.pts > 0 ? 'is-live' : ''}>
              {activeEvent.pts > 0 ? '+' : ''}{formatPoints(activeEvent.pts)}
            </strong>
          </div>
        </div>
      )}

      <div className="companion-live-sheet__tabs" role="tablist" aria-label="Player detail sections">
        <button type="button" role="tab" aria-selected={activeTab === 'breakdown'} className={activeTab === 'breakdown' ? 'is-active' : ''} onClick={() => setTab('breakdown')}>
          {activeEvent ? 'Play breakdown' : 'Breakdown'}
        </button>
        {canShowPlays && (
          <button type="button" role="tab" aria-selected={activeTab === 'plays'} className={activeTab === 'plays' ? 'is-active' : ''} onClick={() => setTab('plays')}>
            Plays{playerEvents.length ? ` · ${playerEvents.length}` : ''}
          </button>
        )}
      </div>

      <div className="companion-live-sheet__body">
        {activeTab === 'breakdown' && (
          breakdown.rows.length ? (
            <div className="companion-live-breakdown">
              {breakdown.rows.map((line) => (
                <div className="companion-live-breakdown__row" key={line.key}>
                  <div>
                    <div className="companion-live-breakdown__label">{line.label}</div>
                    {line.statVal != null && <div className="companion-live-breakdown__detail">{line.statVal}</div>}
                  </div>
                  <span className={line.pts > 0 ? 'is-up' : line.pts < 0 ? 'is-down' : ''}>
                    {line.pts > 0 ? '+' : ''}{line.pts.toFixed(1)}
                  </span>
                </div>
              ))}
              <div className="companion-live-breakdown__row is-total">
                <div className="companion-live-breakdown__label">Total</div>
                <span>{formatPoints(breakdown.total)}</span>
              </div>
            </div>
          ) : (
            <div className="companion-live-sheet__empty">
              <strong>{hasBreakdownStats ? 'No fantasy points yet' : activeEvent ? 'No play scoring details' : 'No stat line'}</strong>
              <span>
                {hasBreakdownStats
                  ? activeEvent ? 'This play did not create a scored fantasy component' : 'Scoring lines appear as plays happen'
                  : liveActive
                    ? 'Stat lines appear as live or official weekly data arrives'
                    : 'Stat lines appear once weekly data is available'}
              </span>
            </div>
          )
        )}

        {activeTab === 'plays' && (
          playerEvents.length ? (
            <div className="companion-live-sheet__plays">
              {playerEvents.map((event) => (
                <button
                  type="button"
                  className={`companion-live-sheet__play${activeEvent?.id === event.id ? ' is-active' : ''}`}
                  key={event.id}
                  onClick={() => onSelectEvent?.(event)}
                >
                  <span className={`companion-live-kind is-${event.kind}`}>{EVENT_KIND_LABELS[event.kind] ?? '•'}</span>
                  <div>
                    <div className="companion-live-sheet__play-time">{formatEventTime(event.at)}</div>
                    <div className="companion-live-sheet__play-desc">{event.desc}</div>
                  </div>
                  <span className={`companion-live-sheet__play-pts${event.pts > 0 ? ' is-up' : event.pts < 0 ? ' is-down' : ''}`}>
                    {event.pts === 0 ? '—' : `${event.pts > 0 ? '+' : ''}${event.pts.toFixed(1)}`}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="companion-live-sheet__empty">
              <strong>No scoring plays tracked yet</strong>
              <span>{glance?.clock ?? 'Play-by-play appears when live data is connected for this game'}</span>
            </div>
          )
        )}

        {onViewPlayer && (
          <button
            type="button"
            className="companion-live-sheet__more"
            onClick={() => onViewPlayer(row.id, { mode: 'fantasy' })}
          >
            Full player page ›
          </button>
        )}
      </div>
    </div>
  );
}
