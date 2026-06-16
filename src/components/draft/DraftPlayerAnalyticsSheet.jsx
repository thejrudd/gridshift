import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import {
  DRAFT_ANALYTICS_AXIS_OPTIONS,
  buildDraftAnalyticsCompareRows,
  buildDraftAnalyticsScatter,
  buildDraftAnalyticsSnapshot,
  getDraftAnalyticsCompareLimit,
  getDraftAnalyticsAxisOptions,
  normalizeDraftAnalyticsAxisPair,
} from '../../utils/draftAssistant/analytics.js';
import {
  getCompanionInitials,
  getCompanionPositionColor,
  getPositionTextColor,
  getSleeperPlayerImageUrl,
} from '../../utils/companionAssetVisuals.js';
import { useTheme } from '../../context/ThemeContext.jsx';
import { getTeamVisualTheme } from '../../utils/teamVisualTheme.js';

const DraftAnalyticsScatterChart = lazy(() => import('./DraftAnalyticsScatterChart.jsx'));

function getPlayerName(player) {
  return player?.name ?? player?.full_name ?? 'Player';
}

function formatMeta(player) {
  return [player?.position, player?.team || 'FA'].filter(Boolean).join(' / ');
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

function AddIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
      <path d="M4 4h16v16H4z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function PlayerAvatar({ player, className = 'draft-analytics-hero__avatar' }) {
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
        className={className}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className={`${className} draft-analytics-hero__avatar--fallback`}>
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
      {position || '-'}
    </span>
  );
}

function AxisDropdown({ axis, value, otherValue, onChange, options = DRAFT_ANALYTICS_AXIS_OPTIONS }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value) ?? options[0] ?? DRAFT_ANALYTICS_AXIS_OPTIONS[0];

  return (
    <div className={`draft-analytics-axis-dropdown draft-analytics-axis-dropdown--${String(axis).toLowerCase()}`}>
      <button
        type="button"
        className="draft-analytics-axis-dropdown__button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="draft-analytics-axis-dropdown__axis">{axis}</span>
        <span className="draft-analytics-axis-dropdown__value">{selected.label}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <>
          <button type="button" className="draft-analytics-axis-dropdown__scrim" aria-label="Close axis menu" onClick={() => setOpen(false)} />
          <div className="draft-analytics-axis-dropdown__menu" role="listbox" aria-label={`${axis} axis`}>
            {options.map((option) => {
              const active = option.id === value;
              const disabled = option.id === otherValue;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={[
                    'draft-analytics-axis-dropdown__item',
                    active ? 'is-active' : '',
                  ].filter(Boolean).join(' ')}
                  disabled={disabled}
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                  role="option"
                  aria-selected={active}
                >
                  {option.label}
                  {active ? <CheckIcon /> : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

function getScoreTone(score) {
  if (score == null || score === '') return 'var(--color-label)';
  const value = Number(score);
  if (!Number.isFinite(value)) return 'var(--color-label)';
  if (value >= 75) return 'var(--color-accent-green)';
  if (value >= 50) return 'var(--color-label)';
  if (value >= 25) return 'var(--color-accent-orange)';
  return 'var(--color-accent-red)';
}

function SnapshotPills({ rows }) {
  return (
    <div className="draft-analytics-snapshot-pills">
      {rows.map((row) => (
        <div key={row.key} className="draft-analytics-snapshot-pill">
          <div className="draft-analytics-snapshot-pill__top">
            <span>{row.label}</span>
            {row.rank != null && row.peerCount ? (
              <em>#{row.rank}<small>/{row.peerCount}</small></em>
            ) : null}
          </div>
          <strong style={{ color: getScoreTone(row.score) }}>{row.value}</strong>
          <div className="draft-analytics-snapshot-pill__track" aria-hidden="true">
            <span style={{ width: `${row.score ?? 0}%`, background: getScoreTone(row.score) }} />
          </div>
          <small>{row.detail}</small>
        </div>
      ))}
    </div>
  );
}

function buildVerdict(player) {
  const rating = Number(player?.draftModel?.score);
  const market = Number(player?.draftModel?.components?.marketRank);
  const ppg = Number(player?.draftModel?.components?.pastProduction);
  const need = Number(player?.draftModel?.components?.rosterNeed);
  if (Number.isFinite(rating) && Number.isFinite(market)) {
    const edge = rating - market;
    if (edge >= 14) return { label: 'Value vs Market', tone: 'pos', detail: 'Rating beats market price' };
    if (edge <= -14) return { label: 'Market Reach', tone: 'neg', detail: 'Costs more than the rating' };
  }
  if (Number.isFinite(need) && need >= 72) return { label: 'Need Fit', tone: 'pos', detail: 'Roster pressure supports the pick' };
  if (Number.isFinite(ppg) && ppg >= 72) return { label: 'Production Edge', tone: 'pos', detail: 'Recent scoring backs the profile' };
  return { label: 'Priced Right', tone: 'neu', detail: 'Rating tracks the market' };
}

function ScatterPlot({
  scatter,
  compact,
  fullscreen = false,
  onRequestFullscreen,
  onExitFullscreen,
  onTogglePin,
  onSelectPlayer,
  pinLimitReached = false,
  axisOptions,
}) {
  return (
    <div className="draft-analytics-scatter">
      <div className="draft-analytics-scatter__plot">
        <div className="draft-analytics-scatter__chart">
          <Suspense fallback={<div className="draft-analytics-scatter__loading">Loading chart...</div>}>
            <DraftAnalyticsScatterChart
              scatter={scatter}
              compact={compact}
              fullscreen={fullscreen}
              onRequestFullscreen={onRequestFullscreen}
              onExitFullscreen={onExitFullscreen}
              onTogglePin={onTogglePin}
              onSelectPlayer={onSelectPlayer}
              pinLimitReached={pinLimitReached}
            />
          </Suspense>
        </div>
      </div>
      {!fullscreen ? (
        <div className="draft-analytics-scatter__meta">
          <span>{scatter.points.length}/{scatter.renderedCount} plotted</span>
          {scatter.unavailableCount > 0 ? <span>{scatter.unavailableCount} unavailable</span> : null}
        </div>
      ) : null}
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

function FullscreenScatter({
  player,
  scatter,
  xAxis,
  yAxis,
  onAxisChange,
  onExit,
  onTogglePin,
  onSelectPlayer,
  pinLimitReached = false,
}) {
  return (
    <div className="draft-analytics-fullscreen">
      <div className="draft-analytics-fullscreen__header">
        <PlayerAvatar player={player} className="draft-analytics-fullscreen__avatar" />
        <div className="draft-analytics-fullscreen__identity">
          <strong>{getPlayerName(player)}</strong>
          <span>{formatMeta(player)}</span>
        </div>
        <button type="button" className="draft-analytics-scatter__exit" onClick={onExit} aria-label="Close expanded chart">
          <CloseIcon />
        </button>
      </div>
      <div className="draft-analytics-fullscreen__axes">
        <AxisDropdown
          axis="Y"
          value={yAxis}
          otherValue={xAxis}
          onChange={(nextAxis) => onAxisChange?.({ xAxis, yAxis: nextAxis })}
          options={axisOptions}
        />
        <span>vs</span>
        <AxisDropdown
          axis="X"
          value={xAxis}
          otherValue={yAxis}
          onChange={(nextAxis) => onAxisChange?.({ xAxis: nextAxis, yAxis })}
          options={axisOptions}
        />
      </div>
      <div className="draft-analytics-fullscreen__body">
        <ScatterPlot
          scatter={scatter}
          compact={false}
          fullscreen
          onTogglePin={onTogglePin}
          onSelectPlayer={onSelectPlayer}
          pinLimitReached={pinLimitReached}
        />
      </div>
      <div className="draft-analytics-fullscreen__hint">Drag to pan / pinch or scroll to zoom / tap a dot to inspect</div>
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
  onAddToBoard,
  boardIds,
  onSelectPlayer,
  onOpenStatistics,
  onClose,
  presentation = 'modal',
  className = '',
}) {
  const { darkMode } = useTheme();
  const [fullscreen, setFullscreen] = useState(false);
  const [localSelectedPlayerId, setLocalSelectedPlayerId] = useState(() => String(player?.id ?? ''));
  const playersById = useMemo(() => new Map((candidates ?? []).map((item) => [String(item.id), item])), [candidates]);
  const selectedPlayer = playersById.get(localSelectedPlayerId) ?? player;
  const axisOptions = useMemo(() => getDraftAnalyticsAxisOptions(selectedPlayer), [selectedPlayer]);
  const effectiveAxisPair = useMemo(
    () => normalizeDraftAnalyticsAxisPair(selectedPlayer, xAxis, yAxis),
    [selectedPlayer, xAxis, yAxis],
  );
  const effectiveXAxis = effectiveAxisPair.xAxis;
  const effectiveYAxis = effectiveAxisPair.yAxis;
  const pinnedPlayers = useMemo(() => (
    (pinnedPlayerIds ?? []).map((id) => playersById.get(String(id))).filter(Boolean)
  ), [pinnedPlayerIds, playersById]);
  const snapshotRows = useMemo(() => buildDraftAnalyticsSnapshot(selectedPlayer, candidates), [candidates, selectedPlayer]);
  const scatter = useMemo(() => buildDraftAnalyticsScatter({
    candidates,
    focusedPlayerId: selectedPlayer?.id,
    pinnedPlayerIds,
    xAxis: effectiveXAxis,
    yAxis: effectiveYAxis,
  }), [candidates, effectiveXAxis, effectiveYAxis, pinnedPlayerIds, selectedPlayer?.id]);
  const compareRows = useMemo(() => buildDraftAnalyticsCompareRows(pinnedPlayers), [pinnedPlayers]);
  const compareLimit = getDraftAnalyticsCompareLimit();
  const playerId = String(selectedPlayer?.id ?? '');
  const pinned = pinnedPlayerIds?.map(String).includes(playerId);
  const onBoard = useMemo(() => {
    if (!playerId) return false;
    if (boardIds instanceof Set) return boardIds.has(playerId);
    return (boardIds ?? []).map(String).includes(playerId);
  }, [boardIds, playerId]);
  const pinDisabled = !pinned && (pinnedPlayerIds?.length ?? 0) >= compareLimit;
  const pinLimitReached = (pinnedPlayerIds?.length ?? 0) >= compareLimit;
  const rating = Number(selectedPlayer?.draftModel?.score);
  const verdict = buildVerdict(selectedPlayer);
  const compact = presentation !== 'inline';
  const ratingRank = snapshotRows.find((row) => row.key === 'rating')?.rank;
  const teamTheme = selectedPlayer?.team ? getTeamVisualTheme(selectedPlayer.team, darkMode, { logoSide: 'start' }) : null;
  const hasTeamGradient = Boolean(teamTheme?.gradient);
  const positionColor = getCompanionPositionColor(selectedPlayer?.position);
  const heroForeground = hasTeamGradient
    ? (teamTheme.gradientFullForeground ?? teamTheme.gradientForeground)
    : 'var(--color-label)';
  const heroMuted = hasTeamGradient
    ? (heroForeground === '#FFFFFF' ? 'rgba(255,255,255,0.84)' : 'rgba(12,15,20,0.78)')
    : 'var(--color-label-secondary)';
  const heroStyle = {
    background: hasTeamGradient ? teamTheme.gradient : 'var(--color-bg)',
    '--draft-analytics-hero-accent': teamTheme?.borderColor ?? positionColor ?? 'var(--color-accent)',
    '--draft-analytics-hero-fg': heroForeground,
    '--draft-analytics-hero-muted': heroMuted,
    '--draft-analytics-hero-subtle': hasTeamGradient ? (teamTheme.gradientFullSubtle ?? teamTheme.gradientSubtle) : 'var(--color-fill-secondary)',
    '--draft-analytics-hero-action-fg': heroForeground,
    '--draft-analytics-position-bg': positionColor ?? (hasTeamGradient ? (teamTheme.gradientFullSubtle ?? teamTheme.gradientSubtle) : 'var(--color-fill-secondary)'),
    '--draft-analytics-position-fg': positionColor ? getPositionTextColor(positionColor) : heroForeground,
  };

  useEffect(() => {
    setLocalSelectedPlayerId(String(player?.id ?? ''));
  }, [player?.id]);

  if (!selectedPlayer) return null;

  const handleSelectPlayer = (nextPlayerId) => {
    const id = String(nextPlayerId ?? '');
    if (!id) return;
    if (onSelectPlayer) {
      onSelectPlayer(id);
      return;
    }
    setLocalSelectedPlayerId(id);
  };

  const content = (
    <>
      <header className="draft-analytics-hero" style={heroStyle}>
        {hasTeamGradient ? <div className="draft-analytics-hero__gradient" style={{ background: teamTheme.gradientOverlay }} aria-hidden="true" /> : null}
        <div className="draft-analytics-hero__row">
          <PlayerAvatar player={selectedPlayer} />
          <div className="draft-analytics-hero__main">
            <div className="draft-analytics-hero__name-row">
              <strong>{getPlayerName(selectedPlayer)}</strong>
              <PositionBadge position={selectedPlayer.position} />
            </div>
            <span>{formatMeta(selectedPlayer)}</span>
          </div>
          <div className="draft-analytics-hero__score">
            <strong>{Number.isFinite(rating) ? rating.toFixed(1) : '-'}</strong>
            <span>{ratingRank ? `Rating / #${ratingRank} ${selectedPlayer.position || 'POS'}` : 'Rating'}</span>
          </div>
          <button type="button" className="draft-analytics-close" onClick={onClose} aria-label="Close analytics">
            <CloseIcon />
          </button>
        </div>
        <div className="draft-analytics-hero__footer">
          <span className={`draft-analytics-verdict draft-analytics-verdict--${verdict.tone}`}>{verdict.label}</span>
          <span className="draft-analytics-verdict__detail">{verdict.detail}</span>
          <span className="draft-analytics-hero__spacer" />
          <div className="draft-analytics-hero__actions">
            <button
              type="button"
              className="draft-analytics-action draft-analytics-action--outline"
              onClick={() => onOpenStatistics?.(selectedPlayer.id)}
            >
              Statistics
              <ArrowIcon />
            </button>
            {onAddToBoard ? (
              <button
                type="button"
                className={['draft-analytics-action', onBoard ? 'draft-analytics-action--ghost is-added' : 'draft-analytics-action--signature'].filter(Boolean).join(' ')}
                onClick={() => onAddToBoard?.(selectedPlayer)}
                disabled={onBoard}
                aria-pressed={onBoard}
              >
                {onBoard ? <CheckIcon /> : <AddIcon />}
                {onBoard ? 'Added' : 'Add'}
              </button>
            ) : null}
            <button
              type="button"
              className={['draft-analytics-action draft-analytics-action--ghost', pinned ? 'is-pinned' : ''].filter(Boolean).join(' ')}
              onClick={() => onTogglePin?.(selectedPlayer.id)}
              disabled={pinDisabled}
              aria-pressed={pinned}
            >
              <PinIcon pinned={pinned} />
              {pinned ? 'Pinned' : pinDisabled ? 'Full' : 'Pin'}
            </button>
          </div>
        </div>
      </header>

      <div className="draft-analytics-body">
        <section className="draft-analytics-section draft-analytics-section--snapshot">
          <div className="draft-analytics-section__header">
            <h2>Value Snapshot</h2>
            <span>vs {scatter.peerCount} {selectedPlayer.position || 'peer'} peers</span>
          </div>
          <SnapshotPills rows={snapshotRows} />
        </section>

        <section className="draft-analytics-section draft-analytics-section--chart">
          <div className="draft-analytics-section__header draft-analytics-section__header--axes">
            <h2>Positional Map</h2>
            <div className="draft-analytics-axis-pair">
              <AxisDropdown
                axis="Y"
                value={effectiveYAxis}
                otherValue={effectiveXAxis}
                onChange={(nextAxis) => onAxisChange?.({ xAxis: effectiveXAxis, yAxis: nextAxis })}
                options={axisOptions}
              />
              <span>vs</span>
              <AxisDropdown
                axis="X"
                value={effectiveXAxis}
                otherValue={effectiveYAxis}
                onChange={(nextAxis) => onAxisChange?.({ xAxis: nextAxis, yAxis: effectiveYAxis })}
                options={axisOptions}
              />
            </div>
          </div>
          <div className="draft-analytics-chart-card">
            <ScatterPlot
              scatter={scatter}
              compact={compact}
              onRequestFullscreen={() => setFullscreen(true)}
              onTogglePin={onTogglePin}
              onSelectPlayer={handleSelectPlayer}
              pinLimitReached={pinLimitReached}
            />
            <div className="draft-analytics-chart-legend">
              <span><i className="draft-analytics-chart-legend__face" />Selected</span>
              <span><i className="draft-analytics-chart-legend__pin" />Pinned</span>
              <span><i />Peer</span>
              {scatter.referenceLine ? <span><b />{scatter.referenceLine.label}</span> : null}
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

      {fullscreen ? (
        <FullscreenScatter
          player={selectedPlayer}
          scatter={scatter}
          xAxis={effectiveXAxis}
          yAxis={effectiveYAxis}
          onAxisChange={onAxisChange}
          onExit={() => setFullscreen(false)}
          onTogglePin={onTogglePin}
          onSelectPlayer={handleSelectPlayer}
          pinLimitReached={pinLimitReached}
          axisOptions={axisOptions}
        />
      ) : null}
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
