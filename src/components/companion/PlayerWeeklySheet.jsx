import { useMemo } from 'react';
import { useSleeper } from '../../context/SleeperContext';
import { calcPoints } from '../../utils/scoringEngine';

// Which raw stats to display per position group
const OFFENSE_STAT_DISPLAY = [
  { key: 'pass_yd',  label: 'Pass Yds' },
  { key: 'pass_td',  label: 'Pass TD' },
  { key: 'pass_int', label: 'INT' },
  { key: 'rush_yd',  label: 'Rush Yds' },
  { key: 'rush_td',  label: 'Rush TD' },
  { key: 'rec',      label: 'Rec' },
  { key: 'rec_yd',   label: 'Rec Yds' },
  { key: 'rec_td',   label: 'Rec TD' },
  { key: 'fum_lost', label: 'Fum Lost' },
  { key: 'st_td',    label: 'ST TD' },
  { key: 'ret_td',   label: 'Ret TD' },
];

const IDP_STAT_DISPLAY = [
  { key: 'idp_tkl',      label: 'Tackles' },
  { key: 'idp_tkl_solo', label: 'Solo' },
  { key: 'idp_tkl_ast',  label: 'Ast' },
  { key: 'idp_tkl_loss', label: 'TFL' },
  { key: 'idp_sack',     label: 'Sacks' },
  { key: 'idp_int',      label: 'INT' },
  { key: 'idp_ff',       label: 'FF' },
  { key: 'idp_fr',       label: 'FR' },
  { key: 'idp_pd',       label: 'PD' },
  { key: 'idp_qbhit',    label: 'QB Hit' },
  { key: 'idp_safety',   label: 'Safety' },
  { key: 'idp_int_td',   label: 'INT TD' },
  { key: 'idp_fr_td',    label: 'FR TD' },
];

const IDP_POSITIONS = new Set(['DL', 'LB', 'DB', 'DE', 'DT', 'CB', 'S', 'ILB', 'OLB', 'SS', 'FS']);

const SEASON_WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);

export default function PlayerWeeklySheet({ playerId, onClose }) {
  const { players, weeklyStats, scoringSettings, scheduleMap } = useSleeper();

  const player = players?.[playerId];
  const weeks = weeklyStats?.[playerId] ?? [];

  const isIDP = player ? IDP_POSITIONS.has(player.position) : false;
  const statDisplay = isIDP ? IDP_STAT_DISPLAY : OFFENSE_STAT_DISPLAY;

  const weekRows = useMemo(() => {
    const playerTeam = player?.team?.toUpperCase();
    const rows = [];
    for (const w of SEASON_WEEKS) {
      const wEntry = weeks.find(e => e.week === w);
      const schedEntry = playerTeam ? (scheduleMap?.[w]?.[playerTeam] ?? null) : null;
      const weekHasGames = !!scheduleMap && Object.keys(scheduleMap?.[w] ?? {}).length > 0;
      if (wEntry) {
        const opp = wEntry.opp?.toUpperCase() ?? schedEntry?.opp?.toUpperCase() ?? null;
        rows.push({ week: w, pts: calcPoints(wEntry, scoringSettings), stats: wEntry, opp, isBye: false });
      } else if (weekHasGames && playerTeam && !schedEntry) {
        // Bye week — other teams played but not this team
        rows.push({ week: w, pts: 0, stats: null, opp: null, isBye: true });
      } else if (weekHasGames && schedEntry) {
        // Game played but no Sleeper stats (DNP / zero week not in dataset)
        rows.push({ week: w, pts: 0, stats: null, opp: schedEntry.opp?.toUpperCase() ?? null, isBye: false });
      }
      // Future weeks (no game data yet) are omitted
    }
    return rows;
  }, [weeks, scoringSettings, player, scheduleMap]);

  const seasonTotal = weekRows.reduce((s, r) => s + r.pts, 0);
  const weeksPlayed = weekRows.filter(r => r.pts > 0).length;
  const avg = weeksPlayed > 0 ? seasonTotal / weeksPlayed : 0;
  const best = weekRows.reduce((max, r) => r.pts > max ? r.pts : max, 0);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl overflow-hidden"
        style={{
          background: 'var(--color-bg-secondary)',
          maxWidth: '640px',
          marginLeft: 'auto',
          marginRight: 'auto',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        role="dialog"
        aria-modal="true"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: 'var(--color-fill)' }} />
        </div>

        {/* Player header */}
        <div className="flex items-center gap-3 px-5 pb-4 shrink-0" style={{ borderBottom: '1px solid var(--color-separator)' }}>
          <img
            src={`https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`}
            alt={player?.full_name}
            className="w-12 h-12 rounded-full object-cover shrink-0"
            style={{ background: 'var(--color-fill)' }}
            onError={e => { e.target.src = 'https://sleepercdn.com/images/v2/icons/player_default.webp'; }}
          />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base truncate" style={{ color: 'var(--color-label)' }}>
              {player?.full_name ?? 'Unknown Player'}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-label-tertiary)' }}>
              {player?.position} · {player?.team ?? 'FA'}
              {player?.injury_status && (
                <span className="ml-2 font-semibold" style={{ color: 'var(--color-accent-red)' }}>
                  {player.injury_status}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 p-1" style={{ color: 'var(--color-label-secondary)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Season summary pills */}
        <div className="flex gap-3 px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--color-separator)' }}>
          <StatSummaryPill label="Season" value={seasonTotal.toFixed(1)} highlight />
          <StatSummaryPill label="Avg/Wk" value={avg.toFixed(1)} />
          <StatSummaryPill label="Best" value={best.toFixed(1)} />
          <StatSummaryPill label="Active Wks" value={`${weeksPlayed}`} />
        </div>

        {/* Weekly breakdown table — single horizontal scroll wrapper keeps header + rows in sync */}
        <div className="overflow-y-auto flex-1">
          {weekRows.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>
                No weekly data available yet.
              </span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* min-w ensures all columns are always visible on narrow screens */}
              <div style={{ minWidth: `${20 + 40 + 56 + statDisplay.length * 52 + 8}px` }}>
                {/* Column headers */}
                <div
                  className="flex items-center px-5 py-2 sticky top-0"
                  style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-separator)' }}
                >
                  <span className="w-8 shrink-0 text-xs font-semibold" style={{ color: 'var(--color-label-tertiary)' }}>WK</span>
                  <span className="w-10 shrink-0 text-xs font-semibold" style={{ color: 'var(--color-label-tertiary)' }}>OPP</span>
                  <div className="flex flex-1 gap-2">
                    {statDisplay.map(s => (
                      <span key={s.key} className="w-12 shrink-0 text-right text-xs font-semibold" style={{ color: 'var(--color-label-tertiary)' }}>
                        {s.label}
                      </span>
                    ))}
                  </div>
                  <span className="w-14 shrink-0 text-right text-xs font-semibold" style={{ color: 'var(--color-label-tertiary)' }}>Pts</span>
                </div>

                {weekRows.map(row => (
                  <WeekRow key={row.week} row={row} statDisplay={statDisplay} best={best} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function WeekRow({ row, statDisplay, best }) {
  const isBest = row.pts > 0 && row.pts === best;
  const isDnp = !row.isBye && row.pts === 0;

  return (
    <div
      className="flex items-center px-5 py-2.5"
      style={{
        borderBottom: '1px solid var(--color-separator)',
        background: isBest ? 'rgba(245,183,0,0.06)' : 'transparent',
        opacity: row.isBye || isDnp ? 0.45 : 1,
      }}
    >
      <span className="w-8 shrink-0 text-xs font-bold tabular-nums" style={{ color: 'var(--color-label-tertiary)' }}>
        {row.week}
      </span>
      <span className="w-10 shrink-0 text-xs tabular-nums font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
        {row.isBye ? 'BYE' : (row.opp ? row.opp : '—')}
      </span>
      <div className="flex flex-1 gap-2">
        {statDisplay.map(s => {
          const val = row.stats?.[s.key];
          return (
            <span
              key={s.key}
              className="w-12 text-right text-xs tabular-nums shrink-0"
              style={{ color: val ? 'var(--color-label)' : 'var(--color-label-quaternary)' }}
            >
              {val ? (Number.isInteger(val) ? val : val.toFixed(1)) : '—'}
            </span>
          );
        })}
      </div>
      <span
        className="w-14 shrink-0 text-right font-bold tabular-nums text-sm"
        style={{ color: isBest ? 'var(--color-signature)' : (row.isBye || isDnp) ? 'var(--color-label-quaternary)' : 'var(--color-label)' }}
      >
        {row.isBye ? 'BYE' : isDnp ? 'DNP' : row.pts.toFixed(2)}
      </span>
    </div>
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
