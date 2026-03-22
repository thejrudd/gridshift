// ── CompareFantasyPanel ───────────────────────────────────────────────────────
// Fantasy (Sleeper) side-by-side comparison panel.
// Calls useSleeper() internally; takes matched Sleeper IDs from CompareTab.

import { useMemo, useEffect } from 'react';
import { useSleeper } from '../../context/SleeperContext';
import { calcPointsFromTotals, getRecentAvg, DEFAULT_SCORING } from '../../utils/scoringEngine';
import {
  computePositionalRanks, getAvgPPG,
  buildDefenseTable, getDefenseStrength, getLeagueAvgPPG,
  projectPlayer,
} from '../../utils/projectionEngine';

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);

// ── Stat key metadata ─────────────────────────────────────────────────────────

// Human-readable labels for every Sleeper scoring stat key
const STAT_LABELS = {
  // Passing
  pass_yd:          'Pass Yards',
  pass_td:          'Pass TDs',
  pass_int:         'Interceptions',
  pass_2pt:         'Pass 2-Pt',
  pass_cmp:         'Completions',
  pass_att:         'Pass Attempts',
  pass_inc:         'Incompletions',
  pass_fd:          'Pass 1st Downs',
  pass_sack:        'Sacks Taken',
  // Rushing
  rush_yd:          'Rush Yards',
  rush_td:          'Rush TDs',
  rush_2pt:         'Rush 2-Pt',
  rush_fd:          'Rush 1st Downs',
  // Receiving
  rec:              'Receptions',
  rec_yd:           'Rec Yards',
  rec_td:           'Rec TDs',
  rec_2pt:          'Rec 2-Pt',
  rec_fd:           'Rec 1st Downs',
  // Misc
  fum:              'Fumbles',
  fum_lost:         'Fum Lost',
  fum_rec:          'Fum Recovered',
  fum_ret_td:       'Fum Ret TD',
  st_td:            'Special Teams TD',
  ret_td:           'Return TD',
  blk_kick:         'Blocked Kick',
  // Bonuses
  bonus_pass_yd_300: '300+ Pass Yd Bonus',
  bonus_pass_yd_400: '400+ Pass Yd Bonus',
  bonus_rush_yd_100: '100+ Rush Yd Bonus',
  bonus_rush_yd_200: '200+ Rush Yd Bonus',
  bonus_rec_yd_100:  '100+ Rec Yd Bonus',
  bonus_rec_yd_200:  '200+ Rec Yd Bonus',
  // IDP Defense
  idp_tkl:          'Tackles',
  idp_tkl_solo:     'Solo Tackles',
  idp_tkl_ast:      'Asst Tackles',
  idp_tkl_loss:     'TFL',
  idp_sack:         'Sacks',
  idp_sack_yd:      'Sack Yards',
  idp_int:          'Def INTs',
  idp_int_ret_yd:   'INT Ret Yards',
  idp_int_td:       'INT Ret TD',
  idp_ff:           'Forced Fumbles',
  idp_fr:           'Fum Recoveries',
  idp_fr_yd:        'Fum Rec Yards',
  idp_fr_td:        'Fum Rec TD',
  idp_def_td:       'Def TD',
  idp_pd:           'Passes Def.',
  idp_qbhit:        'QB Hits',
  idp_safety:       'Safety',
  idp_blk_kick:     'Blocked Kick (D)',
  // Kicking
  fgm:              'FG Made',
  fgm_0_19:         'FG 0–19 yds',
  fgm_20_29:        'FG 20–29 yds',
  fgm_30_39:        'FG 30–39 yds',
  fgm_40_49:        'FG 40–49 yds',
  fgm_50_59:        'FG 50–59 yds',
  fgm_60p:          'FG 60+ yds',
  fgmiss:           'FG Missed',
  fgmiss_0_19:      'FGM 0–19 yds',
  fgmiss_20_29:     'FGM 20–29 yds',
  fgmiss_30_39:     'FGM 30–39 yds',
  fgmiss_40_49:     'FGM 40–49 yds',
  fgmiss_50_59:     'FGM 50–59 yds',
  fgmiss_60p:       'FGM 60+ yds',
  xpm:              'Extra Points',
  xpmiss:           'XP Missed',
};

// Ordered display categories — controls section grouping and row order
const STAT_CATEGORIES = [
  { heading: 'Passing',          keys: ['pass_yd','pass_td','pass_int','pass_2pt','pass_cmp','pass_att','pass_inc','pass_fd','pass_sack'] },
  { heading: 'Rushing',          keys: ['rush_yd','rush_td','rush_2pt','rush_fd'] },
  { heading: 'Receiving',        keys: ['rec','rec_yd','rec_td','rec_2pt','rec_fd'] },
  { heading: 'Miscellaneous',    keys: ['fum','fum_lost','fum_rec','fum_ret_td','st_td','ret_td','blk_kick'] },
  { heading: 'Bonuses',          keys: ['bonus_pass_yd_300','bonus_pass_yd_400','bonus_rush_yd_100','bonus_rush_yd_200','bonus_rec_yd_100','bonus_rec_yd_200'] },
  { heading: 'Defense (IDP)',    keys: ['idp_tkl','idp_tkl_solo','idp_tkl_ast','idp_tkl_loss','idp_sack','idp_sack_yd','idp_int','idp_int_ret_yd','idp_int_td','idp_ff','idp_fr','idp_fr_yd','idp_fr_td','idp_def_td','idp_pd','idp_qbhit','idp_safety','idp_blk_kick'] },
  { heading: 'Kicking',          keys: ['fgm','fgm_0_19','fgm_20_29','fgm_30_39','fgm_40_49','fgm_50_59','fgm_60p','fgmiss','fgmiss_0_19','fgmiss_20_29','fgmiss_30_39','fgmiss_40_49','fgmiss_50_59','fgmiss_60p','xpm','xpmiss'] },
];


function ordinal(n) {
  if (n == null) return null;
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function fmtPts(rawVal, scoringVal) {
  if (rawVal == null || rawVal === 0 || scoringVal == null) return '—';
  const pts = rawVal * scoringVal;
  if (pts === 0) return '—';
  return pts.toFixed(1);
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function buildPlayerData(id, players, seasonStats, weeklyStats, scoringSettings, positionalRanks, defenseTable, leagueAvgByPos, week) {
  const p = players?.[id];
  if (!p) return null;
  const stats  = seasonStats?.[id] ?? null;
  const weekly = weeklyStats?.[id] ?? [];
  const pos    = p.position;

  const seasonPts = stats ? calcPointsFromTotals(stats, scoringSettings) : null;
  const avgPPG    = getAvgPPG(weekly, scoringSettings);
  const last4     = getRecentAvg(weekly, scoringSettings, 4);
  const rank      = positionalRanks[id] ?? null;

  const defStr     = defenseTable ? getDefenseStrength(defenseTable, p.team, pos, week) : null;
  const projection = SKILL_POSITIONS.has(pos)
    ? projectPlayer({
        weeklyArr: weekly, pos, oppTeam: null, isHome: null, isIndoor: null,
        weather: null, allWeeklyStats: null, players: null, scoringSettings,
        scheduleMap: null, week, defStrength: defStr,
        leagueAvg: leagueAvgByPos[pos] ?? 0, skipOpponentLookup: true,
      })
    : null;

  return {
    id, name: p.full_name || `${p.first_name} ${p.last_name}`,
    position: pos, team: p.team || 'FA',
    seasonPts, avgPPG, last4, rank, projection, seasonStats: stats,
  };
}

// Compute per-stat positional ranks for the two players.
// Ranks by fantasy pts earned (rawStat × scoringVal), descending — rank 1 = most pts.
// Negative scoring (e.g. INTs × -2) naturally puts better players first.
function buildStatRankMaps(statKeys, sleeperIdA, sleeperIdB, seasonStats, players, mergedScoring) {
  if (!seasonStats || !players) return {};
  const posA = players[sleeperIdA]?.position;
  const posB = players[sleeperIdB]?.position;
  const activePosSet = new Set([posA, posB].filter(Boolean));
  if (!activePosSet.size) return {};

  // Bucket players by position for efficiency
  const byPos = {};
  for (const [pid, pStats] of Object.entries(seasonStats)) {
    const pos = players[pid]?.position;
    if (!pos || !activePosSet.has(pos)) continue;
    if (!byPos[pos]) byPos[pos] = [];
    byPos[pos].push({ id: pid, stats: pStats });
  }

  const rankMaps = {};
  for (const statKey of statKeys) {
    const scoringVal = mergedScoring[statKey] ?? 0;
    const rankForKey = {};
    for (const pos of activePosSet) {
      const pList = byPos[pos] ?? [];
      const withVal = pList
        .map(p => ({ id: p.id, pts: (parseFloat(p.stats?.[statKey] ?? 0) || 0) * scoringVal }))
        .filter(p => p.pts !== 0);
      // Higher pts = better rank — works for both positive and negative scoring
      withVal.sort((a, b) => b.pts - a.pts);
      withVal.forEach((p, i) => { rankForKey[p.id] = i + 1; });
    }
    rankMaps[statKey] = rankForKey;
  }
  return rankMaps;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Props:
 *   sleeperIdA / sleeperIdB - matched Sleeper player IDs (string | null)
 */
export default function CompareFantasyPanel({ sleeperIdA, sleeperIdB }) {
  const {
    hasLeague, players, league,
    rosters, seasonStats, weeklyStats,
    scoringSettings, scheduleMap,
    statsLoading, loadSeasonStats,
  } = useSleeper();

  // Trigger stats load if not yet loaded (same pattern as all Companion views)
  useEffect(() => {
    if (!seasonStats && !statsLoading) loadSeasonStats();
  }, [seasonStats, statsLoading, loadSeasonStats]);

  const week = useMemo(() => {
    const playoffStart = league?.settings?.playoff_week_start ?? 18;
    const lastScored   = league?.settings?.last_scored_leg;
    if (lastScored) return Math.min(lastScored + 1, playoffStart - 1);
    return Math.max(1, playoffStart - 1);
  }, [league]);

  const positionalRanks = useMemo(
    () => computePositionalRanks(seasonStats, players, scoringSettings),
    [seasonStats, players, scoringSettings],
  );

  const defenseTable = useMemo(() => {
    if (!weeklyStats || !players) return null;
    return buildDefenseTable(weeklyStats, players, scheduleMap, scoringSettings);
  }, [weeklyStats, players, scheduleMap, scoringSettings]);

  const leagueAvgByPos = useMemo(() => {
    if (!weeklyStats || !players) return {};
    const result = {};
    for (const pos of SKILL_POSITIONS) {
      result[pos] = getLeagueAvgPPG(pos, weeklyStats, players, scoringSettings, week);
    }
    return result;
  }, [weeklyStats, players, scoringSettings, week]);

  const dataA = useMemo(
    () => sleeperIdA ? buildPlayerData(sleeperIdA, players, seasonStats, weeklyStats, scoringSettings, positionalRanks, defenseTable, leagueAvgByPos, week) : null,
    [sleeperIdA, players, seasonStats, weeklyStats, scoringSettings, positionalRanks, defenseTable, leagueAvgByPos, week],
  );

  const dataB = useMemo(
    () => sleeperIdB ? buildPlayerData(sleeperIdB, players, seasonStats, weeklyStats, scoringSettings, positionalRanks, defenseTable, leagueAvgByPos, week) : null,
    [sleeperIdB, players, seasonStats, weeklyStats, scoringSettings, positionalRanks, defenseTable, leagueAvgByPos, week],
  );

  const mergedScoring = useMemo(
    () => ({ ...DEFAULT_SCORING, ...scoringSettings }),
    [scoringSettings],
  );

  // Build active stat sections: categories where at least one row has scoring != 0
  // AND either player has a non-zero value
  const activeSections = useMemo(() => {
    const statsA = dataA?.seasonStats ?? {};
    const statsB = dataB?.seasonStats ?? {};

    return STAT_CATEGORIES.map(({ heading, keys }) => {
      const activeKeys = keys.filter(k => {
        if (!mergedScoring[k]) return false; // stat not scored in this league
        const vA = statsA[k]; const vB = statsB[k];
        return (vA && vA !== 0) || (vB && vB !== 0);
      });
      return activeKeys.length ? { heading, keys: activeKeys } : null;
    }).filter(Boolean);
  }, [mergedScoring, dataA, dataB]);

  // Per-stat positional ranks for displayed stats (ranked by fantasy pts earned)
  const statRankMaps = useMemo(() => {
    if (!sleeperIdA && !sleeperIdB) return {};
    const allKeys = activeSections.flatMap(s => s.keys);
    return buildStatRankMaps(allKeys, sleeperIdA, sleeperIdB, seasonStats, players, mergedScoring);
  }, [activeSections, sleeperIdA, sleeperIdB, seasonStats, players, mergedScoring]);

  // ── Render guards ─────────────────────────────────────────────────────────

  if (!hasLeague) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 gap-3">
        <span className="text-sm text-center" style={{ color: 'var(--color-label-secondary)' }}>
          Connect a Sleeper league in the Companion tab to see fantasy stats.
        </span>
      </div>
    );
  }

  if (!sleeperIdA && !sleeperIdB) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 gap-2">
        <span className="text-sm text-center" style={{ color: 'var(--color-label-secondary)' }}>
          Select players above to see fantasy comparison.
        </span>
        <span className="text-xs text-center" style={{ color: 'var(--color-label-quaternary)' }}>
          Players not found in your Sleeper league will show &ldquo;—&rdquo;.
        </span>
      </div>
    );
  }

  if (statsLoading && !seasonStats) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <svg className="animate-spin w-6 h-6" style={{ color: 'var(--color-accent)' }} fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>Loading season stats…</span>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="pb-6">
      {/* ── Season overview ───────────────────────────────────────────── */}
      <SectionHeader label="Season" />

      <CompareRow
        label="Season Pts"
        valA={dataA?.seasonPts != null ? dataA.seasonPts.toFixed(1) : '—'}
        valB={dataB?.seasonPts != null ? dataB.seasonPts.toFixed(1) : '—'}
        numA={dataA?.seasonPts} numB={dataB?.seasonPts}
        higher="better" highlight
      />
      <CompareRow
        label="Avg/Game"
        valA={dataA?.avgPPG > 0 ? dataA.avgPPG.toFixed(1) : '—'}
        valB={dataB?.avgPPG > 0 ? dataB.avgPPG.toFixed(1) : '—'}
        numA={dataA?.avgPPG} numB={dataB?.avgPPG}
        higher="better"
      />
      <CompareRow
        label="Last 4 Wks"
        valA={dataA?.last4 > 0 ? dataA.last4.toFixed(1) : '—'}
        valB={dataB?.last4 > 0 ? dataB.last4.toFixed(1) : '—'}
        numA={dataA?.last4} numB={dataB?.last4}
        higher="better"
      />

      {(dataA?.rank || dataB?.rank) && (
        <CompareRow
          label="Pos Rank"
          valA={dataA?.rank ? `${dataA.rank.posLabel}${dataA.rank.rank}` : '—'}
          valB={dataB?.rank ? `${dataB.rank.posLabel}${dataB.rank.rank}` : '—'}
          numA={dataA?.rank?.rank ?? null} numB={dataB?.rank?.rank ?? null}
          higher="lower"
        />
      )}

      {/* ── Projection ────────────────────────────────────────────────── */}
      {(dataA?.projection || dataB?.projection) && (
        <>
          <SectionHeader label="Projection" />
          <CompareRow
            label="Projected"
            valA={dataA?.projection?.projected != null ? dataA.projection.projected.toFixed(1) : '—'}
            valB={dataB?.projection?.projected != null ? dataB.projection.projected.toFixed(1) : '—'}
            numA={dataA?.projection?.projected} numB={dataB?.projection?.projected}
            higher="better" highlight
          />
          <CompareRow
            label="Floor"
            valA={dataA?.projection?.floor != null ? dataA.projection.floor.toFixed(1) : '—'}
            valB={dataB?.projection?.floor != null ? dataB.projection.floor.toFixed(1) : '—'}
            numA={dataA?.projection?.floor} numB={dataB?.projection?.floor}
            higher="better"
          />
          <CompareRow
            label="Ceiling"
            valA={dataA?.projection?.ceiling != null ? dataA.projection.ceiling.toFixed(1) : '—'}
            valB={dataB?.projection?.ceiling != null ? dataB.projection.ceiling.toFixed(1) : '—'}
            numA={dataA?.projection?.ceiling} numB={dataB?.projection?.ceiling}
            higher="better"
          />
        </>
      )}

      {/* ── Dynamic stat breakdown ────────────────────────────────────── */}
      {activeSections.length > 0 && activeSections.map(({ heading, keys }) => (
        <div key={heading}>
          <SectionHeader label={heading} />
          {keys.map(statKey => {
            const scoringVal = mergedScoring[statKey] ?? 0;
            const rawA = dataA?.seasonStats?.[statKey] ?? null;
            const rawB = dataB?.seasonStats?.[statKey] ?? null;
            const ptsA = rawA != null && rawA !== 0 ? rawA * scoringVal : null;
            const ptsB = rawB != null && rawB !== 0 ? rawB * scoringVal : null;
            const rankMap = statRankMaps[statKey] ?? {};
            return (
              <CompareRow
                key={statKey}
                label={STAT_LABELS[statKey] ?? statKey}
                valA={fmtPts(rawA, scoringVal)}
                valB={fmtPts(rawB, scoringVal)}
                numA={ptsA} numB={ptsB}
                higher="better"
                rankA={sleeperIdA ? ordinal(rankMap[sleeperIdA]) : null}
                rankB={sleeperIdB ? ordinal(rankMap[sleeperIdB]) : null}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionHeader({ label }) {
  return (
    <div
      className="px-4 py-1.5"
      style={{ background: 'var(--color-fill-secondary)', borderBottom: '1px solid var(--color-separator)' }}
    >
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-label-quaternary)' }}>
        {label}
      </span>
    </div>
  );
}

function CompareRow({ label, valA, valB, numA, numB, higher, highlight, rankA, rankB }) {
  let winA = false, winB = false;
  if (numA != null && numB != null && numA !== numB) {
    if (higher === 'better') { winA = numA > numB; winB = numB > numA; }
    else { winA = numA < numB; winB = numB < numA; }
  }
  const winColor    = 'var(--color-signature)';
  const normalColor = highlight ? 'var(--color-label)' : 'var(--color-label-secondary)';

  return (
    <div
      className="flex items-center px-4 py-2.5"
      style={{ borderBottom: '1px solid var(--color-separator)' }}
    >
      {/* Player A */}
      <div className="flex-1 text-right">
        <div className="flex items-baseline justify-end gap-1">
          {winA && <span className="text-[10px]" style={{ color: winColor }}>▲</span>}
          <span className="font-bold tabular-nums text-sm" style={{ color: winA ? winColor : normalColor }}>
            {valA}
          </span>
        </div>
        {rankA && (
          <div className="text-[10px] tabular-nums" style={{ color: 'var(--color-label-quaternary)' }}>
            {rankA}
          </div>
        )}
      </div>

      {/* Label */}
      <div className="shrink-0 text-center" style={{ width: 88 }}>
        <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>{label}</span>
      </div>

      {/* Player B */}
      <div className="flex-1 text-left">
        <div className="flex items-baseline gap-1">
          <span className="font-bold tabular-nums text-sm" style={{ color: winB ? winColor : normalColor }}>
            {valB}
          </span>
          {winB && <span className="text-[10px]" style={{ color: winColor }}>▲</span>}
        </div>
        {rankB && (
          <div className="text-[10px] tabular-nums" style={{ color: 'var(--color-label-quaternary)' }}>
            {rankB}
          </div>
        )}
      </div>
    </div>
  );
}

