// Deterministic league fixture for the drilldown harness: a full 32-team
// schedule and weekly stat lines (so peer ranks and defense tiers resolve),
// and one featured receiver whose season mirrors the design prototype.
import { getDrilldownElapsedFraction } from '../../../src/utils/playerDrilldownModel.js';

const TEAMS = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS'];
const CIN_OPPONENT = { 1: 'CLE', 2: 'JAX', 3: 'MIN', 4: 'DEN', 5: 'DET', 6: 'GB', 7: 'PIT', 8: 'BAL' };
const CIN_HOME = { 1: true, 2: false, 3: true, 4: false, 5: true, 6: false, 7: false, 8: true };
export const WEEK = 7;
export const SCORING = { rec: 1, rec_yd: 0.1, rec_td: 6, rush_yd: 0.1, rush_td: 6, pass_yd: 0.04, pass_td: 4, pass_int: -2, fum_lost: -2 };
const PLAYS = [
  ['Q1 12:10', 2.83, '8-yd catch', 1.8, { rec: 1, rec_yd: 8 }],
  ['Q1 5:32', 9.47, '4-yd end-around', 0.4, { rush_yd: 4 }],
  ['Q2 14:01', 15.98, '22-yd catch', 3.2, { rec: 1, rec_yd: 22 }],
  ['Q2 6:47', 23.22, '31-yd catch', 4.1, { rec: 1, rec_yd: 31 }],
  ['Q2 0:38', 29.37, '9-yd catch', 1.9, { rec: 1, rec_yd: 9 }],
  ['Q3 10:15', 34.75, '9-yd catch on 3rd down', 1.9, { rec: 1, rec_yd: 9 }],
  ['Q4 9:20', 50.67, '24-yd touchdown catch', 9.4, { rec: 1, rec_yd: 24, rec_td: 1 }],
  ['Q4 2:05', 57.92, '9-yd catch', 1.9, { rec: 1, rec_yd: 9 }],
];

function random(seed) {
  let state = seed;
  return () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
}

export function buildFixture({ phase = 'pregame', source = 'balldontlie', bench = true, bdl = true, sparse = false, now = Date.now() } = {}) {
  const rand = random(7);
  // A live game that kicked off 70 minutes ago sits in the second half.
  const kickoff = phase === 'pregame' ? new Date(now + 2 * 864e5).toISOString()
    : phase === 'live' ? new Date(now - 70 * 60e3).toISOString()
      : new Date(now - 6 * 3600e3).toISOString();
  const scheduleMap = {};
  for (let week = 1; week <= 8; week += 1) {
    const others = TEAMS.filter(team => team !== 'CIN' && team !== CIN_OPPONENT[week]);
    const pairs = [['CIN', CIN_OPPONENT[week], CIN_HOME[week]]];
    for (let index = 0; index < others.length; index += 2) pairs.push([others[index], others[index + 1], true]);
    const completed = week < WEEK || (week === WEEK && phase === 'final');
    const weekKickoff = week < WEEK ? `2026-09-${String(week * 4).padStart(2, '0')}T17:00:00Z` : week === WEEK ? kickoff : new Date(now + 9 * 864e5).toISOString();
    const games = {};
    pairs.forEach(([team, opponent, home]) => {
      const teamScore = 14 + Math.round(rand() * 20);
      const opponentScore = 14 + Math.round(rand() * 20);
      games[team] = { kickoff: weekKickoff, completed, opp: opponent, home, status: completed ? 'final' : 'scheduled', ...(completed ? { ptsFor: teamScore, ptsAgainst: opponentScore } : {}) };
      games[opponent] = { kickoff: weekKickoff, completed, opp: team, home: !home, status: completed ? 'final' : 'scheduled', ...(completed ? { ptsFor: opponentScore, ptsAgainst: teamScore } : {}) };
    });
    if (week === WEEK && completed) Object.assign(games.CIN, { ptsFor: 27, ptsAgainst: 20 }) && Object.assign(games.PIT, { ptsFor: 20, ptsAgainst: 27 });
    scheduleMap[week] = games;
  }

  const players = { receiver: { full_name: 'Test Receiver', position: 'WR', team: 'CIN', years_exp: 5 } };
  const weeklyStats = {};
  TEAMS.forEach((team) => {
    ['WR', 'WR', 'RB', 'TE', 'QB'].forEach((position, index) => {
      const id = `${team}-${position}-${index}`;
      players[id] = { full_name: `${team} ${position} ${index}`, position, team, depth_chart_order: 1 };
      weeklyStats[id] = Array.from({ length: WEEK - 1 }, (unused, offset) => ({
        week: offset + 1,
        team,
        opp: scheduleMap[offset + 1][team].opp,
        gs: 1,
        ...(position === 'QB' ? { pass_yd: 180 + Math.round(rand() * 160), pass_td: Math.round(rand() * 3), rush_yd: Math.round(rand() * 20) }
          : position === 'RB' ? { rush_yd: 30 + Math.round(rand() * 90), rec: Math.round(rand() * 4), rec_yd: Math.round(rand() * 35), rush_td: rand() > 0.7 ? 1 : 0 }
            : { rec: 2 + Math.round(rand() * 6), rec_yd: 20 + Math.round(rand() * 80), rec_td: rand() > 0.75 ? 1 : 0 }),
        off_snp: 40 + Math.round(rand() * 25),
        tm_off_snp: 66,
      }));
    });
  });
  // W3's lost fumble gives the stat line a deduction to filter Recent form by.
  const lines = [
    { rec: 6, rec_yd: 86 }, { rec: 7, rec_yd: 91, rec_td: 1 }, { rec: 4, rec_yd: 58, fum_lost: 1 },
    { rec: 7, rec_yd: 114 }, { rec: 8, rec_yd: 120, rec_td: 1 }, { rec: 5, rec_yd: 67 },
  ];
  const snaps = [60, 63, 60, 64, 65, 59];
  // Sparse: a pregame player with no played games, no schedule entry and a
  // placeholder date from another season (as Matchups passes when the
  // league's schedule has not loaded).
  weeklyStats.receiver = sparse ? [] : lines.map((line, offset) => ({ week: offset + 1, team: 'CIN', opp: CIN_OPPONENT[offset + 1], ...line, off_snp: snaps[offset], tm_off_snp: 70 }));

  const scheduleEntry = scheduleMap[WEEK].CIN;
  const elapsed = getDrilldownElapsedFraction({ phase, scheduleEntry, now });
  const events = PLAYS.map(([clock, minute, desc, pts, stats], index) => ({
    id: `play-${index}`, progress: minute / 60, order: index, pts, desc, glance: { clock }, stats, kind: stats.rec_td ? 'td' : 'rec',
  }));
  // The week's stat line is exactly the plays the clock has reached, so the
  // official total and the play sum agree.
  const reached = events.filter(event => phase === 'final' || event.progress <= elapsed);
  if (phase !== 'pregame') {
    const total = { week: WEEK, team: 'CIN', opp: 'PIT', off_snp: 62, tm_off_snp: 70 };
    reached.forEach(event => Object.entries(event.stats).forEach(([key, value]) => { total[key] = (total[key] ?? 0) + value; }));
    weeklyStats.receiver.push(total);
  }

  const projectedStats = { rec: 6.4, rec_yd: 81, rec_td: 0.5, rush_yd: 4 };
  const projection = source === 'model'
    ? { projected: 17.8, min: 11.9, max: 24.4, factors: { source: 'current-season', seasonBase: 17.1, recentBase: 19.6, recentWeight: 0.6, shrunkBase: 18.3, oppFactor: 0.97, weatherFactor: 1, snapFactor: 1, locationFactor: 1 } }
    : source === 'none' ? null
      : sparse ? { projected: 21, projectedStats, factors: { source } }
        : { projected: 17.9, min: 11.9, max: 24.4, projectedStats, factors: { source } };

  const benchPlayer = { id: 'bench', full_name: 'Bench Receiver', name: 'Bench Receiver', position: 'WR', team: 'SEA', projection: { projected: 20.4 }, scheduleEntry: { kickoff, opp: 'ARI' } };
  const benchComparison = phase === 'pregame' && bench ? {
    isUser: true,
    slot: 'WR',
    starter: { id: 'receiver', position: 'WR', projection, scheduleEntry: { kickoff, opp: 'PIT' } },
    bench: [benchPlayer],
    players: { bench: benchPlayer },
  } : null;

  return {
    bdl,
    sleeper: { platform: 'sleeper', selectedLeagueId: 'league', players, weeklyStats, season: '2026', activeScoringSettings: SCORING, scheduleMap, espnIdOverrides: { receiver: '4362628' } },
    timeline: { events, elapsed },
    props: {
      playerId: 'receiver',
      week: WEEK,
      projection,
      benchComparison,
      enrichedPlayer: sparse ? {
        gameDate: '2025-11-23',
        gameStarted: false,
        rank: { rank: 2, posCount: 8, posLabel: 'WR' },
        isIndoor: false,
      } : {
        oppTeam: 'PIT',
        isHome: false,
        scheduleEntry,
        gameStarted: phase !== 'pregame',
        rank: { rank: 7, posCount: 82, posLabel: 'WR' },
        weekRank: phase === 'final' ? { rank: 3, posCount: 82, posLabel: 'WR' } : null,
        opponentFantasyContext: { team: 'PIT', position: 'WR', rank: 9, teamCount: 32, ptsAllowedPerGame: 33.1, leagueAveragePtsAllowed: 35.2, currentGames: 6, evidenceKind: 'current' },
        weather: { temp_c: 9, wind_kph: 8, precipitation_mm: 0 },
        isIndoor: false,
        stadium: { name: 'Acrisure Stadium', city: 'Pittsburgh' },
      },
    },
  };
}
