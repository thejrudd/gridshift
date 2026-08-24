import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStatisticsStandings } from '../../src/utils/statisticsStandings.js';

const teams = [
  { id: 'BUF', name: 'Buffalo Bills', division: 'AFC East', conference: 'AFC' },
  { id: 'MIA', name: 'Miami Dolphins', division: 'AFC East', conference: 'AFC' },
  { id: 'NE', name: 'New England Patriots', division: 'AFC East', conference: 'AFC' },
  { id: 'NYJ', name: 'New York Jets', division: 'AFC East', conference: 'AFC' },
  { id: 'BAL', name: 'Baltimore Ravens', division: 'AFC North', conference: 'AFC' },
  { id: 'CIN', name: 'Cincinnati Bengals', division: 'AFC North', conference: 'AFC' },
  { id: 'DAL', name: 'Dallas Cowboys', division: 'NFC East', conference: 'NFC' },
  { id: 'PHI', name: 'Philadelphia Eagles', division: 'NFC East', conference: 'NFC' },
];

test('statistics standings build division and conference records from final schedule scores', () => {
  const standings = buildStatisticsStandings({
    teams,
    scheduleData: {
      season: 2026,
      weeks: [
        {
          week: 1,
          games: [
            { id: 'buf-mia', awayTeam: 'BUF', homeTeam: 'MIA', completed: true, awayScore: 24, homeScore: 17 },
            { id: 'ne-nyj', awayTeam: 'NE', homeTeam: 'NYJ', status: 'STATUS_FINAL', awayScore: 20, homeScore: 10 },
            { id: 'dal-phi', awayTeam: 'DAL', homeTeam: 'PHI', status: 'scheduled', awayScore: 21, homeScore: 17 },
          ],
        },
        {
          week: 2,
          games: [
            { id: 'buf-bal', awayTeam: 'BUF', homeTeam: 'BAL', completed: true, awayScore: 27, homeScore: 30 },
            { id: 'cin-bal', awayTeam: 'CIN', homeTeam: 'BAL', completed: true, awayScore: 21, homeScore: 21 },
          ],
        },
      ],
    },
  });

  const afcEast = standings.divisionGroups.find((group) => group.id === 'AFC East');
  assert.deepEqual(afcEast.rows.map((row) => row.teamId), ['NE', 'BUF', 'MIA', 'NYJ']);

  const buffalo = standings.rows.find((row) => row.teamId === 'BUF');
  assert.equal(buffalo.wins, 1);
  assert.equal(buffalo.losses, 1);
  assert.equal(buffalo.divisionWins, 1);
  assert.equal(buffalo.divisionLosses, 0);
  assert.equal(buffalo.conferenceWins, 1);
  assert.equal(buffalo.conferenceLosses, 1);
  assert.equal(buffalo.pointDifferential, 4);

  const afc = standings.conferenceGroups.find((group) => group.id === 'AFC');
  assert.deepEqual(afc.rows.slice(0, 3).map((row) => row.teamId), ['NE', 'BAL', 'BUF']);

  assert.equal(standings.completedGames, 4);
  assert.equal(standings.scoredGames, 4);
  assert.equal(standings.scheduledGames, 5);
});

test('statistics standings keep teams visible before final scores exist', () => {
  const standings = buildStatisticsStandings({
    teams: teams.slice(0, 4),
    scheduleData: {
      season: 2026,
      weeks: [
        {
          week: 1,
          games: [
            { id: 'buf-mia', awayTeam: 'BUF', homeTeam: 'MIA', status: 'scheduled' },
          ],
        },
      ],
    },
  });

  const afcEast = standings.divisionGroups.find((group) => group.id === 'AFC East');
  assert.deepEqual(afcEast.rows.map((row) => row.teamId), ['BUF', 'MIA', 'NE', 'NYJ']);
  assert.deepEqual(afcEast.rows.map((row) => row.gamesPlayed), [0, 0, 0, 0]);
  assert.equal(standings.completedGames, 0);
});
