// attributePlayActors.js — the single owner of "which rostered player is this
// named actor?" for BALLDONTLIE play-by-play.
//
// Fantasy Live (livePlaysFeed.js) and Statistics Scores
// (statisticsPlayerQuarterStats.js) both credit named actors to roster rows.
// They used to each own a matcher, and the Scores copy drifted: it sent
// kick-coverage tacklers to the receiving roster, sent an interception
// returner's tackler to the intercepting roster, ignored a provider
// `defense_team`, and fell back to a league-wide name match when the team
// check failed. This module is the one rule; each surface keeps only what it
// does with a match (Fantasy: starter roles and pricing; Scores: quarter
// buckets and team tallies).
//
// See docs/Play-By-Play Normalization.md ("Actor attribution").

import { PLAY_ROLES, parseFumbleCredit, parseTacklers } from '../nflPlays/playNarrative.js';
import { lookupPlayerByName, normalizePlayerName } from '../nflPlays/playerNameIndex.js';
import { isKickReturnPlay } from './normalizePlay.js';

/** Roles that always belong to the side that ran the play. */
export const NARRATIVE_OFFENSIVE_ROLES = Object.freeze([
  PLAY_ROLES.PASSER,
  PLAY_ROLES.RECEIVER,
  PLAY_ROLES.RUSHER,
  PLAY_ROLES.KICKER,
  PLAY_ROLES.PUNTER,
  PLAY_ROLES.FUMBLER,
]);

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** The official gamebook text, from a Fantasy feed play (`raw.text`) or a Scores play (`rawText`). */
export function readPlayRawText(play) {
  return String(play?.raw?.text ?? play?.rawText ?? '');
}

/** Lower-cased play type, from either surface's play shape. */
function readPlayType(play) {
  return String(firstString(play?.type, play?.typeSlug) ?? '').toLowerCase();
}

/** The provider's possession team: whoever holds the ball when the play ends. */
function readPossessionTeam(play) {
  return firstString(play?.teamAbbr, play?.team?.abbreviation, play?.team, play?.raw?.team?.abbreviation, play?.raw?.team);
}

/**
 * A tackler named only in the return after the defense recovered a fumble:
 * the original offense chasing the ball back ("RECOVERED by PHI-Q.Mitchell …
 * Q.Mitchell to PHI 16 for 6 yards (D.Prescott)").
 */
function isLostFumbleReturnTackler(play, name, offenseTeam, normalizeTeam) {
  const text = readPlayRawText(play);
  const at = text.search(/\bRECOVERED by\b/i);
  if (at < 0 || !name || !offenseTeam) return false;
  const recoveredBy = normalizeTeam(parseFumbleCredit(text)?.recoveredByTeam) || null;
  if (!recoveredBy || recoveredBy === offenseTeam) return false;
  return parseTacklers(text.slice(at)).includes(name) && !parseTacklers(text.slice(0, at)).includes(name);
}

/**
 * The roster a named actor must belong to before they can be attributed.
 *
 * `offenseTeam` / `defenseTeam` are the resolved sides (see
 * `resolveOffenseDefenseTeams`), never the raw provider `team`: on a kick or a
 * turnover BDL's `team` names whoever ends up with the ball.
 *
 * A kick splits the defensive-sounding roles across opposite sidelines: the
 * returner belongs to the receiving team (the resolved defense) while the
 * coverage players who bring him down belong to the kicking team (the resolved
 * offense). An interception returner is stopped by the team that threw.
 *
 * A recoverer with no team in the text is checked against the possession
 * team, the side that ended up with the ball — which is the recoverer's side
 * on a lost fumble, an own recovery, and a kick recovery alike. A tackler
 * named only in a lost fumble's return clause is the original offense.
 *
 * `actorSide` is the side of the snap the parser placed the actor on when
 * several turnovers make the role alone ambiguous (`parseTurnoverChain`): the
 * tight end who strips an interception returner, or the kicker of the extra
 * point after a defensive touchdown. It wins over the role.
 */
export function getActorExpectedTeam(play, actorRole, {
  offenseTeam = null,
  defenseTeam = null,
  possessionTeam = null,
  kickReturn = isKickReturnPlay(play),
  actorName = null,
  actorSide = null,
  normalizeTeam = (value) => value ?? null,
} = {}) {
  if (actorSide === 'offense') return offenseTeam;
  if (actorSide === 'defense') return defenseTeam;
  if (NARRATIVE_OFFENSIVE_ROLES.includes(actorRole)) return offenseTeam;
  // A blocked kick is the blocking side's play: the blocker and whoever
  // scoops the ball belong to the team that was receiving the kick.
  if (actorRole === PLAY_ROLES.KICK_BLOCKER || /blocked/.test(readPlayType(play))) return defenseTeam;
  if (actorRole === PLAY_ROLES.RETURNER) return defenseTeam;
  if (actorRole === PLAY_ROLES.TACKLER && /intercept/i.test(readPlayRawText(play))) return offenseTeam;
  if (actorRole === PLAY_ROLES.TACKLER && isLostFumbleReturnTackler(play, actorName, offenseTeam, normalizeTeam)) return offenseTeam;
  if (actorRole === PLAY_ROLES.RECOVERER && possessionTeam) return possessionTeam;
  return kickReturn ? offenseTeam : defenseTeam;
}

function surnameOf(name) {
  const tokens = String(name ?? '').split(' ').filter((token) => !/^(?:jr|sr|ii|iii|iv|v)\.?$/i.test(token));
  return tokens.length > 1 ? tokens.at(-1) : null;
}

/** The id under which `record` is indexed (`buildPlayerNameIndex` meta). */
export function getIndexedPlayerId(nameIndex, record) {
  if (!record) return null;
  if (record.id != null && nameIndex?.meta?.get?.(record.id) === record) return record.id;
  return [...(nameIndex?.meta?.entries?.() ?? [])].find(([, candidate]) => candidate === record)?.[0] ?? null;
}

/**
 * One name against the index on one team. A full name the roster spells
 * differently (a nickname: "Bam Knight" for Zonovan Knight) falls back to the
 * surname on that team when `surnameFallback` is on and no other indexed
 * player there shares it. Never a cross-team fallback: with a team supplied,
 * a name that does not resolve on it stays unmatched.
 */
export function lookupActor(nameIndex, actor, team, { normalize = normalizePlayerName, surnameFallback = false, prefer = null } = {}) {
  const name = typeof actor === 'string' ? actor : actor?.name;
  if (!name) return null;
  const record = lookupPlayerByName(nameIndex, name, { team: team || null, normalize, prefer });
  // The gamebook abbreviates a defender's legal first name, which a roster may
  // not carry: "T.Woolen" is Riq Woolen, "A.Phillips" Dru Phillips, "A.Gardner"
  // Sauce Gardner, "B.Okoye" C.J. Okoye. A defensive credit that resolves to
  // nobody on its team is the one defender there with that surname. Weeks
  // 1–10 of 2026: 127 credits, and every affected stat line then matches
  // Sleeper's.
  if (!record && surnameFallback && actor?.abbreviated && DEFENSIVE_CREDIT_ROLES.has(actor?.role)) {
    const alias = teammateBySurname(nameIndex, String(name).split('.').slice(1).join('.').trim(), team, normalize);
    if (alias && DEFENSIVE_POSITIONS.has(String(alias.position ?? '').toUpperCase())) return alias;
  }
  if (record || !surnameFallback || actor?.abbreviated) return record;
  const surname = surnameOf(name);
  const fallback = surname
    ? lookupPlayerByName(nameIndex, surname, { team: team || null, normalize, prefer }) ?? teammateBySurname(nameIndex, surname, team, normalize)
    : null;
  // A nickname is the same player under another first name, never a defender
  // standing in for a ball carrier: "Kendre Miller" (a running back no longer
  // on the roster) fell back to NO defensive tackle Christen Miller, who was
  // credited 38 carries over weeks 5–7 of 2026 (Sleeper: none).
  if (fallback && OFFENSIVE_ACTOR_ROLES.has(actor?.role)
    && DEFENSIVE_POSITIONS.has(String(fallback.position ?? '').toUpperCase())) return null;
  // The direct lookup already turned down a teammate whose first name shares
  // the initial but differs ("Jimmy Horn Jr." is not CAR's Jaycee Horn: W1 CHI
  // at CAR, where he was charged the returner's muff). A nickname spells a
  // different first name altogether ("Bam" Knight, "Hollywood" Brown).
  const given = normalize(name).split(' ').filter(Boolean)[0] ?? '';
  const found = String(fallback?.normalizedName ?? '').split(' ').filter(Boolean)[0] ?? '';
  if (fallback && given.length > 1 && found && given[0] === found[0] && given !== found) return null;
  return fallback;
}

const OFFENSIVE_ACTOR_ROLES = new Set([PLAY_ROLES.PASSER, PLAY_ROLES.RUSHER, PLAY_ROLES.RECEIVER]);

// The index drops a bare surname that several players league-wide share
// ("brown"), so a nickname with a common surname ("Hollywood Brown" for PHI's
// Marquise Brown, W7–W8 of 2026: 4 catches in Sleeper's lines, none credited)
// is looked up on the one team: the only player there with that surname.
function teammateBySurname(nameIndex, surname, team, normalize) {
  if (!team || !nameIndex?.meta) return null;
  const wanted = normalize(surname).split(' ').filter(Boolean).at(-1);
  if (!wanted) return null;
  const found = [...nameIndex.meta.values()].filter((record) => record?.team === team
    && String(record.normalizedName ?? '').split(' ').filter(Boolean).at(-1) === wanted);
  return found.length === 1 ? found[0] : null;
}

const DEFENSIVE_CREDIT_ROLES = new Set([
  PLAY_ROLES.SACKER, PLAY_ROLES.INTERCEPTER, PLAY_ROLES.FORCER, PLAY_ROLES.RECOVERER, PLAY_ROLES.TACKLER,
  PLAY_ROLES.PASS_DEFENDER, PLAY_ROLES.QB_HITTER, PLAY_ROLES.SAFETY, PLAY_ROLES.KICK_BLOCKER,
]);
const DEFENSIVE_POSITIONS = new Set(['DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S', 'SS', 'FS']);

/**
 * A defensive credit on the snap's defense, away from a kick, belongs to a
 * defender: when an abbreviated name fits two teammates and only one plays
 * defense, it is that one (2026 weeks 6, 8–10: "D.Williams" is BUF linebacker
 * Dorian Williams in Sleeper's lines, never tackle Daryl Williams; "D.Key" is
 * DEN safety Devon Key, not receiver Dane Key).
 */
function preferDefender(play, actorRole, expectedTeam, defenseTeam, kickReturn) {
  if (!DEFENSIVE_CREDIT_ROLES.has(actorRole) || kickReturn || !expectedTeam || expectedTeam !== defenseTeam) return null;
  if (/kickoff|punt/.test(readPlayType(play))) return null;
  return (record) => DEFENSIVE_POSITIONS.has(String(record?.position ?? '').toUpperCase());
}

/**
 * The actors a play names, in text order: the confident narrative's actors,
 * then (optionally) the gamebook's explicit defensive credits that the
 * narrative did not already list, then any caller-supplied extras.
 */
export function collectPlayActors(play, {
  narrative = play?.narrative ?? null,
  defensiveActors = play?.defensiveActors ?? null,
  includeDefensiveActors = true,
  extraActors = [],
  normalize = normalizePlayerName,
} = {}) {
  const actors = narrative?.confident && Array.isArray(narrative.actors) ? [...narrative.actors] : [];
  if (includeDefensiveActors && Array.isArray(defensiveActors)) {
    defensiveActors.forEach((actor) => {
      const duplicate = actors.some((candidate) => (
        candidate.role === actor.role && normalize(candidate.name) === normalize(actor.name)
      ));
      if (!duplicate) actors.push(actor);
    });
  }
  (extraActors ?? []).forEach((actor) => { if (actor?.name) actors.push(actor); });
  return actors;
}

/**
 * Every named actor on a play with the roster record it resolves to.
 *
 * Returns `[{ actor, textPos, expectedTeam, record, playerId }]`, one per
 * actor, in text order; `record`/`playerId` are null when the name does not
 * resolve to exactly one indexed player on the expected team. Callers decide
 * what a match is worth.
 *
 * `offenseTeam` / `defenseTeam` default to the play's own resolved sides
 * (`play.offenseTeamAbbr` on a Fantasy feed play, `play.offenseTeam` on a
 * Scores play). `normalizeTeam` must match the index's team spelling.
 */
export function attributePlayActors(play, nameIndex, {
  actors = null,
  offenseTeam = play?.offenseTeamAbbr ?? play?.offenseTeam ?? null,
  defenseTeam = play?.defenseTeamAbbr ?? play?.defenseTeam ?? null,
  normalize = normalizePlayerName,
  normalizeTeam = (value) => value ?? null,
  surnameFallback = false,
  ...collectOptions
} = {}) {
  const list = actors ?? collectPlayActors(play, { normalize, ...collectOptions });
  const sides = {
    offenseTeam: normalizeTeam(offenseTeam) || null,
    defenseTeam: normalizeTeam(defenseTeam) || null,
    possessionTeam: normalizeTeam(readPossessionTeam(play)) || null,
    kickReturn: isKickReturnPlay(play),
    normalizeTeam,
  };
  return list.map((actor, textPos) => {
    const expectedTeam = normalizeTeam(actor.team)
      || getActorExpectedTeam(play, actor.role, { ...sides, actorName: actor.name, actorSide: actor.side ?? null });
    const prefer = preferDefender(play, actor.role, expectedTeam, sides.defenseTeam, sides.kickReturn);
    const record = lookupActor(nameIndex, actor, expectedTeam, { normalize, surnameFallback, prefer });
    return { actor, textPos, expectedTeam, record, playerId: getIndexedPlayerId(nameIndex, record) };
  });
}
