import { useMemo, useEffect, useState } from 'react';
import { useSleeperLeague, useSleeperStats } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { calcPoints } from '../../utils/scoringEngine';
import { getTeamPalette } from '../../data/teamColors.js';

function hexLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function darkenHex(hex, amount = 0.28) {
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Which raw stats to display per position group
const OFFENSE_STAT_DISPLAY = [
  { key: 'pass_yd', label: 'Pass Yds' },
  { key: 'pass_td', label: 'Pass TD' },
  { key: 'pass_int', label: 'INT' },
  { key: 'rush_yd', label: 'Rush Yds' },
  { key: 'rush_td', label: 'Rush TD' },
  { key: 'rec', label: 'Rec' },
  { key: 'rec_yd', label: 'Rec Yds' },
  { key: 'rec_td', label: 'Rec TD' },
  { key: 'fum_lost', label: 'Fum Lost' },
  { key: 'st_td', label: 'ST TD' },
  { key: 'ret_td', label: 'Ret TD' },
];

const IDP_STAT_DISPLAY = [
  { key: 'idp_tkl', label: 'Tackles' },
  { key: 'idp_tkl_solo', label: 'Solo' },
  { key: 'idp_tkl_ast', label: 'Ast' },
  { key: 'idp_tkl_loss', label: 'TFL' },
  { key: 'idp_sack', label: 'Sacks' },
  { key: 'idp_int', label: 'INT' },
  { key: 'idp_ff', label: 'FF' },
  { key: 'idp_fr', label: 'FR' },
  { key: 'idp_pd', label: 'PD' },
  { key: 'idp_qbhit', label: 'QB Hit' },
  { key: 'idp_safety', label: 'Safety' },
  { key: 'idp_int_td', label: 'INT TD' },
  { key: 'idp_fr_td', label: 'FR TD' },
];

const IDP_POSITIONS = new Set(['DL', 'LB', 'DB', 'DE', 'DT', 'CB', 'S', 'ILB', 'OLB', 'SS', 'FS']);

export default function PlayerWeeklySheet({ playerId, onClose, onOpenWeek = null }) {
  const { scoringSettings, league } = useSleeperLeague();
  const { players, weeklyStats, scheduleMap } = useSleeperStats();
  const { darkMode } = useTheme();
  const [closeHover, setCloseHover] = useState(false);

  const player = players?.[playerId];
  const weeks = weeklyStats?.[playerId] ?? [];
  const palette = getTeamPalette(player?.team);
  const heroBg = palette ? (darkMode ? palette.darkPrimary : palette.primary) : null;
  const heroAccent = palette ? (darkMode ? palette.darkSecondary : palette.secondary) : null;
  const heroOnBg = heroBg && hexLuminance(heroBg) > 0.3 ? '#0C0F14' : '#FFFFFF';
  const heroOnBgMuted = heroOnBg === '#FFFFFF' ? 'rgba(255,255,255,0.65)' : 'rgba(12,15,20,0.60)';

  const inferredSeasonTeam = useMemo(() => {
    const counts = new Map();
    for (const week of weeks) {
      const team = week?.team?.toUpperCase?.();
      if (!team) continue;
      counts.set(team, (counts.get(team) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] ?? null;
  }, [weeks]);

  const lastScoredLeg = Number(league?.settings?.last_scored_leg);
  const fantasySeasonWeeks = useMemo(() => {
    const maxWeek = Number.isFinite(lastScoredLeg) && lastScoredLeg > 0
      ? Math.min(lastScoredLeg, 18)
      : 17;
    return Array.from({ length: maxWeek }, (_, i) => i + 1);
  }, [lastScoredLeg]);

  const isIDP = player ? IDP_POSITIONS.has(player.position) : false;
  const statDisplay = isIDP ? IDP_STAT_DISPLAY : OFFENSE_STAT_DISPLAY;

  const weekRows = useMemo(() => {
    const playerTeam = inferredSeasonTeam ?? player?.team?.toUpperCase?.();
    const byeWeek = Number(player?.bye_week);
    const rows = [];
    for (const w of fantasySeasonWeeks) {
      const wEntry = weeks.find((entry) => entry.week === w);
      const weekSchedule = scheduleMap?.[w] ?? scheduleMap?.[String(w)] ?? null;
      const weekHasGames = weekSchedule && Object.keys(weekSchedule).length > 0;
      const schedEntry = playerTeam && weekSchedule ? (weekSchedule[playerTeam] ?? null) : null;

      const isBye = (Number.isFinite(byeWeek) && byeWeek === w)
        || (weekHasGames && playerTeam && !schedEntry);

      if (isBye) {
        rows.push({ week: w, pts: 0, stats: null, opp: null, isBye: true });
      } else if (wEntry && !isBye) {
        const opp = wEntry.opp?.toUpperCase() ?? schedEntry?.opp?.toUpperCase() ?? null;
        rows.push({ week: w, pts: calcPoints(wEntry, scoringSettings, player?.position), stats: wEntry, opp, isBye: false });
      } else if (weekHasGames && schedEntry) {
        rows.push({ week: w, pts: 0, stats: null, opp: schedEntry.opp?.toUpperCase() ?? null, isBye: false });
      }
    }
    return rows;
  }, [fantasySeasonWeeks, weeks, scoringSettings, player, scheduleMap, inferredSeasonTeam]);

  const activeStats = useMemo(() => {
    return statDisplay.filter((stat) =>
      weeks.some((week) => week[stat.key] != null && week[stat.key] !== 0)
    );
  }, [statDisplay, weeks]);

  const seasonTotal = weekRows.reduce((sum, row) => sum + row.pts, 0);
  const weeksPlayed = weekRows.filter((row) => row.pts > 0).length;
  const avg = weeksPlayed > 0 ? seasonTotal / weeksPlayed : 0;
  const best = weekRows.reduce((max, row) => (row.pts > max ? row.pts : max), 0);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      >
        <div
          className="rounded-2xl w-full mx-4"
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-separator)',
            maxWidth: '640px',
            maxHeight: '85vh',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)',
          }}
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
        >
          <div
            className="flex items-center gap-3 px-5 pt-5 pb-4 shrink-0 relative overflow-hidden"
            style={{
              background: heroBg
                ? `linear-gradient(135deg, ${heroBg} 0%, ${darkenHex(heroBg, 0.32)} 100%)`
                : 'var(--color-bg-secondary)',
              borderBottom: heroBg ? 'none' : '1px solid var(--color-separator)',
              borderLeft: heroAccent ? `4px solid ${heroAccent}` : undefined,
            }}
          >
            <img
              src={`https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`}
              alt={player?.full_name}
              className="w-12 h-12 rounded-full object-cover shrink-0"
              style={{
                background: heroBg ? 'rgba(255,255,255,0.15)' : 'var(--color-fill)',
                border: heroBg ? `2px solid ${heroAccent ?? 'rgba(255,255,255,0.25)'}` : 'none',
              }}
              onError={(event) => { event.target.src = 'https://sleepercdn.com/images/v2/icons/player_default.webp'; }}
            />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base truncate" style={{ color: heroBg ? heroOnBg : 'var(--color-label)' }}>
                {player?.full_name ?? 'Unknown Player'}
              </div>
              <div className="text-xs mt-0.5" style={{ color: heroBg ? heroOnBgMuted : 'var(--color-label-tertiary)' }}>
                {player?.position} · {player?.team ?? 'FA'}
                {player?.injury_status && (
                  <span
                    className="ml-2 font-semibold"
                    style={{ color: heroBg ? heroOnBg : 'var(--color-accent-red)' }}
                  >
                    {player.injury_status}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              onMouseEnter={() => setCloseHover(true)}
              onMouseLeave={() => setCloseHover(false)}
              onFocus={() => setCloseHover(true)}
              onBlur={() => setCloseHover(false)}
              className="shrink-0 p-2 rounded-lg transition-colors duration-150 cursor-pointer"
              style={{
                color: heroBg ? heroOnBgMuted : 'var(--color-label-secondary)',
                background: closeHover
                  ? (heroBg ? 'rgba(255,255,255,0.14)' : 'var(--color-fill)')
                  : 'transparent',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="flex gap-3 px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--color-separator)' }}>
            <StatSummaryPill label="Season" value={seasonTotal.toFixed(1)} highlight />
            <StatSummaryPill label="Avg/Wk" value={avg.toFixed(1)} />
            <StatSummaryPill label="Best" value={best.toFixed(1)} />
            <StatSummaryPill label="Active Wks" value={`${weeksPlayed}`} />
          </div>

          <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
            {weekRows.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>
                  No weekly data available yet.
                </span>
              </div>
            ) : (
              <div>
                <div
                  className="flex items-end px-4 py-2 sticky top-0"
                  style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-separator)' }}
                >
                  <span className="w-7 shrink-0 text-[10px] font-semibold" style={{ color: 'var(--color-label-tertiary)' }}>WK</span>
                  <span className="w-9 shrink-0 text-[10px] font-semibold" style={{ color: 'var(--color-label-tertiary)' }}>OPP</span>
                  <div className="flex flex-1 min-w-0">
                    {activeStats.map((stat) => {
                      const ptsPerUnit = scoringSettings?.[stat.key];
                      return (
                        <div key={stat.key} className="flex-1 flex flex-col items-center px-0.5">
                          <span className="text-[10px] font-semibold leading-tight" style={{ color: 'var(--color-label-tertiary)' }}>
                            {stat.label}
                          </span>
                          {ptsPerUnit != null && ptsPerUnit !== 0 && (
                            <span className="text-[9px] leading-tight" style={{ color: 'var(--color-label-quaternary)' }}>
                              ({ptsPerUnit > 0 ? '+' : ''}{Number.isInteger(ptsPerUnit) ? ptsPerUnit : ptsPerUnit.toFixed(2)})
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <span className="w-12 shrink-0 text-right text-[10px] font-semibold" style={{ color: 'var(--color-label-tertiary)' }}>Pts</span>
                  {onOpenWeek && (
                    <span className="w-7 shrink-0 text-right text-[10px] font-semibold" style={{ color: 'var(--color-label-tertiary)' }}>Go</span>
                  )}
                </div>

                {weekRows.map((row) => (
                  <WeekRow
                    key={row.week}
                    row={row}
                    statDisplay={activeStats}
                    best={best}
                    onClick={onOpenWeek ? () => {
                      onOpenWeek(playerId, row.week);
                      onClose();
                    } : null}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function WeekRow({ row, statDisplay, best, onClick }) {
  const isBest = row.pts > 0 && row.pts === best;
  const isDnp = !row.isBye && row.pts === 0;
  const isInteractive = typeof onClick === 'function';
  const hoverBackground = isBest ? 'rgba(245,183,0,0.10)' : 'var(--color-fill-secondary)';
  const RowTag = isInteractive ? 'button' : 'div';

  return (
    <RowTag
      {...(isInteractive ? { type: 'button', onClick } : {})}
      className={`group flex w-full items-center px-4 py-2 text-left transition-colors duration-150 ${isInteractive ? 'focus:outline-none' : ''}`}
      style={{
        borderBottom: '1px solid var(--color-separator)',
        background: isBest ? 'rgba(245,183,0,0.06)' : 'transparent',
        opacity: row.isBye || isDnp ? 0.45 : 1,
        cursor: isInteractive ? 'pointer' : 'default',
      }}
      {...(isInteractive ? {
        onMouseEnter: (event) => { event.currentTarget.style.background = hoverBackground; },
        onMouseLeave: (event) => { event.currentTarget.style.background = isBest ? 'rgba(245,183,0,0.06)' : 'transparent'; },
        onFocus: (event) => { event.currentTarget.style.background = hoverBackground; },
        onBlur: (event) => { event.currentTarget.style.background = isBest ? 'rgba(245,183,0,0.06)' : 'transparent'; },
        'aria-label': `Open Companion matchup for Week ${row.week}`,
      } : {})}
    >
      <span className="w-7 shrink-0 text-xs font-bold tabular-nums" style={{ color: 'var(--color-label-tertiary)' }}>
        {row.week}
      </span>
      <span className="w-9 shrink-0 text-xs tabular-nums font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
        {row.isBye ? 'BYE' : (row.opp ? row.opp : '—')}
      </span>
      <div className="flex flex-1 min-w-0">
        {statDisplay.map((stat) => {
          const val = row.stats?.[stat.key];
          return (
            <span
              key={stat.key}
              className="flex-1 text-center text-[11px] tabular-nums px-0.5"
              style={{ color: val ? 'var(--color-label)' : 'var(--color-label-quaternary)' }}
            >
              {val ? (Number.isInteger(val) ? val : val.toFixed(1)) : '—'}
            </span>
          );
        })}
      </div>
      <span
        className="w-12 shrink-0 text-right font-bold tabular-nums text-sm"
        style={{ color: isBest ? 'var(--color-signature)' : (row.isBye || isDnp) ? 'var(--color-label-quaternary)' : 'var(--color-label)' }}
      >
        {row.isBye ? 'BYE' : isDnp ? 'DNP' : row.pts.toFixed(2)}
      </span>
      {isInteractive && (
        <span
          className="w-7 shrink-0 flex justify-end"
          style={{ color: 'var(--color-accent)' }}
          aria-hidden="true"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform duration-150 group-hover:translate-x-0.5 group-focus:translate-x-0.5"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      )}
    </RowTag>
  );
}

function StatSummaryPill({ label, value, highlight }) {
  return (
    <div
      className="flex-1 px-3 py-2 rounded-xl text-center"
      style={{ background: highlight ? 'rgba(245,183,0,0.10)' : 'var(--color-fill)' }}
    >
      <div
        className="font-bold tabular-nums text-base"
        style={{ color: highlight ? 'var(--color-signature)' : 'var(--color-label)' }}
      >
        {value}
      </div>
      <div className="text-xs mt-0.5" style={{ color: 'var(--color-label-tertiary)' }}>
        {label}
      </div>
    </div>
  );
}
