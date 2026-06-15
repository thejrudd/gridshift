import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import {
  DRAFT_ANALYTICS_AXIS_OPTIONS,
  buildDraftAnalyticsCompareRows,
  buildDraftAnalyticsScatter,
  buildDraftAnalyticsSnapshot,
  getDraftAnalyticsCompareLimit,
} from '../../utils/draftAssistant/analytics.js';
import {
  getCompanionInitials,
  getCompanionPositionColor,
  getPositionTextColor,
  getSleeperPlayerImageUrl,
} from '../../utils/companionAssetVisuals.js';

const DraftAnalyticsScatterChart = lazy(() => import('./DraftAnalyticsScatterChart.jsx'));

function getPlayerName(player) {
  return player?.name ?? player?.full_name ?? 'Player';
}

function formatMeta(player) {
  return [player?.position, player?.team || 'FA'].filter(Boolean).join(' · ');
}

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PinIcon({ pinned }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 17v5" />
      <path d="M8 4h8l-1 6 3 4H6l3-4-1-6Z" />
    </svg>
  );
}

function PlayerAvatar({ player }) {
  const [failed, setFailed] = useState(false);
  const name = getPlayerName(player);
  const imageUrl = getSleeperPlayerImageUrl(player?.id);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="draft-analytics-hero__avatar"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="draft-analytics-hero__avatar draft-analytics-hero__avatar--fallback">
      {getCompanionInitials(name)}
    </div>
  );
}

function PositionBadge({ position }) {
  const positionColor = getCompanionPositionColor(position);
  return (
    <span
      className="draft-analytics-hero__position"
      style={{
        background: positionColor ?? 'var(--color-fill-secondary)',
        color: positionColor ? getPositionTextColor(positionColor) : 'var(--color-label-secondary)',
      }}
    >
      {position || '—'}
    </span>
  );
}

function AxisControl({ label, value, onChange }) {
  return (
    <div className="draft-analytics-axis-control">
      <span>{label}</span>
      <div className="draft-analytics-axis-control__chips" role="group" aria-label={`${label} axis`}>
        {DRAFT_ANALYTICS_AXIS_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={value === option.id ? 'is-active' : ''}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SnapshotBars({ rows }) {
  return (
    <div className="draft-analytics-snapshot">
      {rows.map((row) => (
        <div key={row.key} className="draft-analytics-snapshot__row">
          <span className="draft-analytics-snapshot__label">{row.label}</span>
          <div className="draft-analytics-meter" aria-hidden="true">
            <span style={{ width: `${row.score ?? 0}%` }} />
          </div>
          <div className="draft-analytics-snapshot__value">
            <strong>{row.value}</strong>
            <small>{row.detail}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function ScatterPlot({ scatter }) {
  return (
    <div className="draft-analytics-scatter">
      <div className="draft-analytics-scatter__plot">
        <div className="draft-analytics-scatter__chart">
          <Suspense fallback={<div className="draft-analytics-scatter__loading">Loading chart...</div>}>
            <DraftAnalyticsScatterChart scatter={scatter} />
          </Suspense>
        </div>
        <span className="draft-analytics-scatter__axis draft-analytics-scatter__axis--x">{scatter.xAxis.label}</span>
        <span className="draft-analytics-scatter__axis draft-analytics-scatter__axis--y">{scatter.yAxis.label}</span>
      </div>
      <div className="draft-analytics-scatter__meta">
        <span>{scatter.points.length}/{scatter.renderedCount} plotted</span>
        {scatter.unavailableCount > 0 ? <span>{scatter.unavailableCount} unavailable</span> : null}
      </div>
    </div>
  );
}

function CompareTray({ players, rows }) {
  if (!players.length) {
    return (
      <div className="draft-analytics-empty-compare">
        <span>No pinned players.</span>
      </div>
    );
  }

  return (
    <div className="draft-analytics-compare">
      <div className="draft-analytics-compare__players" style={{ '--draft-analytics-compare-count': players.length }}>
        {players.map((player) => (
          <div key={player.id} className="draft-analytics-compare__player">
            <strong>{getPlayerName(player)}</strong>
            <span>{formatMeta(player)}</span>
          </div>
        ))}
      </div>
      <div className="draft-analytics-compare__rows">
        {rows.map((row) => (
          <div key={row.key} className="draft-analytics-compare__row" style={{ '--draft-analytics-compare-count': players.length }}>
            <span className="draft-analytics-compare__metric">{row.label}</span>
            {row.cells.map((cell) => (
              <span key={`${row.key}-${cell.playerId}`} className="draft-analytics-compare__cell">
                <strong>{cell.value}</strong>
                <span className="draft-analytics-meter" aria-hidden="true">
                  <span style={{ width: `${cell.score ?? 0}%` }} />
                </span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DraftPlayerAnalyticsSheet({
  player,
  candidates,
  pinnedPlayerIds,
  xAxis,
  yAxis,
  onAxisChange,
  onTogglePin,
  onOpenStatistics,
  onClose,
  presentation = 'modal',
  className = '',
}) {
  const playersById = useMemo(() => new Map((candidates ?? []).map((item) => [String(item.id), item])), [candidates]);
  const pinnedPlayers = useMemo(() => (
    (pinnedPlayerIds ?? []).map((id) => playersById.get(String(id))).filter(Boolean)
  ), [pinnedPlayerIds, playersById]);
  const snapshotRows = useMemo(() => buildDraftAnalyticsSnapshot(player), [player]);
  const scatter = useMemo(() => buildDraftAnalyticsScatter({
    candidates,
    focusedPlayerId: player?.id,
    pinnedPlayerIds,
    xAxis,
    yAxis,
  }), [candidates, pinnedPlayerIds, player?.id, xAxis, yAxis]);
  const compareRows = useMemo(() => buildDraftAnalyticsCompareRows(pinnedPlayers), [pinnedPlayers]);
  const compareLimit = getDraftAnalyticsCompareLimit();
  const playerId = String(player?.id ?? '');
  const pinned = pinnedPlayerIds?.map(String).includes(playerId);
  const pinDisabled = !pinned && (pinnedPlayerIds?.length ?? 0) >= compareLimit;
  const rating = Number(player?.draftModel?.score);

  if (!player) return null;

  const content = (
    <>
      <header className="draft-analytics-hero">
        <button type="button" className="draft-analytics-close" onClick={onClose} aria-label="Close analytics">
          <CloseIcon />
        </button>
        <PlayerAvatar player={player} />
        <div className="draft-analytics-hero__main">
          <div className="draft-analytics-hero__name-row">
            <strong>{getPlayerName(player)}</strong>
            <PositionBadge position={player.position} />
          </div>
          <span>{formatMeta(player)}</span>
        </div>
        <div className="draft-analytics-hero__score">
          <span>Rating</span>
          <strong>{Number.isFinite(rating) ? rating.toFixed(1) : '—'}</strong>
        </div>
        <div className="draft-analytics-hero__actions">
          <button
            type="button"
            className="draft-analytics-action"
            onClick={() => onOpenStatistics?.(player.id)}
          >
            Statistics
            <ArrowIcon />
          </button>
          <button
            type="button"
            className={['draft-analytics-action', pinned ? 'is-pinned' : ''].filter(Boolean).join(' ')}
            onClick={() => onTogglePin?.(player.id)}
            disabled={pinDisabled}
            aria-pressed={pinned}
          >
            <PinIcon pinned={pinned} />
            {pinned ? 'Pinned' : pinDisabled ? 'Full' : 'Pin Compare'}
          </button>
        </div>
      </header>

      <div className="draft-analytics-body">
        <section className="draft-analytics-section draft-analytics-section--overview">
          <div className="draft-analytics-section__header">
            <h2>Snapshot</h2>
            <span>{scatter.peerCount} {player.position || 'peer'} peers</span>
          </div>
          <div className="draft-analytics-overview-grid">
            <SnapshotBars rows={snapshotRows} />
            <div className="draft-analytics-chart-card">
              <div className="draft-analytics-axis-grid">
                <AxisControl
                  label="X"
                  value={xAxis}
                  onChange={(nextAxis) => onAxisChange?.({ xAxis: nextAxis, yAxis })}
                />
                <AxisControl
                  label="Y"
                  value={yAxis}
                  onChange={(nextAxis) => onAxisChange?.({ xAxis, yAxis: nextAxis })}
                />
              </div>
              <ScatterPlot scatter={scatter} />
            </div>
          </div>
        </section>

        <section className="draft-analytics-section">
          <div className="draft-analytics-section__header">
            <h2>Compare</h2>
            <span>{pinnedPlayers.length}/{compareLimit} pinned</span>
          </div>
          <CompareTray players={pinnedPlayers} rows={compareRows} />
        </section>
      </div>
    </>
  );

  if (presentation === 'inline') {
    return (
      <section
        className={['draft-analytics-sheet draft-analytics-sheet--inline flex flex-col', className].filter(Boolean).join(' ')}
        aria-label={`${getPlayerName(player)} draft analytics`}
      >
        {content}
      </section>
    );
  }

  return (
    <Modal
      onClose={onClose}
      mobileSheet
      ariaLabel={`${getPlayerName(player)} draft analytics`}
      containerClassName={['draft-analytics-sheet flex flex-col', className].filter(Boolean).join(' ')}
      containerStyle={{
        '--modal-mobile-sheet-max-height': 'min(88vh, calc(100dvh - env(safe-area-inset-top) - 8px))',
      }}
    >
      {content}
    </Modal>
  );
}
