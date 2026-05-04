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
  const showLoading = loading || (hasAny && !ktcPlayers && !error);

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

  const analysis = bothKnown ? (() => {
    const tier         = fairnessTier(pct);
    const pickEquiv    = leader !== 'equal' ? findPickEquiv(gap, ktcPlayers, leagueType) : null;
    const playerEquivs = leader !== 'equal' ? findPlayerEquivs(gap, ktcPlayers, leagueType) : [];

    const ageA  = ktcA?.age ? Math.floor(ktcA.age) : null;
    const ageB  = ktcB?.age ? Math.floor(ktcB.age) : null;
    // KTC position is used for dynasty window / prime years / context blurbs.
    const ktcPosA = ktcA?.position ?? null;
    const ktcPosB = ktcB?.position ?? null;
    // Sleeper position is used for stat lookups because it matches the ranking tables.
    const sleeperPosA = sleeperPlayerA?.position?.toUpperCase() ?? null;
    const sleeperPosB = sleeperPlayerB?.position?.toUpperCase() ?? null;
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

    const srA = statRanksByPos[(posA ?? '').toUpperCase()] ?? {};
    const srB = statRanksByPos[(posB ?? '').toUpperCase()] ?? {};
    const samePos = posA && posB && posA.toUpperCase() === posB.toUpperCase();
    const allStatKeys = [...new Set([
      ...(POS_STAT_KEYS[(posA ?? '').toUpperCase()] ?? []),
      ...(POS_STAT_KEYS[(posB ?? '').toUpperCase()] ?? []),
    ])];

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

    const vsDefA  = computeVsDefense(pidA, posA, posA, weeklyStats, defenseTable, scoringSettings);
    const vsDefB  = computeVsDefense(pidB, posB, posB, weeklyStats, defenseTable, scoringSettings);
    const vsDefA2 = posA === 'TE' ? computeVsDefense(pidA, 'TE', 'WR', weeklyStats, defenseTable, scoringSettings) : null;
    const vsDefB2 = posB === 'TE' ? computeVsDefense(pidB, 'TE', 'WR', weeklyStats, defenseTable, scoringSettings) : null;

    const showPyl     = format === 'dynasty' && (pylA != null || pylB != null);

    return {
      tier, pickEquiv, playerEquivs,
      ageA, ageB, winA, winB, pylA, pylB, showPyl,
      posA, posB, samePos,
      t7A, t7B, ctxA, ctxB,
      perfA, perfB, rankA, rankB,
      notableStats, fantasyNotableStats,
      vsDefA, vsDefB, vsDefA2, vsDefB2,
    };
  })() : null;

  // Empty state — no players selected
  if (!hasAny) {
    return (
      <div className="trade-compare trade-compare--empty flex flex-col items-center justify-center py-20 px-8 gap-3">
        <TradeIcon />
        <span className="text-sm font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
          Select players to see trade values
        </span>
      </div>
    );
  }

  return (
    <div className="trade-compare px-4 py-4 flex flex-col gap-5">
      {showLoading ? (
        <TradeCompareState kind="loading" />
      ) : error ? (
        <TradeCompareState kind="error" error={error} />
      ) : (
        <>
          {playerA && playerB && bothKnown && analysis && (
            <div className="trade-compare__analysis flex flex-col gap-4" data-testid="trade-compare-analysis">
              <TradeCompareScoreboard
                playerA={playerA}
                playerB={playerB}
                valA={valA}
                valB={valB}
                leader={leader}
                gap={gap}
                pct={pct}
                tier={analysis.tier}
              />
              <BalanceInsightPanel
                leader={leader}
                leaderName={leaderName}
                trailerName={trailerName}
                gap={gap}
                pct={pct}
                tier={analysis.tier}
                playerEquivs={analysis.playerEquivs}
                pickEquiv={analysis.pickEquiv}
              />
              <TradeContextGrid
                analysis={analysis}
                valA={valA}
                valB={valB}
                rawValA={rawValA}
                rawValB={rawValB}
                format={format}
                leagueType={leagueType}
                statsLoading={statsLoading}
                seasonStats={seasonStats}
              />
            </div>
          )}

          {!playerA && playerB && <TradeCompareState kind="missingA" />}
          {playerA && !playerB && <TradeCompareState kind="missingB" />}
          {playerA && playerB && !bothKnown && (
            <TradeCompareState
              kind="unavailable"
              playerA={playerA}
              playerB={playerB}
              notFoundA={notFoundA}
              notFoundB={notFoundB}
            />
          )}

          <TradeCompareCTA hasLeague={hasLeague} hasAny={hasAny} onBuildTrade={onBuildTrade} />
          <TradeCompareAttribution format={format} leagueType={leagueType} />
        </>
      )}
    </div>
  );
}

// ── Render Sections ──────────────────────────────────────────────────────────

function TradeCompareState({ kind, error, playerA, playerB, notFoundA, notFoundB }) {
  if (kind === 'loading') {
    return (
      <div className="trade-compare__state trade-compare__state--loading flex items-center justify-center py-8 gap-3"
        style={{ color: 'var(--color-label-tertiary)' }}>
        <Spinner />
        <span className="text-sm">Loading KTC data…</span>
      </div>
    );
  }

  if (kind === 'error') {
    return (
      <div
        className="trade-compare__state trade-compare__state--error rounded-xl px-4 py-4 flex flex-col gap-1.5"
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
    );
  }

  if (kind === 'missingA' || kind === 'missingB') {
    return (
      <div className={`trade-compare__state trade-compare__state--partial trade-compare__state--${kind} text-sm text-center`} style={{ color: 'var(--color-label-tertiary)' }}>
        {kind === 'missingA' ? 'Select Player 1 to compare trade values.' : 'Select Player 2 to compare trade values.'}
      </div>
    );
  }

  const missingNames = [
    notFoundA ? playerA?.displayName : null,
    notFoundB ? playerB?.displayName : null,
  ].filter(Boolean);

  return (
    <div
      className="trade-compare__state trade-compare__state--unavailable rounded-xl px-4 py-4 flex flex-col gap-1.5"
      style={{ background: 'var(--color-fill)' }}
    >
      <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
        Trade value unavailable
      </span>
      <span className="text-xs leading-relaxed" style={{ color: 'var(--color-label-tertiary)' }}>
        {missingNames.length
          ? `No KeepTradeCut match was found for ${missingNames.join(' or ')}.`
          : 'KeepTradeCut values are still unavailable for this comparison.'}
      </span>
    </div>
  );
}

function TradeCompareScoreboard({ playerA, playerB, valA, valB, leader, gap, pct, tier }) {
  const verdict = leader === 'equal'
    ? 'Even Value'
    : `${leader === 'A' ? playerA?.displayName : playerB?.displayName} leads`;

  return (
    <section
      className="trade-compare__scoreboard trade-compare-scoreboard rounded-xl px-4 py-4"
      style={{ background: 'var(--color-fill)', color: 'var(--color-label)' }}
    >
      <div className="trade-compare-scoreboard__grid grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-4 items-center">
        <ScoreboardSide align="left" name={playerA?.displayName} value={valA} isLeader={leader === 'A'} />
        <div className="trade-compare-scoreboard__center flex flex-col items-center text-center gap-0.5">
          <span
            className="trade-compare-scoreboard__verdict text-sm font-extrabold"
            data-testid="trade-compare-verdict"
            style={{ color: tier?.color ?? 'var(--color-label)' }}
          >
            {verdict}
          </span>
          <span className="trade-compare-scoreboard__gap text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
            {gap === 0 ? 'No value gap' : `${fmtKtcValue(gap)} gap`}
          </span>
          <span className="trade-compare-scoreboard__pct text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-label-quaternary)' }}>
            {pct != null ? `${pct}% of top side` : 'Gap pending'}
          </span>
        </div>
        <ScoreboardSide align="right" name={playerB?.displayName} value={valB} isLeader={leader === 'B'} />
      </div>
    </section>
  );
}

function ScoreboardSide({ align, name, value, isLeader }) {
  const alignment = align === 'right' ? 'items-end text-right' : 'items-start text-left';
  return (
    <div className={`trade-compare-scoreboard__side trade-compare-scoreboard__side--${align} ${isLeader ? 'trade-compare-scoreboard__side--leader' : ''} ${alignment} flex flex-col min-w-0`}>
      <span className="trade-compare-scoreboard__name text-xs font-bold truncate max-w-full" style={{ color: 'var(--color-label-secondary)' }}>
        {name ?? 'Player'}
      </span>
      <span className="trade-compare-scoreboard__value text-3xl font-extrabold tabular-nums" style={{ color: 'var(--color-label)' }}>
        {fmtKtcValue(value)}
      </span>
    </div>
  );
}

function BalanceInsightPanel({ leader, leaderName, trailerName, gap, pct, tier, playerEquivs, pickEquiv }) {
  return (
    <section
      className="trade-compare__balance trade-compare-balance rounded-xl px-4 py-4 flex flex-col gap-3"
      style={{ background: 'var(--color-fill)' }}
    >
      <SectionHeader label="Trade Analysis" />
      {tier && (
        <div className="trade-compare-balance__tier flex items-center gap-2">
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
        <p className="trade-compare-balance__sentence text-sm" style={{ color: 'var(--color-label)' }}>
          These players have roughly equal trade value — a straight swap is fair.
        </p>
      ) : (
        <>
          <p className="trade-compare-balance__sentence text-sm leading-relaxed" style={{ color: 'var(--color-label)' }}>
            <span className="font-semibold">{leaderName}</span> has{' '}
            <span className="font-semibold">{fmtKtcValue(gap)}</span> more value.
            To balance this trade, the <span className="font-medium">{trailerName?.split(' ').slice(-1)[0]}</span> side
            needs to add roughly <span className="font-semibold">{fmtKtcValue(gap)}</span> in additional asset value.
          </p>

          {(playerEquivs.length > 0 || pickEquiv) && (
            <ValueEquivalents playerEquivs={playerEquivs} pickEquiv={pickEquiv} />
          )}
        </>
      )}
    </section>
  );
}

function ValueEquivalents({ playerEquivs, pickEquiv }) {
  return (
    <div className="trade-compare-balance__equivalents flex flex-col gap-1.5">
      <span
        className="text-[10px] uppercase tracking-widest"
        style={{ color: 'var(--color-label-quaternary)', letterSpacing: '0.08em' }}
      >
        Value equivalents
      </span>
      {playerEquivs.map(eq => (
        <EquivalentRow key={eq.name} icon="player">
          A{' '}
          <span className="font-semibold" style={{ color: 'var(--color-label)' }}>
            {eq.tier} {eq.posLabel}
          </span>
          {' '}— e.g.{' '}
          <span className="font-semibold" style={{ color: 'var(--color-label)' }}>
            {eq.name}
          </span>
          {' '}({fmtKtcValue(eq.val)})
        </EquivalentRow>
      ))}
      {pickEquiv && (
        <EquivalentRow icon="pick">
          A draft pick — e.g.{' '}
          <span className="font-semibold" style={{ color: 'var(--color-label)' }}>
            {pickEquiv.name}
          </span>
          {' '}({fmtKtcValue(pickEquiv.val)})
        </EquivalentRow>
      )}
    </div>
  );
}

function EquivalentRow({ icon, children }) {
  return (
    <div
      className={`trade-compare-balance__equivalent trade-compare-balance__equivalent--${icon} flex items-center gap-2 rounded-lg px-3 py-2`}
      style={{ background: 'var(--color-fill-secondary)' }}
    >
      {icon === 'player' ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-label-tertiary)', flexShrink: 0 }}>
          <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-label-tertiary)', flexShrink: 0 }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
      <span className="text-xs" style={{ color: 'var(--color-label-secondary)' }}>
        {children}
      </span>
    </div>
  );
}

function TradeContextGrid({ analysis, valA, valB, rawValA, rawValB, format, leagueType, statsLoading, seasonStats }) {
  const hasTrend = (analysis.t7A != null && Math.abs(analysis.t7A) >= 5) || (analysis.t7B != null && Math.abs(analysis.t7B) >= 5);
  const hasFantasy = analysis.rankA || analysis.rankB || analysis.perfA || analysis.perfB;
  const hasDefense = analysis.vsDefA || analysis.vsDefB;

  return (
    <section className="trade-compare__outlook trade-compare-context" data-testid="trade-compare-outlook">
      <div className="trade-compare-context__heading flex items-center gap-2 mb-2">
        <SectionHeader label="Player Outlook" />
        {statsLoading && !seasonStats && (
          <span className="text-[10px]" style={{ color: 'var(--color-label-quaternary)' }}>
            · loading stats…
          </span>
        )}
      </div>

      <div className="trade-compare-context__grid flex flex-col gap-3">
        <ContextCard title="Market">
          <OutlookRow
            label="Adj Value"
            left={<MetricValue>{fmtKtcValue(valA)}</MetricValue>}
            right={<MetricValue>{fmtKtcValue(valB)}</MetricValue>}
          />
          <OutlookRow
            label="KTC Base"
            left={<MetricValue>{fmtKtcValue(rawValA)}</MetricValue>}
            right={<MetricValue>{fmtKtcValue(rawValB)}</MetricValue>}
          />
          <OutlookRow
            label="League"
            left={<MutedValue>{format === 'dynasty' ? 'Dynasty' : 'Redraft'}</MutedValue>}
            right={<MutedValue>{leagueType === 'sf' ? 'Superflex' : '1QB'}</MutedValue>}
          />
        </ContextCard>

        {(analysis.winA || analysis.winB || analysis.showPyl || analysis.ctxA || analysis.ctxB) && (
          <ContextCard title="Dynasty / Age">
            <OutlookRow
              label="Age"
              left={<AgeValue age={analysis.ageA} window={analysis.winA} />}
              right={<AgeValue age={analysis.ageB} window={analysis.winB} />}
            />
            {analysis.showPyl && (
              <OutlookRow
                label="Prime Left"
                left={<PrimeValue years={analysis.pylA} />}
                right={<PrimeValue years={analysis.pylB} />}
              />
            )}
            {(analysis.ctxA || analysis.ctxB) && (
              <div className="trade-compare-context__blurbs flex flex-col gap-1.5 pt-1.5" style={{ borderTop: '1px solid var(--color-separator)' }}>
                {analysis.ctxA && <p className="text-xs leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>{analysis.ctxA}</p>}
                {analysis.ctxB && <p className="text-xs leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>{analysis.ctxB}</p>}
              </div>
            )}
          </ContextCard>
        )}

        {hasFantasy && (
          <ContextCard
            title="Fantasy Performance"
            tooltip="Fantasy points using your league's scoring settings. Szn Rank = positional finish among all active players. Szn PPG = points per game played. Recent = average over the last 4 scored weeks."
            tooltipPosition="below"
          >
            {(analysis.rankA || analysis.rankB) && (
              <OutlookRow
                label="Szn Rank"
                left={analysis.rankA ? <MetricValue>{analysis.rankA.posLabel}{analysis.rankA.rank}</MetricValue> : <DashValue />}
                right={analysis.rankB ? <MetricValue>{analysis.rankB.posLabel}{analysis.rankB.rank}</MetricValue> : <DashValue />}
              />
            )}
            {(analysis.perfA?.ppg != null || analysis.perfB?.ppg != null) && (
              <OutlookRow
                label="Szn PPG"
                left={analysis.perfA?.ppg != null ? <MetricValue>{analysis.perfA.ppg}</MetricValue> : <DashValue />}
                right={analysis.perfB?.ppg != null ? <MetricValue>{analysis.perfB.ppg}</MetricValue> : <DashValue />}
              />
            )}
            {(analysis.perfA?.recentAvg != null || analysis.perfB?.recentAvg != null) && (
              <OutlookRow
                label="Recent"
                left={<RecentValue perf={analysis.perfA} />}
                right={<RecentValue perf={analysis.perfB} />}
              />
            )}
          </ContextCard>
        )}

        {analysis.fantasyNotableStats.length > 0 && (
          <StatRanksCard
            title="Production Ranks"
            stats={analysis.fantasyNotableStats}
            samePos={analysis.samePos}
            kind="fantasy"
          />
        )}

        {analysis.notableStats.length > 0 && (
          <StatRanksCard
            title="Raw Stat Ranks"
            stats={analysis.notableStats}
            samePos={analysis.samePos}
            kind="raw"
          />
        )}

        {hasDefense && (
          <DefenseSplitsCard analysis={analysis} />
        )}

        {hasTrend && (
          <ContextCard title="Trend">
            <OutlookRow
              label="7d Trend"
              left={<TrendValue value={analysis.t7A} />}
              right={<TrendValue value={analysis.t7B} />}
            />
          </ContextCard>
        )}
      </div>
    </section>
  );
}

function ContextCard({ title, tooltip, tooltipPosition = 'above', children }) {
  return (
    <div className="trade-compare-context__card rounded-xl px-4 py-4 flex flex-col gap-2" style={{ background: 'var(--color-fill)' }}>
      <div className="trade-compare-context__card-heading flex items-center gap-1.5">
        <SectionHeader label={title} />
        {tooltip && <InfoTooltip position={tooltipPosition} text={tooltip} />}
      </div>
      {children}
    </div>
  );
}

function StatRanksCard({ title, stats, samePos, kind }) {
  const tooltip = kind === 'fantasy'
    ? (samePos
      ? "Positional rank by fantasy points earned from each stat category, using your league's scoring settings. Stats worth 0 pts in your league are excluded. Top 10 only."
      : "Each player is ranked within their own position group. Dash (—) means that stat is not tracked for that position. Ranks are not directly comparable across positions.")
    : (samePos
      ? "In-game production only — not fantasy-scored. Each rank is the player's positional finish among all players at that position this season. Shows any stat where either player ranks top 15."
      : "Each player is ranked within their own position group. Dash (—) means that stat is not tracked for that position. Ranks are not directly comparable across positions.");
  const rankColor = r => {
    if (r == null) return 'var(--color-label-quaternary)';
    if (kind === 'fantasy') return r <= 3 ? '#22c55e' : r <= 7 ? '#f59e0b' : 'var(--color-label-secondary)';
    return r <= 5 ? '#22c55e' : r <= 10 ? '#f59e0b' : 'var(--color-label-secondary)';
  };

  return (
    <ContextCard title={title} tooltip={tooltip} tooltipPosition="below">
      {stats.map(({ key, rankA: rA, rankB: rB }) => (
        <OutlookRow
          key={key}
          label={STAT_LABEL[key] ?? key}
          left={rA != null ? <MetricValue color={rankColor(rA)}>#{rA}</MetricValue> : <DashValue />}
          right={rB != null ? <MetricValue color={rankColor(rB)}>#{rB}</MetricValue> : <DashValue />}
        />
      ))}
    </ContextCard>
  );
}

function DefenseSplitsCard({ analysis }) {
  const labelA = analysis.vsDefA?.label ?? null;
  const labelB = analysis.vsDefB?.label ?? null;
  const defLabel = analysis.samePos || labelA === labelB
    ? (labelA ?? labelB ?? 'D')
    : [labelA, labelB].filter(Boolean).join(' / ');
  const crossDefPos = !analysis.samePos && labelA !== labelB;

  return (
    <ContextCard
      title={`vs ${defLabel} · fpts by tier`}
      tooltip={crossDefPos
        ? `Fantasy points each player scores against their own position's defense tiers. Each player's defenses are ranked independently by pts allowed to their position — tiers are not directly comparable across positions.`
        : `Fantasy points scored against each defense tier. Defenses are split into thirds by avg ${defLabel} pts allowed per game — Tough = stingiest third, Soft = most generous. Values shown are each player's avg fpts against that tier.`}
    >
      <OutlookRow label="Tough Defense" left={<DefenseValue d={analysis.vsDefA} tier="tough" />} right={<DefenseValue d={analysis.vsDefB} tier="tough" />} />
      <OutlookRow label="Mid Defense" left={<DefenseValue d={analysis.vsDefA} tier="mid" />} right={<DefenseValue d={analysis.vsDefB} tier="mid" />} />
      <OutlookRow label="Soft Defense" left={<DefenseValue d={analysis.vsDefA} tier="soft" />} right={<DefenseValue d={analysis.vsDefB} tier="soft" />} />

      {(analysis.vsDefA2 || analysis.vsDefB2) && (
        <div className="trade-compare-context__defense-proxy flex flex-col gap-2 pt-1.5" style={{ borderTop: '1px solid var(--color-separator)' }}>
          <div className="flex items-center gap-1.5">
            <SectionHeader label="vs WR D · passing game context" />
            <InfoTooltip position="above" text="For tight ends, defenses are also ranked by how many fantasy points they allow to wide receivers — a proxy for overall passing game permissiveness. Values shown are the TE's fpts scored against each tier." />
          </div>
          <OutlookRow label="Tough Defense" left={<DefenseValue d={analysis.vsDefA2} tier="tough" />} right={<DefenseValue d={analysis.vsDefB2} tier="tough" />} />
          <OutlookRow label="Mid Defense" left={<DefenseValue d={analysis.vsDefA2} tier="mid" />} right={<DefenseValue d={analysis.vsDefB2} tier="mid" />} />
          <OutlookRow label="Soft Defense" left={<DefenseValue d={analysis.vsDefA2} tier="soft" />} right={<DefenseValue d={analysis.vsDefB2} tier="soft" />} />
        </div>
      )}
    </ContextCard>
  );
}

function TradeCompareCTA({ hasLeague, hasAny, onBuildTrade }) {
  if (!hasLeague || !hasAny) return null;
  return (
    <div className="trade-compare__cta flex flex-col gap-1.5">
      <button
        onClick={onBuildTrade ?? undefined}
        disabled={!onBuildTrade}
        className="trade-compare__build-trade w-full py-2.5 rounded-xl text-sm font-semibold transition-colors"
        data-testid="trade-compare-build-trade"
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
  );
}

function TradeCompareAttribution({ format, leagueType }) {
  return (
    <div className="trade-compare__attribution text-xs text-center" data-testid="trade-compare-attribution" style={{ color: 'var(--color-label-quaternary)' }}>
      Values from{' '}
      <span className="font-medium" style={{ color: 'var(--color-label-tertiary)' }}>
        KeepTradeCut
      </span>{' '}
      · {format === 'dynasty' ? 'Dynasty' : 'Redraft'} · {leagueType === 'sf' ? 'Superflex' : '1QB'}
    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-widest"
      style={{ color: 'var(--color-label-quaternary)', letterSpacing: '0.1em' }}
    >
      {label}
    </span>
  );
}

function OutlookRow({ label, left, right }) {
  return (
    <div className="trade-compare-context__row flex items-center gap-2">
      <div className="trade-compare-context__value trade-compare-context__value--left flex-1 flex justify-end">{left}</div>
      <div
        className="trade-compare-context__label shrink-0 text-center text-[10px] uppercase tracking-wider"
        style={{ width: 96, color: 'var(--color-label-quaternary)' }}
      >
        {label}
      </div>
      <div className="trade-compare-context__value trade-compare-context__value--right flex-1">{right}</div>
    </div>
  );
}

function MetricValue({ children, color = 'var(--color-label)' }) {
  return <span className="text-xs font-semibold" style={{ color }}>{children}</span>;
}

function MutedValue({ children }) {
  return <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>{children}</span>;
}

function DashValue() {
  return <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>—</span>;
}

function AgeValue({ age, window }) {
  if (age == null) return <DashValue />;
  return (
    <MetricValue>
      {age}
      {window && <span className="text-[10px] ml-1" style={{ color: 'var(--color-label-quaternary)' }}>· {window}</span>}
    </MetricValue>
  );
}

function PrimeValue({ years }) {
  if (years == null) return <DashValue />;
  const color = years <= 1 ? '#ef4444' : years <= 3 ? '#f59e0b' : '#22c55e';
  return (
    <MetricValue color={color}>
      {years === 0 ? 'Past peak' : `~${years} yr${years !== 1 ? 's' : ''}`}
    </MetricValue>
  );
}

function RecentValue({ perf }) {
  if (perf?.recentAvg == null) return <DashValue />;
  const color = perf.recentAvg > (perf.ppg ?? 0)
    ? '#22c55e'
    : perf.recentAvg < (perf.ppg ?? 0) * 0.75
      ? '#ef4444'
      : 'var(--color-label)';
  return (
    <MetricValue color={color}>
      {perf.recentAvg}
      <span className="text-[10px] ml-1" style={{ color: 'var(--color-label-quaternary)' }}>L{perf.recentWeeks}</span>
    </MetricValue>
  );
}

function DefenseValue({ d, tier }) {
  const v = d?.[`${tier}Avg`];
  const color = tier === 'tough' ? '#ef4444' : tier === 'soft' ? '#22c55e' : 'var(--color-label)';
  return v != null ? <MetricValue color={color}>{v}</MetricValue> : <DashValue />;
}

function TrendValue({ value }) {
  const trend = fmtTrend(value);
  return <span className="text-xs font-bold" style={{ color: trend.color }}>{trend.label}</span>;
}

function fmtTrend(v) {
  if (v == null || Math.abs(v) < 5) return { label: 'Flat', color: 'var(--color-label-quaternary)' };
  return { label: v > 0 ? `▲ +${v}` : `▼ ${v}`, color: v > 0 ? '#22c55e' : '#ef4444' };
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
