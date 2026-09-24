// ── Answer dispatch ────────────────────────────────────────────────────────
// Picks the one answer, if any, that a query deserves.
//
// Answers are additive: the ranked result list always renders underneath, so a
// resolver returning null costs the user nothing. That is what makes the
// "return null when data is cold" rule safe — the query still works, it just
// answers with a link instead of a number.
//
// Order is specificity, not preference. A table beats a card beats a stat line:
// each step down is a broader reading of the same query, so the narrowest one
// that fires is the one the user most likely meant.

import { resolveFantasyAnswer } from './fantasyLookup.js';
import { resolveLeadersAnswer } from './leaders.js';
import { resolvePlayerStatAnswer } from './playerStat.js';
import { resolveStandingsAnswer } from './standings.js';
import { resolveTeamStatsAnswer } from './teamStats.js';

/**
 * @param {object} slots   parsed query slots
 * @param {Array}  groups  ranked result groups
 * @param {object} data    cached stats and league data; see each resolver
 * @returns {object|null}  an answer model, or null
 */
export function resolveAnswer(slots, groups = [], data = {}) {
  const topOf = (kind) => groups.find((group) => group.kind === kind)?.results?.[0]?.record ?? null;
  const topFantasyTeam = topOf('fantasyTeam');
  const topPlayer = topOf('player');

  // Standings is a table about a competition, so it needs no result at all —
  // "afc standings" names nothing the index holds.
  const standings = resolveStandingsAnswer(slots, data, {
    hasFantasyTeamMatch: Boolean(topFantasyTeam),
  });
  if (standings) return standings;

  // A season-level question about one team. Checked before leaders because
  // "seahawks points against" is a question about the Seahawks, not a
  // leaderboard of them.
  const teamStats = resolveTeamStatsAnswer(slots, data, {
    record: topFantasyTeam ?? topPlayer,
  });
  if (teamStats) return teamStats;

  // A leaders query is about a field, not a player, so it does not need a top
  // result either.
  const leaders = resolveLeadersAnswer(slots, data);
  if (leaders) return leaders;

  if (!topPlayer) return null;

  return resolveFantasyAnswer(slots, topPlayer, data)
    ?? resolvePlayerStatAnswer(slots, topPlayer, data);
}
