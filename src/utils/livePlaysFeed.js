// livePlaysFeed.js — turns BALLDONTLIE play-by-play rows into Companion Live
// feed events with estimated fantasy impact. Estimation is per-play and
// approximate; the separate live closing point stays exact because it comes
// from the stats endpoint. Historical replay keeps event-time estimates rather
// than rewriting them with that later total. Field mapping is defensive: BDL
// play payload shapes have not been captured in this repo yet, so every read
// tolerates alternates.

import { getTeamAbbr, normalizeName } from './liveScoringFeed.js';
import { PLAY_ROLES, parseFumbleCredit } from './nflPlays/playNarrative.js';
import { buildPlayerNameIndex, lookupPlayerByName } from './nflPlays/playerNameIndex.js';
import { enrichPlaySequenceContext } from './nflPlays/playSequenceContext.js';
import {
  isKickReturnPlay,
  normalizeCanonicalPlay,
  resolveOffenseDefenseTeams,
} from './playByPlay/normalizePlay.js';
import {
  PLAY_MATCH_STATS,
  TEAM_DEFENSE_COVERAGE,
  TEAM_DEFENSE_RETURN,
  buildPlayStatDelta,
  estimatePlayPoints,
  getPlayEventClassification,
  isTeamDefenseScoringPlay,
} from './playByPlay/playStatDelta.js';
import { calcPoints } from './scoringEngine.js';

// Statistics Scores and Fantasy Live share one provider-shape normalizer and
// one stat-attribution owner. Re-exported here because these are Fantasy Live's
// long-standing public surface (liveReconciliation.js and the Live tests import
// them from this module).
export {
  PLAY_MATCH_STATS,
  buildPlayStatDelta,
  buildTeamDefensePlayDelta,
  estimatePlayPoints,
  getPlayEventClassification,
} from './playByPlay/playStatDelta.js';

const MAX_DESC_LENGTH = 140;

// normalizeName (which keeps generational suffixes) with the suffixes then
// dropped. Play text abbreviates "Kyle Pitts Sr." as "K.Pitts", so a kept
// suffix made the indexed short forms "k sr" / "ksr": every Jr./Sr./II starter
// went unmatched wherever the provider abbreviated them — every tackle, every
// sentence the narrative parser could not read.
function normalizeStarterName(value) {
  return normalizeName(value)
    .replace(/\b(?:jr|sr|ii|iii|iv|v)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const GAME_DURATION_MS = 3 * 60 * 60 * 1000 + 10 * 60 * 1000;

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
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

/**
 * Fantasy Live's feed play, built on the shared canonical normalizer.
 *
 * Two Live-only presentation choices stay here rather than moving into the
 * shared module: a row with no description is dropped (the feed has nothing to
 * show for it), and the sentence is the narrative parser's when it is
 * confident, with an inferred passer folded in and a display clamp applied.
 */
export function normalizePlay(raw, gameId, { inferredPasserName = null } = {}) {
  const canonical = normalizeCanonicalPlay(raw, {
    gameId,
    inferredPasserName,
    normalizeTeam: getTeamAbbr,
  });
  if (!canonical) return null;
  const description = canonical.rawDescription;
  if (!description) return null;
  // `narrative` is non-null only when the parser was confident.
  const narrative = canonical.narrative;
  const parsedDescription = narrative?.sentence ? narrative.sentence : description;
  const displayDescription = inferredPasserName && narrative
    && !narrative.actors?.some((actor) => actor.role === PLAY_ROLES.PASSER)
    ? addInferredPasserToInterception(parsedDescription, inferredPasserName)
    : parsedDescription;
  return {
    id: canonical.id,
    gameId,
    period: canonical.period,
    clock: canonical.clock,
    // BALLDONTLIE names this type_slug / type_text ("pass-reception", "rush",
    // "passing-touchdown"); it has no play_type or type field. Reading the
    // wrong keys left this empty on every play, so pass detection fell back to
    // a regex that does not match the provider's phrasing ("pass short left
    // to") — and quarterbacks were attributed as rushers.
    type: firstString(raw.type_slug, raw.type_text, raw.type_abbreviation, raw.play_type, raw.type)
      ?.toLowerCase() ?? '',
    yards: canonical.yards ?? 0,
    scoring: canonical.scoringInferred,
    awayScore: canonical.awayScore,
    homeScore: canonical.homeScore,
    teamAbbr: getTeamAbbr(canonical.team),
    wallclock: canonical.wallclock,
    defenseTeamAbbr: getTeamAbbr(firstString(raw.defense_team?.abbreviation, raw.defense_team, raw.defensive_team)),
    inferredPasserName,
    description: displayDescription.length > MAX_DESC_LENGTH
      ? `${displayDescription.slice(0, MAX_DESC_LENGTH - 1)}…`
      : displayDescription,
    // Fantasy attribution follows the parser's explicit clauses. Rescanning
    // the display sentence alone can give the primary play type to a kicker
    // who is named only in a trailing extra-point result.
    narrative,
    defensiveActors: canonical.defensiveActors,
    // The provider row, kept intact. The feed only needs a sentence, but the
    // field visual reads structured geometry — down, distance, yards to the
    // end zone — that this normalisation deliberately flattens away.
    raw: canonical.raw,
  };
}

function getGameTeamAbbr(team) {
  return getTeamAbbr(team?.abbreviation ?? team?.id ?? team);
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

  // normalizeStarterName rather than the shared default: Fantasy Live matches
  // against play text normalized the same way (periods deleted, so "K.Pitts"
  // reads "kpitts"), which the shared normalizer would split differently.
  const { index, meta, teamDefenseIds } = buildPlayerNameIndex(entries, { normalize: normalizeStarterName });
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
  if ([
    PLAY_ROLES.SACKER,
    PLAY_ROLES.INTERCEPTER,
    PLAY_ROLES.FORCER,
    PLAY_ROLES.RECOVERER,
    PLAY_ROLES.TACKLER,
    PLAY_ROLES.PASS_DEFENDER,
    PLAY_ROLES.QB_HITTER,
    PLAY_ROLES.SAFETY,
    PLAY_ROLES.KICK_BLOCKER,
  ].includes(actorRole)) {
    return isDefensivePosition(playerMeta?.position) ? 'defense' : null;
  }
  if (actorRole === PLAY_ROLES.FUMBLER) {
    const type = String(play?.type ?? '');
    return PASSER_POSITIONS.has(playerMeta?.position) && type.includes('pass') ? 'passer' : 'rusher';
  }
  return null;
}

const NARRATIVE_OFFENSIVE_ROLES = [
  PLAY_ROLES.PASSER,
  PLAY_ROLES.RECEIVER,
  PLAY_ROLES.RUSHER,
  PLAY_ROLES.KICKER,
  PLAY_ROLES.PUNTER,
  PLAY_ROLES.FUMBLER,
];

/**
 * The roster a named actor must belong to before they can be attributed.
 *
 * Defensive names in BDL's trailing tackle/recovery clauses can belong to
 * either side, so each role is pinned to the side its own clause implies —
 * otherwise an offensive player named after a recovery becomes an IDP.
 *
 * This reads the resolved offense/defense rather than the raw `play.teamAbbr`:
 * on a kick or a turnover BDL's `team` names whoever ends up with the ball, so
 * a passer or fumbler checked against `teamAbbr` would be compared to the wrong
 * side and dropped as a mismatch. See `resolveOffenseDefenseTeams` in
 * `playByPlay/normalizePlay.js`.
 *
 * A kick splits the two defensive-sounding roles across opposite sidelines: the
 * returner belongs to the receiving team (the resolved defense) while the
 * coverage players who bring him down belong to the kicking team (the resolved
 * offense). Sending every non-offensive role to the defense credited kick
 * tackles to the returning roster, where those players do not exist, and the
 * tackle silently disappeared.
 */
function getActorExpectedTeam(play, actorRole, isKickReturn) {
  if (NARRATIVE_OFFENSIVE_ROLES.includes(actorRole)) return play.offenseTeamAbbr;
  if (actorRole === PLAY_ROLES.RETURNER) return play.defenseTeamAbbr;
  return isKickReturn ? play.offenseTeamAbbr : play.defenseTeamAbbr;
}

function getIndexedPlayerId(nameIndex, record) {
  if (!record) return null;
  return [...nameIndex.meta.entries()].find(([, candidate]) => candidate === record)?.[0] ?? null;
}

function matchNarrativeActors(play, nameIndex) {
  const narrativeActors = play?.narrative?.confident && Array.isArray(play.narrative.actors)
    ? play.narrative.actors
    : [];
  const defensiveActors = Array.isArray(play?.defensiveActors) ? play.defensiveActors : [];
  if (!narrativeActors.length && !defensiveActors.length) return null;
  const actors = [...narrativeActors];
  defensiveActors.forEach((actor) => {
    const duplicate = actors.some((candidate) => (
      candidate.role === actor.role
      && normalizeStarterName(candidate.name) === normalizeStarterName(actor.name)
    ));
    if (!duplicate) actors.push(actor);
  });

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
      normalize: normalizeStarterName,
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

  const kickReturn = isKickReturnPlay(play);

  // Special teams for team defenses: the receiving side's return yards, and a
  // coverage tackle for the kicking side when one defender made the stop.
  if (kickReturn && play?.narrative?.confident) {
    const returnYards = Number(play.narrative.returnYards);
    if (Number.isFinite(returnYards) && returnYards !== 0) {
      nameIndex.teamDefenseIds?.get?.(play.defenseTeamAbbr)?.forEach((playerId) => {
        const existing = matches.get(playerId);
        if (existing) existing.detail = TEAM_DEFENSE_RETURN;
        else matches.set(playerId, { playerId, role: 'team_defense', textPos: -1, detail: TEAM_DEFENSE_RETURN });
      });
      const coverage = defensiveActors.filter((actor) => actor.role === PLAY_ROLES.TACKLER);
      if (coverage.length === 1) {
        nameIndex.teamDefenseIds?.get?.(play.offenseTeamAbbr)?.forEach((playerId) => {
          if (!matches.has(playerId)) matches.set(playerId, { playerId, role: 'team_defense', textPos: -1, detail: TEAM_DEFENSE_COVERAGE });
        });
      }
    }
  }

  actors.forEach((actor, textPos) => {
    const record = lookupPlayerByName(nameIndex, actor.name, {
      team: getTeamAbbr(actor.team) || getActorExpectedTeam(play, actor.role, kickReturn),
      normalize: normalizeStarterName,
    });
    const playerId = getIndexedPlayerId(nameIndex, record);
    if (!playerId) return;
    const role = getFantasyRoleForActor(actor.role, record, play);
    if (!role) return;
    const existing = matches.get(playerId);
    if (existing) {
      if (role === 'defense' && !existing.attributionRoles.includes(actor.role)) {
        existing.attributionRoles.push(actor.role);
      }
      return;
    }
    matches.set(playerId, {
      playerId,
      role,
      textPos,
      detail: actor.detail ?? null,
      attributionRoles: role === 'defense' ? [actor.role] : [],
    });
  });

  // A successful two-point try in the same row: its passer, receiver, or
  // rusher is credited for the try, on top of any part in the touchdown.
  const conversion = play?.narrative?.conversion;
  if (conversion?.good === true) {
    conversion.actors.forEach((actor, index) => {
      const record = lookupPlayerByName(nameIndex, actor.name, {
        team: play.offenseTeamAbbr,
        normalize: normalizeStarterName,
      });
      const playerId = getIndexedPlayerId(nameIndex, record);
      const role = playerId ? getFantasyRoleForActor(actor.role, record, play) : null;
      if (!role) return;
      const existing = matches.get(playerId);
      if (existing) existing.conversion = { role, only: false };
      else {
        matches.set(playerId, {
          playerId,
          role,
          textPos: actors.length + index,
          detail: null,
          attributionRoles: [],
          conversion: { role, only: true },
        });
      }
    });
  }

  return [...matches.values()].sort((left, right) => left.textPos - right.textPos);
}

// Who fumbled, and whether the other side came up with it. A fumble is charged
// to that player's own involvement in the play (the sack, the run, the catch,
// the return) rather than inferred from the word "fumble" in the sentence.
function withFumbleCredit(matches, play, nameIndex) {
  const fumble = parseFumbleCredit(play?.raw?.text ?? play?.description);
  if (!fumble?.fumbledBy) return matches;
  const record = lookupPlayerByName(nameIndex, fumble.fumbledBy, {
    team: isKickReturnPlay(play) ? play.defenseTeamAbbr : play.offenseTeamAbbr,
    normalize: normalizeStarterName,
  });
  const playerId = getIndexedPlayerId(nameIndex, record);
  return matches.map((match) => (
    match.playerId === playerId && ['passer', 'rusher', 'receiver', 'returner'].includes(match.role)
      ? { ...match, fumble: { lost: Boolean(fumble.recoveredByTeam && record.team && fumble.recoveredByTeam !== record.team) } }
      : match
  ));
}

/**
 * Returns [{ playerId, role }] for starters involved in the play.
 * Roles: passer | receiver | rusher | returner | kicker | defense | team_defense.
 */
export function matchPlayToStarters(play, nameIndex) {
  const narrativeMatches = matchNarrativeActors(play, nameIndex);
  if (play?.narrative?.confident && narrativeMatches) return withFumbleCredit(narrativeMatches, play, nameIndex);

  const { index, meta, teamDefenseIds } = nameIndex;
  // A touchdown row can carry its two-point try. That try's players are not
  // part of the touchdown, so the scan stops where the try begins.
  const normalizedDesc = ` ${normalizeStarterName(String(play.description ?? '').split(/two.?point conversion attempt/i)[0])} `;
  const type = play.type;
  // Gamebook passes read "pass short right to ..." / "pass deep left to ...",
  // and a catch-and-fumble row is typed as the fumble, not the pass.
  const isPass = type.includes('pass') || /\bpass (?:complete|incomplete|to|short|deep)\b/i.test(play.description);
  const isKick = type.includes('field') || type.includes('extra') || /field goal|extra point|\bPAT\b/i.test(play.description);
  const isReturnPlay = type.includes('punt') || type.includes('kickoff')
    || /punt|kickoff|return(?:ed)? for|fair catch by/i.test(play.description);
  const matches = new Map(); // playerId -> position in text

  (narrativeMatches ?? []).forEach((match) => matches.set(match.playerId, match));

  const teamDefenseMatches = teamDefenseIds?.get?.(play.defenseTeamAbbr);
  if (teamDefenseMatches && isTeamDefenseScoringPlay(play)) {
    teamDefenseMatches.forEach((playerId) => {
      if (!matches.has(playerId)) matches.set(playerId, -1);
    });
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
      if (existing == null || (typeof existing === 'number' && at < existing)) matches.set(playerId, at);
    });
  });

  const isSack = /sack/i.test(play.description);

  return withFumbleCredit([...matches.entries()]
    .sort((left, right) => {
      const leftPos = typeof left[1] === 'number' ? left[1] : left[1].textPos;
      const rightPos = typeof right[1] === 'number' ? right[1] : right[1].textPos;
      return leftPos - rightPos;
    })
    .map(([playerId, match]) => {
      if (typeof match === 'object') return match;
      const textPos = match;
      const playerMeta = meta.get(playerId) ?? {};
      let role = 'rusher';
      if (isKick && playerMeta.position === 'K') role = 'kicker';
      else if (isTeamDefensePosition(playerMeta.position)) role = 'team_defense';
      else if (isDefensivePosition(playerMeta.position)) role = 'defense';
      else if (isReturnPlay && ['K', 'P'].includes(playerMeta.position)) role = 'punter';
      else if (isReturnPlay && !['K', 'P'].includes(playerMeta.position)) role = 'returner';
      else if (isPass) role = PASSER_POSITIONS.has(playerMeta.position) ? 'passer' : 'receiver';
      else if (isSack && PASSER_POSITIONS.has(playerMeta.position)) role = 'passer';
      return { playerId, role, textPos, detail: null, attributionRoles: [] };
    }), play, nameIndex);
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
 * On a punt or kickoff, BDL's `team` names the RECEIVING side — whoever ends
 * up with the ball — so the resolved offense is the kicking team and the
 * resolved defense is the returning team (see `resolveOffenseDefenseTeams`).
 * The returner is therefore checked against the defense and the kicker/punter
 * against the offense. Everything else (passer, rusher, receiver, kicker,
 * punter) is checked against the resolved offense. Defensive positions never
 * reach this fallback at all — `matchPlayToStarters` skips them, so kick
 * coverage tacklers are routed by `getActorExpectedTeam` instead.
 */
function getExpectedCandidateTeam(play, playerMeta, isReturnPlay) {
  const position = playerMeta?.position;
  if (isReturnPlay && !['K', 'P'].includes(position)) return play.defenseTeamAbbr ?? null;
  return play.offenseTeamAbbr ?? play.teamAbbr ?? null;
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
// Single-game threshold bonuses. A stat line reports them as flags, so the play
// that carries a player across the line earns the bonus (and a play that drops
// them back under, a negative run say, gives it back). Without this the bonus
// only reached the feed as a residual on whichever play happened to be last.
const MILESTONE_BONUSES = [
  ['bonus_pass_yd_300', (s) => s.pass_yd, 300],
  ['bonus_pass_yd_400', (s) => s.pass_yd, 400],
  ['bonus_pass_cmp_25', (s) => s.pass_cmp, 25],
  ['bonus_rush_yd_100', (s) => s.rush_yd, 100],
  ['bonus_rush_yd_200', (s) => s.rush_yd, 200],
  ['bonus_rush_att_20', (s) => s.rush_att, 20],
  ['bonus_rec_yd_100', (s) => s.rec_yd, 100],
  ['bonus_rec_yd_200', (s) => s.rec_yd, 200],
  ['bonus_rush_rec_yd_100', (s) => s.rush_yd + s.rec_yd, 100],
  ['bonus_rush_rec_yd_200', (s) => s.rush_yd + s.rec_yd, 200],
  ['bonus_sack_2p', (s) => s.idp_sack, 2],
  ['bonus_tkl_10p', (s) => s.idp_tkl, 10],
  ['idp_pass_def_3p', (s) => s.idp_pd, 3],
];
const MILESTONE_STATS = ['pass_yd', 'pass_cmp', 'rush_yd', 'rush_att', 'rec_yd', 'idp_sack', 'idp_tkl', 'idp_pd'];

function crossedMilestones(before, after) {
  const crossed = {};
  MILESTONE_BONUSES.forEach(([key, read, threshold]) => {
    const change = Number(read(after) >= threshold) - Number(read(before) >= threshold);
    if (change) crossed[key] = change;
  });
  return crossed;
}

/**
 * The sentence for one credited player. A touchdown row also carries the extra
 * point, and the kicker credited from it must not be shown the scorer's run or
 * catch.
 */
export function describePlayForRole(play, role) {
  const extraPoint = play?.narrative?.extraPoint;
  if (role === 'kicker' && extraPoint?.sentence) return extraPoint.sentence;
  return play?.description ?? '';
}

export function buildPlayEvents(playsByGame, nameIndex, scoringSettings, positionsById, gamesById) {
  const events = [];
  const milestoneTotals = new Map();
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
      // One shared rule for who ran the snap — see
      // `playByPlay/normalizePlay.js`. It is wider than Fantasy Live's old
      // interception/opponent-fumble test: kickoffs, punts, missed or blocked
      // field goals, and turnovers on downs now flip too, matching Statistics
      // Scores' drive grouping and field graphics.
      const { offenseTeam, defenseTeam } = resolveOffenseDefenseTeams(play, {
        homeTeam: context.homeTeam,
        awayTeam: context.awayTeam,
        normalizeTeam: getTeamAbbr,
      });
      play.defenseTeamAbbr = defenseTeam;
      play.offenseTeamAbbr = offenseTeam;
      matchPlayToStarters(play, nameIndex).forEach(({ playerId, role, detail, attributionRoles, conversion, fumble }) => {
        const position = positionsById.get(playerId) ?? 'FLEX';
        const credit = { conversion, fumble };
        const statDelta = buildPlayStatDelta(play, role, detail, attributionRoles, credit);
        let pts = estimatePlayPoints(play, role, position, scoringSettings, detail, attributionRoles, credit);
        // Running game totals, kept even for plays worth nothing on their own
        // (a no-gain carry still counts toward 20 carries).
        const totalsKey = `${gameId}:${playerId}`;
        const before = milestoneTotals.get(totalsKey)
          ?? Object.fromEntries(MILESTONE_STATS.map((key) => [key, 0]));
        const after = { ...before };
        MILESTONE_STATS.forEach((key) => { after[key] += Number(statDelta[key]) || 0; });
        milestoneTotals.set(totalsKey, after);
        Object.entries(crossedMilestones(before, after)).forEach(([key, change]) => {
          const bonus = calcPoints({ [key]: 1 }, scoringSettings, position);
          if (!bonus) return;
          statDelta[key] = change;
          pts = Math.round((pts + change * bonus) * 100) / 100;
        });
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
          role,
          ...classification,
          desc: describePlayForRole(play, role),
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

const SHARED_KIND_PRIORITY = ['td', 'to', 'fg', 'xp'];

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function describeSharedPlay(primary, contributors) {
  const description = primary.play?.description ?? primary.desc;
  const extraPoint = primary.play?.narrative?.extraPoint;
  if (!extraPoint || !contributors.some((contributor) => contributor.role === 'kicker')) return description;
  return `${description} ${extraPoint.kicker} ${extraPoint.good ? 'made' : 'missed'} the extra point.`.replace(/\.\.+/g, '.');
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
        role: event.role,
        desc: event.desc,
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
        adjustmentParts: event.adjustmentParts,
        displayPts: event.displayPts,
        status: event.status,
        confirmedBy: event.confirmedBy,
      }));
      if (!rest.length) {
        return {
          ...primary,
          // Use the shared-snap identity even before every same-side contributor
          // has arrived. The row therefore keeps its selection/chart identity
          // when a later replay snapshot adds the receiver to the quarterback's
          // already-visible play (or vice versa).
          id: `shared-${primary.sharedPlayId}-${group.sideKey}`,
          contributorIds: [primary.playerId],
          contributors,
        };
      }
      const sum = (read) => round2(group.events.reduce((total, event) => total + (Number(read(event)) || 0), 0));
      const reconciled = group.events.some((event) => event.rawPts !== undefined);
      return {
        ...primary,
        id: `shared-${primary.sharedPlayId}-${group.sideKey}`,
        // The snap's own sentence. A kicker credited from a touchdown row
        // carries an extra-point sentence of their own (describePlayForRole),
        // so a primary kicker must not stand in for the whole play.
        desc: describeSharedPlay(primary, contributors),
        pts: sum((event) => event.pts),
        ...(reconciled ? {
          rawPts: sum((event) => event.rawPts ?? (Number(event.pts) || 0) - (Number(event.adjustment) || 0)),
          adjustment: sum((event) => event.adjustment),
        } : {}),
        ...(group.events.some((event) => event.displayPts !== undefined)
          ? { displayPts: sum((event) => event.displayPts ?? event.pts) }
          : {}),
        // The most telling contributor kind names the row: a touchdown pass
        // reads as a touchdown even when the quarterback came first.
        kind: SHARED_KIND_PRIORITY.find((kind) => contributors.some((contributor) => contributor.kind === kind))
          ?? primary.kind,
        status: group.events.some((event) => event.status === 'pending') ? 'pending' : primary.status,
        contributorIds: contributors.map((contributor) => contributor.playerId),
        contributors,
      };
    });
}
