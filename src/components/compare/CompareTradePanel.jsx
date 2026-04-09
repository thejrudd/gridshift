// ── CompareTradePanel ─────────────────────────────────────────────────────────
// v5.5 — Trade Agent: live KeepTradeCut values for the two compared players.

import { useEffect, useMemo, useState } from 'react';
import { fetchKtcPlayers, findKtcPlayer, getKtcValue, fmtKtcValue, productionAdjustedValue } from '../../utils/ktcApi';
import { useSleeperBase } from '../../context/SleeperContext';
import { calcPointsFromTotals } from '../../utils/scoringEngine';
import { computePositionalRanks, buildDefenseTable, computePositionalAvgPPG } from '../../utils/projectionEngine';

function detectLeagueFormat(league) {
  return league?.settings?.type === 2 ? 'dynasty' : 'redraft';
}

function detectLeagueType(league) {
  return (league?.roster_positions ?? []).includes('SUPER_FLEX') ? 'sf' : '1qb';
}

// Fairness tier based on gap as % of the higher side's value
function fairnessTier(pct) {
  if (pct == null) return null;
  if (pct < 5)  return { label: 'Fair Trade',         color: '#22c55e' };
  if (pct < 15) return { label: 'Minor Edge',          color: '#f59e0b' };
  if (pct < 30) return { label: 'Moderate Overpay',   color: '#f97316' };
  return          { label: 'Significant Overpay', color: '#ef4444' };
}

// Position-specific career window thresholds
const POS_WINDOWS = {
  QB:  { emerging: 25, primeEnd: 35, latePrimeEnd: 39 },
  RB:  { emerging: 22, primeEnd: 26, latePrimeEnd: 29 },
  WR:  { emerging: 23, primeEnd: 29, latePrimeEnd: 32 },
  TE:  { emerging: 24, primeEnd: 30, latePrimeEnd: 33 },
};
const DEFAULT_WINDOW = { emerging: 23, primeEnd: 29, latePrimeEnd: 32 };

function getWindow(position) {
  return POS_WINDOWS[(position ?? '').toUpperCase()] ?? DEFAULT_WINDOW;
}

function dynastyWindow(age, position) {
  if (!age) return null;
  const w = getWindow(position);
  if (age < w.emerging)    return 'Emerging';
  if (age < w.primeEnd)    return 'Prime';
  if (age < w.latePrimeEnd) return 'Late Prime';
  return 'Veteran';
}

function primeYearsLeft(age, position) {
  if (!age) return null;
  const remaining = Math.round(getWindow(position).primeEnd - age);
  return remaining > 0 ? remaining : 0;
}

// One-sentence dynasty context for a single player
function playerContext(name, age, position, trend7d, format) {
  if (!age || !position) return null;
  const phase = dynastyWindow(age, position);
  const pyl   = primeYearsLeft(age, position);
  const first = name?.split(' ')[0] ?? name;
  const pos   = (position ?? '').toUpperCase();

  if (format === 'redraft') {
    if (phase === 'Emerging')   return `${first} is a young ${pos} — solid upside value at ${age}.`;
    if (phase === 'Prime')      return `${first} is in his prime at ${age} — reliable redraft ${pos}.`;
    if (phase === 'Late Prime') return `At ${age}, ${first} is late-career for a ${pos} — monitor usage.`;
    return `At ${age}, ${first} is a veteran ${pos} — production risk is elevated.`;
  }

  if (phase === 'Emerging')   return `${first} is an emerging ${pos} at ${age} with significant upside yet to be priced in.`;
  if (phase === 'Prime') {
    return pyl > 3
      ? `${first} has ~${pyl} prime years left as a ${pos} — a core dynasty asset.`
      : `${first} is in the back half of his prime at ${age} — the sell window is narrowing.`;
  }
  if (phase === 'Late Prime') return `At ${age}, ${first} is past peak for a ${pos} — sell high while value remains.`;
  return `At ${age}, ${first} is a veteran ${pos} past his dynasty prime — value will continue to fall.`;
}

// Fantasy performance summary for a player from Sleeper stats
function computeFantasyPerf(playerId, weeklyStats, seasonStats, scoringSettings, position) {
  if (!playerId || !scoringSettings) return null;

  // Season PPG from aggregated stats
  let ppg = null;
  if (seasonStats?.[playerId]) {
    const agg = seasonStats[playerId];
    const pts = calcPointsFromTotals(agg, scoringSettings, position);
    const gp  = agg.gp ?? agg.games_played ?? 0;
    if (gp > 0) ppg = Math.round((pts / gp) * 10) / 10;
  }

  // Recent form — last 4 active (non-bye, non-zero) weeks
  let recentAvg = null;
  let recentWeeks = 0;
  const weeks = weeklyStats?.[playerId];
  if (weeks?.length) {
    const active = weeks
      .filter(w => {
        const pts = calcPointsFromTotals(w, scoringSettings, position);
        return pts > 0;
      })
      .sort((a, b) => b.week - a.week)
      .slice(0, 4);
    if (active.length >= 2) {
      const sum = active.reduce((acc, w) => acc + calcPointsFromTotals(w, scoringSettings, position), 0);
      recentAvg = Math.round((sum / active.length) * 10) / 10;
      recentWeeks = active.length;
    }
  }

  if (ppg == null && recentAvg == null) return null;
  return { ppg, recentAvg, recentWeeks };
}

// Stat keys ranked per position (ordered by fantasy relevance)
const POS_STAT_KEYS = {
  QB: ['pass_td', 'pass_yd', 'rush_td', 'rush_yd'],
  RB: ['rush_td', 'rush_yd', 'rec_td', 'rec_yd', 'rec'],
  WR: ['rec_td', 'rec_yd', 'rec'],
  TE: ['rec_td', 'rec_yd', 'rec'],
};
const STAT_LABEL = {
  pass_td: 'Pass TDs', pass_yd: 'Pass Yds',
  rush_td: 'Rush TDs', rush_yd: 'Rush Yds',
  rec_td:  'Rec TDs',  rec_yd:  'Rec Yds', rec: 'Receptions',
};

// Build { [statKey]: { [playerId]: rank } } by fantasy pts earned from each stat.
// Stats with zero scoring multiplier in this league are excluded.
function computeFantasyStatRankings(position, seasonStats, players, scoringSettings) {
  const pos = (position ?? '').toUpperCase();
  const keys = POS_STAT_KEYS[pos];
  if (!keys || !seasonStats || !players || !scoringSettings) return {};

  const eligible = Object.entries(seasonStats).filter(([pid]) =>
    (players[pid]?.position ?? '').toUpperCase() === pos
  );

  const result = {};
  for (const key of keys) {
    // TE receptions earn both base rec pts + bonus_rec_te
    const mult = (scoringSettings[key] ?? 0) +
      (pos === 'TE' && key === 'rec' ? (scoringSettings.bonus_rec_te ?? 0) : 0);
    if (mult === 0) continue; // stat contributes no fantasy value in this league
    const sorted = eligible
      .filter(([, s]) => (s[key] ?? 0) > 0)
      .sort(([, a], [, b]) => ((b[key] ?? 0) * mult) - ((a[key] ?? 0) * mult));
    const rankMap = {};
    sorted.forEach(([pid], i) => { rankMap[pid] = i + 1; });
    result[key] = rankMap;
  }
  return result;
}

// Build { [statKey]: { [playerId]: rank } } for all players at a given position.
function computePosStatRankings(position, seasonStats, players) {
  const pos = (position ?? '').toUpperCase();
  const keys = POS_STAT_KEYS[pos];
  if (!keys || !seasonStats || !players) return {};

  const eligible = Object.entries(seasonStats).filter(([pid]) =>
    (players[pid]?.position ?? '').toUpperCase() === pos
  );

  const result = {};
  for (const key of keys) {
    const sorted = eligible
      .filter(([, s]) => (s[key] ?? 0) > 0)
      .sort(([, a], [, b]) => (b[key] ?? 0) - (a[key] ?? 0));
    const rankMap = {};
    sorted.forEach(([pid], i) => { rankMap[pid] = i + 1; });
    result[key] = rankMap;
  }
  return result;
}

// Position labels for defense context
const D_LABEL = { QB: 'Pass D', RB: 'Rush D', WR: 'WR D', TE: 'TE D' };

// Average fpts split into three defense tiers (tough/mid/soft).
// playerPos: position used for scoring (calcPointsFromTotals).
// defensePos: position used to rank defenses in the table (may differ from playerPos for TE combo).
// defenseTable: { [team]: { [normPos]: { [week]: pts } } } — from buildDefenseTable.
function computeVsDefense(playerId, playerPos, defensePos, weeklyStats, defenseTable, scoringSettings) {
  if (!playerId || !weeklyStats || !defenseTable || !scoringSettings) return null;
  const pPos = (playerPos ?? '').toUpperCase();
  const dPos = (defensePos ?? pPos).toUpperCase();
  const myWeeks = weeklyStats[playerId];
  if (!myWeeks?.length) return null;

  // Rank all defenses by pts allowed to dPos
  const defAvgs = [];
  for (const [team, posData] of Object.entries(defenseTable)) {
    const weekData = posData[dPos] ?? {};
    const vals = Object.values(weekData);
    if (vals.length < 3) continue;
    defAvgs.push({ team, avg: vals.reduce((s, v) => s + v, 0) / vals.length });
  }
  if (defAvgs.length < 6) return null;
  defAvgs.sort((a, b) => a.avg - b.avg); // ascending: toughest first

  const third = Math.max(1, Math.floor(defAvgs.length / 3));
  const toughTeams = new Set(defAvgs.slice(0, third).map(d => d.team));
  const softTeams  = new Set(defAvgs.slice(-third).map(d => d.team));
  const midTeams   = new Set(defAvgs.slice(third, defAvgs.length - third).map(d => d.team));

  // Compute player's actual fpts against each tier
  const toughPts = [], midPts = [], softPts = [];
  for (const w of myWeeks) {
    const opp = w.opp?.toUpperCase();
    if (!opp) continue;
    const pts = calcPointsFromTotals(w, scoringSettings, pPos);
    if (pts <= 0) continue;
    if (toughTeams.has(opp))      toughPts.push(pts);
    else if (softTeams.has(opp))  softPts.push(pts);
    else if (midTeams.has(opp))   midPts.push(pts);
  }

  if (!toughPts.length && !midPts.length && !softPts.length) return null;
  const avg = arr => arr.length ? Math.round(arr.reduce((s, p) => s + p, 0) / arr.length * 10) / 10 : null;
  return {
    label: D_LABEL[dPos] ?? `${dPos} D`,
    toughAvg: avg(toughPts), midAvg: avg(midPts), softAvg: avg(softPts),
    toughGames: toughPts.length, midGames: midPts.length, softGames: softPts.length,
  };
}

// Get the 7-day trend value for a KTC entry given the active league type
function ktcTrend7d(ktcEntry, leagueType) {
  if (!ktcEntry) return null;
  const vals = leagueType === 'sf' ? ktcEntry.superflexValues : ktcEntry.oneQBValues;
  return vals?.overall7DayTrend ?? null;
}

// Find one player per position whose KTC value is closest to `gap`.
// Returns up to `maxResults` entries sorted by closeness, one per position group.
function findPlayerEquivs(gap, ktcPlayers, leagueType, maxResults = 3) {
  if (!gap || !ktcPlayers?.length) return [];
  const nonPicks = ktcPlayers.filter(k => k.position !== 'RDP' && k.playerName && k.position);
  if (!nonPicks.length) return [];

  const getVal = k => leagueType === 'sf'
    ? (k.superflexValues?.value ?? k.oneQBValues?.value ?? 0)
    : (k.oneQBValues?.value ?? 0);

  const POS_LABEL = { QB: 'quarterback', RB: 'running back', WR: 'wide receiver', TE: 'tight end' };

  // Best (closest to gap) match per position, within ±35%
  const byPosition = {};
  for (const k of nonPicks) {
    const v = getVal(k);
    if (v <= 0) continue;
    const dist = Math.abs(v - gap) / gap;
    if (dist > 0.35) continue;
    const pos = k.position;
    if (!byPosition[pos] || dist < byPosition[pos].dist) {
      byPosition[pos] = { k, v, dist };
    }
  }

  return Object.entries(byPosition)
    .sort(([, a], [, b]) => a.dist - b.dist)
    .slice(0, maxResults)
    .map(([pos, { k, v }]) => {
      const posPeers = nonPicks
        .filter(p => p.position === pos)
        .sort((a, b) => getVal(b) - getVal(a));
      const posRank = posPeers.findIndex(p => p.playerName === k.playerName) + 1;
      const total   = posPeers.length;
      const posLabel = POS_LABEL[pos] ?? pos.toLowerCase();
      // Percentile-based tiers so labels scale correctly across deep position groups (WR, RB)
      let tier;
      if (posRank <= Math.ceil(total * 0.08))      tier = 'elite';
      else if (posRank <= Math.ceil(total * 0.20)) tier = 'high-end';
      else if (posRank <= Math.ceil(total * 0.45)) tier = 'mid-tier';
      else                                          tier = 'depth';
      return { name: k.playerName, val: v, tier, posLabel };
    });
}

// Find the RDP (draft pick) entry in the KTC list whose value is closest to `gap`
function findPickEquiv(gap, ktcPlayers, leagueType) {
  if (!gap || !ktcPlayers?.length) return null;
  const rdp = ktcPlayers.filter(k => k.position === 'RDP' && k.playerName);
  if (!rdp.length) return null;
  const getVal = k => leagueType === 'sf'
    ? (k.superflexValues?.value ?? k.oneQBValues?.value ?? 0)
    : (k.oneQBValues?.value ?? 0);
  // Find closest by absolute value distance, only consider picks within 60% of gap
  let best = null, bestDist = Infinity;
  for (const k of rdp) {
    const v = getVal(k);
    if (v <= 0) continue;
    const dist = Math.abs(v - gap);
    if (dist < bestDist && dist / gap < 0.6) {
      bestDist = dist;
      best = k;
    }
  }
  return best ? { name: best.playerName, val: getVal(best) } : null;
}

// ── CompareTradePanel ─────────────────────────────────────────────────────────

export default function CompareTradePanel({ playerA, playerB, sleeperPlayerA, sleeperPlayerB, onBuildTrade, onValuesChange }) {
  const { league, hasLeague, seasonStats, weeklyStats, scoringSettings, players, scheduleMap, statsLoading, loadSeasonStats, loadPlayers } = useSleeperBase();
  const [ktcPlayers, setKtcPlayers] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  const format     = detectLeagueFormat(league);
  const leagueType = detectLeagueType(league);
  const hasAny     = playerA || playerB;

  useEffect(() => {
    if (!hasAny) return;
    setLoading(true);
    setError(null);
    fetchKtcPlayers(format)
      .then((p) => { setKtcPlayers(p); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [format, hasAny]);

  // Auto-load Sleeper stats when players are selected and stats aren't loaded yet
  useEffect(() => {
    if (!hasLeague || !hasAny || statsLoading) return;
    if (!players) loadPlayers();
    if (!seasonStats) loadSeasonStats();
  }, [hasLeague, hasAny, statsLoading, players, seasonStats]); // eslint-disable-line react-hooks/exhaustive-deps

  // Positional rank map (same computation as CompanionTrade)
  const rankMap = useMemo(
    () => computePositionalRanks(seasonStats, players, scoringSettings),
    [seasonStats, players, scoringSettings]
  );

  // Average PPG per position across all players with stats — anchors production multipliers
  const positionalAvgPPG = useMemo(
    () => computePositionalAvgPPG(null, seasonStats, players, scoringSettings),
    [seasonStats, players, scoringSettings]
  );

  // Per-position stat rankings: { [pos]: { [statKey]: { [playerId]: rank } } }
  const statRanksByPos = useMemo(() => {
    if (!seasonStats || !players) return {};
    const result = {};
    for (const pos of Object.keys(POS_STAT_KEYS)) {
      result[pos] = computePosStatRankings(pos, seasonStats, players);
    }
    return result;
  }, [seasonStats, players]);

  // Fantasy-pts-weighted stat rankings: same shape, but sorted by pts contribution
  const fantasyRanksByPos = useMemo(() => {
    if (!seasonStats || !players || !scoringSettings) return {};
    const result = {};
    for (const pos of Object.keys(POS_STAT_KEYS)) {
      result[pos] = computeFantasyStatRankings(pos, seasonStats, players, scoringSettings);
    }
    return result;
  }, [seasonStats, players, scoringSettings]);

  // Defense table for vs-tier computation (same source as heatmap defense view)
  const defenseTable = useMemo(
    () => buildDefenseTable(weeklyStats, players, scheduleMap, scoringSettings),
    [weeklyStats, players, scheduleMap, scoringSettings]
  );

  // Compute values (safe when ktcPlayers or players are null)
  const ktcA = (ktcPlayers && playerA) ? findKtcPlayer(playerA, ktcPlayers, sleeperPlayerA) : null;
  const ktcB = (ktcPlayers && playerB) ? findKtcPlayer(playerB, ktcPlayers, sleeperPlayerB) : null;

  // Apply per-player production adjustment (35% blend toward PPG vs positional avg)
  const rawValA = getKtcValue(ktcA, leagueType);
  const rawValB = getKtcValue(ktcB, leagueType);

  const ppgA = (() => {
    const stats = playerA?.id ? seasonStats?.[playerA.id] : null;
    const pts = stats ? calcPointsFromTotals(stats, scoringSettings, playerA?.position) : null;
    return pts != null && stats?.gp ? pts / stats.gp : null;
  })();
  const ppgB = (() => {
    const stats = playerB?.id ? seasonStats?.[playerB.id] : null;
    const pts = stats ? calcPointsFromTotals(stats, scoringSettings, playerB?.position) : null;
    return pts != null && stats?.gp ? pts / stats.gp : null;
  })();

  const valA = productionAdjustedValue(rawValA, ppgA, positionalAvgPPG[playerA?.position]);
  const valB = productionAdjustedValue(rawValB, ppgB, positionalAvgPPG[playerB?.position]);

  const bothKnown = valA != null && valB != null;
  const maxVal    = bothKnown ? Math.max(valA, valB) : null;
  const gap       = bothKnown ? Math.abs(valA - valB) : null;
  const pct       = bothKnown && maxVal > 0 ? Math.round((gap / maxVal) * 100) : null;

  const leader = bothKnown
    ? (valA > valB ? 'A' : valA < valB ? 'B' : 'equal')
    : null;

  const notFoundA = !!ktcPlayers && !!playerA && ktcA === null;
  const notFoundB = !!ktcPlayers && !!playerB && ktcB === null;

  // Notify parent of current KTC values so PlayerSlot can render them inline
  useEffect(() => {
    onValuesChange?.({ valA, valB, leader, maxVal, notFoundA, notFoundB });
  }, [valA, valB, leader, maxVal, notFoundA, notFoundB]); // eslint-disable-line react-hooks/exhaustive-deps

  const leaderName = leader === 'A' ? playerA?.displayName
    : leader === 'B' ? playerB?.displayName
    : null;

  const trailerName = leader === 'A' ? playerB?.displayName
    : leader === 'B' ? playerA?.displayName
    : null;

  // Empty state — no players selected
  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-8 gap-3">
        <TradeIcon />
        <span className="text-sm font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
          Select players to see trade values
        </span>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 flex flex-col gap-5">

      {/* ── Loading / error ────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-8 gap-3"
          style={{ color: 'var(--color-label-tertiary)' }}>
          <Spinner />
          <span className="text-sm">Loading KTC data…</span>
        </div>
      )}

      {!loading && error && (
        <div
          className="rounded-xl px-4 py-4 flex flex-col gap-1.5"
          style={{ background: 'var(--color-fill)' }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
            KTC data unavailable
          </span>
          <span className="text-xs leading-relaxed" style={{ color: 'var(--color-label-tertiary)' }}>
            The KeepTradeCut proxy could not be reached. This feature requires the Docker
            deployment — it is not available in local dev mode without the nginx proxy.
          </span>
          <span className="text-xs font-mono mt-1" style={{ color: 'var(--color-label-quaternary)' }}>
            {error}
          </span>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ── Trade analysis ──────────────────────────────────────────── */}
          {bothKnown && (() => {
            const tier         = fairnessTier(pct);
            const pickEquiv    = leader !== 'equal' ? findPickEquiv(gap, ktcPlayers, leagueType) : null;
            const playerEquivs = leader !== 'equal' ? findPlayerEquivs(gap, ktcPlayers, leagueType) : [];

            const ageA  = ktcA?.age ? Math.floor(ktcA.age) : null;
            const ageB  = ktcB?.age ? Math.floor(ktcB.age) : null;
            // KTC position — used for dynasty window / prime years / context blurbs
            const ktcPosA = ktcA?.position ?? null;
            const ktcPosB = ktcB?.position ?? null;
            // Sleeper position — used for stat lookups (more reliable: matches the
            // position key used to build statRanksByPos, fantasyRanksByPos, defenseTable)
            const sleeperPosA = sleeperPlayerA?.position?.toUpperCase() ?? null;
            const sleeperPosB = sleeperPlayerB?.position?.toUpperCase() ?? null;
            // posA/posB: Sleeper-authoritative, falls back to KTC
            const posA = sleeperPosA ?? ktcPosA;
            const posB = sleeperPosB ?? ktcPosB;
            const t7A   = ktcTrend7d(ktcA, leagueType);
            const t7B   = ktcTrend7d(ktcB, leagueType);

            const winA    = ageA != null ? dynastyWindow(ageA, ktcPosA) : null;
            const winB    = ageB != null ? dynastyWindow(ageB, ktcPosB) : null;
            const pylA    = ageA != null ? primeYearsLeft(ageA, ktcPosA) : null;
            const pylB    = ageB != null ? primeYearsLeft(ageB, ktcPosB) : null;
            const ctxA    = playerContext(playerA?.displayName, ageA, ktcPosA, t7A, format);
            const ctxB    = playerContext(playerB?.displayName, ageB, ktcPosB, t7B, format);

            const perfA   = computeFantasyPerf(sleeperPlayerA?.player_id, weeklyStats, seasonStats, scoringSettings, posA);
            const perfB   = computeFantasyPerf(sleeperPlayerB?.player_id, weeklyStats, seasonStats, scoringSettings, posB);

            const pidA    = sleeperPlayerA?.player_id ?? null;
            const pidB    = sleeperPlayerB?.player_id ?? null;

            const rankA   = pidA ? rankMap?.[pidA] : null;
            const rankB   = pidB ? rankMap?.[pidB] : null;

            // Per-stat position rankings
            const srA = statRanksByPos[(posA ?? '').toUpperCase()] ?? {};
            const srB = statRanksByPos[(posB ?? '').toUpperCase()] ?? {};
            const samePos = posA && posB && posA.toUpperCase() === posB.toUpperCase();
            const allStatKeys = [...new Set([
              ...(POS_STAT_KEYS[(posA ?? '').toUpperCase()] ?? []),
              ...(POS_STAT_KEYS[(posB ?? '').toUpperCase()] ?? []),
            ])];
            // Same position: top-15 only. Cross-position: show all stats either player has a rank for
            // (otherwise player B's position-specific stats never appear because their domain doesn't overlap)
            const notableStats = allStatKeys
              .map(key => ({ key, rankA: srA[key]?.[pidA] ?? null, rankB: srB[key]?.[pidB] ?? null }))
              .filter(({ rankA: rA, rankB: rB }) => samePos
                ? ((rA ?? Infinity) <= 15 || (rB ?? Infinity) <= 15)
                : (rA != null || rB != null)
              )
              .sort((a, b) =>
                Math.min(a.rankA ?? Infinity, a.rankB ?? Infinity) -
                Math.min(b.rankA ?? Infinity, b.rankB ?? Infinity)
              );

            // Fantasy pts-weighted rankings — same threshold logic
            const frA = fantasyRanksByPos[(posA ?? '').toUpperCase()] ?? {};
            const frB = fantasyRanksByPos[(posB ?? '').toUpperCase()] ?? {};
            const fantasyNotableStats = allStatKeys
              .map(key => ({ key, rankA: frA[key]?.[pidA] ?? null, rankB: frB[key]?.[pidB] ?? null }))
              .filter(({ rankA: rA, rankB: rB }) => samePos
                ? ((rA ?? Infinity) <= 10 || (rB ?? Infinity) <= 10)
                : (rA != null || rB != null)
              )
              .sort((a, b) =>
                Math.min(a.rankA ?? Infinity, a.rankB ?? Infinity) -
                Math.min(b.rankA ?? Infinity, b.rankB ?? Infinity)
              );

            // Primary defense split: player scored against defenses ranked by their own position
            const vsDefA  = computeVsDefense(pidA, posA, posA, weeklyStats, defenseTable, scoringSettings);
            const vsDefB  = computeVsDefense(pidB, posB, posB, weeklyStats, defenseTable, scoringSettings);
            // TE secondary: rank defenses by WR pts allowed (passing game proxy) — TE scores the fpts
            const vsDefA2 = posA === 'TE' ? computeVsDefense(pidA, 'TE', 'WR', weeklyStats, defenseTable, scoringSettings) : null;
            const vsDefB2 = posB === 'TE' ? computeVsDefense(pidB, 'TE', 'WR', weeklyStats, defenseTable, scoringSettings) : null;

            const showOutlook = winA || winB || perfA || perfB || fantasyNotableStats.length > 0 || notableStats.length > 0;
            const showPyl     = format === 'dynasty' && (pylA != null || pylB != null);

            const fmtTrend = (v) => {
              if (v == null || Math.abs(v) < 5) return { label: 'Flat', color: 'var(--color-label-quaternary)' };
              return { label: v > 0 ? `▲ +${v}` : `▼ ${v}`, color: v > 0 ? '#22c55e' : '#ef4444' };
            };

            // Two-column row helper
            const OutlookRow = ({ label, left, right }) => (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex justify-end">{left}</div>
                <div
                  className="shrink-0 text-center text-[10px] uppercase tracking-wider"
                  style={{ width: 96, color: 'var(--color-label-quaternary)' }}
                >
                  {label}
                </div>
                <div className="flex-1">{right}</div>
              </div>
            );

            return (
              <div
                className="rounded-xl px-4 py-4 flex flex-col gap-3"
                style={{ background: 'var(--color-fill)' }}
              >
                <span
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}
                >
                  Trade Analysis
                </span>

                {/* Fairness verdict */}
                {tier && (
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded-md text-xs font-bold"
                      style={{ background: `${tier.color}22`, color: tier.color }}
                    >
                      {tier.label}
                    </span>
                    {pct != null && pct > 0 && (
                      <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
                        {pct}% gap
                      </span>
                    )}
                  </div>
                )}

                {leader === 'equal' ? (
                  <p className="text-sm" style={{ color: 'var(--color-label)' }}>
                    These players have roughly equal trade value — a straight swap is fair.
                  </p>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label)' }}>
                      <span className="font-semibold">{leaderName}</span> has{' '}
                      <span className="font-semibold">{fmtKtcValue(gap)}</span> more value.
                      To balance this trade, the <span className="font-medium">{trailerName?.split(' ').slice(-1)[0]}</span> side
                      needs to add roughly <span className="font-semibold">{fmtKtcValue(gap)}</span> in additional asset value.
                    </p>

                    {/* Value equivalents */}
                    {(playerEquivs.length > 0 || pickEquiv) && (
                      <div className="flex flex-col gap-1.5">
                        <span
                          className="text-[10px] uppercase tracking-widest"
                          style={{ color: 'var(--color-label-quaternary)', letterSpacing: '0.08em' }}
                        >
                          Value equivalents
                        </span>
                        {playerEquivs.map(eq => (
                          <div
                            key={eq.name}
                            className="flex items-center gap-2 rounded-lg px-3 py-2"
                            style={{ background: 'var(--color-fill-secondary)' }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-label-tertiary)', flexShrink: 0 }}>
                              <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                            </svg>
                            <span className="text-xs" style={{ color: 'var(--color-label-secondary)' }}>
                              A{' '}
                              <span className="font-semibold" style={{ color: 'var(--color-label)' }}>
                                {eq.tier} {eq.posLabel}
                              </span>
                              {' '}— e.g.{' '}
                              <span className="font-semibold" style={{ color: 'var(--color-label)' }}>
                                {eq.name}
                              </span>
                              {' '}({fmtKtcValue(eq.val)})
                            </span>
                          </div>
                        ))}
                        {pickEquiv && (
                          <div
                            className="flex items-center gap-2 rounded-lg px-3 py-2"
                            style={{ background: 'var(--color-fill-secondary)' }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-label-tertiary)', flexShrink: 0 }}>
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                            <span className="text-xs" style={{ color: 'var(--color-label-secondary)' }}>
                              A draft pick — e.g.{' '}
                              <span className="font-semibold" style={{ color: 'var(--color-label)' }}>
                                {pickEquiv.name}
                              </span>
                              {' '}({fmtKtcValue(pickEquiv.val)})
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* ── Player Outlook ─────────────────────────────────── */}
                {showOutlook && (
                  <div
                    className="flex flex-col gap-2 pt-2"
                    style={{ borderTop: '1px solid var(--color-separator)' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest"
                        style={{ color: 'var(--color-label-quaternary)', letterSpacing: '0.1em' }}>
                        Player Outlook
                      </span>
                      {statsLoading && !seasonStats && (
                        <span className="text-[10px]" style={{ color: 'var(--color-label-quaternary)' }}>
                          · loading stats…
                        </span>
                      )}
                    </div>

                    {/* ── Age + career ───────────────────────────────── */}
                    <OutlookRow
                      label="Age"
                      left={ageA != null
                        ? <span className="text-xs font-semibold" style={{ color: 'var(--color-label)' }}>
                            {ageA}
                            {winA && <span className="text-[10px] ml-1" style={{ color: 'var(--color-label-quaternary)' }}>· {winA}</span>}
                          </span>
                        : <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>—</span>}
                      right={ageB != null
                        ? <span className="text-xs font-semibold" style={{ color: 'var(--color-label)' }}>
                            {ageB}
                            {winB && <span className="text-[10px] ml-1" style={{ color: 'var(--color-label-quaternary)' }}>· {winB}</span>}
                          </span>
                        : <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>—</span>}
                    />
                    {showPyl && (
                      <OutlookRow
                        label="Prime Left"
                        left={pylA != null
                          ? <span className="text-xs font-semibold" style={{ color: pylA <= 1 ? '#ef4444' : pylA <= 3 ? '#f59e0b' : '#22c55e' }}>
                              {pylA === 0 ? 'Past peak' : `~${pylA} yr${pylA !== 1 ? 's' : ''}`}
                            </span>
                          : <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>—</span>}
                        right={pylB != null
                          ? <span className="text-xs font-semibold" style={{ color: pylB <= 1 ? '#ef4444' : pylB <= 3 ? '#f59e0b' : '#22c55e' }}>
                              {pylB === 0 ? 'Past peak' : `~${pylB} yr${pylB !== 1 ? 's' : ''}`}
                            </span>
                          : <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>—</span>}
                      />
                    )}

                    {/* ── Fantasy Performance ────────────────────────── */}
                    {(rankA || rankB || perfA || perfB) && (
                      <div className="flex flex-col gap-2 pt-1.5"
                        style={{ borderTop: '1px solid var(--color-separator)' }}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-widest"
                            style={{ color: 'var(--color-label-quaternary)', letterSpacing: '0.1em' }}>
                            Fantasy Performance
                          </span>
                          <InfoTooltip position="below" text="Fantasy points using your league's scoring settings. Szn Rank = positional finish among all active players. Szn PPG = points per game played. Recent = average over the last 4 scored weeks." />
                        </div>
                        {(rankA || rankB) && (
                          <OutlookRow
                            label="Szn Rank"
                            left={rankA
                              ? <span className="text-xs font-semibold" style={{ color: 'var(--color-label)' }}>{rankA.posLabel}{rankA.rank}</span>
                              : <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>—</span>}
                            right={rankB
                              ? <span className="text-xs font-semibold" style={{ color: 'var(--color-label)' }}>{rankB.posLabel}{rankB.rank}</span>
                              : <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>—</span>}
                          />
                        )}
                        {(perfA?.ppg != null || perfB?.ppg != null) && (
                          <OutlookRow
                            label="Szn PPG"
                            left={perfA?.ppg != null
                              ? <span className="text-xs font-semibold" style={{ color: 'var(--color-label)' }}>{perfA.ppg}</span>
                              : <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>—</span>}
                            right={perfB?.ppg != null
                              ? <span className="text-xs font-semibold" style={{ color: 'var(--color-label)' }}>{perfB.ppg}</span>
                              : <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>—</span>}
                          />
                        )}
                        {(perfA?.recentAvg != null || perfB?.recentAvg != null) && (
                          <OutlookRow
                            label="Recent"
                            left={perfA?.recentAvg != null
                              ? <span className="text-xs font-semibold" style={{ color: perfA.recentAvg > (perfA.ppg ?? 0) ? '#22c55e' : perfA.recentAvg < (perfA.ppg ?? 0) * 0.75 ? '#ef4444' : 'var(--color-label)' }}>
                                  {perfA.recentAvg}
                                  <span className="text-[10px] ml-1" style={{ color: 'var(--color-label-quaternary)' }}>L{perfA.recentWeeks}</span>
                                </span>
                              : <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>—</span>}
                            right={perfB?.recentAvg != null
                              ? <span className="text-xs font-semibold" style={{ color: perfB.recentAvg > (perfB.ppg ?? 0) ? '#22c55e' : perfB.recentAvg < (perfB.ppg ?? 0) * 0.75 ? '#ef4444' : 'var(--color-label)' }}>
                                  {perfB.recentAvg}
                                  <span className="text-[10px] ml-1" style={{ color: 'var(--color-label-quaternary)' }}>L{perfB.recentWeeks}</span>
                                </span>
                              : <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>—</span>}
                          />
                        )}
                      </div>
                    )}

                    {/* ── Fantasy Stat Leaders ───────────────────────── */}
                    {fantasyNotableStats.length > 0 && (
                      <div className="flex flex-col gap-2 pt-1.5"
                        style={{ borderTop: '1px solid var(--color-separator)' }}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-widest"
                            style={{ color: 'var(--color-label-quaternary)', letterSpacing: '0.1em' }}>
                            Fantasy Stat Leaders
                          </span>
                          <InfoTooltip position="below" text={samePos
                            ? "Positional rank by fantasy points earned from each stat category, using your league's scoring settings. Stats worth 0 pts in your league are excluded. Top 10 only."
                            : "Each player is ranked within their own position group. Dash (—) means that stat is not tracked for that position. Ranks are not directly comparable across positions."} />
                        </div>
                        {fantasyNotableStats.map(({ key, rankA: rA, rankB: rB }) => {
                          const rankColor = r => r == null ? 'var(--color-label-quaternary)' : r <= 3 ? '#22c55e' : r <= 7 ? '#f59e0b' : 'var(--color-label-secondary)';
                          return (
                            <OutlookRow
                              key={key}
                              label={STAT_LABEL[key] ?? key}
                              left={rA != null
                                ? <span className="text-xs font-semibold" style={{ color: rankColor(rA) }}>#{rA}</span>
                                : <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>—</span>}
                              right={rB != null
                                ? <span className="text-xs font-semibold" style={{ color: rankColor(rB) }}>#{rB}</span>
                                : <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>—</span>}
                            />
                          );
                        })}
                      </div>
                    )}

                    {/* ── Raw Stat Leaders ───────────────────────────── */}
                    {notableStats.length > 0 && (
                      <div className="flex flex-col gap-2 pt-1.5"
                        style={{ borderTop: '1px solid var(--color-separator)' }}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-widest"
                            style={{ color: 'var(--color-label-quaternary)', letterSpacing: '0.1em' }}>
                            Raw Stat Leaders
                          </span>
                          <InfoTooltip position="below" text={samePos
                            ? "In-game production only — not fantasy-scored. Each rank is the player's positional finish among all players at that position this season. Shows any stat where either player ranks top 15."
                            : "Each player is ranked within their own position group. Dash (—) means that stat is not tracked for that position. Ranks are not directly comparable across positions."} />
                        </div>
                        {notableStats.map(({ key, rankA: rA, rankB: rB }) => {
                          const rankColor = r => r == null ? 'var(--color-label-quaternary)' : r <= 5 ? '#22c55e' : r <= 10 ? '#f59e0b' : 'var(--color-label-secondary)';
                          return (
                            <OutlookRow
                              key={key}
                              label={STAT_LABEL[key] ?? key}
                              left={rA != null
                                ? <span className="text-xs font-semibold" style={{ color: rankColor(rA) }}>#{rA}</span>
                                : <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>—</span>}
                              right={rB != null
                                ? <span className="text-xs font-semibold" style={{ color: rankColor(rB) }}>#{rB}</span>
                                : <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>—</span>}
                            />
                          );
                        })}
                      </div>
                    )}

                    {/* ── Defense Analysis ───────────────────────────── */}
                    {(vsDefA || vsDefB) && (() => {
                      const labelA = vsDefA?.label ?? null;
                      const labelB = vsDefB?.label ?? null;
                      // Same position → single label; cross-position → show both
                      const defLabel = samePos || labelA === labelB
                        ? (labelA ?? labelB ?? 'D')
                        : [labelA, labelB].filter(Boolean).join(' / ');
                      const crossDefPos = !samePos && labelA !== labelB;
                      const DVal = ({ d, tier }) => {
                        const v = d?.[`${tier}Avg`];
                        const c = tier === 'tough' ? '#ef4444' : tier === 'soft' ? '#22c55e' : 'var(--color-label)';
                        return v != null
                          ? <span className="text-xs font-semibold" style={{ color: c }}>{v}</span>
                          : <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>—</span>;
                      };
                      return (
                        <div className="flex flex-col gap-2 pt-1.5"
                          style={{ borderTop: '1px solid var(--color-separator)' }}>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-widest"
                              style={{ color: 'var(--color-label-quaternary)', letterSpacing: '0.1em' }}>
                              vs {defLabel} · fpts by tier
                            </span>
                            <InfoTooltip position="above" text={crossDefPos
                              ? `Fantasy points each player scores against their own position's defense tiers. Each player's defenses are ranked independently by pts allowed to their position — tiers are not directly comparable across positions.`
                              : `Fantasy points scored against each defense tier. Defenses are split into thirds by avg ${defLabel} pts allowed per game — Tough = stingiest third, Soft = most generous. Values shown are each player's avg fpts against that tier.`} />
                          </div>
                          <OutlookRow label="Tough Defense"
                            left={<DVal d={vsDefA} tier="tough" />}
                            right={<DVal d={vsDefB} tier="tough" />} />
                          <OutlookRow label="Mid Defense"
                            left={<DVal d={vsDefA} tier="mid" />}
                            right={<DVal d={vsDefB} tier="mid" />} />
                          <OutlookRow label="Soft Defense"
                            left={<DVal d={vsDefA} tier="soft" />}
                            right={<DVal d={vsDefB} tier="soft" />} />

                          {/* TE secondary: WR defense as passing-game proxy */}
                          {(vsDefA2 || vsDefB2) && (
                            <>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[10px] font-semibold uppercase tracking-widest"
                                  style={{ color: 'var(--color-label-quaternary)', letterSpacing: '0.1em' }}>
                                  vs WR D · passing game context
                                </span>
                                <InfoTooltip position="above" text="For tight ends, defenses are also ranked by how many fantasy points they allow to wide receivers — a proxy for overall passing game permissiveness. Values shown are the TE's fpts scored against each tier." />
                              </div>
                              <OutlookRow label="Tough Defense"
                                left={<DVal d={vsDefA2} tier="tough" />}
                                right={<DVal d={vsDefB2} tier="tough" />} />
                              <OutlookRow label="Mid Defense"
                                left={<DVal d={vsDefA2} tier="mid" />}
                                right={<DVal d={vsDefB2} tier="mid" />} />
                              <OutlookRow label="Soft Defense"
                                left={<DVal d={vsDefA2} tier="soft" />}
                                right={<DVal d={vsDefB2} tier="soft" />} />
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* ── KTC market trend ───────────────────────────── */}
                    {((t7A != null && Math.abs(t7A) >= 5) || (t7B != null && Math.abs(t7B) >= 5)) && (
                      <div className="pt-1.5" style={{ borderTop: '1px solid var(--color-separator)' }}>
                        <OutlookRow
                          label="7d Trend"
                          left={<span className="text-xs font-bold" style={{ color: fmtTrend(t7A).color }}>{fmtTrend(t7A).label}</span>}
                          right={<span className="text-xs font-bold" style={{ color: fmtTrend(t7B).color }}>{fmtTrend(t7B).label}</span>}
                        />
                      </div>
                    )}

                    {/* Per-player context blurbs */}
                    {(ctxA || ctxB) && (
                      <div className="flex flex-col gap-1.5 pt-1.5"
                        style={{ borderTop: '1px solid var(--color-separator)' }}>
                        {ctxA && (
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
                            {ctxA}
                          </p>
                        )}
                        {ctxB && (
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
                            {ctxB}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* One player selected but not the other */}
          {!playerA && playerB && (
            <div className="text-sm text-center" style={{ color: 'var(--color-label-tertiary)' }}>
              Select Player 1 to compare trade values.
            </div>
          )}
          {playerA && !playerB && (
            <div className="text-sm text-center" style={{ color: 'var(--color-label-tertiary)' }}>
              Select Player 2 to compare trade values.
            </div>
          )}

          {/* Build Full Trade button — only enabled when exactly one player is on own roster */}
          {hasLeague && (playerA || playerB) && (
            <div className="flex flex-col gap-1.5">
              <button
                onClick={onBuildTrade ?? undefined}
                disabled={!onBuildTrade}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{
                  background: onBuildTrade ? 'var(--color-signature)' : 'var(--color-fill)',
                  color: onBuildTrade ? 'var(--color-signature-fg)' : 'var(--color-label-quaternary)',
                  cursor: onBuildTrade ? 'pointer' : 'default',
                }}
              >
                Build Full Trade
              </button>
              {!onBuildTrade && (
                <p className="text-xs text-center" style={{ color: 'var(--color-label-quaternary)' }}>
                  One player must be on your roster to build a trade.
                </p>
              )}
            </div>
          )}

          {/* KTC attribution */}
          <div className="text-xs text-center" style={{ color: 'var(--color-label-quaternary)' }}>
            Values from{' '}
            <span className="font-medium" style={{ color: 'var(--color-label-tertiary)' }}>
              KeepTradeCut
            </span>{' '}
            · {format === 'dynasty' ? 'Dynasty' : 'Redraft'} · {leagueType === 'sf' ? 'Superflex' : '1QB'}
          </div>
        </>
      )}
    </div>
  );
}

// ── InfoTooltip ───────────────────────────────────────────────────────────────

function InfoTooltip({ text, position = 'above' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" style={{ display: 'inline-flex', alignItems: 'center' }}>
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(v => !v)}
        aria-label="More info"
        style={{
          width: 14, height: 14, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-fill)',
          color: 'var(--color-label-tertiary)',
          fontSize: '8px', fontWeight: 700, flexShrink: 0, border: 'none', cursor: 'pointer',
        }}
      >
        i
      </button>
      {open && (
        <div
          className="absolute z-[9999] rounded-lg px-3 py-2 text-xs leading-relaxed"
          style={{
            [position === 'above' ? 'bottom' : 'top']: '100%',
            left: 0,
            marginBottom: position === 'above' ? '6px' : undefined,
            marginTop: position === 'above' ? undefined : '6px',
            background: 'var(--color-fill)',
            border: '1px solid var(--color-separator)',
            color: 'var(--color-label-secondary)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
            width: '240px',
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

// ── TradeIcon ─────────────────────────────────────────────────────────────────

function TradeIcon() {
  return (
    <div
      className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2"
      style={{ background: 'var(--color-fill)' }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ color: 'var(--color-label-tertiary)' }}>
        <path d="M7 16V4m0 0L3 8m4-4l4 4" />
        <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    </div>
  );
}
