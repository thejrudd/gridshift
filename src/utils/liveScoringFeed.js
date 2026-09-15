// liveScoringFeed.js — GridShift Live data helpers.
// Maps BALLDONTLIE live rows onto GridShift scoring keys, tracks per-player
// snapshot deltas as feed events, and formats stat lines / game glances for
// the Companion Live tab.

import { calcPoints } from './scoringEngine.js';
import { splitDeltaIntoPlays } from './livePlaySplitting.js';

const TEAM_ALIASES = {
  ARI: 'ARI',
  ATL: 'ATL',
  BAL: 'BAL',
  BUF: 'BUF',
  CAR: 'CAR',
  CHI: 'CHI',
  CIN: 'CIN',
  CLE: 'CLE',
  DAL: 'DAL',
  DEN: 'DEN',
  DET: 'DET',
  GB: 'GB',
  GNB: 'GB',
  HOU: 'HOU',
  IND: 'IND',
  JAC: 'JAX',
  JAX: 'JAX',
  KC: 'KC',
  KAN: 'KC',
  LV: 'LV',
  LVR: 'LV',
  LAC: 'LAC',
  LA: 'LAR',
  LAR: 'LAR',
  MIA: 'MIA',
  MIN: 'MIN',
  NE: 'NE',
  NEP: 'NE',
  NO: 'NO',
  NOR: 'NO',
  NYG: 'NYG',
  NYJ: 'NYJ',
  PHI: 'PHI',
  PIT: 'PIT',
  SEA: 'SEA',
  SF: 'SF',
  SFO: 'SF',
  TB: 'TB',
  TAM: 'TB',
  TEN: 'TEN',
  WAS: 'WAS',
  WSH: 'WAS',
};

export function getTeamAbbr(team) {
  const raw = String(team?.abbreviation ?? team ?? '').trim().toUpperCase();
  return TEAM_ALIASES[raw] ?? raw;
}

export function normalizeName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function getSleeperPlayerName(player) {
  return player?.full_name || [player?.first_name, player?.last_name].filter(Boolean).join(' ') || 'Unknown Player';
}

function getBdlPlayerName(row) {
  const player = row?.player ?? {};
  return [player.first_name, player.last_name].filter(Boolean).join(' ') || player.full_name || '';
}

export function getStatKeyForSleeperPlayer(player) {
  return `${normalizeName(getSleeperPlayerName(player))}|${getTeamAbbr(player?.team)}`;
}

function getStatKeyForBdlRow(row) {
  return `${normalizeName(getBdlPlayerName(row))}|${getTeamAbbr(row?.team ?? row?.player?.team)}`;
}

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const numeric = finiteNumber(value);
    if (numeric != null) return numeric;
  }
  return null;
}

function roundLivePoints(value) {
  return Math.round(Number(value) * 100) / 100;
}

/**
 * Compare the BDL-derived player total with Sleeper's fantasy total without
 * changing either source. Sleeper owns the score; BDL remains the explanation
 * layer. The adjustment is surfaced by the Live breakdown when the two differ.
 */
export function reconcileLiveFantasyPoints({
  derivedPoints = null,
  authoritativePoints = null,
} = {}) {
  const derived = finiteNumber(derivedPoints);
  const authoritative = finiteNumber(authoritativePoints);
  if (derived == null || authoritative == null) {
    return {
      status: 'unavailable',
      derivedPoints: derived,
      authoritativePoints: authoritative,
      adjustment: null,
    };
  }
  const adjustment = roundLivePoints(authoritative - derived);
  return {
    status: Math.abs(adjustment) < 0.01 ? 'matched' : 'adjusted',
    derivedPoints: roundLivePoints(derived),
    authoritativePoints: roundLivePoints(authoritative),
    adjustment,
  };
}

export function buildStatIndex(statsByGame) {
  const index = new Map();
  Object.entries(statsByGame ?? {}).forEach(([gameId, rows]) => {
    (rows ?? []).forEach((row) => {
      const key = getStatKeyForBdlRow(row);
      if (key !== '|') index.set(key, { ...row, gameId });
    });
  });
  return index;
}

/**
 * Chooses the score that represents a starter at the current live moment.
 *
 * A replay fixture carries the completed week's Sleeper totals so the final
 * result can reconcile exactly. Those totals are future information while the
 * replay is still moving, so an unmatched provider row must remain at zero
 * until its time-sliced stats arrive.
 */
export function resolveCurrentPlayerPoints({
  hasMappedStats = false,
  livePoints = 0,
  sleeperPoints = null,
  sleeperDerivedPoints = null,
  suppressFallback = false,
  preferAuthoritative = false,
} = {}) {
  if (preferAuthoritative && !suppressFallback) {
    if (Number.isFinite(Number(sleeperPoints))) return Number(sleeperPoints);
    if (Number.isFinite(Number(sleeperDerivedPoints))) return Number(sleeperDerivedPoints);
  }
  if (hasMappedStats) return Number.isFinite(Number(livePoints)) ? Number(livePoints) : 0;
  if (suppressFallback) return 0;
  if (Number.isFinite(Number(sleeperPoints))) return Number(sleeperPoints);
  return Number.isFinite(Number(sleeperDerivedPoints)) ? Number(sleeperDerivedPoints) : 0;
}

export function mapBdlStatsToGridShift(row, position = null) {
  const passingCompletions = finiteNumber(row?.passing_completions);
  const passingAttempts = finiteNumber(row?.passing_attempts);
  const passingIncompletions = finiteNumber(row?.passing_incompletions);
  const fieldGoalsMade = Number(row?.field_goals_made) || 0;
  const fieldGoalAttempts = Number(row?.field_goal_attempts);
  const extraPointsMade = Number(row?.extra_points_made) || 0;
  const extraPointAttemptsRaw = row?.extra_point_attempts ?? row?.extra_points_attempted;
  const extraPointAttempts = Number(extraPointAttemptsRaw);
  const totalTackles = firstFiniteNumber(row?.total_tackles) ?? 0;
  const soloTackles = firstFiniteNumber(row?.solo_tackles) ?? 0;
  const assistedTackles = firstFiniteNumber(
    row?.assisted_tackles,
    row?.assistedTackles,
    row?.assist_tackles,
    row?.assistTackles,
  ) ?? Math.max(0, totalTackles - soloTackles);
  const hasPosition = position != null && String(position).trim() !== '';
  const includeIdpStats = !hasPosition || IDP_POSITIONS.has(String(position).toUpperCase());
  return {
    pass_yd: row?.passing_yards ?? 0,
    pass_td: row?.passing_touchdowns ?? 0,
    pass_int: row?.passing_interceptions ?? 0,
    pass_cmp: passingCompletions ?? 0,
    pass_att: passingAttempts ?? 0,
    // The live game-stat endpoint exposes attempts and completions but not
    // always an explicit incompletions counter. Keep an explicit provider
    // value when one is present and otherwise derive the NFL box-score total.
    pass_inc: passingIncompletions ?? (
      passingAttempts != null && passingCompletions != null
        ? Math.max(0, passingAttempts - passingCompletions)
        : 0
    ),
    // These fields are accepted as forward-compatible provider aliases. The
    // current BDL game-stat contract does not guarantee them; connected
    // Sleeper weekly stats supply the authoritative values when available.
    pass_fd: row?.passing_first_downs ?? 0,
    rush_fd: row?.rushing_first_downs ?? 0,
    rec_fd: row?.receiving_first_downs ?? 0,
    pass_sack: row?.sacks ?? 0,
    rush_att: row?.rushing_attempts ?? 0,
    rush_yd: row?.rushing_yards ?? 0,
    rush_td: row?.rushing_touchdowns ?? 0,
    rec: row?.receptions ?? 0,
    rec_yd: row?.receiving_yards ?? 0,
    rec_td: row?.receiving_touchdowns ?? 0,
    fum: row?.fumbles ?? 0,
    fum_lost: row?.fumbles_lost ?? 0,
    fum_rec: row?.fumbles_recovered ?? 0,
    fum_ret_td: row?.fumbles_touchdowns ?? 0,
    kr_yd: row?.kick_return_yards ?? 0,
    pr_yd: row?.punt_return_yards ?? 0,
    kr_td: row?.kick_return_touchdowns ?? 0,
    pr_td: row?.punt_return_touchdowns ?? 0,
    ret_td: (row?.kick_return_touchdowns ?? 0) + (row?.punt_return_touchdowns ?? 0),
    fgm: fieldGoalsMade,
    fgmiss: Number.isFinite(fieldGoalAttempts) ? Math.max(0, fieldGoalAttempts - fieldGoalsMade) : 0,
    xpm: extraPointsMade,
    // The documented game-stat contract currently guarantees XP makes but
    // not XP attempts. Derive misses only when a provider payload actually
    // supplies an attempt field; never infer one from the team score.
    xpmiss: Number.isFinite(extraPointAttempts) ? Math.max(0, extraPointAttempts - extraPointsMade) : 0,
    idp_tkl: includeIdpStats ? totalTackles : 0,
    idp_tkl_solo: includeIdpStats ? soloTackles : 0,
    idp_tkl_ast: includeIdpStats ? assistedTackles : 0,
    idp_tkl_loss: includeIdpStats ? (row?.tackles_for_loss ?? 0) : 0,
    idp_pd: includeIdpStats ? (row?.passes_defended ?? 0) : 0,
    idp_qbhit: includeIdpStats ? (row?.qb_hits ?? 0) : 0,
    idp_sack: includeIdpStats ? (row?.defensive_sacks ?? 0) : 0,
    idp_int: includeIdpStats ? (row?.defensive_interceptions ?? 0) : 0,
    idp_int_ret_yd: includeIdpStats ? (row?.interception_yards ?? 0) : 0,
    idp_int_td: includeIdpStats ? (row?.interception_touchdowns ?? 0) : 0,
    idp_fr: includeIdpStats ? (row?.fumbles_recovered ?? 0) : 0,
    idp_fr_td: includeIdpStats ? (row?.fumbles_touchdowns ?? 0) : 0,
    idp_def_td: includeIdpStats
      ? (row?.interception_touchdowns ?? 0) + (row?.fumbles_touchdowns ?? 0)
      : 0,
  };
}

/**
 * The BDL live game-stat row is intentionally sparse: it is excellent for
 * current box-score counters, but its documented shape does not include the
 * player-level first-down counters used by custom Sleeper leagues. Overlay
 * only those scoring inputs from the weekly Sleeper row; the rest of the live
 * row remains provider-current.
 */
export function mergeLiveScoringStats(liveStats, weeklyStats) {
  if (!liveStats && !weeklyStats) return null;
  if (!liveStats) return weeklyStats ? { ...weeklyStats } : null;
  if (!weeklyStats || typeof weeklyStats !== 'object') return { ...liveStats };

  const merged = { ...liveStats };
  const aliases = {
    pass_inc: ['pass_inc', 'passing_incompletions'],
    pass_fd: ['pass_fd', 'passing_first_downs'],
    rush_fd: ['rush_fd', 'rushing_first_downs'],
    rec_fd: ['rec_fd', 'receiving_first_downs'],
    fgm_yds: ['fgm_yds', 'field_goal_yards'],
    fgm_yds_over_30: ['fgm_yds_over_30', 'field_goal_yards_over_30'],
    idp_tkl_ast: ['idp_tkl_ast', 'assisted_tackles', 'assistedTackles', 'assist_tackles'],
  };
  Object.entries(aliases).forEach(([target, keys]) => {
    const value = keys.map((key) => finiteNumber(weeklyStats[key])).find((entry) => entry != null);
    if (value != null) merged[target] = value;
  });
  return merged;
}

// ── Game glance ──────────────────────────────────────────────────────────

function getRawGameStatus(game) {
  return String(game?.status ?? '').trim().toLowerCase();
}

function getRawGameStatusState(game) {
  return String(game?.status_state ?? game?.statusState ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
}

export function getGameStatusText(game) {
  const raw = String(game?.status ?? '').trim();
  return raw || 'Scheduled';
}

export function isLiveGame(game) {
  const status = getRawGameStatus(game);
  const state = getRawGameStatusState(game);
  if (['completed', 'complete', 'final', 'post', 'closed', 'scheduled', 'pre', 'not started', 'upcoming', 'delayed', 'delay', 'postponed'].includes(state)) {
    return false;
  }
  // BALLDONTLIE's raw Games response can expose an in-progress game as a
  // clock-first status such as "4:12 - 1st". Statistics Scores normalizes that
  // shape before rendering, while Fantasy Live consumes the raw response.
  const clockQuarterStatus = /^\d{1,2}:\d{2}\s*(?:-|·)\s*\d+(?:st|nd|rd|th)(?:\s+(?:q|quarter))?$/i.test(status);
  return state === 'in progress'
    || state === 'live'
    || state === 'in'
    || clockQuarterStatus
    || status.includes('progress')
    || status.includes('quarter')
    || status.includes('qtr')
    || status.includes('half')
    || status.includes('live')
    || status.includes('overtime')
    || status === 'ot';
}

export function isFinalGame(game) {
  const status = getRawGameStatus(game);
  return status.includes('final') || status.includes('complete');
}

export const STARTER_GAME_STATE = Object.freeze({
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  OFFICIAL_FINAL: 'officialFinal',
  CONFIRMED_BYE: 'confirmedBye',
  UNRESOLVED: 'unresolved',
});

const MIN_COMPLETE_WEEK_TEAM_COUNT = 26;
const FALLBACK_GAME_WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * A missing team can prove a bye only when the schedule looks like a complete
 * NFL week. The reciprocal opponent check rejects partial or malformed maps;
 * the team-count floor allows normal six-team bye weeks while failing closed
 * if the provider returns only part of the slate.
 */
export function isCompleteScheduleWeek(schedule) {
  if (!schedule || typeof schedule !== 'object') return false;
  const teams = Object.keys(schedule).filter(Boolean);
  if (teams.length < MIN_COMPLETE_WEEK_TEAM_COUNT) return false;
  return teams.every((team) => {
    const opponent = getTeamAbbr(schedule[team]?.opp);
    return opponent && getTeamAbbr(schedule[opponent]?.opp) === getTeamAbbr(team);
  });
}

/**
 * Estimates progress without ever treating it as settlement evidence. This is
 * a conservative fallback when live provider timing is missing or
 * unrecognized, preventing already-earned points from being added to a second
 * full-game projection.
 */
export function getFallbackRemainingGameFraction({
  scheduleEntry = null,
  currentPoints = null,
  now = Date.now(),
} = {}) {
  const kickoffAt = Date.parse(String(scheduleEntry?.kickoff ?? ''));
  const observedAt = Number(now);
  if (Number.isFinite(kickoffAt) && Number.isFinite(observedAt)) {
    if (observedAt <= kickoffAt) return 1;
    const elapsedFraction = (observedAt - kickoffAt) / FALLBACK_GAME_WINDOW_MS;
    return Math.max(0.05, Math.min(1, 1 - elapsedFraction));
  }
  const rawPoints = currentPoints;
  const points = rawPoints == null || rawPoints === '' ? 0 : Number(rawPoints);
  return Number.isFinite(points) && Math.abs(points) > 0.001 ? 0.5 : 1;
}

function isScheduledGame(game) {
  const status = getRawGameStatus(game);
  if (!status) return false;
  return status.includes('scheduled')
    || status.includes('not started')
    || status.includes('pre-game')
    || status.includes('pregame')
    || status.includes('upcoming')
    || /\b\d{1,2}:\d{2}\s*(?:am|pm)\b/.test(status);
}

/**
 * Keeps projection progress separate from settlement evidence. Missing game
 * data is never interpreted as a final merely because no live row was found.
 */
export function resolveStarterGameState({
  game = null,
  scheduleEntry = null,
  hasScheduleForWeek = false,
  hasGameThisWeek = null,
} = {}) {
  if (game && isFinalGame(game)) {
    return { state: STARTER_GAME_STATE.OFFICIAL_FINAL, remainingFraction: 0, settled: true };
  }
  if (scheduleEntry?.completed === true) {
    return { state: STARTER_GAME_STATE.OFFICIAL_FINAL, remainingFraction: 0, settled: true };
  }
  if (game && isLiveGame(game)) {
    return { state: STARTER_GAME_STATE.LIVE, remainingFraction: null, settled: false };
  }
  if (game && isScheduledGame(game)) {
    return { state: STARTER_GAME_STATE.SCHEDULED, remainingFraction: 1, settled: false };
  }
  if (game) {
    return { state: STARTER_GAME_STATE.UNRESOLVED, remainingFraction: 1, settled: false };
  }
  if (scheduleEntry || hasGameThisWeek === true) {
    return { state: STARTER_GAME_STATE.SCHEDULED, remainingFraction: 1, settled: false };
  }
  if (hasScheduleForWeek && hasGameThisWeek === false) {
    return { state: STARTER_GAME_STATE.CONFIRMED_BYE, remainingFraction: 0, settled: true };
  }
  return { state: STARTER_GAME_STATE.UNRESOLVED, remainingFraction: 1, settled: false };
}

export function getMatchupCustomPoints(row) {
  const rawAdjustment = row?.custom_points;
  if (rawAdjustment == null || rawAdjustment === '') return 0;
  const adjustment = Number(rawAdjustment);
  return Number.isFinite(adjustment) ? adjustment : 0;
}

export function getOfficialMatchupRowPoints(row) {
  const rawPoints = row?.points;
  if (rawPoints == null || rawPoints === '') return null;
  const points = Number(rawPoints);
  if (!Number.isFinite(points)) return null;
  return points + getMatchupCustomPoints(row);
}

export function hasCompleteOfficialStarterPoints(row) {
  const starters = (row?.starters ?? [])
    .map((id) => String(id))
    .filter((id) => id && id !== '0');
  const playerPoints = row?.players_points;
  return getOfficialMatchupRowPoints(row) != null
    && playerPoints
    && typeof playerPoints === 'object'
    && starters.every((id) => (
      playerPoints[id] != null
      && playerPoints[id] !== ''
      && Number.isFinite(Number(playerPoints[id]))
    ));
}

export function hasReconciledMatchup(rows, matchupId) {
  const sides = (rows ?? []).filter((row) => Number(row?.matchup_id) === Number(matchupId));
  return sides.length === 2 && sides.every(hasCompleteOfficialStarterPoints);
}

export function findGameForTeam(games, teamAbbr) {
  if (!teamAbbr) return null;
  return (games ?? []).find((game) => (
    getTeamAbbr(game?.visitor_team) === teamAbbr || getTeamAbbr(game?.home_team) === teamAbbr
  )) ?? null;
}

export function getGameGlance(game) {
  if (!game) return null;
  const away = getTeamAbbr(game.visitor_team);
  const home = getTeamAbbr(game.home_team);
  const live = isLiveGame(game);
  const period = Number(game.period);
  const timeLeft = String(game.time ?? '').trim();
  let clock = getGameStatusText(game);
  if (live && Number.isFinite(period) && period > 0) {
    clock = `Q${period}${timeLeft ? ` ${timeLeft}` : ''}`;
  } else if (isFinalGame(game)) {
    clock = 'Final';
  }
  return {
    score: `${away} ${game.visitor_team_score ?? 0} · ${home} ${game.home_team_score ?? 0}`,
    clock,
    live,
  };
}

// ── Stat lines and box scores ────────────────────────────────────────────

function n(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function summarizeStatLine(stats, position) {
  if (!stats) return null;
  const pos = String(position ?? '').toUpperCase();
  const parts = [];
  if (pos === 'QB') {
    parts.push(`${n(stats.pass_cmp)}/${n(stats.pass_att)}, ${n(stats.pass_yd)} pass yds`);
    if (n(stats.pass_td)) parts.push(`${n(stats.pass_td)} TD`);
    if (n(stats.pass_int)) parts.push(`${n(stats.pass_int)} INT`);
    if (n(stats.rush_yd)) parts.push(`${n(stats.rush_yd)} rush yds`);
  } else if (pos === 'K') {
    parts.push(`${n(stats.fgm)} FG, ${n(stats.xpm)} XP`);
  } else if (pos === 'RB') {
    parts.push(`${n(stats.rush_att)} att, ${n(stats.rush_yd)} rush yds`);
    if (n(stats.rec)) parts.push(`${n(stats.rec)} rec, ${n(stats.rec_yd)} yds`);
    const tds = n(stats.rush_td) + n(stats.rec_td);
    if (tds) parts.push(`${tds} TD`);
  } else if (['WR', 'TE'].includes(pos)) {
    parts.push(`${n(stats.rec)} rec, ${n(stats.rec_yd)} yds`);
    if (n(stats.rec_td)) parts.push(`${n(stats.rec_td)} TD`);
    if (n(stats.rush_yd)) parts.push(`${n(stats.rush_yd)} rush yds`);
  } else {
    if (n(stats.idp_tkl)) parts.push(`${n(stats.idp_tkl)} tkl`);
    if (n(stats.idp_sack)) parts.push(`${n(stats.idp_sack)} sack`);
    if (n(stats.idp_int)) parts.push(`${n(stats.idp_int)} INT`);
    if (n(stats.idp_pd)) parts.push(`${n(stats.idp_pd)} PD`);
    if (!parts.length && n(stats.rec)) parts.push(`${n(stats.rec)} rec, ${n(stats.rec_yd)} yds`);
  }
  return parts.length ? parts.join(' · ') : null;
}

export function buildPositionBoxScore(stats, position) {
  if (!stats) return [];
  const pos = String(position ?? '').toUpperCase();
  if (pos === 'QB') {
    return [
      ['CMP/ATT', `${n(stats.pass_cmp)}/${n(stats.pass_att)}`],
      ['PASS YDS', n(stats.pass_yd)],
      ['PASS TD', n(stats.pass_td)],
      ['INT', n(stats.pass_int)],
      ['SACKED', n(stats.pass_sack)],
      ['RUSH YDS', n(stats.rush_yd)],
      ['RUSH TD', n(stats.rush_td)],
      ['FUM LOST', n(stats.fum_lost)],
    ];
  }
  if (pos === 'K') {
    return [
      ['FG MADE', n(stats.fgm)],
      ['XP MADE', n(stats.xpm)],
    ];
  }
  if (pos === 'RB') {
    return [
      ['CARRIES', n(stats.rush_att)],
      ['RUSH YDS', n(stats.rush_yd)],
      ['RUSH TD', n(stats.rush_td)],
      ['REC', n(stats.rec)],
      ['REC YDS', n(stats.rec_yd)],
      ['REC TD', n(stats.rec_td)],
      ['FUM LOST', n(stats.fum_lost)],
      ['RET YDS', n(stats.kr_yd) + n(stats.pr_yd)],
    ];
  }
  if (['WR', 'TE'].includes(pos)) {
    return [
      ['REC', n(stats.rec)],
      ['REC YDS', n(stats.rec_yd)],
      ['REC TD', n(stats.rec_td)],
      ['RUSH YDS', n(stats.rush_yd)],
      ['FUM LOST', n(stats.fum_lost)],
      ['RET YDS', n(stats.kr_yd) + n(stats.pr_yd)],
    ];
  }
  return [
    ['TACKLES', n(stats.idp_tkl)],
    ['SOLO', n(stats.idp_tkl_solo)],
    ['SACKS', n(stats.idp_sack)],
    ['TFL', n(stats.idp_tkl_loss)],
    ['INT', n(stats.idp_int)],
    ['PD', n(stats.idp_pd)],
    ['QB HITS', n(stats.idp_qbhit)],
    ['FUM REC', n(stats.idp_fr)],
  ];
}

// ── Feed events from snapshot deltas ─────────────────────────────────────

const DELTA_DESCRIPTIONS = [
  { key: 'pass_td', label: (v) => `${v > 1 ? `${v} passing TDs` : 'Passing TD'}` },
  { key: 'rush_td', label: (v) => `${v > 1 ? `${v} rushing TDs` : 'Rushing TD'}` },
  { key: 'rec_td', label: (v) => `${v > 1 ? `${v} receiving TDs` : 'Receiving TD'}` },
  { key: 'kr_td', label: (v) => `${v > 1 ? `${v} kickoff return TDs` : 'Kickoff return TD'}` },
  { key: 'pr_td', label: (v) => `${v > 1 ? `${v} punt return TDs` : 'Punt return TD'}` },
  { key: 'ret_td', label: () => 'Return TD' },
  { key: 'fum_ret_td', label: () => 'Fumble return TD' },
  { key: 'fgm', label: (v) => `${v > 1 ? `${v} FGs made` : 'FG made'}` },
  { key: 'fgm_yds_over_30', label: (v) => `${v} FG yards over 30` },
  { key: 'fgmiss', label: (v) => `${v > 1 ? `${v} FGs missed` : 'FG missed'}` },
  { key: 'xpm', label: (v) => `${v > 1 ? `${v} XPs` : 'XP made'}` },
  { key: 'xpmiss', label: (v) => `${v > 1 ? `${v} XPs missed` : 'XP missed'}` },
  { key: 'pass_int', label: (v) => `${v > 1 ? `${v} INTs thrown` : 'INT thrown'}` },
  { key: 'pass_2pt', label: () => 'Passing 2-point conversion' },
  { key: 'rush_2pt', label: () => 'Rushing 2-point conversion' },
  { key: 'rec_2pt', label: () => 'Receiving 2-point conversion' },
  { key: 'fum_lost', label: () => 'Fumble lost' },
  { key: 'idp_sack', label: (v) => `${v > 1 ? `${v} sacks` : 'Sack'}` },
  { key: 'idp_int', label: () => 'Interception' },
  { key: 'idp_fr', label: () => 'Fumble recovery' },
  { key: 'pass_yd', label: (v) => `${v > 0 ? '+' : ''}${v} pass yds` },
  { key: 'pass_cmp', label: (v) => `${v} completion${v === 1 ? '' : 's'}` },
  { key: 'pass_att', label: (v) => `${v} pass attempt${v === 1 ? '' : 's'}` },
  { key: 'pass_inc', label: (v) => `${v} incomplete pass${v === 1 ? '' : 'es'}` },
  { key: 'pass_fd', label: (v) => `${v} pass first down${v === 1 ? '' : 's'}` },
  { key: 'rush_yd', label: (v) => `${v > 0 ? '+' : ''}${v} rush yds` },
  { key: 'rush_att', label: (v) => `${v} rush attempt${v === 1 ? '' : 's'}` },
  { key: 'rush_fd', label: (v) => `${v} rush first down${v === 1 ? '' : 's'}` },
  { key: 'rec', label: (v) => `${v} rec` },
  { key: 'rec_yd', label: (v) => `${v > 0 ? '+' : ''}${v} rec yds` },
  { key: 'rec_fd', label: (v) => `${v} receiving first down${v === 1 ? '' : 's'}` },
  { key: 'kr_yd', label: (v) => `${v > 0 ? '+' : ''}${v} kick return yds` },
  { key: 'pr_yd', label: (v) => `${v > 0 ? '+' : ''}${v} punt return yds` },
  { key: 'idp_tkl_ast', label: (v) => `${v} assisted tackle${v === 1 ? '' : 's'}` },
  { key: 'idp_tkl_solo', label: (v) => `${v} solo tackle${v === 1 ? '' : 's'}` },
  { key: 'idp_tkl', label: (v) => `${v} tkl` },
];

const TEAM_DEFENSE_POSITIONS = new Set(['DEF', 'DST', 'D/ST']);
const IDP_POSITIONS = new Set(['DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S', 'SS', 'FS']);

function getEventMechanism(delta, position) {
  const pos = String(position ?? '').toUpperCase();
  const defensiveStats = n(delta.def_td) + n(delta.idp_def_td) + n(delta.idp_sack)
    + n(delta.idp_int) + n(delta.idp_fr) + n(delta.idp_tkl) + n(delta.idp_pd);
  if (defensiveStats || TEAM_DEFENSE_POSITIONS.has(pos) || IDP_POSITIONS.has(pos)) return 'def';
  if (n(delta.ret_td) + n(delta.kr_td) + n(delta.pr_td) + n(delta.fum_ret_td)
    + n(delta.kr_yd) + n(delta.pr_yd) > 0) return 'return';
  if (n(delta.pass_td) || n(delta.pass_yd) || n(delta.pass_att)
    || n(delta.rec_td) || n(delta.rec) || n(delta.rec_yd)) return 'pass';
  if (n(delta.rush_td) || n(delta.rush_yd) || n(delta.rush_att)) return 'rush';
  return null;
}

/**
 * Separates the result of a fantasy scoring event from the football action
 * that produced it. `kind` remains the primary badge for compatibility with
 * pace-chart milestones; `mechanism` supplies the optional compound marker.
 */
export function getEventClassification(delta, position) {
  const pos = String(position ?? '').toUpperCase();
  const mechanism = getEventMechanism(delta, pos);
  let kind = null;

  if (n(delta.pass_td) + n(delta.rush_td) + n(delta.rec_td) + n(delta.ret_td)
    + n(delta.kr_td) + n(delta.pr_td)
    + n(delta.fum_ret_td) + n(delta.def_td) + n(delta.idp_def_td) > 0) kind = 'td';
  else if (n(delta.fgm) + n(delta.fgmiss) > 0) kind = 'fg';
  else if (n(delta.xpm) + n(delta.xpmiss) > 0) kind = 'xp';
  else if (n(delta.pass_int) + n(delta.fum_lost) > 0) kind = 'to';
  else if (mechanism) kind = mechanism;
  else if (pos === 'K' || pos === 'PK') kind = 'fg';
  else kind = 'pass';

  return {
    kind,
    mechanism: mechanism && mechanism !== kind ? mechanism : null,
  };
}

export function getEventKind(delta, position) {
  return getEventClassification(delta, position).kind;
}

export function describeDelta(delta) {
  const safeDelta = delta ?? {};
  const parts = [];
  for (const { key, label } of DELTA_DESCRIPTIONS) {
    const value = n(safeDelta[key]);
    if (!value) continue;
    parts.push(label(value));
    if (parts.length >= 3) break;
  }
  if (parts.length) return parts.join(', ');
  return Object.values(safeDelta).some((value) => n(value) !== 0)
    ? 'Fantasy scoring update'
    : '';
}

function diffStats(prev, next) {
  const delta = {};
  let changed = false;
  Object.keys(next ?? {}).forEach((key) => {
    const diff = n(next[key]) - n(prev?.[key]);
    if (diff !== 0) {
      delta[key] = diff;
      changed = true;
    }
  });
  return changed ? delta : null;
}

/**
 * Compares the previous snapshot of mapped stats/points against the next one
 * and returns new feed events (most recent first). `snapshots` are Maps of
 * playerId -> { stats, points }.
 */
export function buildDeltaEvents(
  prevSnapshot,
  nextSnapshot,
  playerMeta,
  { now = Date.now(), scoringSettings = null } = {},
) {
  const events = [];
  nextSnapshot.forEach(({ stats, points }, playerId) => {
    const prev = prevSnapshot.get(playerId);
    if (!prev || !stats) return;
    const delta = diffStats(prev.stats, stats);
    // A points-only change is a Sleeper correction, not a football event. The
    // reconciler pins it to the play it belongs to as an adjustment; emitting
    // a feed row for it here would double the moment.
    if (!delta) return;
    const pointDelta = Math.round((points - n(prev.points)) * 100) / 100;
    if (!Number.isFinite(pointDelta) || pointDelta === 0) return;
    const meta = playerMeta.get(playerId) ?? {};
    const splitPlays = splitDeltaIntoPlays(delta);
    if (!splitPlays.length) return;

    // Use the active league scoring to allocate the snapshot's point movement
    // to each split play. When the scoring profile is unavailable (older call
    // sites and small utilities), preserve the authoritative aggregate by
    // distributing it evenly and correcting the final row for rounding.
    const calculated = splitPlays.map((eventStats) => (
      scoringSettings
        ? calcPoints(eventStats, scoringSettings, meta.position)
        : pointDelta / splitPlays.length
    ));
    const hasScoredPlay = calculated.some((value) => Number.isFinite(value) && value !== 0);
    const relevant = splitPlays
      .map((eventStats, index) => ({ eventStats, value: calculated[index] }))
      .filter(({ value }) => !scoringSettings || !hasScoredPlay || (Number.isFinite(value) && value !== 0));
    if (!relevant.length) return;

    const values = relevant.map(({ value }) => (
      Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
    ));
    const allocated = values.reduce((sum, value) => sum + value, 0);
    values[values.length - 1] = Math.round((values.at(-1) + pointDelta - allocated) * 100) / 100;

    relevant.forEach(({ eventStats }, index) => {
      const desc = describeDelta(eventStats);
      if (!desc || !Number.isFinite(values[index]) || values[index] === 0) return;
      const classification = getEventClassification(eventStats, meta.position);
      events.push({
        id: `${playerId}-${now}-${index}`,
        playerId,
        ...classification,
        desc,
        // The description and point change are both derived from this exact
        // split stat delta. Keep each slice on its own row so a polling gap
        // cannot turn several football plays into one headline.
        stats: eventStats,
        pts: values[index],
        at: now,
        source: 'stats-delta',
        estimated: false,
      });
    });
  });
  return events;
}

export const EVENT_KIND_LABELS = {
  td: 'TD',
  fg: 'FG',
  xp: 'XP',
  to: 'TO',
  def: 'D',
  pass: 'P',
  rush: 'R',
  return: 'RET',
};
