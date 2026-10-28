// GridShift-league implementation of the league data contract
// (src/utils/leagueProviderContract.js): pure mappers from GridShift platform
// API responses. The requests live in src/api/gridshiftPlatformApi.js.
//
// Only platform data goes in: no Sleeper ids, seasons, caches, or names are
// read here, so nothing from a Sleeper league can reach a GridShift league.

import { LEAGUE_PROVIDER_IDS } from './leagueProviderContract.js';

const NO_MANAGER = 'No manager';

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundScore(value) {
  return Math.round(finiteNumber(value) * 100) / 100;
}

/**
 * `GET /api/leagues` entry, or `GET /api/leagues/:id` body, to a league summary.
 * @returns {import('./leagueProviderContract.js').LeagueSummary | null}
 */
export function mapGridShiftLeagueSummary(entry) {
  const league = entry?.league ?? entry;
  if (!league?.id) return null;
  const role = entry?.viewerRole ?? entry?.role ?? null;
  return {
    provider: LEAGUE_PROVIDER_IDS.GRIDSHIFT,
    leagueId: String(league.id),
    name: String(league.name ?? 'League'),
    season: String(league.season ?? ''),
    viewerRole: role === 'commissioner' || role === 'manager' ? role : null,
  };
}

/** `GET /api/leagues/:id/teams` body to contract teams, keyed by team id. */
export function mapGridShiftTeams(teamsBody, { viewerUserId = null } = {}) {
  const teams = new Map();
  for (const team of teamsBody?.teams ?? []) {
    if (!team?.id) continue;
    teams.set(String(team.id), {
      teamId: String(team.id),
      name: String(team.name ?? 'Team'),
      managerName: team.managerUsername ? String(team.managerUsername) : NO_MANAGER,
      isViewer: Boolean(viewerUserId && team.managerUserId === viewerUserId),
    });
  }
  return teams;
}

/**
 * Up to five most recent final regular-season results per team, oldest first,
 * from `GET /api/leagues/:id/matchups`. Totals include commissioner
 * adjustments, matching the platform's standings.
 */
export function buildGridShiftRecentForm(matchupsBody) {
  const form = new Map();
  const finals = (matchupsBody?.matchups ?? [])
    .filter((matchup) => matchup?.kind === 'regular' && matchup.status === 'final' && matchup.home && matchup.away)
    .sort((left, right) => finiteNumber(left.week) - finiteNumber(right.week));
  const push = (teamId, result) => {
    if (!form.has(teamId)) form.set(teamId, []);
    form.get(teamId).push(result);
  };
  finals.forEach(({ home, away }) => {
    const homeTotal = roundScore(home.total ?? home.providerPoints);
    const awayTotal = roundScore(away.total ?? away.providerPoints);
    if (homeTotal === awayTotal) {
      push(String(home.teamId), 'T');
      push(String(away.teamId), 'T');
    } else {
      push(String(home.teamId), homeTotal > awayTotal ? 'W' : 'L');
      push(String(away.teamId), awayTotal > homeTotal ? 'W' : 'L');
    }
  });
  return new Map([...form.entries()].map(([teamId, results]) => [teamId, results.slice(-5)]));
}

/** The last week whose regular-season matchups are final in this league, or 0. */
export function getGridShiftThroughWeek(matchupsBody) {
  return (matchupsBody?.matchups ?? [])
    .filter((matchup) => matchup?.kind === 'regular' && matchup.status === 'final')
    .reduce((latest, matchup) => Math.max(latest, finiteNumber(matchup.week)), 0);
}

/**
 * Standings model from the platform responses Standings needs. Row order and
 * seeds are the platform's `rank` (its own tiebreakers); core never re-sorts.
 *
 * @param {object} input
 * @param {object} input.league     `GET /api/leagues/:id` body
 * @param {object} input.teams      `GET /api/leagues/:id/teams` body
 * @param {object} input.standings  `GET /api/leagues/:id/standings` body (final results only)
 * @param {object} input.weeks      `GET /api/leagues/:id/weeks` body
 * @param {object} input.matchups   `GET /api/leagues/:id/matchups` body
 * @returns {import('./leagueProviderContract.js').StandingsModel}
 */
export function buildGridShiftStandingsModel({ league, teams, standings, weeks, matchups }, { retry = () => {}, viewerUserId = null } = {}) {
  const summary = mapGridShiftLeagueSummary(league);
  const season = summary?.season || String(weeks?.season ?? '');
  const teamsById = mapGridShiftTeams(teams, { viewerUserId });
  const recentForm = buildGridShiftRecentForm(matchups);
  const throughWeek = getGridShiftThroughWeek(matchups);

  const rows = [...(standings?.standings ?? [])]
    .sort((left, right) => finiteNumber(left.rank) - finiteNumber(right.rank))
    .map((row) => {
      const teamId = String(row.teamId);
      const team = teamsById.get(teamId);
      return {
        participantId: teamId,
        seed: finiteNumber(row.rank),
        teamName: team?.name ?? 'Team',
        managerName: team?.managerName ?? NO_MANAGER,
        wins: finiteNumber(row.wins),
        losses: finiteNumber(row.losses),
        ties: finiteNumber(row.ties),
        recentForm: recentForm.get(teamId) ?? [],
        pointsFor: roundScore(row.pointsFor),
        pointsAgainst: roundScore(row.pointsAgainst),
      };
    });

  const hasStandings = rows.length > 0 && throughWeek > 0;
  const championshipWeek = weeks?.championshipWeek == null ? null : finiteNumber(weeks.championshipWeek, null);

  return {
    provider: LEAGUE_PROVIDER_IDS.GRIDSHIFT,
    status: hasStandings ? 'ready' : 'empty',
    season,
    error: '',
    retry,
    // A finished GridShift season (final table, championship result) is not
    // modelled yet; the live table is shown until then.
    historical: false,
    standings: {
      season,
      throughWeek,
      playoffTeamCount: 2,
      rows,
      divisions: [{ id: 'League', label: 'League', rows }],
    },
    brackets: null,
    finalPlacements: null,
    postseason: championshipWeek ? { kind: 'championship', week: championshipWeek } : null,
  };
}
