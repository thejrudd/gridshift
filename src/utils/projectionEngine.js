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
 * How many fantasy pts per game has `oppTeam` allowed to players at `pos`
 * across the whole season (from all weekly stats).
 *
 * Requires weeklyStats (all players) and players DB.
 * Returns { ptsAllowedPerGame, gamesAnalyzed } or null if insufficient data.
 */
/**
 * scheduleMap (optional): { [week]: { [teamAbbr]: { opp, home } } } from fetchSeasonSchedule.
 *   Used to determine each player's opponent when w.opp is absent from the stats entry.
 */
export function getOpponentStrength(oppTeam, pos, allWeeklyStats, players, scoringSettings, scheduleMap = null) {
  const normPos = normalizePos(pos);
  const normOpp = oppTeam?.toUpperCase();
  let totalPts = 0;
  let games = 0;

  for (const [playerId, weeks] of Object.entries(allWeeklyStats ?? {})) {
    const player = players?.[playerId];
    if (!player) continue;
    if (normalizePos(player.position) !== normPos) continue;

    for (const w of weeks) {
      // Prefer opp stored on the stat entry; fall back to schedule lookup
      let playerOpp = w.opp?.toUpperCase() ?? null;
      if (!playerOpp && scheduleMap && player.team) {
        playerOpp = scheduleMap[w.week]?.[player.team]?.opp ?? null;
      }
      if (!playerOpp || playerOpp !== normOpp) continue;
      const pts = calcPoints(w, scoringSettings);
      if (pts <= 0) continue; // skip DNPs
      totalPts += pts;
      games++;
    }
  }

  if (games < 3) return null; // not enough data
  return { ptsAllowedPerGame: totalPts / games, gamesAnalyzed: games };
}

/**
 * League-wide average PPG for a position group (for normalizing opponent factor).
 */
function getLeagueAvgPPG(pos, allWeeklyStats, players, scoringSettings) {
  const normPos = normalizePos(pos);
  let total = 0, count = 0;
  for (const [playerId, weeks] of Object.entries(allWeeklyStats ?? {})) {
    const player = players?.[playerId];
    if (!player || normalizePos(player.position) !== normPos) continue;
    for (const w of weeks) {
      const pts = calcPoints(w, scoringSettings);
      if (pts > 0) { total += pts; count++; }
    }
  }
  return count ? total / count : 0;
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
  allWeeklyStats, players, scoringSettings, scheduleMap,
}) {
  if (!weeklyArr?.length) return null;

  const gamePts = weeklyArr
    .map(w => calcPoints(w, scoringSettings))
    .filter(p => p > 0);

  if (gamePts.length < 2) return null;

  const seasonAvg = gamePts.reduce((s, p) => s + p, 0) / gamePts.length;

  // ── Home/away factor ──────────────────────────────────────────────────────
  const homeGames = [], awayGames = [];
  for (const w of weeklyArr) {
    const pts = calcPoints(w, scoringSettings);
    if (pts > 0) (w.home ? homeGames : awayGames).push(pts);
  }
  const homeAvg = homeGames.length >= 3 ? homeGames.reduce((s,p)=>s+p,0)/homeGames.length : seasonAvg;
  const awayAvg = awayGames.length >= 3 ? awayGames.reduce((s,p)=>s+p,0)/awayGames.length : seasonAvg;
  const locationAvg = isHome !== null ? (isHome ? homeAvg : awayAvg) : seasonAvg;
  const locationFactor = seasonAvg > 0 ? locationAvg / seasonAvg : 1;

  // ── Opponent defensive strength factor ───────────────────────────────────
  let oppFactor = 1.0;
  let oppData = null;
  if (oppTeam && allWeeklyStats && players) {
    const strength = getOpponentStrength(oppTeam, pos, allWeeklyStats, players, scoringSettings, scheduleMap);
    const leagueAvg = getLeagueAvgPPG(pos, allWeeklyStats, players, scoringSettings);
    if (strength && leagueAvg > 0) {
      oppData = strength;
      // Raw ratio, clamped to avoid extreme outliers
      oppFactor = Math.max(0.65, Math.min(1.45, strength.ptsAllowedPerGame / leagueAvg));
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
  const snapFactor = getSnapFactor(weeklyArr, pos);

  // ── Projected score ───────────────────────────────────────────────────────
  const projected = seasonAvg * locationFactor * oppFactor * weatherFactor * snapFactor;

  // ── Floor / ceiling from historical distribution ──────────────────────────
  const sorted = [...gamePts].sort((a, b) => a - b);
  const p10idx = Math.max(0, Math.floor(sorted.length * 0.1));
  const p90idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9));
  const floor = sorted[p10idx];
  const ceiling = sorted[p90idx];

  const min = Math.max(0, Math.round(floor  * oppFactor * weatherFactor * snapFactor * 10) / 10);
  const max =            Math.round(ceiling * oppFactor * (isPassingPos ? weatherFactor : Math.max(0.95, weatherFactor)) * snapFactor * 10) / 10;

  return {
    projected: Math.round(projected * 10) / 10,
    min,
    max,
    factors: {
      locationFactor: Math.round(locationFactor * 100) / 100,
      oppFactor:      Math.round(oppFactor * 100) / 100,
      weatherFactor:  Math.round(weatherFactor * 100) / 100,
      snapFactor:     Math.round(snapFactor * 100) / 100,
      oppGames:       oppData?.gamesAnalyzed ?? 0,
    },
  };
}
