// Context that can only be recovered by reading consecutive plays together.
// Keep it shared so Statistics Scores and Fantasy Live do not disagree about
// the same provider possession.

import { canonicalTeam } from './fieldGeometry.js';
import { parsePlayNarrative, PLAY_ROLES } from './playNarrative.js';

function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? null;
}

function firstFinite(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function playType(play) {
  return firstString(play?.typeSlug, play?.type, play?.type_slug, play?.type_text, play?.type_abbreviation)
    ?.toLowerCase() ?? '';
}

function playTeam(play) {
  return canonicalTeam(firstString(
    play?.teamAbbr,
    play?.team?.abbreviation,
    play?.team?.id,
    play?.team,
  ));
}

function playPeriod(play) {
  return firstFinite(play?.period, play?.quarter);
}

function narrativeFor(play) {
  if (play?.narrative?.confident) return play.narrative;
  return parsePlayNarrative({
    typeSlug: playType(play),
    shortText: firstString(play?.shortText, play?.short_text),
    rawText: firstString(play?.rawText, play?.text, play?.description, play?.short_text),
    description: firstString(play?.description, play?.text, play?.shortText, play?.short_text),
    statYardage: firstFinite(play?.statYardage, play?.stat_yardage, play?.yards),
  });
}

function otherTeam(team, { homeTeam, awayTeam }) {
  const home = canonicalTeam(homeTeam);
  const away = canonicalTeam(awayTeam);
  if (!team || !home || !away) return null;
  if (team === home) return away;
  if (team === away) return home;
  return null;
}

function isPossessionBoundary(type) {
  return /kickoff|punt|field.?goal|interception/.test(type)
    || (/fumble/.test(type) && /opp|opponent/.test(type));
}

/**
 * Add evidence-backed context that a compact provider row omitted.
 *
 * A scoring-summary interception may name only its returner. The latest
 * confidently parsed pass by the same offense in the same period identifies
 * the passer; intervening rushes and administrative stoppages are allowed,
 * while possession and team boundaries stop the search. When evidence is
 * absent, the play remains anonymous.
 */
export function enrichPlaySequenceContext(plays = [], context = {}) {
  return plays.map((play, index) => {
    if (play?.inferredPasserName || !playType(play).includes('interception')) return play;
    const narrative = narrativeFor(play);
    if (narrative.actors?.some((actor) => actor.role === PLAY_ROLES.PASSER)) return play;

    const offense = otherTeam(playTeam(play), context);
    const period = playPeriod(play);
    if (!offense) return play;

    for (let position = index - 1; position >= 0; position -= 1) {
      const candidate = plays[position];
      const candidatePeriod = playPeriod(candidate);
      if (period != null && candidatePeriod != null && candidatePeriod !== period) break;

      const type = playType(candidate);
      if (/timeout|warning|end-period/.test(type)) continue;
      const team = playTeam(candidate);
      if (team && team !== offense) break;
      if (isPossessionBoundary(type)) break;

      const candidateNarrative = narrativeFor(candidate);
      const passer = candidateNarrative.confident
        ? candidateNarrative.actors?.find((actor) => actor.role === PLAY_ROLES.PASSER)?.name
        : null;
      if (passer) return { ...play, inferredPasserName: passer };
    }
    return play;
  });
}
