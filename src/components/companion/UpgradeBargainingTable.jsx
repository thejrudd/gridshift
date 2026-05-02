import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getTeamColorKey, getTeamPalette } from '../../data/teamColors';
import { headshot } from '../../utils/playerApi';

const DEFAULT_POSTURE_OPTIONS = [
  { level: 0, label: 'Underpay', description: 'Try to buy low' },
  { level: 1, label: 'Lean Under', description: 'Slight edge to me' },
  { level: 2, label: 'Fair', description: 'Close to even' },
  { level: 3, label: 'Lean Over', description: 'Pay a little extra' },
  { level: 4, label: 'Overpay', description: 'Pay up for the upgrade' },
];

const REVERSED_GRADIENT_TEAMS = new Set(['dal', 'gb', 'jax', 'la', 'lar', 'lv', 'no', 'pit', 'wsh']);

const POSITION_COLORS = {
  QB: '#5AADFF',
  RB: '#2ED578',
  WR: '#FF8C1A',
  TE: '#F5B700',
  K: '#9CA3AF',
  DL: '#FF4433',
  LB: '#00C2A8',
  DB: '#C084FC',
  DEF: '#64748B',
};

const MOVER_DISPLAY_LIMIT = 8;

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

function hexLuminance(hex) {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return 0;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(foreground, background) {
  const fg = hexLuminance(foreground);
  const bg = hexLuminance(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

function mixHex(left, right, amount = 0.5) {
  if (!left || !right || !left.startsWith('#') || !right.startsWith('#')) return left ?? right ?? null;
  const blend = (start, end) => Math.round(start + (end - start) * amount);
  const lr = parseInt(left.slice(1, 3), 16);
  const lg = parseInt(left.slice(3, 5), 16);
  const lb = parseInt(left.slice(5, 7), 16);
  const rr = parseInt(right.slice(1, 3), 16);
  const rg = parseInt(right.slice(3, 5), 16);
  const rb = parseInt(right.slice(5, 7), 16);
  return `#${blend(lr, rr).toString(16).padStart(2, '0')}${blend(lg, rg).toString(16).padStart(2, '0')}${blend(lb, rb).toString(16).padStart(2, '0')}`;
}

function readableTextForGradient(startColor, endColor) {
  const samples = [startColor, mixHex(startColor, endColor, 0.5), endColor].filter(Boolean);
  if (!samples.length) return 'var(--color-label)';
  const lightScore = Math.min(...samples.map(color => contrastRatio('#FFFFFF', color)));
  const darkScore = Math.min(...samples.map(color => contrastRatio('#0C0F14', color)));
  return darkScore > lightScore ? '#0C0F14' : '#FFFFFF';
}

function darkenHex(hex, amount = 0.28) {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return hex;
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function sleeperHeadshot(playerId) {
  if (!playerId) return null;
  return `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`;
}

function getPositionColor(position) {
  const normalized = String(position ?? '').toUpperCase();
  if (normalized === 'DE' || normalized === 'DT') return POSITION_COLORS.DL;
  if (normalized === 'CB' || normalized === 'S') return POSITION_COLORS.DB;
  if (normalized === 'PK') return POSITION_COLORS.K;
  if (normalized === 'DST') return POSITION_COLORS.DEF;
  return POSITION_COLORS[normalized] ?? null;
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

function stopThen(handler, value) {
  return (event) => {
    event.stopPropagation();
    handler?.(value);
  };
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
  const teamKey = getTeamColorKey(player?.team);
  const palette = getTeamPalette(player?.team);
  const primary = palette ? (darkMode ? palette.darkPrimary : palette.primary) : null;
  const secondary = palette ? (darkMode ? palette.darkSecondary : palette.secondary) : null;
  const reverseGradient = teamKey ? REVERSED_GRADIENT_TEAMS.has(teamKey) : false;
  const gradientStart = reverseGradient ? secondary : primary;
  const gradientEnd = reverseGradient ? primary : secondary;
  const heroGradient = primary && secondary
    ? `linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%)`
    : null;
  const heroOnBg = heroGradient ? readableTextForGradient(gradientStart, gradientEnd) : 'var(--color-label)';
  const heroMuted = heroOnBg === '#FFFFFF' ? 'rgba(255,255,255,0.68)' : 'rgba(12,15,20,0.62)';
  const primaryPhotoSrc = sleeperHeadshot(player?.id);
  const fallbackPhotoSrc = player?.espnId ? headshot(player.espnId) : null;
  const playerPhotoSrc = primaryPhotoSrc ?? fallbackPhotoSrc;

  if (!player) {
    return (
      <button
        type="button"
        onClick={onChooseTarget}
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
        borderLeft: secondary ? `4px solid ${secondary}` : undefined,
        color: heroOnBg,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: darkMode
            ? 'linear-gradient(180deg, rgba(12,15,20,0.04) 0%, rgba(12,15,20,0.22) 100%)'
            : 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(12,15,20,0.12) 100%)',
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
        <Metric label="PPG" value={ppgLabel ?? '—'} labelColor={heroMuted} valueColor={heroOnBg} />
        <Metric label="Rank" value={rankLabel ?? '—'} labelColor={heroMuted} valueColor={heroOnBg} />
        <Metric label="Value" value={valueLabel ?? '—'} labelColor={heroMuted} valueColor={heroOnBg} />
      </div>
    </div>
  );
}

function MoverRow({ row, selected, darkMode, onToggleMover, onOpenPlayer }) {
  const player = normalizePlayer(row);
  const ppgLabel = formatDecimal(player.ppg);
  const valueLabel = player.valueLabel ?? formatValue(player.value);
  const rankLabel = formatRank(player.rank);
  const teamKey = getTeamColorKey(player.team);
  const palette = getTeamPalette(player.team);
  const primary = palette ? (darkMode ? palette.darkPrimary : palette.primary) : null;
  const secondary = palette ? (darkMode ? palette.darkSecondary : palette.secondary) : null;
  const reverseGradient = teamKey ? REVERSED_GRADIENT_TEAMS.has(teamKey) : false;
  const gradientStart = reverseGradient ? secondary : primary;
  const gradientEnd = reverseGradient ? primary : secondary;
  const rowGradient = primary && secondary
    ? `linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%)`
    : null;
  const rowText = rowGradient ? readableTextForGradient(gradientStart, gradientEnd) : 'var(--color-label)';
  const rowMuted = rowText === '#FFFFFF' ? 'rgba(255,255,255,0.70)' : 'rgba(12,15,20,0.64)';
  const rowSubtle = rowText === '#FFFFFF' ? 'rgba(255,255,255,0.16)' : 'rgba(12,15,20,0.12)';
  const rowPhotoSrc = sleeperHeadshot(player.id);
  const posColor = getPositionColor(player.position);
  const posTextColor = posColor && hexLuminance(posColor) > 0.42 ? '#0C0F14' : '#FFFFFF';

  return (
    <button
      type="button"
      onClick={() => onToggleMover?.(player.id, row)}
      className="relative grid min-h-[4.25rem] w-full grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition-colors min-[390px]:grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] sm:gap-3 sm:px-4 lg:min-h-[5rem] lg:grid-cols-[auto_auto_auto_minmax(0,1fr)_auto_auto] lg:gap-4 lg:px-4 lg:py-3 xl:min-h-[5.25rem] xl:px-5"
      style={{
        background: rowGradient ?? (selected ? 'var(--color-fill-secondary)' : 'transparent'),
        borderColor: selected ? 'var(--color-signature)' : 'var(--color-separator)',
        boxShadow: selected ? 'inset 3px 0 0 var(--color-signature)' : 'none',
        color: rowGradient ? rowText : 'var(--color-label)',
      }}
    >
      {rowGradient && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: darkMode
              ? 'linear-gradient(180deg, rgba(12,15,20,0.02) 0%, rgba(12,15,20,0.24) 100%)'
              : 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(12,15,20,0.16) 100%)',
          }}
          aria-hidden="true"
        />
      )}
      <span
        className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full border sm:h-8 sm:w-8 lg:h-9 lg:w-9 xl:h-10 xl:w-10"
        style={{
          background: selected ? 'var(--color-signature)' : 'transparent',
          borderColor: selected ? 'var(--color-signature)' : (rowGradient ? rowMuted : 'var(--color-label-quaternary)'),
          color: selected ? 'var(--color-signature-fg)' : 'transparent',
        }}
        aria-hidden="true"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <img
        src={rowPhotoSrc}
        alt=""
        className="relative z-10 h-9 w-9 rounded-full object-cover sm:h-10 sm:w-10 lg:h-12 lg:w-12 xl:h-14 xl:w-14"
        style={{
          background: primary ? darkenHex(primary, 0.45) : 'var(--color-fill-secondary)',
          boxShadow: rowGradient ? '0 5px 14px rgba(0,0,0,0.22)' : 'none',
        }}
        loading="lazy"
        decoding="async"
        onError={event => { event.currentTarget.style.display = 'none'; }}
      />
      <span
        className="relative z-10 hidden rounded-md px-1.5 py-1 text-[10px] font-black uppercase leading-none tracking-[0.06em] min-[390px]:block sm:px-2 sm:text-[11px] sm:tracking-[0.08em] lg:px-2.5 lg:py-1.5 lg:text-[13px] xl:text-sm"
        style={{
          background: posColor ?? (rowGradient ? rowSubtle : (player.position ? 'var(--color-fill)' : 'var(--color-fill-secondary)')),
          color: posColor ? posTextColor : (rowGradient ? rowText : 'var(--color-label-secondary)'),
          boxShadow: posColor ? '0 4px 10px rgba(0,0,0,0.16)' : 'none',
          fontFamily: "'Barlow Condensed', sans-serif",
        }}
      >
        {player.position || '—'}
      </span>

      <span
        className="relative z-10 min-w-0"
        onClick={onOpenPlayer ? stopThen(onOpenPlayer, player.raw) : undefined}
      >
        <span className="block truncate text-[15px] font-extrabold leading-tight sm:text-base lg:leading-normal">{player.name}</span>
        <span className="mt-1 block truncate text-[10px] font-semibold uppercase tracking-wide lg:text-[12px] xl:text-[13px]" style={{ color: rowGradient ? rowMuted : 'var(--color-label-tertiary)' }}>
          {[player.team].filter(Boolean).join(' · ') || 'Mover'}
          {rankLabel ? ` · ${rankLabel}` : ''}
          {player.note ? ` · ${player.note}` : ''}
        </span>
      </span>

      {teamKey ? (
        <img
          src={`https://a.espncdn.com/i/teamlogos/nfl/500/${teamKey}.png`}
          alt=""
          className="relative z-10 hidden h-9 w-9 shrink-0 object-contain lg:block lg:h-10 lg:w-10 xl:h-11 xl:w-11"
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.20))' }}
          onError={event => { event.currentTarget.style.display = 'none'; }}
        />
      ) : (
        <span className="relative z-10 hidden h-9 w-9 lg:block" aria-hidden="true" />
      )}

      <span className="relative z-10 text-right text-[15px] font-black tabular-nums sm:text-base">
        <span>
          <span className="hidden text-[9px] uppercase tracking-widest min-[390px]:block lg:text-[11px] xl:text-[12px]" style={{ color: rowGradient ? rowMuted : 'var(--color-label-tertiary)' }}>{ppgLabel ? `${ppgLabel} PPG` : 'Value'}</span>
          <span>{valueLabel ?? '—'}</span>
        </span>
      </span>
    </button>
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
      <div className="grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: 'var(--color-fill)' }}>
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
    <button
      type="button"
      onClick={onClick}
      className="min-h-9 shrink-0 rounded-full border px-3.5 text-sm font-extrabold transition-opacity active:opacity-70"
      style={{
        background: active ? 'var(--color-label)' : 'var(--color-bg-secondary)',
        borderColor: active ? activeBorder : 'var(--color-separator)',
        color: active ? 'var(--color-bg)' : 'var(--color-label-secondary)',
        boxShadow: active && accentColor ? `inset 0 -3px 0 ${accentColor}` : 'none',
      }}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function SortChip({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-9 shrink-0 rounded-lg border px-3 text-sm font-bold transition-opacity active:opacity-70"
      style={{
        background: active ? 'var(--color-signature)' : 'var(--color-bg-secondary)',
        borderColor: active ? 'var(--color-signature)' : 'var(--color-separator)',
        color: active ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
      }}
      aria-pressed={active}
    >
      {children}
    </button>
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

  const visibleMoverRows = useMemo(() => {
    const filteredRows = (moverRows ?? [])
      .filter(Boolean)
      .filter((row) => {
        if (moverPositionFilter === 'ALL') return true;
        return normalizePosition(normalizePlayer(row).position) === moverPositionFilter;
      });

    return [...filteredRows].sort((a, b) => {
      const aSelected = selectedIds.has(String(normalizePlayer(a).id));
      const bSelected = selectedIds.has(String(normalizePlayer(b).id));
      if (aSelected === bSelected) return compareMoverRows(a, b, moverSortMode);
      return aSelected ? -1 : 1;
    }).slice(0, MOVER_DISPLAY_LIMIT);
  }, [moverPositionFilter, moverSortMode, moverRows, selectedIds]);

  const filteredMoverCount = useMemo(() => (
    (moverRows ?? []).filter((row) => (
      moverPositionFilter === 'ALL' || normalizePosition(normalizePlayer(row).position) === moverPositionFilter
    )).length
  ), [moverPositionFilter, moverRows]);

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
                  onClick={() => setMoverPositionFilter(position)}
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
                  onClick={() => setMoverSortMode(option.id)}
                >
                  {option.label}
                </SortChip>
              ))}
            </ScrollCueRail>
            <div className="text-xs font-semibold" style={{ color: 'var(--color-label-tertiary)' }}>
              Showing {visibleMoverRows.length} of {filteredMoverCount} matching players.
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
                    onOpenPlayer={onOpenPlayer}
                  />
                );
              })
            ) : (
              <button
                type="button"
                onClick={onAddPlayers}
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
