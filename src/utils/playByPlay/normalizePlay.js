// normalizePlay.js — the single semantic normalizer for BALLDONTLIE NFL
// play-by-play rows.
//
// Statistics Scores (balldontlieNflScoreboard.js) and Fantasy Live
// (livePlaysFeed.js) both read the same provider rows and used to each own a
// private normalizer. They disagreed — on which team ran the play, on whether a
// description-less row existed at all — and the disagreement was invisible
// until two surfaces described the same snap differently.
//
// This module owns provider-shape semantics only. It returns one canonical
// object for EVERY raw row and never drops a play: presentation defaults
// ("Play unavailable"), fantasy-relevance filters (pts === 0), and
// description-less drops are consumer choices that stay in the callers.
//
// See docs/Play-By-Play Normalization.md.

import { parsePlayNarrative } from '../nflPlays/playNarrative.js';
import { getOffenseTeam, isKickPossessionPlay } from '../nflPlays/fieldGeometry.js';

export {
  PLAY_MATCH_STATS,
  buildPlayStatDelta,
  buildTeamDefensePlayDelta,
  estimatePlayPoints,
  extractReturnYards,
  extractYardsFromText,
  getPlayEventClassification,
  isFirstDownPlay,
  isTeamDefenseScoringPlay,
} from './playStatDelta.js';

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function firstFinite(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
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

function isReported(value) {
  return value !== null && value !== undefined && value !== '';
}

/** Statistics Scores' `asNumberOrNull`: unreported stays null, never 0. */
function asNumberOrNull(value) {
  if (!isReported(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readPossessionTeam(row) {
  return firstString(row?.team?.abbreviation, row?.possession_team, row?.team);
}

function readProviderDefenseTeam(row) {
  return firstString(
    row?.defense_team?.abbreviation,
    row?.defense_team,
    row?.defensive_team,
  );
}

/**
 * The geometry fields `getOffenseTeam` reads, from either a canonical play or a
 * raw provider row. Canonical fields win; a raw row is read through `play.raw`
 * so a consumer-shaped play (Fantasy Live's feed play, which flattens most of
 * this away) still resolves correctly.
 */
function readGeometryFields(play) {
  const raw = play?.raw ?? null;
  const pick = (own, rawKey) => (play?.[own] !== undefined && play?.[own] !== null
    ? play[own]
    : raw?.[rawKey]);
  return {
    team: play?.team ?? readPossessionTeam(raw ?? play),
    // Wider than `canonical.typeSlug`, which feeds `parsePlayNarrative()` and
    // must stay the provider's slug. Some rows carry only `type_text`
    // ("Interception Return Touchdown"); reading the slug alone left those
    // unflipped and credited a pick-six to the wrong side.
    typeSlug: play?.typeSlug
      ?? firstString(raw?.type_slug, raw?.type_abbreviation, raw?.type_text, raw?.play_type, raw?.type),
    // Always the provider's own flag, never a text-inferred reading. Fantasy
    // Live's feed play carries `scoring: scoringInferred`, and letting that
    // through would make `isTurnoverOnDowns` answer differently for the two
    // consumers on the same row.
    scoring: raw ? firstBoolean(raw.scoring_play, raw.touchdown) : (play?.scoring ?? null),
    statYardage: asNumberOrNull(pick('statYardage', 'stat_yardage')),
    startDown: asNumberOrNull(pick('startDown', 'start_down')),
    startDistance: asNumberOrNull(pick('startDistance', 'start_distance')),
    endDown: asNumberOrNull(pick('endDown', 'end_down')),
  };
}

/**
 * A kick whose provider `team` names the RECEIVING side.
 *
 * On a kickoff, punt, or missed/blocked field goal the kicking team is the
 * resolved offense and fields the coverage unit, while the receiving team is
 * the resolved defense and fields the returner. Callers that attribute named
 * players need both halves of that, not just the possession flip.
 */
export function isKickReturnPlay(play) {
  return isKickPossessionPlay({ typeSlug: readGeometryFields(play).typeSlug });
}

function otherTeam(team, awayTeam, homeTeam) {
  if (!team) return null;
  if (team === awayTeam) return homeTeam ?? null;
  if (team === homeTeam) return awayTeam ?? null;
  return null;
}

/**
 * Who ran the play and who defended it.
 *
 * BALLDONTLIE's `team` names whoever holds the ball when the play is over, so
 * on a kick or a turnover it names the receiving side. The correction lives in
 * `nflPlays/fieldGeometry.js` (`getOffenseTeam`, via `isPossessionChangingPlay`
 * and `isTurnoverOnDowns`) and is not restated here.
 *
 * Order:
 *   1. An explicit provider `defense_team` wins outright — it is the only field
 *      that states the answer rather than implying it.
 *   2. Otherwise the shared field-geometry rule decides, which covers kickoffs,
 *      punts, missed/blocked field goals, interceptions, opponent-recovered
 *      fumbles, and turnovers on downs.
 *
 * `normalizeTeam` lets a caller apply its own abbreviation aliasing (Fantasy
 * Live passes `getTeamAbbr`) so the comparison against home/away is like-for-like.
 */
export function resolveOffenseDefenseTeams(play, {
  homeTeam = null,
  awayTeam = null,
  normalizeTeam = (value) => value ?? null,
} = {}) {
  const geometry = readGeometryFields(play);
  const home = normalizeTeam(homeTeam) || null;
  const away = normalizeTeam(awayTeam) || null;
  const team = normalizeTeam(geometry.team) || null;

  const providerDefense = normalizeTeam(readProviderDefenseTeam(play?.raw ?? play)) || null;
  if (providerDefense) {
    return {
      offenseTeam: otherTeam(providerDefense, away, home),
      defenseTeam: providerDefense,
    };
  }

  const offenseTeam = normalizeTeam(
    getOffenseTeam({ ...geometry, team }, { homeTeam: home, awayTeam: away }),
  ) || null;
  return { offenseTeam, defenseTeam: otherTeam(offenseTeam, away, home) };
}

/**
 * One canonical play object per raw provider row.
 *
 * Returns null only for a null/undefined row. A row with no description, no
 * type, or no fantasy relevance still produces an object — dropping plays is a
 * consumer decision, and the two consumers make different ones.
 */
export function normalizeCanonicalPlay(raw, {
  gameId = null,
  homeTeam = null,
  awayTeam = null,
  inferredPasserName = null,
  normalizeTeam = (value) => value ?? null,
} = {}) {
  if (!raw) return null;

  const rawDescription = firstString(raw.text, raw.description, raw.short_text, raw.desc);
  const shortText = firstString(raw.short_text);
  const typeSlug = firstString(raw.type_slug, raw.type_abbreviation);
  const team = readPossessionTeam(raw);

  // Statistics Scores already turns BDL's compact `short_text` plus official
  // gamebook text into a plain-language sentence. Parsing here means every
  // surface (drive list, feed, replay header, chart tooltip, player sheet)
  // reads the same way. Unknown provider shapes stay unconfident and callers
  // fall back to the official description rather than a guess.
  const narrative = parsePlayNarrative({
    typeSlug,
    shortText,
    rawText: rawDescription,
    description: rawDescription,
    statYardage: firstFinite(raw.stat_yardage, raw.yards_gained, raw.yards, raw.net_yards),
  });

  const scoring = firstBoolean(raw.scoring_play, raw.touchdown);
  const wallclockMs = Date.parse(raw.wallclock ?? '');

  const canonical = {
    id: raw.id ?? `${gameId}-${raw.sequence ?? rawDescription?.slice(0, 24) ?? ''}`,
    gameId,
    period: firstFinite(raw.period, raw.quarter),
    clock: firstString(raw.clock_display, raw.clock, raw.time),
    wallclock: Number.isFinite(wallclockMs) ? wallclockMs : null,

    typeSlug,
    typeDisplay: firstString(raw.type_text, raw.type_abbreviation, raw.type_slug),

    rawDescription,
    shortText,
    narrative: narrative?.confident ? narrative : null,

    team,
    offenseTeam: null,
    defenseTeam: null,

    // Structured geometry carried through for the play narrative parser and the
    // field/win-probability visuals. `*_yards_to_endzone`, `end_down_distance_text`,
    // and `end_possession_text` are absent from BALLDONTLIE's published OpenAPI
    // spec but present on every live play row, so every consumer tolerates null.
    startDown: asNumberOrNull(raw.start_down),
    startDistance: asNumberOrNull(raw.start_distance),
    endDown: asNumberOrNull(raw.end_down),
    endDistance: asNumberOrNull(raw.end_distance),
    startYardsToEndzone: asNumberOrNull(raw.start_yards_to_endzone),
    endYardsToEndzone: asNumberOrNull(raw.end_yards_to_endzone),
    // Absolute yard lines, measured from the home goal line. Unlike the
    // `*_yards_to_endzone` pair above these never change frame, so the field
    // graphics read position from them first.
    startYardLine: asNumberOrNull(raw.start_yard_line),
    endYardLine: asNumberOrNull(raw.end_yard_line),
    startPossessionText: firstString(raw.start_possession_text),
    endPossessionText: firstString(raw.end_possession_text),
    endDownDistanceText: firstString(raw.end_down_distance_text),
    statYardage: asNumberOrNull(raw.stat_yardage),
    homeWinProbability: asNumberOrNull(raw.home_win_probability),

    yards: firstFinite(raw.yards_gained, raw.yards, raw.net_yards, raw.stat_yardage),
    awayScore: firstFinite(raw.away_score, raw.visitor_score, raw.visitor_team_score),
    homeScore: firstFinite(raw.home_score, raw.home_team_score),

    scoring,
    // A provider row can omit the flag on a snap whose own sentence says it
    // scored. Fantasy Live has always read that fallback; Statistics Scores
    // deliberately does not, so both readings stay available side by side.
    scoringInferred: scoring ?? /touchdown|field goal is good/i.test(rawDescription ?? ''),

    // GridShift may recover the passer on a provider summary-only pick-six from
    // earlier, positively identified passes in the same possession. This is
    // app-owned context, never presented as a provider-supplied field.
    inferredPasserName: inferredPasserName ?? firstString(raw.gridshift_inferred_passer_name),

    // The provider row, kept intact. Normalization deliberately flattens shape
    // away; the field visual and the replay still need the original.
    raw: inferredPasserName
      ? { ...raw, gridshift_inferred_passer_name: inferredPasserName }
      : raw,
  };

  const { offenseTeam, defenseTeam } = resolveOffenseDefenseTeams(canonical, {
    homeTeam,
    awayTeam,
    normalizeTeam,
  });
  canonical.offenseTeam = offenseTeam;
  canonical.defenseTeam = defenseTeam;
  return canonical;
}
