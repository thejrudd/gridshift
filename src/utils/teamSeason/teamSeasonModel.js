// teamSeasonModel.js — data for the Statistics team dashboard.
//
// Pure builders shared by the server route (server/teamSeasonHandlers.js) and
// unit tests: one finished game compacted for a team, division standings from
// the season's games, and league unit ranks from every team-game stat line.

import { normalizePlay } from '../livePlaysFeed.js';
import { resolveOffenseDefenseTeams } from '../playByPlay/normalizePlay.js';
import { getTeamAbbr } from '../liveScoringFeed.js';
import { gameSecond } from '../playerSeason/playerSeasonGames.js';

const isFinal = (game) => /^final/i.test(String(game?.status ?? ''));
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const MARKERS = new Set([
  'official-timeout', 'timeout', 'two-minute-warning', 'end-period', 'end-of-half',
  'end-of-game', 'end-of-regulation',
]);
const KICKOFF = new Set(['kickoff', 'kickoff-return-touchdown']);
const DRIVE_ENDERS = {
  punt: 'Punt', 'blocked-punt': 'Punt', 'muffed-punt-recovery-opponent': 'Punt', 'punt-return-touchdown': 'Punt',
  'field-goal-good': 'Field goal', 'field-goal-missed': 'Missed field goal', 'blocked-field-goal': 'Missed field goal',
  'passing-touchdown': 'Touchdown', 'rushing-touchdown': 'Touchdown',
  'pass-interception-return': 'Turnover', 'interception-return-touchdown': 'Turnover', 'fumble-recovery-opponent': 'Turnover',
  'sack-opp-fumble-recovery': 'Turnover', 'fumble-return-touchdown': 'Turnover',
};
const LINE_SKIP = new Set(['id', 'player', 'team', 'game', 'season', 'week']);

function numericFields(row = {}) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (LINE_SKIP.has(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

export function teamInfo(team = {}) {
  return {
    abbr: getTeamAbbr(team.abbreviation),
    name: team.full_name ?? team.name ?? '',
    short: team.name ?? '',
    conf: team.conference ?? '',
    div: team.division ?? '',
  };
}

function scoringType(type) {
  if (/passing-touchdown/.test(type)) return 'Passing TD';
  if (/rushing-touchdown/.test(type)) return 'Rushing TD';
  if (/field-goal/.test(type)) return 'Field goal';
  if (/interception|fumble/.test(type)) return 'Defensive TD';
  if (/return-touchdown/.test(type)) return 'Return TD';
  if (/safety/.test(type)) return 'Safety';
  return 'Other';
}

/**
 * One finished game, from the team's side: box lines for its players, both
 * team stat lines, quarter scores, how every drive ended, and every scoring play.
 */
export function buildTeamGame(detail, teamAbbr) {
  const game = detail?.game;
  if (!game) return null;
  const team = getTeamAbbr(teamAbbr);
  const home = getTeamAbbr(game.home_team?.abbreviation);
  const away = getTeamAbbr(game.visitor_team?.abbreviation);
  if (team !== home && team !== away) return null;
  const isHome = team === home;
  const side = isHome ? 'home_team' : 'visitor_team';
  const otherSide = isHome ? 'visitor_team' : 'home_team';
  const quarters = (prefix) => ['q1', 'q2', 'q3', 'q4', 'ot'].map((q) => num(game[`${prefix}_${q}`]));

  const lines = (detail.playerStats ?? [])
    .filter((row) => getTeamAbbr(row?.team?.abbreviation) === team && row?.player?.id != null)
    .map((row) => ({
      id: row.player.id,
      n: [row.player.first_name, row.player.last_name].filter(Boolean).join(' '),
      pos: row.player.position_abbreviation ?? row.player.position ?? '',
      j: row.player.jersey_number ?? '',
      ...numericFields(row),
    }));

  const ts = {};
  for (const row of detail.teamStats ?? []) {
    ts[getTeamAbbr(row?.team?.abbreviation) === team ? 'me' : 'opp'] = numericFields(row);
  }

  // Drives, rebuilt from play order: a new drive starts when the offense changes,
  // after a kickoff, or after a play that ends one.
  const ordered = (detail.plays ?? [])
    .map((raw, index) => [raw, index])
    .sort((left, right) => {
      const a = left[0];
      const b = right[0];
      if (a?.period && b?.period) {
        const delta = gameSecond(a.period, a.clock_display) - gameSecond(b.period, b.clock_display);
        if (delta) return delta;
      }
      return left[1] - right[1];
    })
    .map(([raw]) => raw);
  const drives = [];
  const scoring = [];
  let current = null;
  let lastMe = 0;
  let lastOpp = 0;
  const close = (result) => {
    if (current) drives.push({ tm: current.tm, r: result || 'Other', plays: current.plays });
    current = null;
  };
  for (const raw of ordered) {
    const type = raw?.type_slug ?? '';
    const me = isHome ? raw?.home_score : raw?.away_score;
    const them = isHome ? raw?.away_score : raw?.home_score;
    if (raw?.scoring_play && me != null && them != null) {
      if (me > lastMe) scoring.push({ side: 'me', type: scoringType(type), pts: me - lastMe, q: raw.period });
      if (them > lastOpp) scoring.push({ side: 'opp', type: scoringType(type), pts: them - lastOpp, q: raw.period });
    }
    if (me != null) lastMe = Math.max(lastMe, me);
    if (them != null) lastOpp = Math.max(lastOpp, them);

    if (MARKERS.has(type)) {
      if (/end-of-half|end-of-game|end-of-regulation/.test(type)) close('Other');
      continue;
    }
    if (KICKOFF.has(type)) { close(); continue; }
    const play = normalizePlay(raw, game.id);
    if (!play) continue;
    const { offenseTeam } = resolveOffenseDefenseTeams(play, { homeTeam: home, awayTeam: away, normalizeTeam: getTeamAbbr });
    if (!offenseTeam) continue;
    if (!current || current.offense !== offenseTeam) {
      if (current) close(current.lastDown === 4 ? 'Downs' : 'Other');
      current = { tm: offenseTeam === team ? 'me' : 'opp', offense: offenseTeam, plays: 0, lastDown: null };
    }
    if (!/No Play/i.test(raw?.text ?? '')) current.plays += 1;
    current.lastDown = raw?.start_down ?? current.lastDown;
    if (DRIVE_ENDERS[type]) close(DRIVE_ENDERS[type]);
  }
  close();

  return {
    id: game.id,
    week: game.week,
    date: game.date,
    status: game.status ?? '',
    home: isHome,
    opp: isHome ? away : home,
    pf: num(game[`${side}_score`]),
    pa: num(game[`${otherSide}_score`]),
    ot: game[`${side}_ot`] != null || /OT/.test(game.status ?? ''),
    venue: game.venue ?? '',
    summary: game.summary ?? '',
    qf: quarters(side),
    qa: quarters(otherSide),
    ts,
    lines,
    drives,
    scoring,
  };
}

/** The team's games still to play, in date order. */
export function upcomingGames(games = [], teamAbbr) {
  const team = getTeamAbbr(teamAbbr);
  return games
    .filter((game) => !isFinal(game) && [game.home_team?.abbreviation, game.visitor_team?.abbreviation].map(getTeamAbbr).includes(team))
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .map((game) => {
      const home = getTeamAbbr(game.home_team?.abbreviation) === team;
      return {
        id: game.id,
        week: game.week,
        date: game.date,
        home,
        opp: getTeamAbbr((home ? game.visitor_team : game.home_team)?.abbreviation),
        venue: game.venue ?? '',
      };
    });
}

/** Every team's record, points, and division record from finished regular-season games. */
export function buildStandings(games = []) {
  const records = {};
  const teams = {};
  for (const game of games) {
    for (const team of [game.home_team, game.visitor_team]) {
      if (team) teams[getTeamAbbr(team.abbreviation)] ??= teamInfo(team);
    }
    if (!isFinal(game) || game.postseason) continue;
    const pairs = [
      [game.home_team, game.visitor_team, game.home_team_score, game.visitor_team_score],
      [game.visitor_team, game.home_team, game.visitor_team_score, game.home_team_score],
    ];
    for (const [me, opp, pf, pa] of pairs) {
      const key = getTeamAbbr(me.abbreviation);
      const record = (records[key] ??= { t: key, w: 0, l: 0, tie: 0, pf: 0, pa: 0, dw: 0, dl: 0, dt: 0 });
      record.pf += num(pf);
      record.pa += num(pa);
      const result = pf > pa ? 'w' : pf < pa ? 'l' : 'tie';
      record[result] += 1;
      if (me.division === opp.division && me.conference === opp.conference) {
        record[result === 'w' ? 'dw' : result === 'l' ? 'dl' : 'dt'] += 1;
      }
    }
  }
  return { teams, standings: Object.values(records) };
}

// [unit, key, label, value, direction (1 = higher is better), decimals, suffix]
export const TEAM_RANK_METRICS = [
  ['off', 'pts', 'Points per game', (a) => a.pf / a.g, 1, 1],
  ['off', 'yds', 'Yards per game', (a) => a.yds / a.g, 1, 1],
  ['off', 'pass', 'Passing yards per game', (a) => a.pass / a.g, 1, 1],
  ['off', 'rush', 'Rushing yards per game', (a) => a.rush / a.g, 1, 1],
  ['off', 'ypp', 'Yards per play', (a) => a.yds / (a.plays || 1), 1, 2],
  ['off', 'td3', 'Third-down conversion rate', (a) => (100 * a.td3) / (a.ta3 || 1), 1, 1, '%'],
  ['off', 'rz', 'Red-zone scoring rate', (a) => (100 * a.rz) / (a.rza || 1), 1, 1, '%'],
  ['off', 'give', 'Giveaways per game', (a) => a.give / a.g, -1, 1],
  ['off', 'sackd', 'Sacks allowed per game', (a) => a.sackd / a.g, -1, 1],
  ['def', 'ptsA', 'Points allowed per game', (a) => a.pa / a.g, -1, 1],
  ['def', 'ydsA', 'Yards allowed per game', (a) => a.ydsA / a.g, -1, 1],
  ['def', 'passA', 'Passing yards allowed per game', (a) => a.passA / a.g, -1, 1],
  ['def', 'rushA', 'Rushing yards allowed per game', (a) => a.rushA / a.g, -1, 1],
  ['def', 'yppA', 'Yards per play allowed', (a) => a.ydsA / (a.playsA || 1), -1, 2],
  ['def', 'td3A', 'Opponent third-down rate', (a) => (100 * a.td3A) / (a.ta3A || 1), -1, 1, '%'],
  ['def', 'rzA', 'Opponent red-zone scoring rate', (a) => (100 * a.rzA) / (a.rzaA || 1), -1, 1, '%'],
  ['def', 'take', 'Takeaways per game', (a) => a.take / a.g, 1, 1],
  ['def', 'sacks', 'Sacks per game', (a) => a.sacks / a.g, 1, 1],
  ['all', 'diff', 'Point differential per game', (a) => (a.pf - a.pa) / a.g, 1, 1],
  ['all', 'tod', 'Turnover differential', (a) => a.take - a.give, 1, 0],
];

/**
 * League unit ranks from every finished regular-season team-game stat line.
 * Ties share a rank; `dir` 1 means higher is better.
 */
export function buildTeamRanks(games = [], teamStatRows = []) {
  const scores = {};
  for (const game of games) {
    if (!isFinal(game) || game.postseason) continue;
    scores[game.id] = {
      [getTeamAbbr(game.home_team?.abbreviation)]: num(game.home_team_score),
      [getTeamAbbr(game.visitor_team?.abbreviation)]: num(game.visitor_team_score),
    };
  }
  const byGame = {};
  for (const row of teamStatRows) {
    const id = row?.game?.id;
    if (id != null && scores[id]) (byGame[id] ??= []).push(row);
  }
  const totals = {};
  const blank = () => ({ g: 0, pf: 0, pa: 0, yds: 0, ydsA: 0, pass: 0, passA: 0, rush: 0, rushA: 0, plays: 0, playsA: 0, td3: 0, ta3: 0, td3A: 0, ta3A: 0, rz: 0, rza: 0, rzA: 0, rzaA: 0, give: 0, take: 0, sackd: 0, sacks: 0 });
  let gameCount = 0;
  for (const [id, rows] of Object.entries(byGame)) {
    if (rows.length !== 2) continue;
    gameCount += 1;
    for (const [mine, theirs] of [[rows[0], rows[1]], [rows[1], rows[0]]]) {
      const team = getTeamAbbr(mine.team?.abbreviation);
      const opp = getTeamAbbr(theirs.team?.abbreviation);
      const a = (totals[team] ??= blank());
      a.g += 1;
      a.pf += scores[id][team] ?? 0;
      a.pa += scores[id][opp] ?? 0;
      a.yds += num(mine.total_yards); a.ydsA += num(theirs.total_yards);
      a.pass += num(mine.net_passing_yards); a.passA += num(theirs.net_passing_yards);
      a.rush += num(mine.rushing_yards); a.rushA += num(theirs.rushing_yards);
      a.plays += num(mine.total_offensive_plays); a.playsA += num(theirs.total_offensive_plays);
      a.td3 += num(mine.third_down_conversions); a.ta3 += num(mine.third_down_attempts);
      a.td3A += num(theirs.third_down_conversions); a.ta3A += num(theirs.third_down_attempts);
      a.rz += num(mine.red_zone_scores); a.rza += num(mine.red_zone_attempts);
      a.rzA += num(theirs.red_zone_scores); a.rzaA += num(theirs.red_zone_attempts);
      a.give += num(mine.turnovers); a.take += num(theirs.turnovers);
      a.sackd += num(mine.sacks); a.sacks += num(theirs.sacks);
    }
  }
  const ranks = TEAM_RANK_METRICS.map(([unit, key, label, valueOf, dir, dp, suffix = '']) => {
    const vals = Object.entries(totals).map(([team, a]) => ({ t: team, v: Number(valueOf(a).toFixed(dp + 1)) }));
    vals.sort((x, y) => (dir > 0 ? y.v - x.v : x.v - y.v));
    vals.forEach((entry, index) => { entry.r = index > 0 && vals[index - 1].v === entry.v ? vals[index - 1].r : index + 1; });
    return { unit, key, label, dir, dp, suffix, vals };
  });
  return { ranks, leagueGames: gameCount };
}
