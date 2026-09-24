// ── NFL team records ───────────────────────────────────────────────────────
// Source: public/nfl-data-2026.json, which already carries id, full name,
// division, conference, city, and nickname for all 32 teams.

import { KIND_NFL_TEAM, makeRecord, nameTokens } from './record.js';

// Shorthand people type that the team data itself does not contain. The full
// alias table lives in vocabulary.js and drives query parsing; these are here so
// the record is also directly findable by its own nickname.
const EXTRA_TOKENS = {
  NE: ['pats'],
  JAX: ['jags'],
  TB: ['bucs'],
  SF: ['niners'],
  LAR: ['la'],
  WSH: ['was', 'washington'],
  LV: ['oakland'],
};

export function buildNflTeamRecords(scheduleData = {}) {
  const teams = Array.isArray(scheduleData.teams) ? scheduleData.teams : [];

  return teams.map((team) => {
    const id = String(team.id ?? '').toUpperCase();
    const abbr = id.toLowerCase();

    return makeRecord({
      kind: KIND_NFL_TEAM,
      id: abbr,
      label: team.name ?? id,
      sublabel: team.division ?? '',
      tokens: [
        abbr,
        ...nameTokens(team.name),
        ...nameTokens(team.city),
        ...nameTokens(team.nickname),
        ...(EXTRA_TOKENS[id] ?? []),
      ],
      route: {
        activeTab: 'statistics',
        statisticsView: 'team',
        statisticsTeamId: id,
      },
      // Teams are few and always relevant, so they sit above the player field
      // when a query matches both a team name and a player's surname.
      weight: 0.9,
      meta: {
        teamId: id,
        division: team.division ?? null,
        conference: team.conference ?? null,
      },
    });
  });
}
