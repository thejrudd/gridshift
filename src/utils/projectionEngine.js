// ── Fantasy Projection Engine ─────────────────────────────────────────────────
import { calcPoints } from './scoringEngine';

const IDP_POSITIONS = new Set(['DL', 'LB', 'DB', 'DE', 'DT', 'CB', 'S', 'ILB', 'OLB', 'SS', 'FS']);
const PASSING_POSITIONS = new Set(['QB', 'WR', 'TE']);
// Positions for which offensive snap % is a meaningful usage signal
const SNAP_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

/**
 * Compute season avg PPG for a player (only counts active weeks, pts > 0).
 */
export function getAvgPPG(weeklyArr, scoring) {
  if (!weeklyArr?.length) return 0;
  const scored = weeklyArr.map(w => calcPoints(w, scoring)).filter(p => p > 0);
  if (!scored.length) return 0;
  return Math.round((scored.reduce((s, p) => s + p, 0) / scored.length) * 10) / 10;
}

/**
 * Compute positional ranks for all players.
 * Returns { [playerId]: { rank, posCount } }
 * where rank=1 is the highest scorer at that position.
 */
export function computePositionalRanks(seasonStats, players, scoringSettings) {
  if (!seasonStats || !players) return {};

  // Group players by position with their pts
  const byPos = {}; // { pos: [{id, pts}] }
  for (const [id, stats] of Object.entries(seasonStats)) {
    const p = players[id];
    if (!p) continue;
    const pos = normalizePos(p.position);
    if (!pos) continue;
    const pts = calcPoints(stats, scoringSettings);
    if (pts <= 0) continue;
    if (!byPos[pos]) byPos[pos] = [];
    byPos[pos].push({ id, pts });
  }

  // Sort each position group descending and assign ranks
  const ranks = {};
  for (const [pos, list] of Object.entries(byPos)) {
    list.sort((a, b) => b.pts - a.pts);
    list.forEach(({ id }, i) => {
      ranks[id] = { rank: i + 1, posCount: list.length, posLabel: pos };
    });
  }
  return ranks;
}

/** Normalize Sleeper sub-positions to display groups */
function normalizePos(pos) {
  if (['QB', 'RB', 'WR', 'TE', 'K'].includes(pos)) return pos;
  if (['DL', 'DE', 'DT'].includes(pos)) return 'DL';
  if (['LB', 'ILB', 'OLB'].includes(pos)) return 'LB';
  if (['DB', 'CB', 'S', 'SS', 'FS'].includes(pos)) return 'DB';
  return null;
}

/**
 * Pre-compute how many fantasy pts each team allowed per position per week.
 * Returns { [teamAbbr]: { [normPos]: { [week]: totalPts } } }
 *
 * For each player/week entry:
 *   1. Primary — use wEntry.opp (set at game time by Sleeper, unaffected by trades)
 *   2. Fallback — infer opponent from scheduleMap + player.team (covers gaps where opp is absent)
 *
 * Call this once after weeklyStats + scheduleMap are loaded; then use getDefenseStrength() for lookups.
 */
// keyBySelf=false (default): key by the opposing team — "points allowed by each defense"
// keyBySelf=true: key by the player's own team — "points scored by each offense"
export function buildDefenseTable(weeklyStats, players, scheduleMap, scoringSettings, valueFn, keyBySelf = false) {
  if (!weeklyStats || !players) return {};

  const getValue = valueFn ?? ((wEntry) => calcPoints(wEntry, scoringSettings));

  // Pre-compute the inferred season team for each player.
  // For players with ESPN-enhanced weeks, use the team from those weeks — this is
  // the game-time team and survives trades. Only fall back to player.team (current
  // roster) when no enhanced weeks exist at all (fringe/unresolved players).
  const inferredSeasonTeam = {};
  for (const [playerId, playerWeeks] of Object.entries(weeklyStats)) {
    const enhanced = playerWeeks.find(w => w._teamSource === 'espn' && w.team);
    inferredSeasonTeam[playerId] = enhanced?.team?.toUpperCase() ?? players[playerId]?.team?.toUpperCase();
  }

  const table = {};
  const addVal = (key, normPos, week, val) => {
    if (!table[key]) table[key] = {};
    if (!table[key][normPos]) table[key][normPos] = {};
    table[key][normPos][week] = (table[key][normPos][week] ?? 0) + val;
  };

  for (const [playerId, playerWeeks] of Object.entries(weeklyStats)) {
    const player = players[playerId];
    if (!player) continue;
    const normPos = normalizePos(player.position);
    if (!normPos) continue;

    for (const wEntry of playerWeeks) {
      const val = getValue(wEntry);
      if (val <= 0) continue;

      // Priority 1: per-player game-time team + scheduleMap → most reliable.
      const gameTeam = wEntry.team?.toUpperCase();
      if (gameTeam && scheduleMap?.[wEntry.week]?.[gameTeam]) {
        const opp = scheduleMap[wEntry.week][gameTeam].opp?.toUpperCase();
        if (opp && opp !== gameTeam) { addVal(keyBySelf ? gameTeam : opp, normPos, wEntry.week, val); continue; }
      }

      // Priority 2: opp field from per-player enhancement.
      const entryOpp = wEntry.opp?.toUpperCase();
      if (keyBySelf) {
        const entryTeam = wEntry.team?.toUpperCase();
        if (entryTeam) { addVal(entryTeam, normPos, wEntry.week, val); continue; }
      } else {
        if (entryOpp) { addVal(entryOpp, normPos, wEntry.week, val); continue; }
      }

      // Priority 3: inferred season team fallback.
      const fallbackTeam = inferredSeasonTeam[playerId];
      if (scheduleMap && fallbackTeam) {
        if (keyBySelf) {
          addVal(fallbackTeam, normPos, wEntry.week, val);
        } else {
          const opp = scheduleMap[wEntry.week]?.[fallbackTeam]?.opp?.toUpperCase();
          if (opp) addVal(opp, normPos, wEntry.week, val);
        }
      }
    }
  }

  return table;
}

/**
 * Look up how many fantasy pts/game an opponent has allowed to a position.
 * Only counts weeks before `beforeWeek`.
 * Returns { ptsAllowedPerGame, gamesAnalyzed } or null if < 3 games found.
 */
export function getDefenseStrength(defenseTable, oppTeam, pos, beforeWeek = null) {
  const normPos = normalizePos(pos);
  const weekData = defenseTable?.[oppTeam?.toUpperCase()]?.[normPos] ?? {};
  const relevant = Object.entries(weekData)
    .filter(([wk]) => beforeWeek == null || Number(wk) < beforeWeek)
    .map(([, pts]) => pts);
  if (relevant.length < 3) return null;
  const total = relevant.reduce((s, p) => s + p, 0);
  return { ptsAllowedPerGame: total / relevant.length, gamesAnalyzed: relevant.length };
}

/**
 * How many fantasy pts per game has `oppTeam` allowed to players at `pos`
 * across the season (only weeks before `beforeWeek`).
 *
 * Two-pass approach:
 *   Pass 1 — Direct opp-field scan: for every normPos player, accumulate their
 *             points in any week where their stat entry's `opp` field === normOpp.
 *             This is the most reliable signal — Sleeper sets `opp` at game time
 *             using Sleeper abbreviations, unaffected by subsequent trades.
 *   Pass 2 — Schedule-map fill: for any week normOpp played that Pass 1 missed
 *             (because `opp` was absent from all stat entries that week), use the
 *             ESPN schedule to identify the facing team and sum by player.team.
 *             Requires scheduleMap keys to use Sleeper abbreviations (handled in
 *             playerApi.js via ESPN_ABBR_TO_SLEEPER).
 *
 * scheduleMap: { [week]: { [sleeperTeamAbbr]: { opp: sleeperTeamAbbr, home } } }
 * Returns { ptsAllowedPerGame, gamesAnalyzed } or null if < 3 games found.
 */
export function getOpponentStrength(oppTeam, pos, allWeeklyStats, players, scoringSettings, scheduleMap = null, beforeWeek = null) {
  const normPos = normalizePos(pos);
  const normOpp = oppTeam?.toUpperCase();

  // ── Pass 1: Direct opp-field scan ────────────────────────────────────────
  // For each normPos player, sum their pts by week where wEntry.opp === normOpp.
  // Most reliable when Sleeper populates the `opp` field in stat entries.
  const weekTotals = {};
  for (const [playerId, playerWeeks] of Object.entries(allWeeklyStats ?? {})) {
    const player = players?.[playerId];
    if (!player || normalizePos(player.position) !== normPos) continue;
    for (const wEntry of playerWeeks) {
      if (beforeWeek != null && wEntry.week >= beforeWeek) continue;
      if (wEntry.opp?.toUpperCase() !== normOpp) continue;
      const pts = calcPoints(wEntry, scoringSettings);
      if (pts > 0) weekTotals[wEntry.week] = (weekTotals[wEntry.week] ?? 0) + pts;
    }
  }

  // ── Build weekToFacingTeam for weeks not yet covered by Pass 1 ────────────
  // Three signals, stacked from most to least authoritative.
  const weekToFacingTeam = {};

  // Signal A: ESPN scheduleMap — complete and reliable when the fetch succeeded.
  // Keys use Sleeper abbreviations (normalised in playerApi.js).
  if (scheduleMap) {
    for (const [weekStr, teamsMap] of Object.entries(scheduleMap)) {
      const wk = Number(weekStr);
      if (beforeWeek != null && wk >= beforeWeek) continue;
      if (weekTotals[wk] != null) continue;
      const facing = teamsMap[normOpp]?.opp?.toUpperCase();
      if (facing) weekToFacingTeam[wk] = facing;
    }
  }

  // Signal B: normOpp's own rostered players — their opp field names who they faced.
  // Useful when the scheduleMap is incomplete.
  for (const [playerId, playerWeeks] of Object.entries(allWeeklyStats ?? {})) {
    const player = players?.[playerId];
    if (!player?.team || player.team.toUpperCase() !== normOpp) continue;
    for (const wEntry of playerWeeks) {
      if (beforeWeek != null && wEntry.week >= beforeWeek) continue;
      if (weekTotals[wEntry.week] != null) continue;
      const opp = wEntry.opp?.toUpperCase();
      if (opp && !weekToFacingTeam[wEntry.week]) weekToFacingTeam[wEntry.week] = opp;
    }
  }

  // Signal C: any player (all positions) with wEntry.opp === normOpp.
  // Their current team is the facing team. This is the widest net — if any
  // skill-position player from the facing team has opp populated, we catch it.
  for (const [playerId, playerWeeks] of Object.entries(allWeeklyStats ?? {})) {
    const player = players?.[playerId];
    if (!player?.team) continue;
    for (const wEntry of playerWeeks) {
      if (beforeWeek != null && wEntry.week >= beforeWeek) continue;
      if (weekTotals[wEntry.week] != null) continue;
      if (wEntry.opp?.toUpperCase() !== normOpp) continue;
      if (!weekToFacingTeam[wEntry.week]) weekToFacingTeam[wEntry.week] = player.team.toUpperCase();
    }
  }

  // ── Pass 2: Sum normPos points from the facing team for uncovered weeks ───
  for (const [wkStr, facingTeam] of Object.entries(weekToFacingTeam)) {
    const wk = Number(wkStr);
    let weekPts = 0;
    let hasData = false;
    for (const [playerId, playerWeeks] of Object.entries(allWeeklyStats ?? {})) {
      const player = players?.[playerId];
      if (!player || normalizePos(player.position) !== normPos) continue;
      const wEntry = playerWeeks.find(w => w.week === wk);
      if (!wEntry) continue;
      // Accept if: opp field says normOpp (game-time, survives trades)
      // OR current team matches schedule-derived facing team
      const entryOpp = wEntry.opp?.toUpperCase();
      const currentTeam = player.team?.toUpperCase();
      if (entryOpp !== normOpp && currentTeam !== facingTeam) continue;
      const pts = calcPoints(wEntry, scoringSettings);
      if (pts > 0) { weekPts += pts; hasData = true; }
    }
    if (hasData) weekTotals[wk] = weekPts;
  }

  const games = Object.keys(weekTotals).length;
  if (games < 3) return null;
  const totalPts = Object.values(weekTotals).reduce((s, p) => s + p, 0);
  return { ptsAllowedPerGame: totalPts / games, gamesAnalyzed: games };
}

/**
 * Compute a percentile rank (0–1) for how easy/hard a matchup is against oppTeam at pos.
 * 0 = hardest matchup (stingiest defense), 1 = easiest (most generous defense).
 * Ranks oppTeam against all teams in defenseTable that have ≥ 3 games of data.
 * Returns null if fewer than 5 teams have enough data, or if oppTeam is not found.
 */
export function getDefensePercentile(defenseTable, oppTeam, pos, beforeWeek = null) {
  const normPos = normalizePos(pos);
  if (!normPos || !defenseTable) return null;
  const normOpp = oppTeam?.toUpperCase();

  const teamAvgs = [];
  for (const [team, posData] of Object.entries(defenseTable)) {
    const weekData = posData[normPos] ?? {};
    const relevant = Object.entries(weekData)
      .filter(([wk]) => beforeWeek == null || Number(wk) < beforeWeek)
      .map(([, pts]) => pts);
    if (relevant.length < 3) continue;
    teamAvgs.push({ team, avg: relevant.reduce((s, p) => s + p, 0) / relevant.length });
  }

  if (teamAvgs.length < 5) return null;

  // Sort ascending: index 0 = stingiest (hardest matchup for fantasy)
  teamAvgs.sort((a, b) => a.avg - b.avg);

  const idx = teamAvgs.findIndex(t => t.team === normOpp);
  if (idx === -1) return null;

  return idx / (teamAvgs.length - 1);
}

/**
 * League-wide average total fantasy pts scored against any defense per game, for a position group.
 * Aggregates by (opponent team, week) — the same scale as ptsAllowedPerGame in getDefenseStrength —
 * so that oppFactor = ptsAllowedPerGame / leagueAvg is a true relative comparison.
 */
export function getLeagueAvgPPG(pos, allWeeklyStats, players, scoringSettings, beforeWeek = null) {
  const normPos = normalizePos(pos);
  const teamWeekTotals = {}; // `${opp}_${week}` → total pts scored against that defense
  for (const [playerId, weeks] of Object.entries(allWeeklyStats ?? {})) {
    const player = players?.[playerId];
    if (!player || normalizePos(player.position) !== normPos) continue;
    for (const w of weeks) {
      if (beforeWeek != null && w.week >= beforeWeek) continue;
      const pts = calcPoints(w, scoringSettings);
      if (pts <= 0) continue;
      const opp = w.opp?.toUpperCase();
      if (!opp) continue;
      const key = `${opp}_${w.week}`;
      teamWeekTotals[key] = (teamWeekTotals[key] ?? 0) + pts;
    }
  }
  const vals = Object.values(teamWeekTotals);
  return vals.length ? vals.reduce((s, p) => s + p, 0) / vals.length : 0;
}

/**
 * Compute a snap-usage trend factor for a player.
 *
 * Compares recent snap % (last 4 games) vs season-average snap %.
 * A player whose role is expanding (e.g. RBBC back gaining carries, emerging WR)
 * gets a modest upward adjustment; one whose role is shrinking (injury return,
 * depth-chart demotion, team switching to multi-back sets) gets a downward adjustment.
 *
 * Important: the season-average pts already embed the player's historical snap rate,
 * so this factor only adjusts for *changes* in usage — it will not penalise a player
 * who has consistently played 55 % of snaps all year.
 *
 * Only applied to offensive skill positions (QB, RB, WR, TE).
 * Returns 1.0 when snap data is insufficient or the position is ineligible.
 */
function getSnapFactor(weeklyArr, pos, recentWeeks = 4) {
  if (!SNAP_POSITIONS.has(pos)) return 1.0;

  // Build a snap-% reading for each week the team ran an offensive play
  const snapPcts = weeklyArr
    .filter(w => w.tm_off_snp > 0 && w.off_snp != null)
    .map(w => ({ week: w.week, pct: w.off_snp / w.tm_off_snp }));

  if (snapPcts.length < 3) return 1.0; // not enough data to form a trend

  const seasonAvg = snapPcts.reduce((s, e) => s + e.pct, 0) / snapPcts.length;

  // If the player has always been a deep role player (< 35 % snaps on average)
  // their pts baseline already prices in low usage — don't compound the adjustment.
  if (seasonAvg < 0.35) return 1.0;

  // Use the most-recent N games (sorted by week number)
  const sorted = [...snapPcts].sort((a, b) => a.week - b.week);
  const recent = sorted.slice(-recentWeeks);
  if (recent.length < 2) return 1.0;

  const recentAvg = recent.reduce((s, e) => s + e.pct, 0) / recent.length;

  // Ratio of recent usage to season baseline, clamped to avoid extremes
  return Math.max(0.75, Math.min(1.25, recentAvg / seasonAvg));
}

/**
 * Project min / max / projected fantasy pts for a player in a specific game.
 *
 * @param {Object[]} weeklyArr   - Player's weekly stats array
 * @param {string}   pos         - Player position ('QB', 'RB', etc.)
 * @param {string|null} oppTeam  - Opposing team abbreviation (from weekly stats `opp`)
 * @param {boolean|null} isHome  - true if player's team is home (from `home` field)
 * @param {boolean}  isIndoor    - Is the game played indoors?
 * @param {Object|null} weather  - { temp_c, wind_kph, precipitation_mm } or null
 * @param {Object}   allWeeklyStats - Full season weekly stats for all players
 * @param {Object}   players     - Full player DB
 * @param {Object}   scoringSettings
 * @returns {{ projected: number, min: number, max: number, factors: Object } | null}
 */
export function projectPlayer({
  weeklyArr, pos, oppTeam, isHome, isIndoor, weather,
  allWeeklyStats, players, scoringSettings, scheduleMap, week,
  defStrength,
  leagueAvg,           // optional pre-computed league avg PPG for this position
  skipOpponentLookup,  // when true, skip getOpponentStrength fallback if defStrength is null
}) {
  if (!weeklyArr?.length) return null;

  // Only use games already played before the projected week, sorted chronologically
  const priorWeekly = (week != null ? weeklyArr.filter(w => w.week < week) : weeklyArr)
    .slice()
    .sort((a, b) => a.week - b.week);

  const gamePts = priorWeekly
    .map(w => calcPoints(w, scoringSettings))
    .filter(p => p > 0);

  if (gamePts.length < 2) return null;

  const seasonAvg = gamePts.reduce((s, p) => s + p, 0) / gamePts.length;

  // ── Recent form (last 4 scored games in chronological order) ─────────────
  // Weighted 60% recent / 40% season so hot/cold streaks propagate quickly
  // into the next projection without completely discarding the season baseline.
  const recentPts = priorWeekly
    .map(w => calcPoints(w, scoringSettings))
    .filter(p => p > 0)
    .slice(-4);
  const recentAvg = recentPts.length >= 2
    ? recentPts.reduce((s, p) => s + p, 0) / recentPts.length
    : seasonAvg;
  const blendedBase = recentPts.length >= 2
    ? recentAvg * 0.6 + seasonAvg * 0.4
    : seasonAvg;

  // ── Home/away factor ──────────────────────────────────────────────────────
  const homeGames = [], awayGames = [];
  for (const w of priorWeekly) {
    const pts = calcPoints(w, scoringSettings);
    if (pts > 0) (w.home ? homeGames : awayGames).push(pts);
  }
  const homeAvg = homeGames.length >= 1 ? homeGames.reduce((s,p)=>s+p,0)/homeGames.length : seasonAvg;
  const awayAvg = awayGames.length >= 1 ? awayGames.reduce((s,p)=>s+p,0)/awayGames.length : seasonAvg;
  const locationAvg = isHome !== null ? (isHome ? homeAvg : awayAvg) : seasonAvg;
  const locationFactor = seasonAvg > 0 ? locationAvg / seasonAvg : 1;

  // ── Opponent defensive strength factor ───────────────────────────────────
  let oppFactor = 1.0;
  let oppData = null;
  // Use pre-computed defStrength when available (preferred — from buildDefenseTable).
  // Falls back to on-demand getOpponentStrength for callers that don't provide it,
  // unless skipOpponentLookup is set (for bulk callers that pre-compute the table).
  const strengthData = defStrength
    ?? (skipOpponentLookup ? null
        : (oppTeam && allWeeklyStats && players
            ? getOpponentStrength(oppTeam, pos, allWeeklyStats, players, scoringSettings, scheduleMap, week)
            : null));
  if (strengthData) {
    const avgPPG = leagueAvg ?? (allWeeklyStats && players
      ? getLeagueAvgPPG(pos, allWeeklyStats, players, scoringSettings, week)
      : 0);
    if (avgPPG > 0) {
      oppData = strengthData;
      oppFactor = Math.max(0.65, Math.min(1.45, strengthData.ptsAllowedPerGame / avgPPG));
    }
  }

  // ── Weather factor ────────────────────────────────────────────────────────
  let weatherFactor = 1.0;
  const isPassingPos = PASSING_POSITIONS.has(pos);
  if (!isIndoor && weather) {
    const { temp_c, wind_kph, precipitation_mm } = weather;
    if (temp_c !== null) {
      if (temp_c < -7)      weatherFactor *= 0.90;
      else if (temp_c < 0)  weatherFactor *= 0.94;
      else if (temp_c < 5)  weatherFactor *= 0.97;
    }
    if (wind_kph !== null) {
      if (wind_kph > 40 && isPassingPos)       weatherFactor *= 0.87;
      else if (wind_kph > 25 && isPassingPos)  weatherFactor *= 0.93;
      else if (wind_kph > 40)                   weatherFactor *= 0.95;
    }
    if (precipitation_mm !== null) {
      if (precipitation_mm > 8)                 weatherFactor *= isPassingPos ? 0.88 : 0.93;
      else if (precipitation_mm > 3)            weatherFactor *= isPassingPos ? 0.93 : 0.97;
    }
  }

  // ── Snap usage trend factor ───────────────────────────────────────────────
  // Compares recent snap % (last 4 games) vs season average.
  // Captures RBBC shifts, emerging roles, and depth-chart changes without
  // double-counting the baseline (which already reflects historical snap rate).
  const snapFactor = getSnapFactor(priorWeekly, pos);

  // ── Projected score ───────────────────────────────────────────────────────
  const projected = blendedBase * locationFactor * oppFactor * weatherFactor * snapFactor;

  // ── Floor / ceiling from historical distribution ──────────────────────────
  // Compute the player's variance profile (25th/75th percentile) as fractions
  // of their season average, then apply those fractions to `projected`.
  // This anchors the range to the current projection level regardless of how
  // much blendedBase diverges from seasonAvg (e.g., after a breakout run),
  // guaranteeing the projection always falls within [min, max].
  const sorted = [...gamePts].sort((a, b) => a - b);
  function percentileVal(arr, p) {
    if (arr.length === 1) return arr[0];
    const idx = p * (arr.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
  }
  const rawFloor = percentileVal(sorted, 0.25);
  const rawCeil  = percentileVal(sorted, 0.75);

  // Express as fractions of season avg — the player's inherent variance profile.
  const floorFrac = seasonAvg > 0 ? rawFloor / seasonAvg : 0.65;
  const ceilFrac  = seasonAvg > 0 ? rawCeil  / seasonAvg : 1.35;

  // Clamp so projected is always strictly inside [min, max].
  // (floor ≤ 90% of projected, ceiling ≥ 110% of projected)
  const safeFloor = Math.min(floorFrac, 0.90);
  const safeCeil  = Math.max(ceilFrac,  1.10);

  // Scale from projected for min/max; from blendedBase for the Base-row display.
  const min     = Math.max(0, Math.round(projected * safeFloor * 10) / 10);
  const max     =             Math.round(projected * safeCeil  * 10) / 10;
  const floor   = Math.round(blendedBase * safeFloor * 10) / 10;
  const ceiling = Math.round(blendedBase * safeCeil  * 10) / 10;

  const ceilingWeatherFactor = isPassingPos ? weatherFactor : Math.max(0.95, weatherFactor);

  return {
    projected: Math.round(projected * 10) / 10,
    min,
    max,
    factors: {
      locationFactor:        Math.round(locationFactor * 100) / 100,
      oppFactor:             Math.round(oppFactor * 100) / 100,
      weatherFactor:         Math.round(weatherFactor * 100) / 100,
      ceilingWeatherFactor:  Math.round(ceilingWeatherFactor * 100) / 100,
      snapFactor:            Math.round(snapFactor * 100) / 100,
      oppGames:              oppData?.gamesAnalyzed ?? 0,
      floorBase:             Math.round(floor * 10) / 10,
      ceilingBase:           Math.round(ceiling * 10) / 10,
      seasonBase:            Math.round(seasonAvg * 10) / 10,
      recentBase:            Math.round(recentAvg * 10) / 10,
    },
  };
}
