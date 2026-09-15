// livePlaysFeed.js — turns BALLDONTLIE play-by-play rows into Companion Live
// feed events with estimated fantasy impact. Estimation is per-play and
// approximate; the separate live closing point stays exact because it comes
// from the stats endpoint. Historical replay keeps event-time estimates rather
// than rewriting them with that later total. Field mapping is defensive: BDL
// play payload shapes have not been captured in this repo yet, so every read
// tolerates alternates.

import { calcPoints } from './scoringEngine.js';
import { getTeamAbbr, normalizeName } from './liveScoringFeed.js';
import { parsePlayNarrative, PLAY_ROLES } from './nflPlays/playNarrative.js';
import { buildPlayerNameIndex, lookupPlayerByName } from './nflPlays/playerNameIndex.js';
import { enrichPlaySequenceContext } from './nflPlays/playSequenceContext.js';

const MAX_DESC_LENGTH = 140;
const GAME_DURATION_MS = 3 * 60 * 60 * 1000 + 10 * 60 * 1000;

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

function firstBoolean(...values) {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
    if (typeof value !== 'string' || !value.trim()) continue;
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
    if (['false', 'no', 'n', '0'].includes(normalized)) return false;
  }
  return null;
}

function addInferredPasserToInterception(sentence, passerName) {
  const possessive = `${passerName}${passerName.endsWith('s') ? "'" : "'s"}`;
  const returned = sentence.replace(
    /^(.+?) intercepted the pass and returned it\b/i,
    `${possessive} pass was intercepted by $1 and returned`,
  );
  if (returned !== sentence) return returned;
  const returns = sentence.replace(
    /^(.+?) returns an interception\b/i,
    `${possessive} pass is intercepted by $1, who returns it`,
  );
  return returns !== sentence ? returns : `${possessive} pass was intercepted. ${sentence}`;
}

export function normalizePlay(raw, gameId, { inferredPasserName = null } = {}) {
  if (!raw) return null;
  const description = firstString(raw.text, raw.description, raw.short_text, raw.desc);
  if (!description) return null;
  // Statistics Scores already turns BDL's compact `short_text` plus official
  // gamebook text into a plain-language sentence. Use that same conservative
  // parser at Fantasy Live's event boundary so every Live surface (feed,
  // replay header, chart tooltip, and player sheet) reads the same way. Unknown
  // provider shapes keep the official description instead of being guessed at.
  const narrative = parsePlayNarrative({
    typeSlug: firstString(raw.type_slug, raw.type_abbreviation),
    shortText: firstString(raw.short_text),
    rawText: firstString(raw.text, raw.description, raw.short_text, raw.desc),
    description,
    statYardage: firstFinite(raw.stat_yardage, raw.yards_gained, raw.yards, raw.net_yards),
  });
  const parsedDescription = narrative.confident && narrative.sentence
    ? narrative.sentence
    : description;
  const displayDescription = inferredPasserName && narrative.confident
    && !narrative.actors?.some((actor) => actor.role === PLAY_ROLES.PASSER)
    ? addInferredPasserToInterception(parsedDescription, inferredPasserName)
    : parsedDescription;
  const replayRaw = inferredPasserName
    ? { ...raw, gridshift_inferred_passer_name: inferredPasserName }
    : raw;
  return {
    id: raw.id ?? `${gameId}-${raw.sequence ?? description.slice(0, 24)}`,
    gameId,
    period: firstFinite(raw.period, raw.quarter),
    clock: firstString(raw.clock_display, raw.clock, raw.time),
    // BALLDONTLIE names this type_slug / type_text ("pass-reception", "rush",
    // "passing-touchdown"); it has no play_type or type field. Reading the
    // wrong keys left this empty on every play, so pass detection fell back to
    // a regex that does not match the provider's phrasing ("pass short left
    // to") — and quarterbacks were attributed as rushers.
    type: firstString(raw.type_slug, raw.type_text, raw.type_abbreviation, raw.play_type, raw.type)
      ?.toLowerCase() ?? '',
    yards: firstFinite(raw.yards_gained, raw.yards, raw.net_yards, raw.stat_yardage) ?? 0,
    scoring: firstBoolean(raw.scoring_play, raw.touchdown)
      ?? /touchdown|field goal is good/i.test(description),
    awayScore: firstFinite(raw.away_score, raw.visitor_score, raw.visitor_team_score),
    homeScore: firstFinite(raw.home_score, raw.home_team_score),
    teamAbbr: getTeamAbbr(firstString(raw.team?.abbreviation, raw.possession_team, raw.team)),
    wallclock: Number.isFinite(Date.parse(raw.wallclock ?? ''))
      ? Date.parse(raw.wallclock ?? '')
      : null,
    defenseTeamAbbr: getTeamAbbr(firstString(raw.defense_team?.abbreviation, raw.defense_team, raw.defensive_team)),
    inferredPasserName,
    description: displayDescription.length > MAX_DESC_LENGTH
      ? `${displayDescription.slice(0, MAX_DESC_LENGTH - 1)}…`
      : displayDescription,
    // Fantasy attribution follows the parser's explicit clauses. Rescanning
    // the display sentence alone can give the primary play type to a kicker
    // who is named only in a trailing extra-point result.
    narrative: narrative.confident ? narrative : null,
    // The provider row, kept intact. The feed only needs a sentence, but the
    // field visual reads structured geometry — down, distance, yards to the
    // end zone — that this normalisation deliberately flattens away.
    raw: replayRaw,
  };
}

function isPossessionChangingSummary(play) {
  const type = String(play?.type ?? '').toLowerCase();
  return type.includes('interception')
    || (type.includes('fumble') && /opp|opponent/.test(type));
}

function isFirstDownPlay(play) {
  const description = String(play?.description ?? '');
  if (/first down/i.test(description)) return true;

  // BALLDONTLIE exposes the down at the start and end of the snap. An
  // offensive play ending on a new first down is still a first down when the
  // provider's sentence omits the phrase (which is common in short_text).
  // Leave incompletions, sacks, interceptions, and no-plays to their existing
  // branches so an end_down value cannot invent a positive offensive stat.
  const raw = play?.raw ?? {};
  const endDown = firstFinite(raw.end_down, raw.endDown);
  const incomplete = play?.narrative?.playKind === 'incompletion'
    || String(play?.type ?? '').toLowerCase().includes('incompletion')
    || /\bincomplete\b/i.test(description);
  const negated = play?.narrative?.negated === true
    || /\bno play\b|wiped out by/i.test([
      description,
      raw.short_text,
      raw.text,
    ].filter(Boolean).join(' '));
  if (incomplete || negated || /\bintercept/i.test(String(play?.type ?? '')) || /\bsack\b/i.test(description)) {
    return false;
  }
  return endDown === 1;
}

function getGameTeamAbbr(team) {
  return getTeamAbbr(team?.abbreviation ?? team?.id ?? team);
}

function getOtherGameTeam(team, game) {
  const away = getGameTeamAbbr(game?.visitor_team ?? game?.away);
  const home = getGameTeamAbbr(game?.home_team ?? game?.home);
  if (!team) return null;
  if (team === away) return home;
  if (team === home) return away;
  return null;
}

function getDefensiveTeamForPlay(play, game) {
  if (play.defenseTeamAbbr) return play.defenseTeamAbbr;
  // On an interception or opponent-recovered fumble the provider's `team`
  // names who possesses the ball after the play — the defense that created
  // the turnover. Inverting it credited the pick-six to Las Vegas instead of
  // Houston.
  if (isPossessionChangingSummary(play)) return play.teamAbbr;
  const away = getGameTeamAbbr(game?.visitor_team ?? game?.away);
  const home = getGameTeamAbbr(game?.home_team ?? game?.home);
  if (!play.teamAbbr) return null;
  if (play.teamAbbr === away) return home;
  if (play.teamAbbr === home) return away;
  return null;
}

function getOffensiveTeamForPlay(play, game) {
  return isPossessionChangingSummary(play)
    ? getOtherGameTeam(play.teamAbbr, game)
    : play.teamAbbr;
}

/**
 * Index of matchup starters by normalized name variants and team DST starters.
 *
 * Thin adapter over the shared buildPlayerNameIndex — see
 * `nflPlays/playerNameIndex.js` for the variant and ambiguity rules.
 */
export function buildStarterNameIndex(rows) {
  const entries = (rows ?? [])
    .filter(({ player }) => player)
    .map(({ id, player }) => ({
      id,
      name: player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`,
      team: getTeamAbbr(player.team),
      position: String(player.position ?? '').toUpperCase(),
    }));

  // normalizeName rather than the shared default: Fantasy Live matches against
  // play text normalized the same way, and that normalizer leaves generational
  // suffixes in place. Changing it here would change matching behavior.
  const { index, meta, teamDefenseIds } = buildPlayerNameIndex(entries, { normalize: normalizeName });
  return {
    index,
    // normalizedName carries through: lookupPlayerByName reads it back off
    // each candidate record to tell a genuine same-team, same-initial
    // teammate apart from the actual named player when a full first name is
    // given (see its "fullFirstNameGiven" check).
    meta: new Map([...meta].map(([id, record]) => (
      [id, { team: record.team, position: record.position, normalizedName: record.normalizedName }]
    ))),
    teamDefenseIds,
  };
}

const PASSER_POSITIONS = new Set(['QB']);

function getFantasyRoleForActor(actorRole, playerMeta, play) {
  if (actorRole === PLAY_ROLES.PASSER) return 'passer';
  if (actorRole === PLAY_ROLES.RECEIVER) return 'receiver';
  if (actorRole === PLAY_ROLES.RUSHER) return 'rusher';
  if (actorRole === PLAY_ROLES.KICKER) return 'kicker';
  if (actorRole === PLAY_ROLES.PUNTER) return 'punter';
  if (actorRole === PLAY_ROLES.RETURNER) return 'returner';
  if ([PLAY_ROLES.SACKER, PLAY_ROLES.INTERCEPTER, PLAY_ROLES.RECOVERER, PLAY_ROLES.TACKLER].includes(actorRole)) {
    return isDefensivePosition(playerMeta?.position) ? 'defense' : null;
  }
  if (actorRole === PLAY_ROLES.FUMBLER) {
    const type = String(play?.type ?? '');
    return PASSER_POSITIONS.has(playerMeta?.position) && type.includes('pass') ? 'passer' : 'rusher';
  }
  return null;
}

function getIndexedPlayerId(nameIndex, record) {
  if (!record) return null;
  return [...nameIndex.meta.entries()].find(([, candidate]) => candidate === record)?.[0] ?? null;
}

function matchNarrativeActors(play, nameIndex) {
  const actors = play?.narrative?.actors;
  if (!play?.narrative?.confident || !Array.isArray(actors)) return null;

  const matches = new Map();
  const teamDefenseMatches = nameIndex.teamDefenseIds?.get?.(play.defenseTeamAbbr);
  if (teamDefenseMatches && isTeamDefenseScoringPlay(play)) {
    teamDefenseMatches.forEach((playerId) => matches.set(playerId, {
      playerId,
      role: 'team_defense',
      textPos: -1,
      detail: null,
    }));
  }

  if (play.inferredPasserName) {
    const record = lookupPlayerByName(nameIndex, play.inferredPasserName, {
      team: play.offenseTeamAbbr,
      normalize: normalizeName,
    });
    const playerId = getIndexedPlayerId(nameIndex, record);
    if (playerId) {
      matches.set(playerId, {
        playerId,
        role: 'passer',
        textPos: -0.5,
        detail: null,
      });
    }
  }

  actors.forEach((actor, textPos) => {
    const offensiveRole = [
      PLAY_ROLES.PASSER,
      PLAY_ROLES.RECEIVER,
      PLAY_ROLES.RUSHER,
      PLAY_ROLES.KICKER,
      PLAY_ROLES.PUNTER,
      PLAY_ROLES.FUMBLER,
    ].includes(actor.role);
    const record = lookupPlayerByName(nameIndex, actor.name, {
      // Defensive names in BDL's trailing tackle/recovery clauses can belong
      // to either side of the turnover. Restrict them to the resolved defense
      // so an offensive player named after a recovery cannot become an IDP.
      //
      // Use the resolved offenseTeamAbbr, not the raw play.teamAbbr: on an
      // interception or opponent-recovered fumble, BDL's `team` field names
      // the team that now possesses the ball (the defense), so a passer or
      // fumbler cross-checked against play.teamAbbr on those plays would be
      // compared to the wrong side and dropped as a mismatch. offenseTeamAbbr
      // (and defenseTeamAbbr, on the other side) already account for that
      // inversion — see getOffensiveTeamForPlay / getDefensiveTeamForPlay.
      team: offensiveRole ? play.offenseTeamAbbr : play.defenseTeamAbbr,
      normalize: normalizeName,
    });
    const playerId = getIndexedPlayerId(nameIndex, record);
    if (!playerId || matches.has(playerId)) return;
    const role = getFantasyRoleForActor(actor.role, record, play);
    if (!role) return;
    matches.set(playerId, {
      playerId,
      role,
      textPos,
      detail: actor.detail ?? null,
    });
  });

  return [...matches.values()].sort((left, right) => left.textPos - right.textPos);
}

/**
 * Returns [{ playerId, role }] for starters involved in the play.
 * Roles: passer | receiver | rusher | returner | kicker | defense | team_defense.
 */
export function matchPlayToStarters(play, nameIndex) {
  const narrativeMatches = matchNarrativeActors(play, nameIndex);
  if (narrativeMatches) return narrativeMatches;

  const { index, meta, teamDefenseIds } = nameIndex;
  const normalizedDesc = ` ${normalizeName(play.description)} `;
  const type = play.type;
  const isPass = type.includes('pass') || /pass (?:complete|incomplete|to)/i.test(play.description);
  const isKick = type.includes('field') || type.includes('extra') || /field goal|extra point|\bPAT\b/i.test(play.description);
  const isReturnPlay = type.includes('punt') || type.includes('kickoff')
    || /punt|kickoff|return(?:ed)? for|fair catch by/i.test(play.description);
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
      // Every non-defensive fallback candidate is checked against the team its
      // eventual role implies: non-kicking returners belong to the resolved
      // defense, and every other eligible fallback role belongs to the offense.
      const expectedTeam = getExpectedCandidateTeam(play, playerMeta, isReturnPlay);
      // This branch only runs when the narrative parser could not identify
      // actors. A defensive starter mentioned in a mixed pass/fumble sentence
      // is not, by itself, evidence that they made the recovery or tackle.
      // Those credits require the parser's explicit defensive actor; otherwise
      // leave the play unattributed instead of manufacturing an IDP event.
      if (isDefensivePosition(playerMeta?.position)) return;
      // A rostered player's team is positive attribution evidence, not a hint.
      // When the provider row lacks enough game context to resolve the team
      // implied by the candidate's role, fail closed. This prevents a same-name
      // defender from another game from surviving an ambiguous fallback scan.
      if (playerMeta?.team && (!expectedTeam || playerMeta.team !== expectedTeam)) {
        return;
      }
      const existing = matches.get(playerId);
      if (existing == null || at < existing) matches.set(playerId, at);
    });
  });

  const isSack = /sack/i.test(play.description);

  return [...matches.entries()]
    .sort((left, right) => left[1] - right[1])
    .map(([playerId, textPos]) => {
      const playerMeta = meta.get(playerId) ?? {};
      let role = 'rusher';
      if (isKick && playerMeta.position === 'K') role = 'kicker';
      else if (isTeamDefensePosition(playerMeta.position)) role = 'team_defense';
      else if (isDefensivePosition(playerMeta.position)) role = 'defense';
      else if (isReturnPlay && ['K', 'P'].includes(playerMeta.position)) role = 'punter';
      else if (isReturnPlay && !['K', 'P'].includes(playerMeta.position)) role = 'returner';
      else if (isPass) role = PASSER_POSITIONS.has(playerMeta.position) ? 'passer' : 'receiver';
      else if (isSack && PASSER_POSITIONS.has(playerMeta.position)) role = 'passer';
      return { playerId, role, textPos, detail: null };
    });
}

function isTeamDefensePosition(position) {
  return ['DEF', 'DST', 'D/ST'].includes(position);
}

function isDefensivePosition(position) {
  return isTeamDefensePosition(position) || ['DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S', 'SS', 'FS'].includes(position);
}

/**
 * The team a name-match candidate must belong to, given the play and the
 * candidate's own position — used to reject a same-name player on the wrong
 * roster before a role is even assigned.
 *
 * On a punt or kickoff, BDL's `team` names the kicking side, so the
 * receiving-side returner is checked against the resolved defense (see
 * getDefensiveTeamForPlay) — the kicker/punter stays on the offense side.
 * Everything else (passer, rusher, receiver, kicker, punter) is checked
 * against the resolved offense.
 */
function getExpectedCandidateTeam(play, playerMeta, isReturnPlay) {
  const position = playerMeta?.position;
  if (isReturnPlay && !['K', 'P'].includes(position)) return play.defenseTeamAbbr ?? null;
  return play.offenseTeamAbbr ?? play.teamAbbr ?? null;
}

/**
 * Approximate fantasy points for one player's involvement in one play,
 * scored through the league settings (position always passed — scoring rule).
 */
export function estimatePlayPoints(play, role, position, scoringSettings, roleDetail = null) {
  return Math.round(calcPoints(buildPlayStatDelta(play, role, roleDetail), scoringSettings, position) * 100) / 100;
}

export function buildPlayStatDelta(play, role, roleDetail = null) {
  const description = play.description;
  const yards = play.yards || extractYardsFromText(description) || 0;
  const type = String(play.type ?? '').toLowerCase();
  const kickContext = [
    type,
    description,
    play.raw?.short_text,
    play.raw?.text,
    roleDetail,
  ].filter(Boolean).join(' ');
  const touchdown = play.scoring && (
    /touchdown|return td/i.test(description)
    || /touchdown|return-touchdown|return_td/.test(type)
  );
  const twoPoint = /two.?point|2.?point/.test(type)
    || /two.?point conversion|2.?point conversion/i.test(description);
  const incomplete = play.narrative?.playKind === 'incompletion'
    || type.includes('incompletion')
    || /\bincomplete\b/i.test(description);
  const negated = play.narrative?.negated === true
    || /\bno play\b|wiped out by/i.test([
      description,
      play.raw?.short_text,
      play.raw?.text,
    ].filter(Boolean).join(' '));
  const delta = {};
  const firstDown = isFirstDownPlay(play);

  // Keep the provider's raw yardage on the normalized play for field geometry,
  // but a snap explicitly ruled "No Play" has no fantasy stat attribution.
  if (negated) return delta;

  if (role === 'kicker') {
    const missedExtraPoint = /(?:extra point|\bPAT\b).*?(?:fail|miss|no good)|(?:fail|miss|no good).*?(?:extra point|\bPAT\b)/i.test(kickContext);
    const madeExtraPoint = /extra point good|extra point.*?is good|\bPAT\b.*?good/i.test(kickContext)
      || /extra point good/i.test(String(roleDetail ?? ''));
    if (missedExtraPoint) delta.xpmiss = 1;
    else if (madeExtraPoint || (type.includes('extra') && play.scoring)) delta.xpm = 1;
    else if (/field goal.*?(?:miss|no good)/i.test(kickContext)) {
      delta.fgmiss = 1;
    } else if (/field goal is good|field goal.*good/i.test(kickContext) || (type.includes('field') && play.scoring)) {
      const fieldGoalYards = extractYardsFromText(kickContext);
      delta.fgm = 1;
      if (fieldGoalYards) {
        delta.fgm_yds = fieldGoalYards;
        delta.fgm_yds_over_30 = Math.max(0, fieldGoalYards - 30);
      }
    }
    else return {};
  } else if (role === 'returner') {
    const kickoff = type.includes('kickoff') || /kickoff/i.test(description);
    if (kickoff) delta.kr_yd = yards;
    else delta.pr_yd = yards;
    if (touchdown) {
      delta.ret_td = 1;
      if (kickoff) delta.kr_td = 1;
      else delta.pr_td = 1;
    }
  } else if (role === 'punter') {
    // Punt distance belongs to the kicking play, not a fantasy rushing line.
    return {};
  } else if (role === 'team_defense') {
    return buildTeamDefensePlayDelta(play);
  } else if (role === 'defense') {
    if (/sack/i.test(description)) delta.idp_sack = 1;
    if (/intercept/i.test(description)) delta.idp_int = 1;
    if (/forced fumble|fumble forced/i.test(description)) delta.idp_ff = 1;
    if (/fumble.*recover/i.test(description)) {
      delta.idp_fr = 1;
      const fumbleReturnYards = firstFinite(
        play.narrative?.returnYards,
        extractReturnYards(description),
      );
      if (fumbleReturnYards != null && fumbleReturnYards > 0) delta.idp_fr_yd = fumbleReturnYards;
    }
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
    if (twoPoint) {
      delta.pass_2pt = 1;
    } else if (/intercept/i.test(description)) {
      delta.pass_int = 1;
    } else if (/sack/i.test(description)) {
      delta.pass_sack = 1;
    } else if (incomplete) {
      delta.pass_att = 1;
      delta.pass_inc = 1;
    } else {
      delta.pass_yd = yards;
      delta.pass_cmp = 1;
      delta.pass_att = 1;
      if (touchdown) delta.pass_td = 1;
      if (firstDown) delta.pass_fd = 1;
      if (touchdown && yards >= 40) delta.pass_td_40p = 1;
      if (touchdown && yards >= 50) delta.pass_td_50p = 1;
      if (yards >= 40) delta.pass_cmp_40p = 1;
    }
  } else if (role === 'receiver') {
    if (twoPoint) {
      delta.rec_2pt = 1;
    } else if (incomplete) {
      return delta;
    } else {
      delta.rec = 1;
      delta.rec_yd = yards;
      if (touchdown) delta.rec_td = 1;
      if (firstDown) delta.rec_fd = 1;
      if (touchdown && yards >= 40) delta.rec_td_40p = 1;
      if (touchdown && yards >= 50) delta.rec_td_50p = 1;
      if (yards >= 40) delta.rec_40p = 1;
    }
  } else {
    if (twoPoint) {
      delta.rush_2pt = 1;
    } else {
      if (/fumble/i.test(description) && /lost|recovered by/i.test(description)) delta.fum_lost = 1;
      delta.rush_att = 1;
      delta.rush_yd = yards;
      if (touchdown) delta.rush_td = 1;
      if (firstDown) delta.rush_fd = 1;
      if (touchdown && yards >= 40) delta.rush_td_40p = 1;
      if (touchdown && yards >= 50) delta.rush_td_50p = 1;
      if (yards >= 40) delta.rush_40p = 1;
    }
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
  if (role === 'returner' || /kickoff|punt|punt.*return|return(?:ed)? for/i.test(`${play.type} ${play.description}`)) return 'return';
  if (role === 'passer' || role === 'receiver') return 'pass';
  if (role === 'rusher') return 'rush';
  return null;
}

export function getPlayEventClassification(play, role, position, statDelta = null) {
  const delta = statDelta ?? buildPlayStatDelta(play, role);
  const stat = (key) => Number(delta?.[key]) || 0;
  const mechanism = getPlayMechanism(play, role);
  const touchdown = stat('pass_td') + stat('rush_td') + stat('rec_td')
    + stat('ret_td') + stat('kr_td') + stat('pr_td')
    + stat('def_td') + stat('idp_def_td') + stat('idp_int_td')
    + stat('idp_fr_td') > 0;
  let kind = null;

  if (touchdown) kind = 'td';
  else if (role === 'kicker' && (stat('xpm') + stat('xpmiss')) > 0) kind = 'xp';
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

/** Sort key: newest first within one game. */
function getPlayOrder(play) {
  if (play?.wallclock != null && Number.isFinite(Number(play.wallclock))) {
    return Number(play.wallclock);
  }
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

function getGameKickoffMs(game) {
  const kickoff = Date.parse(game?.date ?? '');
  return Number.isFinite(kickoff) ? kickoff : null;
}

// `getPlayOrder()` is intentionally game-local so it remains useful while a
// single provider response is being enriched. Feed ordering needs a shared
// key, though: without a wallclock, yesterday's completed Q4 otherwise sorts
// above today's live Q2. Kickoff plus the play's own progress preserves the
// real slate order without changing the per-game progress used by scoring.
function getPlayTimelineOrder(play, game, fallbackGameIndex = 0, fallbackStart = 0) {
  if (play?.wallclock != null && Number.isFinite(Number(play.wallclock))) {
    return Number(play.wallclock);
  }
  const kickoff = getGameKickoffMs(game);
  const base = kickoff ?? fallbackStart + fallbackGameIndex * GAME_DURATION_MS;
  const progress = getPlayProgress(play);
  return base + (Number.isFinite(Number(progress)) ? Number(progress) : 0) * GAME_DURATION_MS;
}

function compareDescending(left, right) {
  return right - left;
}

function firstFiniteEventValue(event, keys) {
  for (const key of keys) {
    if (event?.[key] == null || event?.[key] === '') continue;
    const value = Number(event?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

/** Newest first on the shared chart/feed axis. */
export function compareLiveFeedEvents(left, right) {
  const leftProgress = left?.progress == null || left?.progress === ''
    ? Number.NaN
    : Number(left.progress);
  const rightProgress = right?.progress == null || right?.progress === ''
    ? Number.NaN
    : Number(right.progress);
  if (Number.isFinite(leftProgress) && Number.isFinite(rightProgress)
    && leftProgress !== rightProgress) {
    return compareDescending(leftProgress, rightProgress);
  }
  if (Number.isFinite(leftProgress) !== Number.isFinite(rightProgress)) {
    return Number.isFinite(rightProgress) ? 1 : -1;
  }

  const leftTime = firstFiniteEventValue(left, ['timelineAt', 'at']);
  const rightTime = firstFiniteEventValue(right, ['timelineAt', 'at']);
  if (leftTime != null && rightTime != null && leftTime !== rightTime) {
    return compareDescending(leftTime, rightTime);
  }
  if ((leftTime != null) !== (rightTime != null)) return rightTime != null ? 1 : -1;

  const leftOrder = Number(left?.order);
  const rightOrder = Number(right?.order);
  if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) {
    return compareDescending(leftOrder, rightOrder);
  }
  if (Number.isFinite(leftOrder) !== Number.isFinite(rightOrder)) {
    return Number.isFinite(rightOrder) ? 1 : -1;
  }
  return String(right?.id ?? '').localeCompare(String(left?.id ?? ''), undefined, { numeric: true });
}

export function sortLiveFeedEvents(events = []) {
  return [...events].sort(compareLiveFeedEvents);
}

function compareUnmappedFeedEvents(left, right) {
  const leftTime = firstFiniteEventValue(left, ['timelineAt']);
  const rightTime = firstFiniteEventValue(right, ['timelineAt']);
  if (leftTime != null && rightTime != null && leftTime !== rightTime) {
    return compareDescending(leftTime, rightTime);
  }
  if ((leftTime != null) !== (rightTime != null)) return rightTime != null ? 1 : -1;

  const leftOrder = Number(left?.order);
  const rightOrder = Number(right?.order);
  if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) {
    return compareDescending(leftOrder, rightOrder);
  }
  if (Number.isFinite(leftOrder) !== Number.isFinite(rightOrder)) {
    return Number.isFinite(rightOrder) ? 1 : -1;
  }

  const leftAt = firstFiniteEventValue(left, ['at']);
  const rightAt = firstFiniteEventValue(right, ['at']);
  if (leftAt != null && rightAt != null && leftAt !== rightAt) return compareDescending(leftAt, rightAt);
  return String(right?.id ?? '').localeCompare(String(left?.id ?? ''), undefined, { numeric: true });
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
  const gameIds = Object.keys(playsByGame ?? {}).sort((leftId, rightId) => {
    const left = gamesById?.get?.(String(leftId));
    const right = gamesById?.get?.(String(rightId));
    const leftKickoff = getGameKickoffMs(left);
    const rightKickoff = getGameKickoffMs(right);
    if (leftKickoff != null && rightKickoff != null && leftKickoff !== rightKickoff) {
      return leftKickoff - rightKickoff;
    }
    if (leftKickoff != null) return -1;
    if (rightKickoff != null) return 1;
    return String(leftId).localeCompare(String(rightId), undefined, { numeric: true });
  });
  const knownKickoffs = gameIds
    .map((gameId) => getGameKickoffMs(gamesById?.get?.(String(gameId))))
    .filter((kickoff) => kickoff != null);
  const fallbackStart = knownKickoffs.length ? Math.min(...knownKickoffs) : 0;
  const gameIndexById = new Map(gameIds.map((gameId, index) => [String(gameId), index]));

  gameIds.forEach((gameId) => {
    const rawPlays = playsByGame?.[gameId];
    const game = gamesById?.get?.(String(gameId)) ?? null;
    const fallbackGameIndex = gameIndexById.get(String(gameId)) ?? 0;
    const context = {
      awayTeam: getGameTeamAbbr(game?.visitor_team ?? game?.away),
      homeTeam: getGameTeamAbbr(game?.home_team ?? game?.home),
    };
    const normalized = (rawPlays ?? [])
      .map((raw, rawIndex) => {
        const play = normalizePlay(raw, gameId);
        if (!play || raw.id != null || raw.sequence != null) return play;
        // Some provider snapshots omit both id and sequence. A description is
        // not an identity: repeated short plays must not collapse into one
        // shared row when the snapshot is reconciled or grouped later.
        return { ...play, id: `${gameId}-${rawIndex}-${play.id}` };
      })
      .filter(Boolean)
      .sort((left, right) => getPlayOrder(left) - getPlayOrder(right));
    const contextual = enrichPlaySequenceContext(normalized, context).map((play) => (
      play.inferredPasserName
        ? {
            ...normalizePlay(play.raw, gameId, { inferredPasserName: play.inferredPasserName }),
            id: play.id,
          }
        : play
    ));
    contextual.forEach((play) => {
      if (!play) return;
      play.defenseTeamAbbr = getDefensiveTeamForPlay(play, game);
      play.offenseTeamAbbr = getOffensiveTeamForPlay(play, game);
      matchPlayToStarters(play, nameIndex).forEach(({ playerId, role, detail }) => {
        const position = positionsById.get(playerId) ?? 'FLEX';
        const statDelta = buildPlayStatDelta(play, role, detail);
        const pts = Math.round(calcPoints(statDelta, scoringSettings, position) * 100) / 100;
        if (!Number.isFinite(pts) || pts === 0) return; // only fantasy-relevant involvements
        const classification = getPlayEventClassification(play, role, position, statDelta);
        events.push({
          id: `play-${play.id}-${playerId}`,
          // One NFL snap can credit several rostered players (for example the
          // quarterback and receiver on a passing touchdown). Keep the raw
          // play identifier so the presentation layer can make that one
          // shared fantasy moment without conflating unrelated plays.
          sharedPlayId: String(play.id),
          playerId,
          position,
          ...classification,
          desc: play.description,
          pts,
          stats: statDelta,
          at: play.wallclock ?? Date.now(),
          // Unlike `at`, this stays null when a backfilled play has no real
          // timestamp. Replay must not mistake build time for event time.
          timelineAt: play.wallclock,
          progress: getPlayProgress(play),
          // `order` is shared across games. The per-game game clock remains in
          // `progress`; using the local quarter/clock number here made a
          // completed earlier game outrank a live later game.
          order: getPlayTimelineOrder(play, game, fallbackGameIndex, fallbackStart),
          gameId,
          source: 'play',
          estimated: true,
          glance: buildPlayGlance(play, game),
          play,
          // Game metadata is fetched separately from the provider's play row
          // and is not guaranteed to be embedded at raw.game. Carry the
          // resolved record so provider-backed feed rows can always build the
          // field replay when their play geometry is present.
          playGame: game,
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
    const candidates = (playEvents ?? [])
      .filter((play) => {
        if (consumedPlayIds.has(play.id)) return false;
        if (play.playerId !== event.playerId || play.kind !== event.kind) return false;
        const sameGame = play.gameId != null && event.gameId != null
          && String(play.gameId) === String(event.gameId);
        if (play.gameId != null && event.gameId != null && !sameGame) return false;
        const closeInTime = Math.abs((play.at ?? 0) - (event.at ?? 0)) <= coverageWindowMs;
        const closeInProgress = Number.isFinite(Number(play.progress))
          && Number.isFinite(Number(event.progress))
          && Math.abs(Number(play.progress) - Number(event.progress)) <= 0.05;
        const sameStats = statLinesMatch(play.stats, event.stats);
        const closeEnough = closeInTime || closeInProgress;
        // A replay snapshot can be emitted before its provider play hydrates.
        // When the stat line identifies the same single play, allow the wider
        // replay interval to enrich the existing row, but keep a game and time
        // boundary so two identical catches cannot merge arbitrarily.
        const replayHydrationWindow = sameStats && sameGame
          && Math.abs((play.at ?? 0) - (event.at ?? 0)) <= coverageWindowMs * 5;
        return (Math.abs((play.pts ?? 0) - (event.pts ?? 0)) <= ptsTolerance && closeEnough)
          || (sameStats && (closeEnough || replayHydrationWindow));
      })
      .sort((left, right) => Math.abs((left.at ?? 0) - (event.at ?? 0)) - Math.abs((right.at ?? 0) - (event.at ?? 0)));
    const match = candidates[0] ?? null;
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
      // A stats-delta timestamp means "the poll arrived", not necessarily
      // when the matched play happened. Prefer the provider play's time for
      // hydrated rows; unmatched deltas keep their poll time.
      timelineAt: event.source === 'stats-delta'
        ? match.timelineAt ?? event.timelineAt ?? event.at ?? null
        : event.timelineAt ?? match.timelineAt ?? event.at ?? null,
      order: event.source === 'stats-delta'
        ? match.order ?? event.order ?? null
        : event.order ?? match.order ?? null,
      play: event.play ?? match.play ?? null,
      playGame: event.playGame ?? match.playGame ?? null,
      sharedPlayId: event.sharedPlayId ?? match.sharedPlayId ?? null,
      source: 'play+delta',
    };
  });

  const remainingPlays = (playEvents ?? []).filter((play) => !consumedPlayIds.has(play.id));
  // Prefer a real play timestamp, then the shared kickoff/game-time order, and
  // only use the polling timestamp for unmatched stat-delta rows.
  return [...enrichedDeltas, ...remainingPlays]
    .sort(compareUnmappedFeedEvents);
}

// Provider-derived play stats may carry optional bonus fields that the live box
// score does not expose, while a snapshot delta may carry several plays at once.
// Compare the core per-play counting stats so a one-play fallback can be
// rehydrated without requiring every provider-specific field to line up.
export const PLAY_MATCH_STATS = new Set([
  'pass_yd', 'pass_cmp', 'pass_att', 'pass_inc', 'pass_fd', 'pass_td', 'pass_int', 'pass_2pt',
  'rush_yd', 'rush_att', 'rush_fd', 'rush_td', 'rush_2pt',
  'rec', 'rec_yd', 'rec_fd', 'rec_td', 'rec_2pt',
  'kr_yd', 'kr_td', 'pr_yd', 'pr_td', 'ret_td',
  'fgm', 'fgmiss', 'xpm', 'xpmiss', 'fum_lost', 'fum_ret_td',
  'fgm_yds', 'fgm_yds_over_30', 'idp_tkl', 'idp_tkl_solo', 'idp_tkl_ast',
]);

export function statLinesMatch(left, right) {
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const sharedKeys = [...PLAY_MATCH_STATS].filter((key) => (
    Math.abs(Number(left[key]) || 0) > 0
    && Math.abs(Number(right[key]) || 0) > 0
  ));
  return sharedKeys.length > 0 && sharedKeys.every((key) => (
    Math.abs((Number(left[key]) || 0) - (Number(right[key]) || 0)) < 0.001
  ));
}

/**
 * Collapses contributors from the same NFL snap only when they belong to the
 * same fantasy side. Opposing managers can each benefit from a shared snap
 * (such as a receiver's catch and an opponent's defensive score); those must
 * remain distinct feed and chart events so each side keeps its own movement.
 */
export function groupSharedPlayEvents(events = [], sideKeyOf) {
  const groups = new Map();

  events.forEach((event, index) => {
    const sharedPlayId = event?.sharedPlayId;
    const sideKey = sideKeyOf?.(event) ?? null;
    if (!sharedPlayId || !sideKey) {
      groups.set(`event:${event?.id ?? index}`, { events: [event], index, sideKey: null });
      return;
    }
    const key = `play:${event.gameId ?? 'unknown'}:${sharedPlayId}:side:${sideKey}`;
    const group = groups.get(key);
    if (group) group.events.push(event);
    else groups.set(key, { events: [event], index, sideKey });
  });

  return [...groups.values()]
    .sort((left, right) => left.index - right.index)
    .map((group) => {
      const [primary, ...rest] = group.events;
      if (!rest.length && !group.sideKey) return primary;
      const contributors = group.events.map((event) => ({
        playerId: event.playerId,
        pts: event.pts,
        stats: event.stats,
        position: event.position,
        kind: event.kind,
        mechanism: event.mechanism,
        estimated: event.estimated,
        source: event.source,
        // Reconciled rows arrive with the displayed total in `pts` and the
        // play's own score moved to `rawPts`. The scoring-math expansion reads
        // both per contributor, so dropping them here made every expansion
        // score against the displayed total and hid the adjustment line.
        // Undefined when absent, leaving demo and preseason rows unchanged.
        rawPts: event.rawPts,
        adjustment: event.adjustment,
        displayPts: event.displayPts,
        status: event.status,
        confirmedBy: event.confirmedBy,
      }));
      return {
        ...primary,
        // Use the shared-snap identity even before every same-side contributor
        // has arrived. The row therefore keeps its selection/chart identity
        // when a later replay snapshot adds the receiver to the quarterback's
        // already-visible play (or vice versa).
        id: `shared-${primary.sharedPlayId}-${group.sideKey}`,
        pts: Math.round(contributors.reduce((total, contributor) => (
          total + (Number(contributor.pts) || 0)
        ), 0) * 100) / 100,
        contributorIds: contributors.map((contributor) => contributor.playerId),
        contributors,
      };
    });
}
