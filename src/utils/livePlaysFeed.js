// livePlaysFeed.js — turns BALLDONTLIE play-by-play rows into Companion Live
// feed events with estimated fantasy impact. Estimation is per-play and
// approximate; the separate live closing point stays exact because it comes
// from the stats endpoint. Historical replay keeps event-time estimates rather
// than rewriting them with that later total. Field mapping is defensive: BDL
// play payload shapes have not been captured in this repo yet, so every read
// tolerates alternates.

import { calcPoints } from './scoringEngine.js';
import { getTeamAbbr, normalizeName } from './liveScoringFeed.js';

const MAX_DESC_LENGTH = 140;

function firstFinite(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function normalizePlay(raw, gameId) {
  if (!raw) return null;
  const description = firstString(raw.text, raw.description, raw.short_text, raw.desc);
  if (!description) return null;
  return {
    id: raw.id ?? `${gameId}-${raw.sequence ?? description.slice(0, 24)}`,
    gameId,
    period: firstFinite(raw.period, raw.quarter),
    clock: firstString(raw.clock_display, raw.clock, raw.time),
    type: firstString(raw.play_type, raw.type)?.toLowerCase() ?? '',
    yards: firstFinite(raw.yards_gained, raw.yards, raw.net_yards) ?? 0,
    scoring: Boolean(raw.scoring_play ?? raw.touchdown ?? /touchdown|field goal is good/i.test(description)),
    awayScore: firstFinite(raw.away_score, raw.visitor_score, raw.visitor_team_score),
    homeScore: firstFinite(raw.home_score, raw.home_team_score),
    teamAbbr: getTeamAbbr(firstString(raw.team?.abbreviation, raw.possession_team, raw.team)),
    wallclock: Date.parse(raw.wallclock ?? '') || null,
    defenseTeamAbbr: getTeamAbbr(firstString(raw.defense_team?.abbreviation, raw.defense_team, raw.defensive_team)),
    description: description.length > MAX_DESC_LENGTH ? `${description.slice(0, MAX_DESC_LENGTH - 1)}…` : description,
  };
}

function getDefensiveTeamForPlay(play, game) {
  if (play.defenseTeamAbbr) return play.defenseTeamAbbr;
  const away = getTeamAbbr(game?.visitor_team);
  const home = getTeamAbbr(game?.home_team);
  if (!play.teamAbbr) return null;
  if (play.teamAbbr === away) return home;
  if (play.teamAbbr === home) return away;
  return null;
}

/**
 * Index of matchup starters by normalized name variants and team DST starters.
 * Last-name-only variants are kept only when unique across the matchup; team
 * cross-checks resolve remaining ambiguity at match time.
 */
export function buildStarterNameIndex(rows) {
  const variantOwners = new Map(); // variant -> Set(playerId)
  const meta = new Map(); // playerId -> { team, position }
  const teamDefenseIds = new Map(); // team -> Set(playerId)

  (rows ?? []).forEach(({ id, player }) => {
    if (!player) return;
    const team = getTeamAbbr(player.team);
    const position = String(player.position ?? '').toUpperCase();
    meta.set(id, { team, position });
    if (isTeamDefensePosition(position) && team) {
      const owners = teamDefenseIds.get(team) ?? new Set();
      owners.add(id);
      teamDefenseIds.set(team, owners);
    }

    const full = normalizeName(player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`);
    if (!full) return;
    const parts = full.split(' ');
    const last = parts[parts.length - 1];
    const first = parts[0];
    const variants = new Set([full]);
    if (parts.length >= 2) {
      variants.add(`${first[0]} ${last}`); // "b robinson" — matches "B. Robinson"
      variants.add(`${first[0]}${last}`); // "brobinson" — matches "B.Robinson" (no space)
      variants.add(last);
    }
    variants.forEach((variant) => {
      const owners = variantOwners.get(variant) ?? new Set();
      owners.add(id);
      variantOwners.set(variant, owners);
    });
  });

  const index = new Map();
  variantOwners.forEach((owners, variant) => {
    // Ambiguous bare last names are dropped; longer variants keep all owners
    // and rely on the team cross-check during matching.
    if (owners.size > 1 && !variant.includes(' ')) return;
    index.set(variant, [...owners]);
  });
  return { index, meta, teamDefenseIds };
}

const PASSER_POSITIONS = new Set(['QB']);

/**
 * Returns [{ playerId, role }] for starters involved in the play.
 * Roles: passer | receiver | rusher | kicker | defense | team_defense.
 */
export function matchPlayToStarters(play, nameIndex) {
  const { index, meta, teamDefenseIds } = nameIndex;
  const normalizedDesc = ` ${normalizeName(play.description)} `;
  const matches = new Map(); // playerId -> position in text

  const teamDefenseMatches = teamDefenseIds?.get?.(play.defenseTeamAbbr);
  if (teamDefenseMatches && isTeamDefenseScoringPlay(play)) {
    teamDefenseMatches.forEach((playerId) => matches.set(playerId, -1));
  }

  index.forEach((owners, variant) => {
    const at = normalizedDesc.indexOf(` ${variant} `);
    if (at < 0) return;
    owners.forEach((playerId) => {
      const playerMeta = meta.get(playerId);
      // Team cross-check when the play carries possession info.
      if (play.teamAbbr && playerMeta?.team && playerMeta.team !== play.teamAbbr
        && !isDefensiveRole(play, playerMeta)) {
        return;
      }
      const existing = matches.get(playerId);
      if (existing == null || at < existing) matches.set(playerId, at);
    });
  });

  const type = play.type;
  const isPass = type.includes('pass') || /pass (?:complete|incomplete|to)/i.test(play.description);
  const isKick = type.includes('field') || type.includes('extra') || /field goal|extra point/i.test(play.description);
  const isSack = /sack/i.test(play.description);

  return [...matches.entries()]
    .sort((left, right) => left[1] - right[1])
    .map(([playerId, textPos]) => {
      const playerMeta = meta.get(playerId) ?? {};
      let role = 'rusher';
      if (isKick && playerMeta.position === 'K') role = 'kicker';
      else if (isTeamDefensePosition(playerMeta.position)) role = 'team_defense';
      else if (isDefensivePosition(playerMeta.position)) role = 'defense';
      else if (isPass) role = PASSER_POSITIONS.has(playerMeta.position) ? 'passer' : 'receiver';
      else if (isSack && PASSER_POSITIONS.has(playerMeta.position)) role = 'passer';
      return { playerId, role, textPos };
    });
}

function isTeamDefensePosition(position) {
  return ['DEF', 'DST', 'D/ST'].includes(position);
}

function isDefensivePosition(position) {
  return isTeamDefensePosition(position) || ['DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S', 'SS', 'FS'].includes(position);
}

function isDefensiveRole(play, playerMeta) {
  return isDefensivePosition(playerMeta?.position);
}

/**
 * Approximate fantasy points for one player's involvement in one play,
 * scored through the league settings (position always passed — scoring rule).
 */
export function estimatePlayPoints(play, role, position, scoringSettings) {
  return Math.round(calcPoints(buildPlayStatDelta(play, role), scoringSettings, position) * 10) / 10;
}

export function buildPlayStatDelta(play, role) {
  const description = play.description;
  const yards = play.yards || extractYardsFromText(description) || 0;
  const touchdown = play.scoring && /touchdown/i.test(description);
  const delta = {};

  if (role === 'kicker') {
    if (/extra point/i.test(description)) delta.xpm = 1;
    else if (/field goal is good|field goal.*good/i.test(description) || (play.type.includes('field') && play.scoring)) {
      const fieldGoalYards = extractYardsFromText(description);
      delta.fgm = 1;
      if (fieldGoalYards) {
        delta.fgm_yds = fieldGoalYards;
        delta.fgm_yds_over_30 = Math.max(0, fieldGoalYards - 30);
      }
    }
    else return 0; // missed kicks: leave to exact stat deltas
  } else if (role === 'team_defense') {
    return buildTeamDefensePlayDelta(play);
  } else if (role === 'defense') {
    if (/sack/i.test(description)) delta.idp_sack = 1;
    if (/intercept/i.test(description)) delta.idp_int = 1;
    if (/forced fumble|fumble forced/i.test(description)) delta.idp_ff = 1;
    if (/fumble.*recover/i.test(description)) delta.idp_fr = 1;
    if (/safety/i.test(description)) delta.idp_safety = 1;
    if (/pass (?:defensed|defended|broken up)|pass breakup|incomplete/i.test(description)) delta.idp_pd = 1;
    if (touchdown) {
      delta.idp_def_td = 1;
      if (/intercept/i.test(description)) {
        delta.idp_int_td = 1;
        delta.idp_int_ret_yd = extractReturnYards(description) || yards;
        if (delta.idp_int_ret_yd >= 50) delta.bonus_def_int_td_50p = 1;
      } else if (/fumble/i.test(description)) {
        delta.idp_fr_td = 1;
        delta.idp_fr_yd = extractReturnYards(description) || yards;
        if (delta.idp_fr_yd >= 50) delta.bonus_def_fum_td_50p = 1;
      }
    }
    if (!Object.keys(delta).length) delta.idp_tkl = 1;
  } else if (role === 'passer') {
    if (/intercept/i.test(description)) {
      delta.pass_int = 1;
    } else if (/sack/i.test(description)) {
      delta.pass_sack = 1;
    } else {
      delta.pass_yd = yards;
      delta.pass_cmp = 1;
      delta.pass_att = 1;
      if (touchdown) delta.pass_td = 1;
      if (/first down/i.test(description)) delta.pass_fd = 1;
      if (touchdown && yards >= 40) delta.pass_td_40p = 1;
      if (touchdown && yards >= 50) delta.pass_td_50p = 1;
      if (yards >= 40) delta.pass_cmp_40p = 1;
    }
  } else if (role === 'receiver') {
    delta.rec = 1;
    delta.rec_yd = yards;
    if (touchdown) delta.rec_td = 1;
    if (/first down/i.test(description)) delta.rec_fd = 1;
    if (touchdown && yards >= 40) delta.rec_td_40p = 1;
    if (touchdown && yards >= 50) delta.rec_td_50p = 1;
    if (yards >= 40) delta.rec_40p = 1;
  } else {
    if (/fumble/i.test(description) && /lost|recovered by/i.test(description)) delta.fum_lost = 1;
    delta.rush_att = 1;
    delta.rush_yd = yards;
    if (touchdown) delta.rush_td = 1;
    if (/first down/i.test(description)) delta.rush_fd = 1;
    if (touchdown && yards >= 40) delta.rush_td_40p = 1;
    if (touchdown && yards >= 50) delta.rush_td_50p = 1;
    if (yards >= 40) delta.rush_40p = 1;
  }

  return delta;
}

function buildTeamDefensePlayDelta(play) {
  const description = play.description;
  const delta = {};
  const touchdown = play.scoring && /touchdown/i.test(description);
  const interception = /intercept|picked off|pick six/i.test(description);
  const fumble = /fumble/i.test(description);
  const sack = /sack/i.test(description);

  if (sack) {
    delta.sack = 1;
    delta.sack_yd = Math.abs(play.yards || extractYardsFromText(description) || 0);
  }
  if (interception) delta.int = 1;
  if (/safety/i.test(description)) delta.safe = 1;
  if (/pass (?:defensed|defended|broken up)|pass breakup|incomplete/i.test(description)) delta.def_pass_def = 1;
  if (/forced fumble|fumble forced/i.test(description) || fumble) delta.def_ff = 1;
  if (touchdown) {
    delta.def_td = 1;
    if (interception) {
      delta.def_int_td = 1;
      delta.int_ret_yd = extractReturnYards(description) || play.yards || 0;
      if (delta.int_ret_yd >= 50) delta.bonus_def_int_td_50p = 1;
    } else if (fumble) {
      delta.def_fum_td = 1;
      delta.fum_ret_yd = extractReturnYards(description) || play.yards || 0;
      if (delta.fum_ret_yd >= 50) delta.bonus_def_fum_td_50p = 1;
    }
  }

  return delta;
}

function isTeamDefenseScoringPlay(play) {
  return Object.keys(buildTeamDefensePlayDelta(play)).length > 0;
}

function extractYardsFromText(description) {
  const match = /(-?\d+)\s*(?:yard|yd)/i.exec(description);
  return match ? Number(match[1]) : 0;
}

function extractReturnYards(description) {
  const match = /(?:returned|return)\s+(?:for\s+)?(-?\d+)\s*(?:yard|yd)/i.exec(description)
    ?? /(-?\d+)\s*(?:yard|yd)\s+(?:interception|fumble)?\s*return/i.exec(description);
  return match ? Number(match[1]) : 0;
}

export function getPlayEventKind(play, role, position) {
  return getPlayEventClassification(play, role, position).kind;
}

function getPlayMechanism(play, role) {
  if (role === 'defense' || role === 'team_defense') return 'def';
  if (/kickoff|punt.*return|return(?:ed)? for/i.test(play.description)) return 'return';
  if (role === 'passer' || role === 'receiver') return 'pass';
  if (role === 'rusher') return 'rush';
  return null;
}

export function getPlayEventClassification(play, role, position, statDelta = null) {
  const delta = statDelta ?? buildPlayStatDelta(play, role);
  const stat = (key) => Number(delta?.[key]) || 0;
  const mechanism = getPlayMechanism(play, role);
  const touchdown = stat('pass_td') + stat('rush_td') + stat('rec_td')
    + stat('def_td') + stat('idp_def_td') + stat('idp_int_td')
    + stat('idp_fr_td') > 0;
  let kind = null;

  if (touchdown) kind = 'td';
  else if (role === 'kicker' && stat('xpm') > 0) kind = 'xp';
  else if (role === 'kicker') kind = 'fg';
  else if ((stat('pass_int') + stat('fum_lost')) > 0) kind = 'to';
  else if (mechanism) kind = mechanism;
  else if (position === 'K' || position === 'PK') kind = 'fg';
  else kind = 'rush';

  return {
    kind,
    mechanism: mechanism && mechanism !== kind ? mechanism : null,
  };
}

function buildPlayGlance(play, game) {
  const away = getTeamAbbr(game?.visitor_team);
  const home = getTeamAbbr(game?.home_team);
  const awayScore = play.awayScore ?? game?.visitor_team_score;
  const homeScore = play.homeScore ?? game?.home_team_score;
  const hasScore = Number.isFinite(Number(awayScore)) && Number.isFinite(Number(homeScore)) && (away || home);
  const clock = [play.period ? `Q${play.period}` : null, play.clock].filter(Boolean).join(' ') || null;
  if (!hasScore && !clock) return null;
  return {
    score: hasScore ? `${away} ${awayScore} · ${home} ${homeScore}` : `${away} @ ${home}`,
    clock: clock ?? '',
    live: false,
  };
}

/** Sort key: newest first across games (wallclock preferred, game-time fallback). */
function getPlayOrder(play) {
  if (play.wallclock) return play.wallclock;
  const period = play.period ?? 0;
  const clockParts = /(\d{1,2}):(\d{2})/.exec(play.clock ?? '');
  const secondsLeft = clockParts ? Number(clockParts[1]) * 60 + Number(clockParts[2]) : 900;
  return period * 10000 + (900 - secondsLeft);
}

const REGULATION_SECONDS = 3600;

/**
 * How far into its own game a play happened, 0..1.
 *
 * This is the pace chart's x-axis. Wallclock is the wrong axis for a fantasy
 * slate: a 1pm game and a 4pm game are at completely different points of their
 * own stories at the same moment, and pace is about how far through a game a
 * team is, not what time it is. Overtime clamps to 1 rather than running past
 * the right edge.
 */
export function getPlayProgress(play) {
  const period = Number(play?.period);
  if (!Number.isFinite(period) || period < 1) return null;
  const clockParts = /(\d{1,2}):(\d{2})/.exec(String(play?.clock ?? ''));
  // Mid-quarter is the honest guess when a play carries no clock.
  const secondsLeft = clockParts ? Number(clockParts[1]) * 60 + Number(clockParts[2]) : 450;
  const elapsed = (period - 1) * 900 + (900 - Math.min(900, Math.max(0, secondsLeft)));
  return Math.min(1, Math.max(0, elapsed / REGULATION_SECONDS));
}

/** Same reading, from a rendered glance clock such as `Q3 7:12`. */
export function parseGlanceProgress(clock) {
  const match = /Q(\d)(?:\s+(\d{1,2}):(\d{2}))?/i.exec(String(clock ?? ''));
  if (!match) return null;
  return getPlayProgress({
    period: Number(match[1]),
    clock: match[2] ? `${match[2]}:${match[3]}` : null,
  });
}

/**
 * Builds feed events from raw plays for the matchup's starters.
 * `positionsById`: Map playerId -> position. `gamesById`: Map gameId -> BDL game.
 */
export function buildPlayEvents(playsByGame, nameIndex, scoringSettings, positionsById, gamesById) {
  const events = [];
  Object.entries(playsByGame ?? {}).forEach(([gameId, rawPlays]) => {
    const game = gamesById?.get?.(String(gameId)) ?? null;
    (rawPlays ?? []).forEach((raw) => {
      const play = normalizePlay(raw, gameId);
      if (!play) return;
      play.defenseTeamAbbr = getDefensiveTeamForPlay(play, game);
      matchPlayToStarters(play, nameIndex).forEach(({ playerId, role }) => {
        const position = positionsById.get(playerId) ?? 'FLEX';
        const statDelta = buildPlayStatDelta(play, role);
        const pts = Math.round(calcPoints(statDelta, scoringSettings, position) * 10) / 10;
        if (!pts && !play.scoring) return; // ignore zero-impact involvements
        const classification = getPlayEventClassification(play, role, position, statDelta);
        events.push({
          id: `play-${play.id}-${playerId}`,
          playerId,
          ...classification,
          desc: play.description,
          pts,
          stats: statDelta,
          at: play.wallclock ?? Date.now(),
          // Unlike `at`, this stays null when a backfilled play has no real
          // timestamp. Replay must not mistake build time for event time.
          timelineAt: play.wallclock,
          progress: getPlayProgress(play),
          order: getPlayOrder(play),
          gameId,
          source: 'play',
          estimated: true,
          glance: buildPlayGlance(play, game),
        });
      });
    });
  });
  return events.sort((left, right) => right.order - left.order);
}

/**
 * Merges play events (approximate, full history) with live stat-delta events
 * (exact, session-only). A delta covered by a recent matching play absorbs the
 * play's description/glance and the play event is dropped; otherwise both
 * streams interleave newest-first.
 */
export function mergePlayEvents(playEvents, deltaEvents, { coverageWindowMs = 120000, ptsTolerance = 1.5 } = {}) {
  const consumedPlayIds = new Set();
  const enrichedDeltas = (deltaEvents ?? []).map((event) => {
    const match = (playEvents ?? []).find((play) => (
      !consumedPlayIds.has(play.id)
      && play.playerId === event.playerId
      && play.kind === event.kind
      && Math.abs(play.pts - event.pts) <= ptsTolerance
      && Math.abs((play.at ?? 0) - event.at) <= coverageWindowMs
    ));
    if (!match) return event;
    consumedPlayIds.add(match.id);
    return {
      ...event,
      desc: match.desc,
      glance: match.glance ?? event.glance,
      mechanism: event.mechanism ?? match.mechanism ?? null,
      // The play knows its game clock; the stat delta only knows "just now".
      progress: match.progress ?? event.progress ?? null,
      gameId: event.gameId ?? match.gameId ?? null,
      timelineAt: event.timelineAt ?? event.at ?? match.timelineAt ?? null,
      source: 'play+delta',
    };
  });

  const remainingPlays = (playEvents ?? []).filter((play) => !consumedPlayIds.has(play.id));
  // Primary sort on wallclock-ish `at`; `order` (game time) breaks ties among
  // backfilled plays that lack a wallclock and share a build timestamp.
  return [...enrichedDeltas, ...remainingPlays]
    .sort((left, right) => (
      ((right.at ?? 0) - (left.at ?? 0)) || ((right.order ?? 0) - (left.order ?? 0))
    ));
}
