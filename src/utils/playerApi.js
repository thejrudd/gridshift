import { cachedFetch, TTL } from './playerCache.js';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';
const CURRENT_SEASON = 2025;
const CAREER_STAT_REPAIR_START_SEASON = 2006;

// Some app IDs differ from ESPN's roster endpoint slug
const TEAM_ESPN_ID = {
  WSH: 'wsh',
  WAS: 'wsh',  // Sleeper uses WAS, ESPN uses WSH
  LAR: 'lar',
  NE:  'ne',
  LV:  'lv',
  LAC: 'lac',
  NYG: 'nyg',
  NYJ: 'nyj',
  NO:  'no',
  TB:  'tb',
  KC:  'kc',
  SF:  'sf',
  GB:  'gb',
  JAX: 'jax',  // Sleeper uses JAX (ESPN abbreviation is JAC but API slug is jax)
};
const toEspnTeamId = id => TEAM_ESPN_ID[id] ?? id.toLowerCase();
const APP_TEAM_ABBR_TO_ESPN_ABBR = { WAS: 'WSH' };

async function fetchEspnTeamAbbrev(teamId) {
  if (!teamId) return null;
  try {
    const res = await fetch(`${ESPN_CORE}/teams/${teamId}?lang=en&region=us`);
    if (!res.ok) return null;
    const teamData = await res.json();
    return teamData.abbreviation ?? null;
  } catch {
    return null;
  }
}

function extractTeamIdFromRef(ref) {
  if (typeof ref !== 'string') return null;
  return ref.match(/teams\/(\d+)/)?.[1] ?? null;
}

// Headshot URL — will 404 for some players; handle with onError
export const headshot = id =>
  `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;

function normalizeEspnPosition(position) {
  const pos = String(position ?? '').toUpperCase();
  if (pos === 'PK') return 'K';
  return pos;
}

// Normalize a raw ESPN athlete entry from a roster response
function normalizePlayer(athlete, teamId) {
  return {
    id:          athlete.id,
    displayName: athlete.displayName ?? athlete.fullName ?? '',
    jersey:      athlete.jersey ?? '',
    position:    normalizeEspnPosition(athlete.position?.abbreviation),
    positionName: athlete.position?.displayName ?? '',
    experience:  athlete.experience?.years ?? 0,
    status:      athlete.status?.type?.description ?? 'Active',
    teamId,
  };
}

/**
 * Fetch the roster for a team.
 * Returns normalized player array: { id, displayName, jersey, position, experience, status, teamId }
 */
export async function fetchRoster(teamId) {
  return cachedFetch(`roster_v3_${teamId}`, async () => {
    const url = `${ESPN_BASE}/teams/${toEspnTeamId(teamId)}/roster`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Roster fetch failed: ${res.status}`);
    const json = await res.json();

    // ESPN roster response wraps athletes in groups by position category.
    // Items within each group are in ESPN's implicit depth-chart order —
    // capture that index as rosterOrder so the UI can use it as a ranking signal.
    const athletes = [];
    const groups = json.athletes ?? [];
    for (const group of groups) {
      const items = group.items ?? [];
      items.forEach((a, i) => {
        athletes.push({ ...normalizePlayer(a, teamId), rosterOrder: i });
      });
    }
    return athletes;
  }, TTL.roster);
}

/**
 * Fetch canonical ESPN profile metadata for a player route.
 * Works for current rostered players, free agents, and many recent retirees.
 */
export async function fetchPlayerProfile(playerId) {
  return cachedFetch(`player_profile_v1_${playerId}`, async () => {
    const url = `${ESPN_CORE}/athletes/${playerId}?lang=en&region=us`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Player profile fetch failed: ${res.status}`);
    const athlete = await res.json();
    const teamAbbrev = await fetchEspnTeamAbbrev(extractTeamIdFromRef(athlete.team?.$ref));

    return {
      id: String(athlete.id ?? playerId),
      displayName: athlete.displayName ?? athlete.fullName ?? '',
      jersey: athlete.jersey ?? '',
      position: normalizeEspnPosition(athlete.position?.abbreviation),
      positionName: athlete.position?.displayName ?? '',
      experience: athlete.experience?.years,
      status: athlete.status?.name ?? athlete.status?.type ?? '',
      teamId: teamAbbrev,
    };
  }, TTL.bio);
}

/**
 * Fetch season stats for a player.
 * season: 4-digit year for a specific season, or null for the current season.
 * Correct endpoint: /seasons/{year}/types/2/athletes/{id}/statistics/0
 */
export async function fetchPlayerStats(playerId, season = null) {
  const s = season ?? CURRENT_SEASON;
  const isHistorical = s < CURRENT_SEASON;
  // v2 prefix busts old cache entries that incorrectly stored career totals
  const cacheKey = `stats_v2_${playerId}_${s}`;
  const ttl = isHistorical ? TTL.historical : TTL.stats;

  return cachedFetch(cacheKey, async () => {
    const url = `${ESPN_CORE}/seasons/${s}/types/2/athletes/${playerId}/statistics/0?lang=en&region=us`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Stats fetch failed: ${res.status}`);
    return res.json();
  }, ttl);
}

function getCareerStatEntry(statsJson, statName) {
  const categories = statsJson?.splits?.categories ?? [];
  for (const category of categories) {
    const entry = (category.stats ?? []).find(stat => stat.name === statName);
    if (entry) return entry;
  }
  return null;
}

function getStatValue(statsJson, statName) {
  const value = getCareerStatEntry(statsJson, statName)?.value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function setCareerStatValue(statsJson, statName, value) {
  const entry = getCareerStatEntry(statsJson, statName);
  if (!entry) return;
  entry.value = value;
  entry.displayValue = Number(value).toLocaleString('en-US', {
    maximumFractionDigits: 1,
  });
}

async function fetchSeasonStatValue(playerId, season, statName) {
  try {
    const stats = await fetchPlayerStats(playerId, season);
    return getStatValue(stats, statName) ?? 0;
  } catch {
    return 0;
  }
}

async function repairCareerDefensiveStats(playerId, careerStats) {
  const tfl = getStatValue(careerStats, 'tacklesForLoss');
  const sacks = getStatValue(careerStats, 'sacks');
  const tackles = getStatValue(careerStats, 'totalTackles');
  const shouldRepairTfl = tfl === 0 && ((sacks ?? 0) > 0 || (tackles ?? 0) > 0);

  if (!shouldRepairTfl) return careerStats;

  const seasons = Array.from(
    { length: CURRENT_SEASON - CAREER_STAT_REPAIR_START_SEASON + 1 },
    (_, i) => CAREER_STAT_REPAIR_START_SEASON + i
  );
  const values = await Promise.all(
    seasons.map(season => fetchSeasonStatValue(playerId, season, 'tacklesForLoss'))
  );
  const total = values.reduce((sum, value) => sum + value, 0);

  if (total > 0) setCareerStatValue(careerStats, 'tacklesForLoss', total);
  return careerStats;
}

// Playoff week number → round label
function playoffRoundLabel(weekNum) {
  // Week 4 is the bye between Conference Championships and the Super Bowl
  return { 1: 'Wild Card', 2: 'Divisional', 3: 'Conf. Champ.', 5: 'Super Bowl' }[weekNum] ?? 'Playoffs';
}

// Build an eventId → meta map from a site-API schedule response
function parseCompetitorScore(competitor, completed) {
  if (!completed) return null;
  const score = competitor?.score;
  if (score === null || score === undefined || score === '') return null;
  const raw = typeof score === 'object'
    ? (score.value ?? score.displayValue)
    : score;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function displayCompetitorScore(competitor) {
  const score = competitor?.score;
  if (score === null || score === undefined || score === '') return '?';
  if (typeof score === 'object') return score.displayValue ?? score.value ?? '?';
  return score;
}

function getCompetitorResult(myComp, oppComp, completed) {
  if (!completed) return '-';
  const myScore = parseCompetitorScore(myComp, completed);
  const oppScore = parseCompetitorScore(oppComp, completed);
  if (Number.isFinite(myScore) && Number.isFinite(oppScore)) {
    if (myScore > oppScore) return 'W';
    if (myScore < oppScore) return 'L';
    return 'T';
  }

  const winner = myComp?.winner;
  return winner === true ? 'W' : winner === false ? 'L' : '-';
}

function buildMetaMap(schedData, teamAbbrev, isPostseason) {
  const map = {};
  for (const event of (schedData.events ?? [])) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const myComp  = comp.competitors?.find(c => c.team?.abbreviation === teamAbbrev);
    const oppComp = comp.competitors?.find(c => c.team?.abbreviation !== teamAbbrev);
    if (!myComp || !oppComp) continue;
    const away   = myComp.homeAway === 'away';
    const completed = comp.status?.type?.completed ?? false;
    map[event.id] = {
      week:        event.week?.number ?? null,
      opponent:    `${away ? '@' : 'vs '}${oppComp.team?.abbreviation ?? '?'}`,
      result:      getCompetitorResult(myComp, oppComp, completed),
      score:       `${displayCompetitorScore(myComp)}-${displayCompetitorScore(oppComp)}`,
      myTeam:      myComp.team?.abbreviation ?? null,
      isPostseason,
      roundLabel:  isPostseason ? playoffRoundLabel(event.week?.number) : null,
      completed,
    };
  }
  return map;
}

const TEAM_DEFENSE_STAT_LABELS = {
  gamesPlayed: 'Games',
  pts_allow: 'Points Allowed',
  yds_allow: 'Yards Allowed',
  sack: 'Sacks',
  sack_half: 'Half Sacks',
  sack_yd: 'Sack Yards',
  int: 'Interceptions',
  int_ret_yd: 'Interception Return Yards',
  fum_rec: 'Fumble Recoveries',
  blk_kick: 'Blocked Kicks',
  blk_kick_ret_td: 'Blocked Kick Return TDs',
  def_td: 'D/ST TDs',
  def_2pt: '2-Point Returns',
  def_int_td: 'Interception Return TDs',
  def_fum_td: 'Fumble Return TDs',
  def_ff: 'Forced Fumbles',
  kr_td: 'Kick Return TDs',
  pr_td: 'Punt Return TDs',
  tkl: 'Tackles',
  tkl_solo: 'Solo Tackles',
  tkl_ast: 'Assisted Tackles',
  tkl_3: 'Every 3 Tackles',
  tkl_5: 'Every 5 Tackles',
  tkl_loss: 'Tackles for Loss',
  qb_hit: 'QB Hits',
  def_pass_def: 'Passes Defended',
  def_kr_yd: 'Kick Return Yards',
  def_kr_yd_10: 'Every 10 Kick Return Yards',
  def_kr_yd_25: 'Every 25 Kick Return Yards',
  def_pr_yd: 'Punt Return Yards',
  def_pr_yd_10: 'Every 10 Punt Return Yards',
  def_pr_yd_25: 'Every 25 Punt Return Yards',
  safe: 'Safeties',
  def_1pt_safe: '1-Point Safeties',
};

function parseStatNumber(value) {
  if (value === null || value === undefined || value === '-') return null;
  const normalized = String(value).replace(/,/g, '').trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getBoxscoreStat(stats = [], name) {
  return stats.find((stat) => stat.name === name) ?? null;
}

function getBoxscoreStatNumber(stats = [], name) {
  const stat = getBoxscoreStat(stats, name);
  return parseStatNumber(stat?.value) ?? parseStatNumber(stat?.displayValue);
}

function parseDashStat(value) {
  const match = String(value ?? '').match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return [null, null];
  return [Number(match[1]), Number(match[2])].map((num) => (Number.isFinite(num) ? num : null));
}

function getTeamScoreFromMeta(meta, index) {
  const parts = String(meta?.score ?? '').split('-').map((part) => parseStatNumber(part));
  return Number.isFinite(parts[index]) ? parts[index] : null;
}

function isDefensiveScoringPlayText(combined) {
  return (
    /\binterception return\b/.test(combined)
    || (
      (
        /\bfumble return\b/.test(combined)
        || /\bopp(?:onent)? fumble recovery\b/.test(combined)
        || /\bfumble recovery in end zone\b/.test(combined)
      )
      && !/\baborted\b/.test(combined)
      && !/\b(?:kickoff|punt|blocked)\b/.test(combined)
    )
    || /\b(?:kickoff|punt|blocked (?:punt|field goal|kick|pat)|blocked punt|blocked field goal)\b[\s\S]*\breturn\b/.test(combined)
    || /\bsafety\b/.test(combined)
    || /\b(?:two[- ]point|2-?pt)\s+(?:conversion\s+)?return(?:ed)?\b/.test(combined)
    || /\breturn(?:ed)?\s+(?:for\s+)?(?:a\s+)?(?:two[- ]point|2-?pt)\b/.test(combined)
  );
}

function parseScoringPlayYards(play) {
  const statYardage = parseStatNumber(play?.statYardage);
  if (Number.isFinite(statYardage)) return statYardage;
  const text = String(play?.text ?? '');
  const labelMatch = text.match(/\b(\d+)\s+Yd\s+(?:Interception|Fumble|Kickoff|Punt|Blocked(?: Punt| Field Goal| Kick| PAT)?)\s+Return\b/i);
  if (labelMatch) return Number(labelMatch[1]);
  const returnMatch = text.match(/\bfor\s+(\d+)\s+yards?,\s+TOUCHDOWN\b/i);
  return returnMatch ? Number(returnMatch[1]) : 0;
}

function readOpponentDefensiveScoringPoints(summary, teamAbbrev) {
  const normalized = teamAbbrev?.toUpperCase?.();
  if (!normalized) return 0;

  const sideByTeam = new Map();
  for (const competitor of summary?.header?.competitions?.[0]?.competitors ?? []) {
    const abbrev = competitor?.team?.abbreviation?.toUpperCase?.();
    const side = competitor?.homeAway;
    if (abbrev && (side === 'home' || side === 'away')) sideByTeam.set(abbrev, side);
  }

  let previousAway = 0;
  let previousHome = 0;
  let excludedPoints = 0;

  for (const play of summary?.scoringPlays ?? []) {
    const awayScore = parseStatNumber(play?.awayScore);
    const homeScore = parseStatNumber(play?.homeScore);
    const playTeam = play?.team?.abbreviation?.toUpperCase?.();
    const playSide = sideByTeam.get(playTeam);
    const text = String(play?.text ?? '').toLowerCase();
    const type = `${play?.type?.text ?? ''} ${play?.type?.abbreviation ?? ''}`.toLowerCase();
    const combined = `${type} ${text}`;
    const isOpponentScore = playTeam && playTeam !== normalized;
    const isDefensiveScore = isDefensiveScoringPlayText(combined);

    if (isOpponentScore && isDefensiveScore) {
      const delta = playSide === 'home'
        ? homeScore - previousHome
        : playSide === 'away'
          ? awayScore - previousAway
          : null;
      if (Number.isFinite(delta) && delta > 0) excludedPoints += delta;
    }

    if (Number.isFinite(awayScore)) previousAway = awayScore;
    if (Number.isFinite(homeScore)) previousHome = homeScore;
  }

  return excludedPoints;
}

function readOpponentDefensiveScoringYards(summary, teamAbbrev) {
  const normalized = teamAbbrev?.toUpperCase?.();
  if (!normalized) return 0;

  let yards = 0;
  for (const play of summary?.scoringPlays ?? []) {
    const playTeam = play?.team?.abbreviation?.toUpperCase?.();
    const text = String(play?.text ?? '').toLowerCase();
    const type = `${play?.type?.text ?? ''} ${play?.type?.abbreviation ?? ''}`.toLowerCase();
    const combined = `${type} ${text}`;
    if (playTeam && playTeam !== normalized && isDefensiveScoringPlayText(combined)) {
      yards += parseScoringPlayYards(play);
    }
  }
  return yards;
}

function getAdjustedPointsAllowed(summary, teamAbbrev, meta) {
  const normalized = teamAbbrev?.toUpperCase?.();
  const opponentCompetitor = summary?.header?.competitions?.[0]?.competitors?.find((entry) => (
    entry?.team?.abbreviation?.toUpperCase?.() !== normalized
  )) ?? null;
  const rawPoints = getTeamScoreFromMeta(meta, 1) ?? parseCompetitorScore(opponentCompetitor, true);
  if (!Number.isFinite(rawPoints)) return null;
  const excludedPoints = readOpponentDefensiveScoringPoints(summary, teamAbbrev);
  return Math.max(0, rawPoints - excludedPoints);
}

function getRawPointsAllowed(summary, teamAbbrev, meta) {
  const normalized = teamAbbrev?.toUpperCase?.();
  const opponentCompetitor = summary?.header?.competitions?.[0]?.competitors?.find((entry) => (
    entry?.team?.abbreviation?.toUpperCase?.() !== normalized
  )) ?? null;
  return getTeamScoreFromMeta(meta, 1) ?? parseCompetitorScore(opponentCompetitor, true);
}

function getSummaryBoxscoreTeam(summary, teamAbbrev) {
  const normalized = teamAbbrev?.toUpperCase?.();
  return (summary?.boxscore?.teams ?? []).find((entry) => (
    entry?.team?.abbreviation?.toUpperCase?.() === normalized
  )) ?? null;
}

function getSummaryPlayerTeam(summary, teamAbbrev) {
  const normalized = teamAbbrev?.toUpperCase?.();
  return (summary?.boxscore?.players ?? []).find((entry) => (
    entry?.team?.abbreviation?.toUpperCase?.() === normalized
  )) ?? null;
}

function readPlayerTeamTableTotals(summary, teamAbbrev, tableName) {
  const playerTeam = getSummaryPlayerTeam(summary, teamAbbrev);
  const table = (playerTeam?.statistics ?? []).find((item) => item.name === tableName);
  const totals = {};
  const keys = table?.keys ?? [];
  const values = table?.totals ?? [];

  keys.forEach((key, index) => {
    const value = parseStatNumber(values[index]);
    if (Number.isFinite(value)) totals[key] = value;
  });

  return totals;
}

function getPlayerTeamTable(summary, teamAbbrev, tableName) {
  const playerTeam = getSummaryPlayerTeam(summary, teamAbbrev);
  return (playerTeam?.statistics ?? []).find((item) => item.name === tableName) ?? null;
}

function readFantasyInterceptions(summary, teamAbbrev) {
  const table = getPlayerTeamTable(summary, teamAbbrev, 'interceptions');
  const keys = table?.keys ?? [];
  const interceptionIndex = keys.indexOf('interceptions');
  if (interceptionIndex < 0) return null;

  let total = 0;
  let sawAthleteRow = false;
  for (const row of table?.athletes ?? []) {
    const stats = row?.stats ?? [];
    const interceptions = parseStatNumber(stats[interceptionIndex]);
    if (!Number.isFinite(interceptions)) continue;
    sawAthleteRow = true;
    total += interceptions;
  }

  return sawAthleteRow ? total : null;
}

function readTeamDefenseTotals(summary, teamAbbrev) {
  return readPlayerTeamTableTotals(summary, teamAbbrev, 'defensive');
}

function readScoringPlayTotals(summary, teamAbbrev) {
  const normalized = teamAbbrev?.toUpperCase?.();
  const ownOffensiveFumbleTouchdowns = countOwnOffensiveFumbleTouchdowns(summary, normalized);
  let suppressedOwnOffensiveFumbleTouchdowns = 0;
  const totals = {
    def_int_td: 0,
    def_fum_td: 0,
    blk_kick: 0,
    blk_kick_ret_td: 0,
    kr_td: 0,
    pr_td: 0,
    safe: 0,
    def_2pt: 0,
    def_2pt_failed_stop: 0,
    def_1pt_safe: 0,
  };

  for (const play of summary?.scoringPlays ?? []) {
    const playTeam = play?.team?.abbreviation?.toUpperCase?.();
    const text = String(play?.text ?? '');
    const type = `${play?.type?.text ?? ''} ${play?.type?.abbreviation ?? ''}`.toLowerCase();
    const combined = `${type} ${text.toLowerCase()}`;
    const isPlayTeam = playTeam === normalized;
    const hasOwnBlockedPat = isPlayTeam
      && (
        /\bpat blocked\b/.test(combined)
        || /\bextra point is blocked\b/.test(combined)
        || /\bextra point blocked\b/.test(combined)
      );
    const isOpponentBlockedPat = !isPlayTeam
      && (
        /\bpat blocked\b/.test(combined)
        || /\bextra point blocked\b/.test(combined)
        || /\bkick blocked\b/.test(combined)
      );
    const hasReturn = /\breturn(?:ed)?\b/.test(combined);
    const hasBlockedKick = combined.includes('blocked')
      && (
        combined.includes('kick')
        || combined.includes('field goal')
        || combined.includes('punt')
        || combined.includes('pat')
        || combined.includes('extra point')
      );
    if (!isPlayTeam) {
      if (isOpponentBlockedPat) totals.blk_kick += 1;
      if (
        /\btwo[- ]point\b/.test(combined)
        && /\b(?:failed|fails|incomplete|sacked|stopped|no gain)\b/.test(combined)
      ) {
        totals.def_2pt_failed_stop += 1;
      }
      continue;
    }
    const hasTwoPoint = /\b(?:2-?pt|two[- ]point)\b/.test(combined);
    const hasOnePointSafety = /\b(?:1-?pt|one[- ]point)\s+safety\b/.test(combined);
    const isDefensiveTwoPointReturn = hasTwoPoint
      && (
        type.includes('defensive')
        || /\b(?:two[- ]point|2-?pt)\s+(?:conversion\s+)?return(?:ed)?\b/.test(combined)
        || /\breturn(?:ed)?\s+(?:for\s+)?(?:a\s+)?(?:two[- ]point|2-?pt)\b/.test(combined)
      );

    if (combined.includes('interception return')) totals.def_int_td += 1;
    const isFumbleTouchdown = combined.includes('fumble return')
      || combined.includes('opp fumble recovery')
      || combined.includes('opponent fumble recovery');
    if (
      isFumbleTouchdown
      && /\baborted\b/i.test(combined)
      && suppressedOwnOffensiveFumbleTouchdowns < ownOffensiveFumbleTouchdowns
    ) {
      suppressedOwnOffensiveFumbleTouchdowns += 1;
    } else if (isFumbleTouchdown) {
      totals.def_fum_td += 1;
    }
    if (hasBlockedKick && !hasOwnBlockedPat) totals.blk_kick += 1;
    if (hasBlockedKick && hasReturn && !hasTwoPoint) totals.blk_kick_ret_td += 1;
    if (combined.includes('kickoff return')) totals.kr_td += 1;
    if (combined.includes('punt return')) totals.pr_td += 1;
    if (hasOnePointSafety) totals.def_1pt_safe += 1;
    else if (combined.includes('safety')) totals.safe += 1;
    if (isDefensiveTwoPointReturn) {
      totals.def_2pt += 1;
    }
  }

  return totals;
}

function readDriveFumbleTotals(summary, teamAbbrev) {
  const normalized = teamAbbrev?.toUpperCase?.();
  if (!normalized) return null;

  const totals = {
    fum_rec: 0,
    def_ff: 0,
    blk_kick: 0,
    opponentFumbleRecoveries: 0,
    ownLooseBallRecoveries: 0,
    blockedKickRecoveries: 0,
    touchbackRecoveries: 0,
    outOfBoundsRecoveries: 0,
    turnoverReturnForcedFumbles: 0,
  };
  let sawFumbleContext = false;

  for (const driveGroup of ['previous', 'current']) {
    for (const drive of summary?.drives?.[driveGroup] ?? []) {
      const driveTeam = drive?.team?.abbreviation?.toUpperCase?.();
      if (!driveTeam) continue;

      for (const play of drive?.plays ?? []) {
        const rawText = String(play?.text ?? '');
        const reversedParts = rawText.split(/reversed\.?/i);
        const text = reversedParts.length > 1
          ? reversedParts[reversedParts.length - 1]
          : rawText;
        if (!/fumbles?|recovered|blocked/i.test(text)) continue;
        const combined = `${play?.type?.text ?? ''} ${text}`.toLowerCase();
        if (combined.includes('no play') || combined.includes('nullified')) continue;
        const isBlockedFieldGoal = combined.includes('blocked') && combined.includes('field goal');
        const isBlockedKick = combined.includes('blocked')
          && (
            combined.includes('kick')
            || combined.includes('field goal')
            || combined.includes('punt')
            || combined.includes('pat')
            || combined.includes('extra point')
          );
        sawFumbleContext = true;

        if (driveTeam !== normalized) {
          if (isBlockedKick) totals.blk_kick += 1;
          const ownSpecialTeamsReturnFumble = isSpecialTeamsReturnFumbleByTeam(text, normalized);
          const ownTurnoverReturnFumble = isTeamTurnoverReturnFumble(text, normalized);
          const recoveredByTeam = countRecoveredByTeam(text, normalized);
          const recoveryOnlyCreatesTouchback = recoveredByTeam > 0 && /\bTouchback\b/i.test(text);
          if (ownSpecialTeamsReturnFumble) {
            totals.ownLooseBallRecoveries += recoveredByTeam;
            continue;
          }
          if (!ownSpecialTeamsReturnFumble && !ownTurnoverReturnFumble) {
            for (const match of text.matchAll(/\bFUMBLES\s*\(([^)]+)\)/gi)) {
              if (!/\baborted\b/i.test(match[1] ?? '')) totals.def_ff += 1;
            }
          }
          if (ownTurnoverReturnFumble) continue;
          if (isBlockedKick) {
            totals.blockedKickRecoveries += recoveredByTeam;
            continue;
          }
          if (recoveryOnlyCreatesTouchback) {
            totals.touchbackRecoveries += recoveredByTeam;
            totals.opponentFumbleRecoveries += recoveredByTeam;
            continue;
          }
          if (isBlockedFieldGoal) {
            totals.blockedKickRecoveries += recoveredByTeam;
            continue;
          }
          if (recoveredByTeam > 0) {
            totals.fum_rec += recoveredByTeam;
            totals.opponentFumbleRecoveries += recoveredByTeam;
          } else if (/\bFUMBLES\s*\(/i.test(text) && /\bball out of bounds\b/i.test(text)) {
            totals.outOfBoundsRecoveries += 1;
          }
          continue;
        }

        // ESPN credits some unforced own-team loose-ball recoveries to the team
        // D/ST fantasy row, but not aborted snaps or ordinary forced offensive fumbles.
        if (isSpecialTeamsCoverageFumbleByOpponent(text, normalized)) {
          totals.def_ff += 1;
          const recoveredByTeam = countRecoveredByTeam(text, normalized);
          totals.fum_rec += recoveredByTeam;
          totals.opponentFumbleRecoveries += recoveredByTeam;
          continue;
        }
        const turnoverReturnForcedFumbles = countTurnoverReturnForcedFumbles(text, normalized);
        if (turnoverReturnForcedFumbles > 0) {
          totals.turnoverReturnForcedFumbles += turnoverReturnForcedFumbles;
          continue;
        }
        if (hasOwnLooseBallRecovery(text, normalized)) {
          totals.ownLooseBallRecoveries += 1;
        }
      }
    }
  }

  return sawFumbleContext ? totals : null;
}

function toStatsJson(flatStats, categoryName = 'Team Defense') {
  const stats = Object.entries(flatStats ?? {})
    .filter(([, value]) => Number.isFinite(Number(value)))
    .map(([name, value]) => ({
      name,
      value: Number(value),
      displayValue: Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 }),
      displayName: TEAM_DEFENSE_STAT_LABELS[name] ?? name,
      shortDisplayName: TEAM_DEFENSE_STAT_LABELS[name] ?? name,
    }));

  return { splits: { categories: [{ name: categoryName, stats }] } };
}

function flattenStatsJson(statsJson) {
  const flat = {};
  for (const category of statsJson?.splits?.categories ?? []) {
    for (const stat of category.stats ?? []) {
      const value = parseStatNumber(stat.value) ?? parseStatNumber(stat.displayValue);
      if (Number.isFinite(value)) flat[stat.name] = value;
    }
  }
  return flat;
}

function addNumericStat(target, key, value) {
  if (!Number.isFinite(Number(value))) return;
  target[key] = Number(value);
}

function normalizeFlatStatKey(key) {
  return String(key ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getFlatStatNumber(flatStats = {}, ...keys) {
  const aliases = new Map();
  for (const [key, value] of Object.entries(flatStats ?? {})) {
    aliases.set(normalizeFlatStatKey(key), value);
  }

  for (const key of keys) {
    if (!key) continue;
    const exact = parseStatNumber(flatStats[key]);
    if (Number.isFinite(exact)) return exact;
    const alias = parseStatNumber(aliases.get(normalizeFlatStatKey(key)));
    if (Number.isFinite(alias)) return alias;
  }

  return null;
}

const PLAY_TEXT_TEAM_ABBR_ALIASES = {
  ARI: ['ARI', 'ARZ'],
  BAL: ['BAL', 'BLT'],
  CLE: ['CLE', 'CLV'],
  JAX: ['JAX', 'JAC'],
  LAR: ['LAR', 'LA'],
  WAS: ['WAS', 'WSH'],
  WSH: ['WSH', 'WAS'],
};

function getPlayTextTeamAliases(teamAbbrev) {
  const normalized = teamAbbrev?.toUpperCase?.();
  if (!normalized) return [];
  return PLAY_TEXT_TEAM_ABBR_ALIASES[normalized] ?? [normalized];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countRecoveredByTeam(text, teamAbbrev) {
  const aliases = getPlayTextTeamAliases(teamAbbrev);
  if (aliases.length === 0) return 0;
  const aliasPattern = aliases.map(escapeRegExp).join('|');
  return text.match(new RegExp(`\\bRECOVERED by (?:${aliasPattern})-`, 'gi'))?.length ?? 0;
}

function hasOwnLooseBallRecovery(text, teamAbbrev) {
  const aliases = getPlayTextTeamAliases(teamAbbrev);
  if (aliases.length === 0) return false;
  const aliasPattern = aliases.map(escapeRegExp).join('|');
  return new RegExp(`\\bFUMBLES,\\s+recovered by (?:${aliasPattern})-`, 'i').test(text);
}

function isSpecialTeamsCoverageFumbleByOpponent(text, teamAbbrev) {
  const aliases = getPlayTextTeamAliases(teamAbbrev);
  if (aliases.length === 0) return false;
  return /\bpunts?\b/i.test(text) && /\bFUMBLES\s*\(([^)]+)\)/i.test(text);
}

function isTeamTurnoverReturnFumble(text, teamAbbrev) {
  const aliases = getPlayTextTeamAliases(teamAbbrev);
  if (aliases.length === 0) return false;
  const aliasPattern = aliases.map(escapeRegExp).join('|');
  return (
    /\bINTERCEPTED by\b[\s\S]*\bFUMBLES\s*\(/i.test(text)
    || new RegExp(`\\bRECOVERED by (?:${aliasPattern})-[\\s\\S]*\\bFUMBLES\\s*\\(`, 'i').test(text)
  );
}

function getOpponentTurnoverReturnText(text, teamAbbrev) {
  const aliases = getPlayTextTeamAliases(teamAbbrev);
  const aliasPattern = aliases.map(escapeRegExp).join('|');
  const ownRecoveryPattern = aliases.length
    ? `(?!${aliasPattern}-)`
    : '';
  const markers = [
    /\bINTERCEPTED by\b/i,
    new RegExp(`\\bRECOVERED by ${ownRecoveryPattern}`, 'i'),
  ];
  const starts = markers
    .map((pattern) => text.search(pattern))
    .filter((index) => index >= 0);
  if (!starts.length) return '';
  return text.slice(Math.min(...starts));
}

function countTurnoverReturnForcedFumbles(text, teamAbbrev) {
  const turnoverReturnText = getOpponentTurnoverReturnText(text, teamAbbrev);
  if (!turnoverReturnText) return 0;
  return [...turnoverReturnText.matchAll(/\bFUMBLES\s*\(([^)]+)\)/gi)]
    .filter((match) => !/\baborted\b/i.test(match[1] ?? ''))
    .length;
}

function countOwnOffensiveFumbleTouchdowns(summary, teamAbbrev) {
  const normalized = teamAbbrev?.toUpperCase?.();
  if (!normalized) return 0;

  let count = 0;
  for (const driveGroup of ['previous', 'current']) {
    for (const drive of summary?.drives?.[driveGroup] ?? []) {
      const driveTeam = drive?.team?.abbreviation?.toUpperCase?.();
      if (driveTeam !== normalized) continue;
      for (const play of drive?.plays ?? []) {
        const text = String(play?.text ?? '');
        const type = String(play?.type?.text ?? '');
        const combined = `${type} ${text}`;
        if (!/\btouchdown\b/i.test(combined)) continue;
        if (!/\bfumble/i.test(combined)) continue;
        if (/\b(?:punts?|kickoff|kicks?\s+off|field goal|punt)\b/i.test(combined)) continue;
        count += 1;
      }
    }
  }
  return count;
}

function isSpecialTeamsReturnFumbleByTeam(text, teamAbbrev) {
  const aliases = getPlayTextTeamAliases(teamAbbrev);
  if (aliases.length === 0) return false;
  const aliasPattern = aliases.map(escapeRegExp).join('|');
  return /\b(?:punts?|kicks?\s+off|kickoff)\b/i.test(text)
    && new RegExp(`\\bto (?:${aliasPattern})\\s+\\d+\\b`, 'i').test(text)
    && /\b(?:FUMBLES|MUFFS)\b/i.test(text);
}

function addEveryStat(target, key, value, interval) {
  if (!Number.isFinite(Number(value)) || !Number.isFinite(Number(interval)) || Number(interval) <= 0) return;
  target[key] = Math.floor(Number(value) / Number(interval));
}

function buildTeamDefenseGameStats(summary, teamAbbrev, meta = {}) {
  const teamBox = getSummaryBoxscoreTeam(summary, teamAbbrev);
  if (!teamBox) return null;

  const opponentBox = (summary?.boxscore?.teams ?? []).find((entry) => entry !== teamBox) ?? null;
  const teamStats = teamBox.statistics ?? [];
  const opponentStats = opponentBox?.statistics ?? [];
  const defensiveTotals = readTeamDefenseTotals(summary, teamAbbrev);
  const fumbleTotals = readPlayerTeamTableTotals(summary, teamAbbrev, 'fumbles');
  const interceptionTotals = readPlayerTeamTableTotals(summary, teamAbbrev, 'interceptions');
  const kickReturnTotals = readPlayerTeamTableTotals(summary, teamAbbrev, 'kickReturns');
  const puntReturnTotals = readPlayerTeamTableTotals(summary, teamAbbrev, 'puntReturns');
  const scoringPlayTotals = readScoringPlayTotals(summary, teamAbbrev);
  const driveFumbleTotals = readDriveFumbleTotals(summary, teamAbbrev);
  const [sacksFromOpponent, sackYardsFromOpponent] = parseDashStat(
    getBoxscoreStat(opponentStats, 'sacksYardsLost')?.displayValue,
  );
  const sacks = getFlatStatNumber(defensiveTotals, 'sacks', 'sack') ?? sacksFromOpponent;
  const totalTackles = getFlatStatNumber(defensiveTotals, 'totalTackles', 'combinedTackles', 'tackles');
  const soloTackles = getFlatStatNumber(defensiveTotals, 'soloTackles', 'soloTackle');
  const assistedTackles = getFlatStatNumber(defensiveTotals, 'assistedTackles', 'assistTackles')
    ?? (Number.isFinite(totalTackles) && Number.isFinite(soloTackles) ? Math.max(0, totalTackles - soloTackles) : null);
  const kickReturnYards = getFlatStatNumber(kickReturnTotals, 'kickReturnYards')
    ?? getFlatStatNumber(defensiveTotals, 'kickReturnYards')
    ?? getBoxscoreStatNumber(teamStats, 'kickReturnYards');
  const puntReturnYards = getFlatStatNumber(puntReturnTotals, 'puntReturnYards')
    ?? getFlatStatNumber(defensiveTotals, 'puntReturnYards')
    ?? getBoxscoreStatNumber(teamStats, 'puntReturnYards');
  const rawPointsAllowed = getRawPointsAllowed(summary, teamAbbrev, meta);
  const adjustedPointsAllowed = getAdjustedPointsAllowed(summary, teamAbbrev, meta);
  const yardsAllowed = getBoxscoreStatNumber(opponentStats, 'totalYards');
  const opponentDefensiveScoringYards = readOpponentDefensiveScoringYards(summary, teamAbbrev);
  const opponentFumblesLost = getBoxscoreStatNumber(opponentStats, 'fumblesLost') ?? 0;
  const teamFumblesRecovered = getFlatStatNumber(fumbleTotals, 'fumblesRecovered');
  const defensiveFumbleRecoveries = Number.isFinite(teamFumblesRecovered)
    ? Math.min(teamFumblesRecovered, opponentFumblesLost)
    : opponentFumblesLost;
  const fantasyFumbleRecoveries = driveFumbleTotals
    ? driveFumbleTotals.fum_rec + Math.max(
      0,
      defensiveFumbleRecoveries - (driveFumbleTotals.opponentFumbleRecoveries ?? 0),
    )
    : defensiveFumbleRecoveries;
  const forcedFumbles = driveFumbleTotals?.def_ff
    ?? getFlatStatNumber(defensiveTotals, 'fumblesForced', 'forcedFumbles')
    ?? opponentFumblesLost;
  const interceptionReturnTds = getFlatStatNumber(interceptionTotals, 'interceptionTouchdowns')
    ?? scoringPlayTotals.def_int_td;
  const interceptions = getFlatStatNumber(interceptionTotals, 'interceptions')
    ?? getBoxscoreStatNumber(opponentStats, 'interceptions');
  const baseFantasyInterceptions = readFantasyInterceptions(summary, teamAbbrev) ?? (Number.isFinite(interceptions)
    ? Math.max(0, interceptions - (Number.isFinite(interceptionReturnTds) ? interceptionReturnTds : 0))
    : interceptions);
  const fantasyInterceptions = (
    scoringPlayTotals.def_fum_td > 0
    && Number.isFinite(baseFantasyInterceptions)
    && Number.isFinite(interceptions)
    && Number.isFinite(interceptionReturnTds)
    && interceptionReturnTds > 0
  )
    ? Math.min(interceptions, baseFantasyInterceptions + interceptionReturnTds)
    : baseFantasyInterceptions;
  const flat = {};

  addNumericStat(flat, 'gamesPlayed', 1);
  addNumericStat(flat, 'pts_allow', adjustedPointsAllowed);
  addNumericStat(flat, 'pts_allow_raw', rawPointsAllowed);
  addNumericStat(flat, 'pts_allow_adjusted', adjustedPointsAllowed);
  addNumericStat(flat, 'yds_allow', yardsAllowed);
  addNumericStat(flat, 'yds_allow_raw', yardsAllowed);
  addNumericStat(
    flat,
    'yds_allow_with_return_tds',
    Number.isFinite(yardsAllowed) ? yardsAllowed + opponentDefensiveScoringYards : null,
  );
  addNumericStat(flat, 'sack', sacks);
  addNumericStat(flat, 'sack_half', Number.isFinite(sacks) ? sacks * 2 : null);
  addNumericStat(flat, 'sack_yd', getFlatStatNumber(defensiveTotals, 'sackYards', 'sackYardsLost') ?? sackYardsFromOpponent);
  addNumericStat(flat, 'int', fantasyInterceptions);
  addNumericStat(flat, 'int_ret_yd', getFlatStatNumber(interceptionTotals, 'interceptionYards'));
  addNumericStat(flat, 'fum_rec', fantasyFumbleRecoveries);
  const boxscoreBlockedKicks = getBoxscoreStatNumber(teamStats, 'blockedKicks');
  addNumericStat(
    flat,
    'blk_kick',
    Math.max(
      Number.isFinite(boxscoreBlockedKicks) ? boxscoreBlockedKicks : 0,
      scoringPlayTotals.blk_kick,
      driveFumbleTotals?.blk_kick ?? 0,
    ),
  );
  addNumericStat(flat, 'blk_kick_ret_td', scoringPlayTotals.blk_kick_ret_td);
  addNumericStat(flat, 'def_td', getBoxscoreStatNumber(teamStats, 'defensiveTouchdowns'));
  addNumericStat(flat, 'def_2pt', scoringPlayTotals.def_2pt);
  addNumericStat(flat, 'def_2pt_failed_stop', scoringPlayTotals.def_2pt_failed_stop);
  addNumericStat(flat, 'def_ff_turnover_return_candidate', driveFumbleTotals?.turnoverReturnForcedFumbles ?? 0);
  addNumericStat(flat, 'fum_rec_own_recovery_candidate', driveFumbleTotals?.ownLooseBallRecoveries ?? 0);
  addNumericStat(flat, 'fum_rec_blocked_kick_candidate', driveFumbleTotals?.blockedKickRecoveries ?? 0);
  addNumericStat(flat, 'fum_rec_touchback_candidate', driveFumbleTotals?.touchbackRecoveries ?? 0);
  addNumericStat(flat, 'fum_rec_out_of_bounds_candidate', driveFumbleTotals?.outOfBoundsRecoveries ?? 0);
  addNumericStat(flat, 'def_1pt_safe', scoringPlayTotals.def_1pt_safe);
  addNumericStat(flat, 'def_int_td', interceptionReturnTds);
  addNumericStat(flat, 'def_fum_td', scoringPlayTotals.def_fum_td);
  addNumericStat(flat, 'def_ff', forcedFumbles);
  addNumericStat(flat, 'kr_td', getFlatStatNumber(kickReturnTotals, 'kickReturnTouchdowns') ?? scoringPlayTotals.kr_td);
  addNumericStat(flat, 'pr_td', getFlatStatNumber(puntReturnTotals, 'puntReturnTouchdowns') ?? scoringPlayTotals.pr_td);
  addNumericStat(flat, 'safe', scoringPlayTotals.safe);
  addNumericStat(flat, 'tkl', totalTackles);
  addNumericStat(flat, 'tkl_solo', soloTackles);
  addNumericStat(flat, 'tkl_ast', assistedTackles);
  addEveryStat(flat, 'tkl_3', totalTackles, 3);
  addEveryStat(flat, 'tkl_5', totalTackles, 5);
  addNumericStat(flat, 'tkl_loss', getFlatStatNumber(defensiveTotals, 'tacklesForLoss', 'stuffs'));
  addNumericStat(flat, 'qb_hit', getFlatStatNumber(defensiveTotals, 'QBHits', 'qbHits', 'quarterbackHits'));
  addNumericStat(flat, 'def_pass_def', getFlatStatNumber(defensiveTotals, 'passesDefended', 'passesDefensed', 'passDeflections'));
  addNumericStat(flat, 'def_kr_yd', kickReturnYards);
  addEveryStat(flat, 'def_kr_yd_10', kickReturnYards, 10);
  addEveryStat(flat, 'def_kr_yd_25', kickReturnYards, 25);
  addNumericStat(flat, 'def_pr_yd', puntReturnYards);
  addEveryStat(flat, 'def_pr_yd_10', puntReturnYards, 10);
  addEveryStat(flat, 'def_pr_yd_25', puntReturnYards, 25);

  return toStatsJson(flat, 'Team Defense');
}

function rollupTeamDefenseGameLog(gameLog = []) {
  const totals = {};
  let gamesPlayed = 0;

  for (const game of gameLog) {
    if (game?.meta?.isBye || game?.meta?.isInactive || !game?.statsJson) continue;
    const flat = flattenStatsJson(game.statsJson);
    gamesPlayed += 1;
    for (const [key, value] of Object.entries(flat)) {
      if (key === 'gamesPlayed') continue;
      totals[key] = (totals[key] ?? 0) + value;
    }
  }

  if (gamesPlayed > 0) totals.gamesPlayed = gamesPlayed;
  return toStatsJson(totals, 'Team Defense Season');
}

async function fetchCompletedTeamDefenseGame(eventId, teamAbbrev, meta) {
  const url = `${ESPN_BASE}/summary?event=${eventId}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const summary = await res.json();
  const statsJson = buildTeamDefenseGameStats(summary, teamAbbrev, meta);
  return statsJson ? { eventId, meta, statsJson } : null;
}

export async function fetchTeamDefenseGameLog(teamId, season) {
  const isHistorical = season < CURRENT_SEASON;
  const ttl = isHistorical ? TTL.historical : TTL.stats;
  const teamAbbrev = teamId?.toUpperCase?.() ?? null;
  if (!teamAbbrev) return [];
  const espnTeamAbbrev = APP_TEAM_ABBR_TO_ESPN_ABBR[teamAbbrev] ?? teamAbbrev;

  return cachedFetch(`team_dst_gamelog_v24_${teamAbbrev}_${season}`, async () => {
    const [schedRes, postSchedRes] = await Promise.all([
      fetch(`${ESPN_BASE}/teams/${toEspnTeamId(teamAbbrev)}/schedule?season=${season}&seasontype=2`),
      fetch(`${ESPN_BASE}/teams/${toEspnTeamId(teamAbbrev)}/schedule?season=${season}&seasontype=3`),
    ]);

    const regMeta = schedRes.ok ? buildMetaMap(await schedRes.json(), espnTeamAbbrev, false) : {};
    const postMeta = postSchedRes.ok ? buildMetaMap(await postSchedRes.json(), espnTeamAbbrev, true) : {};
    const regGames = (await Promise.all(
      Object.entries(regMeta)
        .filter(([, meta]) => meta.completed)
        .map(([eventId, meta]) => fetchCompletedTeamDefenseGame(eventId, espnTeamAbbrev, meta).catch(() => null)),
    )).filter(Boolean);

    const coveredWeeks = new Set(regGames.map(game => game.meta?.week).filter(week => week != null));
    const maxWeek = coveredWeeks.size > 0 ? Math.max(...coveredWeeks) : 0;
    for (let week = 1; week <= maxWeek; week += 1) {
      if (!coveredWeeks.has(week)) {
        regGames.push({
          eventId: `bye_${week}`,
          meta: { week, opponent: 'BYE', result: '-', score: '', myTeam: espnTeamAbbrev, isBye: true },
          statsJson: null,
        });
      }
    }

    regGames.sort((a, b) => (a.meta?.week ?? 99) - (b.meta?.week ?? 99));

    const postGames = (await Promise.all(
      Object.entries(postMeta)
        .filter(([, meta]) => meta.completed)
        .map(([eventId, meta]) => fetchCompletedTeamDefenseGame(eventId, espnTeamAbbrev, meta).catch(() => null)),
    )).filter(Boolean);

    return [...regGames, ...postGames];
  }, ttl, (games) => Array.isArray(games) && games.length > 0);
}

export async function fetchTeamDefenseStats(teamId, season = null) {
  const s = season ?? CURRENT_SEASON;
  const gameLog = await fetchTeamDefenseGameLog(teamId, s);
  return rollupTeamDefenseGameLog(gameLog);
}

/**
 * Fetch game-by-game stats for a player for a given season, including playoffs.
 * Combines:
 *   - ESPN Core eventlog (regular season)  → per-game statistics $refs
 *   - ESPN Site team schedule (reg + post)  → opponent, date, result, score
 *   - Constructed stats URLs for postseason games (eventlog ignores seasontype param)
 * Returns [{ eventId, meta, statsJson }] sorted reg-season first, then playoffs.
 */
export async function fetchGameLog(playerId, teamId, season) {
  const isHistorical = season < CURRENT_SEASON;
  const ttl = isHistorical ? TTL.historical : TTL.stats;

  return cachedFetch(`gamelog_v11_${playerId}_${season}`, async () => {
    const abbrev = teamId?.toUpperCase?.() ?? null;

    // Step 1: Fetch the eventlog first — needed to resolve the actual team for this season.
    // The passed-in teamId is the player's *current* team, which may differ for historical seasons.
    const logRes = await fetch(`${ESPN_CORE}/seasons/${season}/athletes/${playerId}/eventlog?lang=en&region=us`);
    if (!logRes.ok) return [];

    const logData = await logRes.json();
    const rawItems = logData.events?.items ?? [];
    const items = Array.isArray(rawItems) ? rawItems : Object.values(rawItems);

    // Extract ESPN numeric competitor ID from any regular-season stats $ref
    // e.g. ".../competitors/25/roster/..." → "25"  (25 = SEA's ESPN team ID)
    let espnCompetitorId = null;
    for (const item of items) {
      const m = (item.statistics?.$ref ?? '').match(/competitors\/(\d+)\/roster/);
      if (m) { espnCompetitorId = m[1]; break; }
    }

    // Step 2: Resolve the actual team abbreviation for this season.
    // The competitor ID in the stats $ref URL is ESPN's persistent numeric team ID.
    // Fetching /teams/{id} returns the abbreviation directly (unlike the competitor endpoint,
    // which wraps team data in a $ref pointer and would silently return undefined).
    let actualAbbrev = abbrev;
    if (espnCompetitorId) {
      actualAbbrev = await fetchEspnTeamAbbrev(espnCompetitorId) ?? abbrev;
    }
    if (!actualAbbrev) return [];

    // Step 3: Fetch the correct team's schedule (reg + post) in parallel
    const [schedRes, postSchedRes] = await Promise.all([
      fetch(`${ESPN_BASE}/teams/${toEspnTeamId(actualAbbrev)}/schedule?season=${season}&seasontype=2`),
      fetch(`${ESPN_BASE}/teams/${toEspnTeamId(actualAbbrev)}/schedule?season=${season}&seasontype=3`),
    ]);

    // Build metadata maps using the resolved team abbreviation
    const regMeta  = schedRes.ok      ? buildMetaMap(await schedRes.json(),      actualAbbrev, false) : {};
    const postMeta = postSchedRes.ok  ? buildMetaMap(await postSchedRes.json(),  actualAbbrev, true)  : {};

    // Regular-season per-game stats (via eventlog $refs), including inactive/DNP games
    const regGamesRaw = await Promise.all(items.map(async (item) => {
      // Get event ID from stats $ref or event $ref (inactive games may lack stats $ref)
      const statsRef = item.statistics?.$ref;
      const eventRef = item.event?.$ref ?? '';
      const eventId = statsRef?.match(/events\/(\d+)/)?.[1]
        ?? eventRef.match(/events\/(\d+)/)?.[1];
      if (!eventId) return null;

      if (!item.played) {
        // Include completed games where the player was inactive
        const meta = regMeta[eventId];
        if (!meta?.completed) return null;
        return { eventId, meta: { ...meta, isInactive: true }, statsJson: null };
      }

      if (!statsRef) return null;
      try {
        // ESPN Core $ref URLs use http:// — upgrade to https:// to avoid mixed-content
        // blocking when the app is served over HTTPS.
        const secureRef = statsRef.replace(/^http:\/\//, 'https://');
        const res = await fetch(secureRef);
        if (!res.ok) return null;
        return { eventId, meta: regMeta[eventId] ?? {}, statsJson: await res.json() };
      } catch { return null; }
    }));

    const regGames = regGamesRaw.filter(Boolean);

    // Insert synthetic BYE rows for missing week numbers between 1 and the highest week played
    const coveredWeeks = new Set(regGames.map(g => g.meta?.week).filter(w => w != null));
    const maxWeek = coveredWeeks.size > 0 ? Math.max(...coveredWeeks) : 0;
    for (let w = 1; w <= maxWeek; w++) {
      if (!coveredWeeks.has(w)) {
        regGames.push({
          eventId: `bye_${w}`,
          meta: { week: w, opponent: 'BYE', result: '-', score: '', myTeam: actualAbbrev, isBye: true },
          statsJson: null,
        });
      }
    }

    // Sort regular-season games by week number
    regGames.sort((a, b) => (a.meta?.week ?? 99) - (b.meta?.week ?? 99));

    // Postseason per-game stats (constructed URL — eventlog can't be filtered by seasontype)
    const postGames = espnCompetitorId
      ? await Promise.all(
          Object.entries(postMeta)
            .filter(([, m]) => m.completed)
            .map(async ([eventId, meta]) => {
              try {
                const url = `${ESPN_CORE}/events/${eventId}/competitions/${eventId}/competitors/${espnCompetitorId}/roster/${playerId}/statistics/0?lang=en&region=us`;
                const res = await fetch(url);
                if (!res.ok) return null;
                return { eventId, meta, statsJson: await res.json() };
              } catch { return null; }
            })
        )
      : [];

    return [...regGames, ...postGames.filter(Boolean)];
  }, ttl, (games) => Array.isArray(games) && games.length > 0);
}

/**
 * Fetch career stats (all-time totals) for a player.
 * Uses the /statistics/0 endpoint on the core API.
 */
export async function fetchPlayerCareerStats(playerId) {
  return cachedFetch(`stats_v2_${playerId}_career`, async () => {
    const url = `${ESPN_CORE}/athletes/${playerId}/statistics/0?lang=en&region=us`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Career stats fetch failed: ${res.status}`);
    const careerStats = await res.json();
    return repairCareerDefensiveStats(playerId, careerStats);
  }, TTL.historical);
}

/**
 * Fetch player bio, which includes major league award history.
 * Returns { awards: [{ id, name, displayCount, seasons: ['2024', ...] }] }
 * Awards covered: NFL MVP, Super Bowl MVP, OPOY, DPOY, ROTY, DROTY,
 *                 Comeback POTY, Walter Payton MOTY.
 * Pro Bowl / All-Pro are NOT in this API — use honors.json for those.
 */
export async function fetchPlayerBio(playerId) {
  return cachedFetch(`bio_${playerId}`, async () => {
    const url = `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${playerId}/bio`;
    const res = await fetch(url);
    if (!res.ok) return { awards: [] };
    return res.json();
  }, TTL.bio);
}

/**
 * Fetch the depth chart for a team.
 * Returns a flat map: { [playerId]: rank } where rank is 1-based (1 = starter).
 * Players not on the depth chart are absent from the map.
 */
export async function fetchDepthChart(teamId) {
  // v2: corrected for actual ESPN response shape:
  //   data.depthchart[] → group.positions{} → posSlot.athletes[] (order = depth rank)
  return cachedFetch(`depthchart_v2_${teamId}`, async () => {
    const url = `${ESPN_BASE}/teams/${toEspnTeamId(teamId)}/depthcharts`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const data = await res.json();
    const rankMap = {};
    for (const group of (data.depthchart ?? [])) {
      for (const posSlot of Object.values(group.positions ?? {})) {
        (posSlot.athletes ?? []).forEach((athlete, idx) => {
          const id = String(athlete.id ?? '');
          const rank = idx + 1; // array order is depth order; make 1-based
          if (id && (rankMap[id] == null || rank < rankMap[id])) {
            rankMap[id] = rank; // keep best (lowest) rank if player appears in multiple slots
          }
        });
      }
    }
    return rankMap;
  }, TTL.roster);
}

// ── Season schedule lookup ────────────────────────────────────────────────────

// ESPN uses different abbreviations than Sleeper for some teams.
const ESPN_ABBR_TO_SLEEPER = { WSH: 'WAS', JAC: 'JAX' };
const normalizeEspnAbbr = a => ESPN_ABBR_TO_SLEEPER[a?.toUpperCase()] ?? a?.toUpperCase() ?? '';

/**
 * Fetch one week of the NFL schedule from ESPN's scoreboard.
 * Returns { [sleeperTeamAbbr]: { opp: sleeperTeamAbbr, home: boolean } }
 *
 * Cache strategy: permanently cached (TTL.historical) only when the week has
 * actual game data. Unplayed/future weeks are fetched fresh each session so
 * they pick up real data once games are scheduled and completed.
 * Cache key v2 busts old v1 entries that may have been permanently stored empty
 * (happened when a user first loaded stats before those weeks were played).
 */
async function fetchWeekSchedule(season, week) {
  const url = `${ESPN_BASE}/scoreboard?seasontype=2&week=${week}&dates=${season}`;
  return cachedFetch(
      `sched_v5_${season}_${week}`,
    async () => {
      const res = await fetch(url);
      if (!res.ok) return {};
      const data = await res.json();
      const map = {};
      for (const event of data?.events ?? []) {
        const comps = event?.competitions?.[0]?.competitors ?? [];
        const homeC = comps.find(c => c.homeAway === 'home');
        const awayC = comps.find(c => c.homeAway === 'away');
        if (!homeC || !awayC) continue;
        const homeAbbr = normalizeEspnAbbr(homeC.team?.abbreviation);
        const awayAbbr = normalizeEspnAbbr(awayC.team?.abbreviation);
        if (!homeAbbr || !awayAbbr) continue;
        const completed = event.competitions?.[0]?.status?.type?.completed ?? false;
        const parseScore = (c) => {
          const s = c.score;
          if (!completed || s == null || s === '') return null;
          if (typeof s === 'string' || typeof s === 'number') return Number(s);
          if (s.value != null) return Number(s.value);
          if (s.displayValue != null) return Number(s.displayValue);
          return null;
        };
        const homePts = parseScore(homeC);
        const awayPts = parseScore(awayC);
        // espnEventId and espnCompetitorId are captured here so the per-player
        // enhancement can cross-reference a player's eventlog competitor IDs
        // (extracted from stats $ref URLs) against the schedule to determine
        // which team they were actually on for each specific game.
        // competitor.team.id is the ESPN franchise ID (e.g. "12" for KC) — the
        // same ID embedded in the core API eventlog stats $ref competitor path.
        // competitor.id is a competition-specific ID and does NOT match.
        const eventDate = event.date?.slice(0, 10) ?? null;
        map[homeAbbr] = { opp: awayAbbr, home: true,  ptsFor: homePts, ptsAgainst: awayPts, espnEventId: event.id, espnCompetitorId: homeC.team?.id, date: eventDate };
        map[awayAbbr] = { opp: homeAbbr, home: false, ptsFor: awayPts, ptsAgainst: homePts, espnEventId: event.id, espnCompetitorId: awayC.team?.id, date: eventDate };
      }
      return map;
    },
    TTL.historical,
    // Only permanently cache weeks that have actual game data.
    // Unplayed weeks return an empty map and will be re-fetched next session.
    (data) => data != null && Object.keys(data).length > 0,
  );
}

/**
 * Fetch the ESPN eventlog for a player and return a map of ESPN event IDs to
 * ESPN competitor IDs extracted from the statistics $ref URL of each game entry.
 *
 * The competitor ID embedded in the stats $ref URL is set at game time and never
 * updated when a player is traded — it always reflects the team they actually
 * played for in that specific game.
 *
 * Returns { [espnEventId]: espnCompetitorId } or null on failure.
 * Cached permanently for past seasons; 1-hour TTL for the current season.
 */
export async function fetchPlayerGameTeamMap(espnPlayerId, season) {
  const isHistorical = parseInt(season) < CURRENT_SEASON;
  const ttl = isHistorical ? TTL.historical : 60 * 60 * 1000;
  return cachedFetch(`nfl_gt_v2_${espnPlayerId}_${season}`, async () => {
    const res = await fetch(
      `${ESPN_CORE}/seasons/${season}/athletes/${espnPlayerId}/eventlog?lang=en&region=us`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rawItems = data.events?.items ?? [];
    const items = Array.isArray(rawItems) ? rawItems : Object.values(rawItems);

    // Pass 1: extract eventId + competitorId from statistics.$ref where available.
    // Stats $ref format: .../events/{eventId}/competitors/{competitorId}/roster/...
    const map = {};
    const eventsWithoutComp = [];
    for (const item of items) {
      const statsRef = item.statistics?.$ref ?? '';
      const eventRef = item.event?.$ref ?? '';
      const eventId = statsRef.match(/events\/(\d+)/)?.[1]
        ?? eventRef.match(/events\/(\d+)/)?.[1];
      const competitorId = statsRef.match(/competitors\/(\d+)/)?.[1];
      if (!eventId) continue;
      if (competitorId) {
        map[eventId] = competitorId;
      } else {
        eventsWithoutComp.push(eventId);
      }
    }

    // Pass 2: for eventlog entries that had an event ID but no competitor ID
    // (common for defensive players whose statistics.$ref is absent), fall back
    // to the most common competitor ID from entries that DID resolve.
    // This is safe because mid-season team changes are rare; the competitor ID
    // represents the team the player was on for most/all of the season.
    if (eventsWithoutComp.length > 0 && Object.keys(map).length > 0) {
      const compCounts = {};
      for (const compId of Object.values(map)) {
        compCounts[compId] = (compCounts[compId] ?? 0) + 1;
      }
      const fallbackComp = Object.entries(compCounts).sort((a, b) => b[1] - a[1])[0][0];
      for (const eventId of eventsWithoutComp) {
        map[eventId] = fallbackComp;
      }
    }

    return Object.keys(map).length > 0 ? map : null;
  }, ttl, (d) => d != null);
}

/**
 * Fetch the full NFL season schedule from ESPN, all 18 regular-season weeks.
 * Returns { [week]: { [sleeperTeamAbbr]: { opp: string, home: boolean } } }
 * Individual weeks are cached indefinitely once fetched.
 */
export async function fetchSeasonSchedule(season) {
  const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
  const results = await Promise.all(weeks.map(w => fetchWeekSchedule(season, w).catch(() => ({}))));
  const map = {};
  weeks.forEach((w, i) => { map[w] = results[i]; });
  return map;
}

export async function fetchEventScoringPlays(eventId) {
  if (!eventId) return [];
  return cachedFetch(
    `event_scoring_plays_v1_${eventId}`,
    async () => {
      const url = `${ESPN_BASE}/summary?event=${encodeURIComponent(eventId)}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data?.scoringPlays) ? data.scoringPlays : [];
    },
    TTL.historical,
    (data) => Array.isArray(data) && data.length > 0,
  );
}

export { CURRENT_SEASON, toEspnTeamId };
