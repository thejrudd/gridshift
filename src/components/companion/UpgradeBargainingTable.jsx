import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { headshot } from '../../utils/playerApi';
import { darkenHex, getTeamVisualTheme } from '../../utils/teamVisualTheme';
import { CompanionSelectorButton } from './CompanionSelectorControls.jsx';
import { getCompanionPositionColor } from '../../utils/companionAssetVisuals.js';
import CompanionPlayerRow, { CompanionPlayerMetric } from './CompanionPlayerRow.jsx';

const DEFAULT_POSTURE_OPTIONS = [
  { level: 0, label: 'Underpay', description: 'Try to buy low' },
  { level: 1, label: 'Lean Under', description: 'Slight edge to me' },
  { level: 2, label: 'Fair', description: 'Close to even' },
  { level: 3, label: 'Lean Over', description: 'Pay a little extra' },
  { level: 4, label: 'Overpay', description: 'Pay up for the upgrade' },
];

const MOVER_DISPLAY_LIMIT = 8;

const TRADE_LOGO_SIDE_THEME_OPTIONS = { logoSide: 'end' };

const MOVER_POSITION_ORDER = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB', 'DEF'];

const MOVER_SORT_OPTIONS = [
  { id: 'highestValue', label: 'Highest Value' },
  { id: 'lowestValue', label: 'Lowest Value' },
  { id: 'highestPpg', label: 'Highest PPG' },
  { id: 'bestRank', label: 'Best Rank' },
];

function normalizePlayer(input) {
  const player = input?.player ?? input ?? {};
  const rank = player.rankInfo ?? player.rank ?? input?.rankInfo ?? input?.rank ?? null;
  return {
    raw: player,
    id: player.id ?? input?.id ?? input?.playerId ?? '',
    espnId: player.espnId ?? player.espn_id ?? player.espnID ?? input?.espnId ?? input?.espn_id ?? null,
    name: player.displayName ?? player.fullName ?? player.full_name ?? player.name ?? input?.name ?? 'Unknown Player',
    team: player.team ?? player.teamId ?? input?.team ?? '',
    position: player.position ?? input?.position ?? '',
    ppg: player.ppg ?? input?.ppg ?? null,
    value: player.value ?? player.tradeValue ?? player.ktcValue ?? input?.value ?? input?.tradeValue ?? input?.ktcValue ?? null,
    valueLabel: player.valueLabel ?? player.tradeValueLabel ?? input?.valueLabel ?? input?.tradeValueLabel ?? null,
    rank,
    note: player.note ?? input?.note ?? input?.description ?? input?.reason ?? '',
  };
}

function sleeperHeadshot(playerId) {
  if (!playerId) return null;
  return `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`;
}

function getPositionColor(position) {
  return getCompanionPositionColor(position);
}

function normalizePosition(position) {
  const normalized = String(position ?? '').toUpperCase();
  if (normalized === 'DE' || normalized === 'DT') return 'DL';
  if (normalized === 'CB' || normalized === 'S') return 'DB';
  if (normalized === 'PK') return 'K';
  if (normalized === 'DST') return 'DEF';
  return normalized || 'UNK';
}

function getRankNumber(rank) {
  if (!rank || typeof rank === 'string') return null;
  const value = rank.rank ?? rank.overallRank ?? rank.value ?? null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function compareNumbers(a, b, direction = 'desc') {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const left = Number(a);
  const right = Number(b);
  const leftValid = Number.isFinite(left);
  const rightValid = Number.isFinite(right);
  if (!leftValid && !rightValid) return 0;
  if (!leftValid) return 1;
  if (!rightValid) return -1;
  return direction === 'asc' ? left - right : right - left;
}

function compareMoverRows(a, b, sortMode) {
  const left = normalizePlayer(a);
  const right = normalizePlayer(b);
  const fallback = (
    compareNumbers(left.value, right.value, 'desc')
    || String(left.name ?? '').localeCompare(String(right.name ?? ''), undefined, { sensitivity: 'base' })
  );

  if (sortMode === 'lowestValue') {
    return compareNumbers(left.value, right.value, 'asc') || fallback;
  }
  if (sortMode === 'highestPpg') {
    return compareNumbers(left.ppg, right.ppg, 'desc') || fallback;
  }
  if (sortMode === 'bestRank') {
    return compareNumbers(getRankNumber(left.rank), getRankNumber(right.rank), 'asc') || fallback;
  }
  return fallback;
}

function compareMoverRowsByTradeValueDesc(a, b) {
  const left = normalizePlayer(a);
  const right = normalizePlayer(b);
  return (
    compareNumbers(left.value, right.value, 'desc')
    || compareNumbers(left.ppg, right.ppg, 'desc')
    || String(left.name ?? '').localeCompare(String(right.name ?? ''), undefined, { sensitivity: 'base' })
  );
}

function formatDecimal(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number.toFixed(digits);
}

function formatValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(number);
}

function formatRank(rank) {
  if (!rank) return null;
  if (typeof rank === 'string') return rank;
  const pos = rank.posLabel ?? rank.position ?? rank.pos ?? '';
  const number = rank.rank ?? rank.overallRank ?? rank.value ?? null;
  if (number == null) return null;
  return pos ? `${pos}${number}` : `#${number}`;
}

function Metric({ label, value, labelColor = 'var(--color-label-tertiary)', valueColor = 'var(--color-label)' }) {
  if (value == null || value === '') return null;
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-widest lg:text-[12px] xl:text-[13px]" style={{ color: labelColor }}>
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-bold tabular-nums lg:mt-1 lg:text-xl xl:text-2xl" style={{ color: valueColor }}>
        {value}
      </div>
    </div>
  );
}

function StageLabel({ children }) {
  return (
    <span
      className="text-[11px] font-black uppercase leading-none tracking-[0.22em]"
      style={{ color: 'var(--color-accent-red)', fontFamily: "'Figtree', sans-serif" }}
    >
      {children}
    </span>
  );
}

function TargetHero({ selectedPlayer, darkMode, onChooseTarget, onOpenPlayer }) {
  const player = selectedPlayer ? normalizePlayer(selectedPlayer) : null;
  const rankLabel = formatRank(player?.rank);
  const valueLabel = player?.valueLabel ?? formatValue(player?.value);
  const ppgLabel = formatDecimal(player?.ppg);
  const teamTheme = player ? getTeamVisualTheme(player.team, darkMode, TRADE_LOGO_SIDE_THEME_OPTIONS) : null;
  const teamKey = teamTheme?.logoKey ?? '';
  const primary = teamTheme?.color ?? null;
  const heroGradient = teamTheme?.gradient ?? null;
  const heroOnBg = heroGradient ? teamTheme.gradientForeground : 'var(--color-label)';
  const heroMuted = heroGradient ? teamTheme.gradientMuted : 'var(--color-label-secondary)';
  const heroMetricTheme = heroGradient
    ? [
        { foreground: teamTheme.gradientStartForeground, muted: teamTheme.gradientStartMuted },
        { foreground: teamTheme.gradientMidForeground, muted: teamTheme.gradientMidMuted },
        { foreground: teamTheme.gradientEndForeground, muted: teamTheme.gradientEndMuted },
      ]
    : [
        { foreground: heroOnBg, muted: heroMuted },
        { foreground: heroOnBg, muted: heroMuted },
        { foreground: heroOnBg, muted: heroMuted },
      ];
  const primaryPhotoSrc = sleeperHeadshot(player?.id);
  const fallbackPhotoSrc = player?.espnId ? headshot(player.espnId) : null;
  const playerPhotoSrc = primaryPhotoSrc ?? fallbackPhotoSrc;

  if (!player) {
    return (
      <button
        type="button"
        onClick={onChooseTarget}
        data-testid="trade-upgrade-choose-target"
        className="flex min-h-[12rem] w-full flex-col items-center justify-center border border-dashed px-6 py-8 text-center transition-opacity active:opacity-70"
        style={{
          background: 'transparent',
          borderColor: 'var(--color-separator)',
          color: 'var(--color-label)',
        }}
      >
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full text-2xl font-black"
          style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
          aria-hidden="true"
        >
          +
        </span>
        <span className="mt-4 text-xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em' }}>
          Choose Target Player
        </span>
        <span className="mt-2 max-w-xs text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
          Pick the player you want to turn this search toward.
        </span>
      </button>
    );
  }

  return (
    <div
      className="relative flex min-h-[13.5rem] flex-col justify-center overflow-hidden p-5 sm:p-6 lg:min-h-[16.5rem] lg:p-7 xl:min-h-[18rem] xl:p-8"
      style={{
        background: heroGradient ?? 'var(--color-fill-tertiary)',
        borderLeft: teamTheme?.borderColor ? `4px solid ${teamTheme.borderColor}` : undefined,
        color: heroOnBg,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: teamTheme?.gradientOverlay ?? 'transparent',
        }}
        aria-hidden="true"
      />
      {teamKey && (
        <img
          src={`https://a.espncdn.com/i/teamlogos/nfl/500/${teamKey}.png`}
          alt=""
          className="pointer-events-none absolute inset-y-0 right-4 hidden h-full w-40 object-contain opacity-[0.13] sm:block"
          aria-hidden="true"
          onError={event => { event.currentTarget.style.display = 'none'; }}
        />
      )}
      <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-stretch">
        <div className="shrink-0">
          {playerPhotoSrc ? (
            <img
              src={playerPhotoSrc}
              alt=""
              className="h-20 w-20 rounded-full object-cover min-[390px]:h-24 min-[390px]:w-24 sm:h-32 sm:w-32 lg:h-36 lg:w-36 xl:h-40 xl:w-40"
              style={{
                background: primary ? darkenHex(primary, 0.45) : 'var(--color-fill)',
                boxShadow: '0 8px 20px rgba(0,0,0,0.24)',
              }}
              onError={event => {
                if (fallbackPhotoSrc && event.currentTarget.src !== fallbackPhotoSrc) {
                  event.currentTarget.src = fallbackPhotoSrc;
                  return;
                }
                event.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full min-[390px]:h-24 min-[390px]:w-24 sm:h-32 sm:w-32 lg:h-36 lg:w-36 xl:h-40 xl:w-40"
              style={{
                background: primary ? darkenHex(primary, 0.45) : 'var(--color-fill)',
                boxShadow: '0 8px 20px rgba(0,0,0,0.24)',
              }}
            >
              <span className="text-3xl font-black" style={{ color: heroMuted }}>
                {player.name.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        <div
          onClick={onOpenPlayer ? () => onOpenPlayer(player.raw) : undefined}
          onKeyDown={onOpenPlayer ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpenPlayer(player.raw);
            }
          } : undefined}
          className="group min-w-0 flex-1 text-left"
          role={onOpenPlayer ? 'button' : undefined}
          tabIndex={onOpenPlayer ? 0 : undefined}
        >
          <h3
            className="line-clamp-2 max-w-[24rem] pr-0 text-[clamp(2.25rem,11vw,3rem)] font-black uppercase leading-[0.9] sm:text-5xl"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.01em' }}
          >
            {player.name}
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] font-black uppercase tracking-[0.16em] lg:text-base xl:text-lg" style={{ color: heroMuted, fontFamily: "'Barlow Condensed', sans-serif" }}>
            {[player.team, player.position].filter(Boolean).join(' · ') || 'Player'}
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-5 grid grid-cols-3 gap-4 sm:pl-[9.25rem] lg:mt-7 lg:gap-6 lg:pl-[10.25rem] xl:pl-[11.25rem]">
        <Metric label="PPG" value={ppgLabel ?? '—'} labelColor={heroMetricTheme[0].muted} valueColor={heroMetricTheme[0].foreground} />
        <Metric label="Rank" value={rankLabel ?? '—'} labelColor={heroMetricTheme[1].muted} valueColor={heroMetricTheme[1].foreground} />
        <Metric label="Value" value={valueLabel ?? '—'} labelColor={heroMetricTheme[2].muted} valueColor={heroMetricTheme[2].foreground} />
      </div>
    </div>
  );
}

function MoverRow({ row, selected, darkMode, onToggleMover }) {
  const player = normalizePlayer(row);
  const ppgLabel = formatDecimal(player.ppg);
  const valueLabel = player.valueLabel ?? formatValue(player.value);
  const rankLabel = formatRank(player.rank);

  return (
    <CompanionPlayerRow
      player={{
        ...player.raw,
        id: player.id,
        name: player.name,
        team: player.team,
        position: player.position,
        espnId: player.espnId,
      }}
      name={player.name}
      darkMode={darkMode}
      selected={selected}
      teamThemeOptions={TRADE_LOGO_SIDE_THEME_OPTIONS}
      showSelectionMark
      metaSegments={[
        player.team || 'Mover',
        rankLabel,
        ppgLabel ? `${ppgLabel} PPG` : null,
        player.note,
      ].filter(Boolean)}
      columns={[
        <CompanionPlayerMetric
          key="value"
          value={valueLabel ?? '—'}
          kicker="Value"
        />,
      ]}
      onClick={() => onToggleMover?.(player.id, row)}
      dataTestId={`trade-upgrade-mover-${player.id}`}
      gridTemplate="auto auto auto minmax(0,1fr) auto auto"
      style={{
        borderColor: selected ? 'var(--color-signature)' : 'var(--color-separator)',
        minHeight: '5rem',
      }}
    />
  );
}

function SegmentedChoice({ title, value, options, onChange }) {
  return (
    <div
      className="border px-4 py-3"
      style={{
        background: 'transparent',
        borderColor: 'var(--color-separator)',
        color: 'var(--color-label)',
      }}
    >
      <div className="mb-2 text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--color-label-tertiary)', fontFamily: "'Barlow Condensed', sans-serif" }}>
        {title}
      </div>
      <div
        className="grid gap-1 rounded-xl p-1"
        role="group"
        aria-label={title}
        style={{ background: 'var(--color-fill)', gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange?.(option.value)}
              className="min-h-10 rounded-lg px-3 text-sm font-extrabold transition-opacity active:opacity-70"
              style={{
                background: selected ? 'var(--color-label)' : 'transparent',
                color: selected ? 'var(--color-bg)' : 'var(--color-label-secondary)',
                boxShadow: selected ? '0 6px 14px rgba(0,0,0,0.12)' : 'none',
              }}
              aria-pressed={selected}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FilterChip({ active, children, onClick, accentColor = null }) {
  const activeBorder = accentColor ?? 'var(--color-signature)';
  return (
    <CompanionSelectorButton
      onClick={onClick}
      active={active}
      size="sm"
      style={{
        borderColor: active ? activeBorder : undefined,
        boxShadow: active && accentColor ? `inset 0 -3px 0 ${accentColor}` : 'none',
      }}
    >
      {children}
    </CompanionSelectorButton>
  );
}

function SortChip({ active, children, onClick }) {
  return (
    <CompanionSelectorButton
      onClick={onClick}
      active={active}
      size="sm"
    >
      {children}
    </CompanionSelectorButton>
  );
}

function ScrollCueRail({ children, ariaLabel, role = 'group' }) {
  const railRef = useRef(null);
  const [scrollCue, setScrollCue] = useState({ left: false, right: false });

  const updateScrollCue = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const next = {
      left: maxScrollLeft > 1 && rail.scrollLeft > 1,
      right: maxScrollLeft > 1 && rail.scrollLeft < maxScrollLeft - 1,
    };
    setScrollCue((prev) => (
      prev.left === next.left && prev.right === next.right ? prev : next
    ));
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;

    const frame = window.requestAnimationFrame(updateScrollCue);
    rail.addEventListener('scroll', updateScrollCue, { passive: true });
    window.addEventListener('resize', updateScrollCue);

    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateScrollCue);
      resizeObserver.observe(rail);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      rail.removeEventListener('scroll', updateScrollCue);
      window.removeEventListener('resize', updateScrollCue);
      resizeObserver?.disconnect();
    };
  }, [children, updateScrollCue]);

  return (
    <div className="upgrade-mover-control-wrap">
      <div ref={railRef} className="upgrade-mover-control-rail" role={role} aria-label={ariaLabel}>
        {children}
      </div>
      {scrollCue.left && <span className="upgrade-mover-scroll-cue upgrade-mover-scroll-cue--left" aria-hidden="true" />}
      {scrollCue.right && <span className="upgrade-mover-scroll-cue upgrade-mover-scroll-cue--right" aria-hidden="true" />}
    </div>
  );
}

function PostureStrip({ postureOptions, tradePostureLevel, onPostureChange }) {
  const options = postureOptions?.length ? postureOptions : DEFAULT_POSTURE_OPTIONS;
  const levels = options.map((option) => Number(option.level)).filter(Number.isFinite);
  const minLevel = levels.length ? Math.min(...levels) : 0;
  const maxLevel = levels.length ? Math.max(...levels) : 4;
  const range = Math.max(1, maxLevel - minLevel);
  const currentLevel = Math.min(maxLevel, Math.max(minLevel, Number(tradePostureLevel) || 0));
  const needleLeft = `${((currentLevel - minLevel) / range) * 100}%`;
  const selectedOption = options.reduce((closest, option) => (
    Math.abs(Number(option.level) - currentLevel) < Math.abs(Number(closest.level) - currentLevel)
      ? option
      : closest
  ), options[0]);
  const handlePostureInput = useCallback((event) => {
    const nextLevel = Math.round(Number(event.target.value) * 100) / 100;
    onPostureChange?.(nextLevel);
  }, [onPostureChange]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-[11px] font-black uppercase tracking-[0.26em]" style={{ color: 'var(--color-label-tertiary)', fontFamily: "'Barlow Condensed', sans-serif" }}>
          Trade Posture
        </div>
        <div className="text-2xl font-black uppercase leading-none" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.03em' }}>
          {selectedOption?.label}
        </div>
      </div>
      <div className="relative h-[4.5rem] overflow-hidden rounded-2xl" style={{ background: 'linear-gradient(90deg, var(--color-accent-green) 0%, var(--color-signature) 50%, var(--color-accent-red) 100%)' }}>
        <input
          type="range"
          min={minLevel}
          max={maxLevel}
          step="0.01"
          value={currentLevel}
          onChange={handlePostureInput}
          className="absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
          aria-label="Trade posture"
          aria-valuetext={selectedOption?.label}
        />
        <span
          className="absolute top-1/2 z-10 h-[5.8rem] w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: needleLeft,
            background: 'var(--color-bg-secondary)',
            boxShadow: '0 0 0 1px var(--color-label), 0 10px 24px rgba(0,0,0,0.28)',
          }}
        />
        <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
          {options.map((option) => (
            <div
              key={option.level}
              className="flex items-center justify-center border-r px-1.5 text-center"
              style={{
                borderColor: 'rgba(255,255,255,0.22)',
                color: 'var(--color-signature-fg)',
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
              title={option.description}
            >
              <span className="block truncate text-[11px] font-black uppercase tracking-[0.16em]">
                {option.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const UpgradeBargainingTable = memo(function UpgradeBargainingTable({
  selectedPlayer = null,
  moverRows = [],
  selectedOutgoingPlayerIds = [],
  allowOutgoingPicks = false,
  allowIncomingPicks = false,
  allowPackages = false,
  darkMode = false,
  postureOptions = DEFAULT_POSTURE_OPTIONS,
  tradePostureLevel = 2,
  canSearch = false,
  searchPending = false,
  onChooseTarget,
  onChangeTarget,
  onToggleMover,
  onAddPlayers,
  onClearPlayers,
  onAllowOutgoingPicksChange,
  onAllowIncomingPicksChange,
  onAllowPackagesChange,
  onPostureChange,
  onRunSearch,
  onOpenPlayer,
}) {
  const [moverPositionFilter, setMoverPositionFilter] = useState('ALL');
  const [moverSortMode, setMoverSortMode] = useState('highestValue');
  const [pinnedMoverOrder, setPinnedMoverOrder] = useState(null);

  const selectedIds = useMemo(
    () => new Set((selectedOutgoingPlayerIds ?? []).map(String)),
    [selectedOutgoingPlayerIds],
  );

  const moverPositionOptions = useMemo(() => {
    const positions = new Set(
      (moverRows ?? [])
        .map((row) => normalizePosition(normalizePlayer(row).position))
        .filter((position) => position && position !== 'UNK'),
    );
    return MOVER_POSITION_ORDER.filter((position) => position === 'ALL' || positions.has(position));
  }, [moverRows]);

  const buildOrderedMoverRows = useCallback((positionFilter, sortMode, pinSelected = false) => {
    const allRows = (moverRows ?? []).filter(Boolean);
    const filteredRows = allRows
      .filter((row) => {
        if (positionFilter === 'ALL') return true;
        return normalizePosition(normalizePlayer(row).position) === positionFilter;
      });

    if (pinSelected) {
      const selectedRows = allRows
        .filter((row) => selectedIds.has(String(normalizePlayer(row).id)))
        .sort(compareMoverRowsByTradeValueDesc);
      const pinnedIds = new Set(selectedRows.map((row) => String(normalizePlayer(row).id)));
      const suggestionRows = filteredRows
        .filter((row) => !pinnedIds.has(String(normalizePlayer(row).id)))
        .sort((a, b) => compareMoverRows(a, b, sortMode));

      return [...selectedRows, ...suggestionRows];
    }

    return [...filteredRows].sort((a, b) => compareMoverRows(a, b, sortMode));
  }, [moverRows, selectedIds]);

  const visibleMoverRows = useMemo(() => {
    const rowsById = new Map(
      (moverRows ?? [])
        .filter(Boolean)
        .map((row) => [String(normalizePlayer(row).id), row]),
    );

    if (pinnedMoverOrder) {
      return pinnedMoverOrder
        .map((id) => rowsById.get(id))
        .filter(Boolean)
        .slice(0, MOVER_DISPLAY_LIMIT);
    }

    return buildOrderedMoverRows(moverPositionFilter, moverSortMode, false)
      .slice(0, MOVER_DISPLAY_LIMIT);
  }, [buildOrderedMoverRows, moverPositionFilter, moverRows, moverSortMode, pinnedMoverOrder]);

  const visibleMoverPoolCount = useMemo(() => {
    if (pinnedMoverOrder) return pinnedMoverOrder.length;
    let count = 0;
    for (const row of buildOrderedMoverRows(moverPositionFilter, moverSortMode, false)) {
      if (row) count += 1;
    }
    return count;
  }, [buildOrderedMoverRows, moverPositionFilter, moverSortMode, pinnedMoverOrder]);

  const pinMoversForControls = useCallback((positionFilter, sortMode) => {
    const nextOrder = buildOrderedMoverRows(positionFilter, sortMode, true)
      .map((row) => String(normalizePlayer(row).id));
    setPinnedMoverOrder(nextOrder);
  }, [buildOrderedMoverRows]);

  const selectedCount = selectedIds.size;

  return (
    <section
      className="overflow-hidden border"
      style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-separator)' }}
    >
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="p-5 lg:border-r lg:p-8" style={{ borderColor: 'var(--color-separator)' }}>
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <StageLabel>Upgrade</StageLabel>
              <span className="mt-2 block text-sm font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
                Find a better starter
              </span>
            </div>
            {selectedPlayer && (
              <button
                type="button"
                onClick={onChangeTarget}
                data-testid="trade-upgrade-change-target"
                className="shrink-0 text-[12px] font-black uppercase tracking-[0.18em] transition-opacity active:opacity-70"
                style={{ color: 'var(--color-accent)', fontFamily: "'Figtree', sans-serif" }}
              >
                Change
              </button>
            )}
          </div>
          <TargetHero
            selectedPlayer={selectedPlayer}
            darkMode={darkMode}
            onChooseTarget={onChooseTarget}
            onOpenPlayer={onOpenPlayer}
          />
          <div className="mt-8">
            <SegmentedChoice
              title="Picks Back"
              value={allowIncomingPicks ? 'allow' : 'none'}
              options={[
                { value: 'none', label: 'No picks' },
                { value: 'allow', label: 'Allow picks' },
              ]}
              onChange={(next) => onAllowIncomingPicksChange?.(next === 'allow')}
            />
          </div>
        </section>

        <section className="flex min-w-0 flex-col p-5 lg:p-8">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <StageLabel>Willing To Give Up</StageLabel>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-sm font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
                {selectedCount} selected
              </span>
              <button
                type="button"
                onClick={onAddPlayers}
                data-testid="trade-upgrade-add-movers"
                className="rounded-lg px-3 py-2 text-xs font-bold transition-opacity active:opacity-70"
                style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
              >
                Add
              </button>
              <button
                type="button"
                onClick={onClearPlayers}
                disabled={!selectedCount}
                className="rounded-lg border px-3 py-2 text-xs font-bold transition-opacity active:opacity-70 disabled:opacity-45"
                style={{
                  background: 'var(--color-bg-secondary)',
                  borderColor: 'var(--color-separator)',
                  color: 'var(--color-label-secondary)',
                }}
              >
                Clear players
              </button>
            </div>
          </div>

          <div className="grid gap-3 border-y py-4" style={{ borderColor: 'var(--color-separator)' }}>
            <ScrollCueRail ariaLabel="Filter movable players by position">
              {moverPositionOptions.map((position) => (
                <FilterChip
                  key={position}
                  active={moverPositionFilter === position}
                  accentColor={position === 'ALL' ? null : getPositionColor(position)}
                  onClick={() => {
                    if (position !== moverPositionFilter) pinMoversForControls(position, moverSortMode);
                    setMoverPositionFilter(position);
                  }}
                >
                  {position === 'ALL' ? 'All' : position}
                </FilterChip>
              ))}
            </ScrollCueRail>
            <ScrollCueRail ariaLabel="Sort movable player suggestions">
              {MOVER_SORT_OPTIONS.map((option) => (
                <SortChip
                  key={option.id}
                  active={moverSortMode === option.id}
                  onClick={() => {
                    if (option.id !== moverSortMode) pinMoversForControls(moverPositionFilter, option.id);
                    setMoverSortMode(option.id);
                  }}
                >
                  {option.label}
                </SortChip>
              ))}
            </ScrollCueRail>
            <div className="text-xs font-semibold" style={{ color: 'var(--color-label-tertiary)' }}>
              Showing {visibleMoverRows.length} of {visibleMoverPoolCount} available players.
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {visibleMoverRows.length ? (
              visibleMoverRows.map((row) => {
                const player = normalizePlayer(row);
                return (
                  <MoverRow
                    key={player.id || player.name}
                    row={row}
                    selected={selectedIds.has(String(player.id))}
                    darkMode={darkMode}
                    onToggleMover={onToggleMover}
                  />
                );
              })
            ) : (
              <button
                type="button"
                onClick={onAddPlayers}
                data-testid="trade-upgrade-empty-add-movers"
                className="min-h-[8rem] rounded-xl border px-4 py-6 text-center transition-opacity active:opacity-70"
                style={{
                  background: 'var(--color-bg-secondary)',
                  borderColor: 'var(--color-separator)',
                  color: 'var(--color-label)',
                }}
              >
                <span className="block text-lg font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em' }}>
                  Add Players
                </span>
                <span className="mt-1 block text-sm" style={{ color: 'var(--color-label-secondary)' }}>
                  Build the pool you are comfortable moving.
                </span>
              </button>
            )}
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <SegmentedChoice
              title="My Picks"
              value={allowOutgoingPicks ? 'include' : 'players'}
              options={[
                { value: 'players', label: 'Players only' },
                { value: 'include', label: 'Allow picks' },
              ]}
              onChange={(next) => onAllowOutgoingPicksChange?.(next === 'include')}
            />
            <SegmentedChoice
              title="Package Size"
              value={allowPackages ? 'package' : 'single'}
              options={[
                { value: 'single', label: 'Single' },
                { value: 'package', label: 'Up to 3' },
              ]}
              onChange={(next) => onAllowPackagesChange?.(next === 'package')}
            />
          </div>
        </section>
      </div>

      <section className="border-t p-5 lg:p-8" style={{ borderColor: 'var(--color-separator)' }}>
        <PostureStrip
          postureOptions={postureOptions}
          tradePostureLevel={tradePostureLevel}
          onPostureChange={onPostureChange}
        />
        <button
          type="button"
          onClick={onRunSearch}
          disabled={!canSearch || searchPending}
          className="mt-8 flex min-h-[5.5rem] w-full items-center justify-between gap-4 rounded-2xl px-7 py-5 text-left uppercase transition-opacity active:opacity-70 disabled:opacity-45"
          style={{
            background: 'var(--color-label)',
            color: 'var(--color-bg)',
            fontFamily: "'Barlow Condensed', sans-serif",
            letterSpacing: '0.18em',
          }}
        >
          <span className="text-2xl font-black leading-none">{searchPending ? 'Searching...' : 'Find Upgrades'}</span>
          <span
            className="rounded-full px-4 py-2 text-sm font-black tracking-[0.14em]"
            style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
          >
            Search
          </span>
        </button>
      </section>
    </section>
  );
});

UpgradeBargainingTable.displayName = 'UpgradeBargainingTable';

export default UpgradeBargainingTable;
