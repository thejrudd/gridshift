// liveScoringFeed.js — GridShift Live data helpers.
// Maps BALLDONTLIE live rows onto GridShift scoring keys, tracks per-player
// snapshot deltas as feed events, and formats stat lines / game glances for
// the Companion Live tab.

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
} = {}) {
  if (hasMappedStats) return Number.isFinite(Number(livePoints)) ? Number(livePoints) : 0;
  if (suppressFallback) return 0;
  if (Number.isFinite(Number(sleeperPoints))) return Number(sleeperPoints);
  return Number.isFinite(Number(sleeperDerivedPoints)) ? Number(sleeperDerivedPoints) : 0;
}

export function mapBdlStatsToGridShift(row) {
  const fieldGoalsMade = Number(row?.field_goals_made) || 0;
  const fieldGoalAttempts = Number(row?.field_goal_attempts);
  const extraPointsMade = Number(row?.extra_points_made) || 0;
  const extraPointAttemptsRaw = row?.extra_point_attempts ?? row?.extra_points_attempted;
  const extraPointAttempts = Number(extraPointAttemptsRaw);
  return {
    pass_yd: row?.passing_yards ?? 0,
    pass_td: row?.passing_touchdowns ?? 0,
    pass_int: row?.passing_interceptions ?? 0,
    pass_cmp: row?.passing_completions ?? 0,
    pass_att: row?.passing_attempts ?? 0,
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
    idp_tkl: row?.total_tackles ?? 0,
    idp_tkl_solo: row?.solo_tackles ?? 0,
    idp_tkl_loss: row?.tackles_for_loss ?? 0,
    idp_pd: row?.passes_defended ?? 0,
    idp_qbhit: row?.qb_hits ?? 0,
    idp_sack: row?.defensive_sacks ?? 0,
    idp_int: row?.defensive_interceptions ?? 0,
    idp_int_ret_yd: row?.interception_yards ?? 0,
    idp_int_td: row?.interception_touchdowns ?? 0,
    idp_fr: row?.fumbles_recovered ?? 0,
    idp_fr_td: row?.fumbles_touchdowns ?? 0,
    idp_def_td: (row?.interception_touchdowns ?? 0) + (row?.fumbles_touchdowns ?? 0),
  };
}

// ── Game glance ──────────────────────────────────────────────────────────

function getRawGameStatus(game) {
  return String(game?.status ?? '').trim().toLowerCase();
}

export function getGameStatusText(game) {
  const raw = String(game?.status ?? '').trim();
  return raw || 'Scheduled';
}

export function isLiveGame(game) {
  const status = getRawGameStatus(game);
  return status.includes('progress')
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
 * used only when the live provider row is missing or unrecognized, preventing
 * already-earned points from being added to a second full-game projection.
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
  const parts = [];
  for (const { key, label } of DELTA_DESCRIPTIONS) {
    const value = n(delta[key]);
    if (!value) continue;
    parts.push(label(value));
    if (parts.length >= 3) break;
  }
  if (parts.length) return parts.join(', ');
  return Object.values(delta ?? {}).some((value) => n(value) !== 0)
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
export function buildDeltaEvents(prevSnapshot, nextSnapshot, playerMeta, { now = Date.now() } = {}) {
  const events = [];
  nextSnapshot.forEach(({ stats, points }, playerId) => {
    const prev = prevSnapshot.get(playerId);
    if (!prev || !stats) return;
    const delta = diffStats(prev.stats, stats);
    if (!delta) return;
    const meta = playerMeta.get(playerId) ?? {};
    const desc = describeDelta(delta);
    if (!desc) return;
    const classification = getEventClassification(delta, meta.position);
    events.push({
      id: `${playerId}-${now}`,
      playerId,
      ...classification,
      desc,
      // The description and point change are both derived from this exact
      // stat delta. Keep it on the event so an unmatched live snapshot still
      // has the same scoring breakdown as a provider-enriched play.
      stats: delta,
      pts: Math.round((points - n(prev.points)) * 10) / 10,
      at: now,
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
