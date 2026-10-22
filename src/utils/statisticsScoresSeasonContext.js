import { getTeamAbbr } from './liveScoringFeed.js';

// statisticsScoresSeasonContext.js — the season behind a Statistics Scores
// matchup, for the pregame Overview and Team Stats.
//
// Input is each team's /api/statistics/teams/season payload (the Statistics
// team dashboard route, server/teamSeasonHandlers.js): finished games with both
// teams' BALLDONTLIE team stats and player lines, standings, and league unit
// ranks. Nothing here requests data or invents a value; a stat with no rank in
// that payload simply shows no rank.

// The score feed and the season route can spell a team differently (WSH vs
// WAS), so team lookups compare through the shared alias map.
const sameTeam = (left, right) => getTeamAbbr(left) === getTeamAbbr(right);

const asNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const finishedGames = (season) => (season?.games ?? [])
  .filter((game) => asNumber(game.pf) != null && asNumber(game.pa) != null)
  .sort((left, right) => (left.week ?? 0) - (right.week ?? 0));

function rankFor(season, team, unitKey) {
  const unit = (season?.ranks ?? []).find((entry) => entry.key === unitKey);
  return unit?.vals?.find((entry) => sameTeam(entry.t, team))?.r ?? null;
}

const clock = (seconds) => {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/* ---------- Team Stats: season averages, ranks, and game logs ---------- */

// Each row mirrors a live Team Stats label (buildTeamStatGroups) so a game reads
// the same before and after kickoff. `side` picks the team's own line (`me`) or
// its opponents' (`opp`); `ratio` rows sum makes and tries across the season.
const SEASON_ROWS = [
  ['offense', 'Offense', [
    { label: 'Total yards', side: 'me', key: 'total_yards', rank: 'yds' },
    { label: 'Passing yards', side: 'me', key: 'net_passing_yards', rank: 'pass' },
    { label: 'Rushing yards', side: 'me', key: 'rushing_yards', rank: 'rush' },
    { label: 'Yards per play', side: 'me', key: 'yards_per_play', rank: 'ypp', decimals: 1, perGame: (me) => (asNumber(me.total_offensive_plays) ? me.total_yards / me.total_offensive_plays : null) },
    { label: 'First downs', side: 'me', key: 'first_downs' },
  ]],
  ['defense', 'Defense', [
    { label: 'Passing yards allowed', side: 'opp', key: 'net_passing_yards', rank: 'passA', direction: 'lower' },
    { label: 'Rushing yards allowed', side: 'opp', key: 'rushing_yards', rank: 'rushA', direction: 'lower' },
    { label: 'Sacks', side: 'opp', key: 'sacks', rank: 'sacks' },
    { label: 'Takeaways', side: 'opp', key: 'turnovers', rank: 'take' },
  ]],
  ['situational', 'Situational', [
    { label: 'Third down', side: 'me', ratio: ['third_down_conversions', 'third_down_attempts'], rank: 'td3' },
    { label: 'Fourth down', side: 'me', ratio: ['fourth_down_conversions', 'fourth_down_attempts'] },
    { label: 'Red zone', side: 'me', ratio: ['red_zone_scores', 'red_zone_attempts'], rank: 'rz' },
  ]],
  ['discipline', 'Discipline', [
    { label: 'Turnovers', side: 'me', key: 'turnovers', rank: 'give', direction: 'lower' },
    { label: 'Penalties', side: 'me', key: 'penalties', direction: 'lower', yardsKey: 'penalty_yards' },
  ]],
  ['possession', 'Possession', [
    { label: 'Time of possession', side: 'me', key: 'possession_time_seconds', direction: 'neutral', format: clock },
    { label: 'Offensive plays', side: 'me', key: 'total_offensive_plays', direction: 'neutral' },
  ]],
];

function gameValue(row, game) {
  const line = game.ts?.[row.side];
  if (!line) return null;
  if (row.ratio) {
    const made = asNumber(line[row.ratio[0]]);
    const tries = asNumber(line[row.ratio[1]]);
    return made == null || tries == null ? null : { made, tries };
  }
  const value = row.perGame ? row.perGame(line) : asNumber(line[row.key]);
  return value == null ? null : { value, yards: row.yardsKey ? asNumber(line[row.yardsKey]) : null };
}

function formatGameValue(row, entry) {
  if (!entry) return '—';
  if (row.ratio) return `${entry.made}–${entry.tries}`;
  if (row.format) return row.format(entry.value);
  if (row.yardsKey && entry.yards != null) return `${entry.value}–${entry.yards}`;
  return row.decimals ? entry.value.toFixed(row.decimals) : String(Math.round(entry.value));
}

function seasonAverage(row, games) {
  const entries = games.map((game) => gameValue(row, game)).filter(Boolean);
  if (!entries.length) return null;
  if (row.ratio) {
    const made = entries.reduce((sum, entry) => sum + entry.made, 0);
    const tries = entries.reduce((sum, entry) => sum + entry.tries, 0);
    return { ratio: tries ? made / tries : 0, display: tries ? `${Math.round((made / tries) * 100)}%` : '—' };
  }
  const average = entries.reduce((sum, entry) => sum + entry.value, 0) / entries.length;
  if (row.format) return { ratio: average, display: row.format(average) };
  const display = row.decimals ? average.toFixed(row.decimals) : average.toFixed(1);
  if (row.yardsKey) {
    const yards = entries.reduce((sum, entry) => sum + (entry.yards ?? 0), 0) / entries.length;
    return { ratio: yards, display: `${display}–${yards.toFixed(1)}` };
  }
  return { ratio: average, display };
}

/**
 * Season-average Team Stats groups in the live groups' shape, plus each row's
 * rank and per-game log for both teams.
 */
export function buildSeasonStatGroups({ away, home, awaySeason, homeSeason }) {
  const awayGames = finishedGames(awaySeason);
  const homeGames = finishedGames(homeSeason);
  if (!awayGames.length && !homeGames.length) return [];
  return SEASON_ROWS.map(([id, label, rows]) => ({
    id,
    label,
    stats: rows.map((row) => {
      const awayAverage = seasonAverage(row, awayGames);
      const homeAverage = seasonAverage(row, homeGames);
      if (!awayAverage && !homeAverage) return null;
      const log = (team, games) => games.map((game) => ({
        id: game.id,
        week: game.week,
        opp: game.opp,
        home: Boolean(game.home),
        result: game.pf > game.pa ? 'W' : game.pf < game.pa ? 'L' : 'T',
        score: `${game.pf}-${game.pa}`,
        value: gameValue(row, game),
        display: formatGameValue(row, gameValue(row, game)),
      }));
      return {
        label: row.label,
        away: awayAverage?.display ?? '—',
        home: homeAverage?.display ?? '—',
        direction: row.direction ?? 'higher',
        awayRatio: awayAverage?.ratio ?? null,
        homeRatio: homeAverage?.ratio ?? null,
        season: {
          ranks: {
            [away]: row.rank ? rankFor(awaySeason, away, row.rank) : null,
            [home]: row.rank ? rankFor(homeSeason, home, row.rank) : null,
          },
          logs: { [away]: log(away, awayGames), [home]: log(home, homeGames) },
          ratio: Boolean(row.ratio),
        },
      };
    }).filter(Boolean),
  })).filter((group) => group.stats.length);
}

/**
 * Each team's season average and NFL rank by Team Stats label, for a live or
 * final game's breakdown headers. The game on screen is left out of the
 * average so it reads as what each team brought into it.
 */
export function buildSeasonStatLookup(input, { excludeGameId = null } = {}) {
  const drop = (season) => (season && excludeGameId != null
    ? { ...season, games: (season.games ?? []).filter((game) => String(game.id) !== String(excludeGameId)) }
    : season);
  const groups = buildSeasonStatGroups({ ...input, awaySeason: drop(input.awaySeason), homeSeason: drop(input.homeSeason) });
  return new Map(groups.flatMap((group) => group.stats.map((stat) => [stat.label, {
    [input.away]: { average: stat.away, rank: stat.season.ranks[input.away] },
    [input.home]: { average: stat.home, rank: stat.season.ranks[input.home] },
  }])));
}

/* ---------- Overview: matchup ranks, recent form, season leaders ---------- */

// Each pair puts one team's offensive unit against the other team's matching
// defensive unit; rank 1 is the strongest unit on both sides of the ball.
const MATCHUP_UNITS = [
  ['pts', 'Scoring offense', 'ptsA', 'Scoring defense'],
  ['pass', 'Passing offense', 'passA', 'Pass defense'],
  ['rush', 'Rushing offense', 'rushA', 'Run defense'],
  ['td3', 'Third-down offense', 'td3A', 'Third-down defense'],
  ['rz', 'Red zone offense', 'rzA', 'Red zone defense'],
];

/** Rows grouped by which team has the ball; the away team always reads left. */
export function buildMatchupRanks({ away, home, awaySeason, homeSeason }) {
  const seasonOf = (team) => (team === away ? awaySeason : homeSeason);
  return [away, home].map((offense) => {
    const defense = offense === away ? home : away;
    const rows = MATCHUP_UNITS.map(([offKey, offLabel, defKey, defLabel]) => {
      const offenseRank = rankFor(seasonOf(offense), offense, offKey);
      const defenseRank = rankFor(seasonOf(defense), defense, defKey);
      if (offenseRank == null && defenseRank == null) return null;
      const side = (team) => (team === offense
        ? { label: offLabel, rank: offenseRank }
        : { label: defLabel, rank: defenseRank });
      return { id: offKey, away: side(away), home: side(home) };
    }).filter(Boolean);
    return { offense, rows };
  }).filter((group) => group.rows.length);
}

/** The last five finished games, oldest first. */
export function buildRecentForm(season) {
  return finishedGames(season).slice(-5).map((game) => ({
    id: game.id,
    week: game.week,
    opp: game.opp,
    home: Boolean(game.home),
    pf: game.pf,
    pa: game.pa,
    result: game.pf > game.pa ? 'W' : game.pf < game.pa ? 'L' : 'T',
    totalYards: asNumber(game.ts?.me?.total_yards),
    turnovers: asNumber(game.ts?.me?.turnovers),
  }));
}

/** A team's record from the standings in its season payload. */
export function seasonRecord(season, team) {
  const row = (season?.standings ?? []).find((entry) => sameTeam(entry.t, team));
  if (!row) return null;
  return row.tie ? `${row.w}-${row.l}-${row.tie}` : `${row.w}-${row.l}`;
}

const sum = (lines, key) => lines.reduce((total, line) => total + (asNumber(line[key]) ?? 0), 0);
const sacks = (count) => `${count} sack${count === 1 ? '' : 's'}`;

// Each position's leader is chosen by its headline stat (tiebreak second) and
// described by its usual season line.
const LEADER_POSITIONS = [
  ['Offense', [
    { pos: 'QB', match: ['QB'], key: 'passing_yards', line: (l) => `${sum(l, 'passing_completions')}/${sum(l, 'passing_attempts')} · ${sum(l, 'passing_yards').toLocaleString('en-US')} yds · ${sum(l, 'passing_touchdowns')} TD · ${sum(l, 'passing_interceptions')} INT` },
    { pos: 'RB', match: ['RB', 'FB'], key: 'rushing_yards', line: (l) => `${sum(l, 'rushing_attempts')} car · ${sum(l, 'rushing_yards')} yds · ${sum(l, 'rushing_touchdowns')} TD` },
    { pos: 'WR', match: ['WR'], key: 'receiving_yards', line: (l) => `${sum(l, 'receptions')} rec · ${sum(l, 'receiving_yards')} yds · ${sum(l, 'receiving_touchdowns')} TD` },
    { pos: 'TE', match: ['TE'], key: 'receiving_yards', line: (l) => `${sum(l, 'receptions')} rec · ${sum(l, 'receiving_yards')} yds · ${sum(l, 'receiving_touchdowns')} TD` },
  ]],
  ['Defense', [
    { pos: 'DL', match: ['DE', 'DT', 'NT', 'DL', 'EDGE'], key: 'defensive_sacks', tiebreak: 'tackles_for_loss', line: (l) => `${sacks(sum(l, 'defensive_sacks'))} · ${sum(l, 'tackles_for_loss')} TFL · ${sum(l, 'total_tackles')} tkl` },
    { pos: 'LB', match: ['LB', 'ILB', 'OLB', 'MLB'], key: 'total_tackles', tiebreak: 'tackles_for_loss', line: (l) => `${sum(l, 'total_tackles')} tkl · ${sum(l, 'tackles_for_loss')} TFL · ${sacks(sum(l, 'defensive_sacks'))}` },
    { pos: 'CB', match: ['CB'], key: 'passes_defended', tiebreak: 'defensive_interceptions', line: (l) => `${sum(l, 'defensive_interceptions')} INT · ${sum(l, 'passes_defended')} PD · ${sum(l, 'total_tackles')} tkl` },
    { pos: 'S', match: ['S', 'SS', 'FS'], key: 'total_tackles', tiebreak: 'defensive_interceptions', line: (l) => `${sum(l, 'total_tackles')} tkl · ${sum(l, 'defensive_interceptions')} INT · ${sum(l, 'passes_defended')} PD` },
  ]],
  ['Special teams', [
    { pos: 'K', match: ['PK', 'K'], key: 'field_goals_made', tiebreak: 'extra_points_made', line: (l) => `${sum(l, 'field_goals_made')}/${sum(l, 'field_goal_attempts')} FG · long ${Math.max(0, ...l.map((x) => asNumber(x.long_field_goal_made) ?? 0))} · ${sum(l, 'extra_points_made')} XP` },
    { pos: 'P', match: ['P'], key: 'punt_yards', line: (l) => {
      const punts = sum(l, 'punts');
      return `${punts} punts · ${punts ? (sum(l, 'punt_yards') / punts).toFixed(1) : '0.0'} avg · ${sum(l, 'punts_inside_20')} inside 20`;
    } },
  ]],
];

function seasonLines(season) {
  const byPlayer = new Map();
  for (const game of finishedGames(season)) {
    for (const line of game.lines ?? []) {
      if (!byPlayer.has(line.id)) byPlayer.set(line.id, { id: line.id, name: line.n, pos: line.pos, lines: [] });
      byPlayer.get(line.id).lines.push(line);
    }
  }
  return [...byPlayer.values()];
}

/** Each team's season leader at every position, side by side. */
export function buildSeasonLeaders({ away, home, awaySeason, homeSeason }) {
  const players = { [away]: seasonLines(awaySeason), [home]: seasonLines(homeSeason) };
  const leader = (team, spec) => players[team]
    .filter((player) => spec.match.includes(String(player.pos).toUpperCase()))
    .map((player) => ({ player, value: sum(player.lines, spec.key), tiebreak: spec.tiebreak ? sum(player.lines, spec.tiebreak) : 0 }))
    .filter((entry) => entry.value > 0 || entry.tiebreak > 0)
    .sort((left, right) => right.value - left.value || right.tiebreak - left.tiebreak)[0] ?? null;
  return LEADER_POSITIONS.map(([unit, specs]) => ({
    unit,
    rows: specs.map((spec) => {
      const side = (team) => {
        const best = leader(team, spec);
        return best ? { id: best.player.id, name: best.player.name, team, value: best.value, line: spec.line(best.player.lines) } : null;
      };
      return { pos: spec.pos, away: side(away), home: side(home) };
    }).filter((row) => row.away || row.home),
  })).filter((group) => group.rows.length);
}

/* ---------- Player card: one season leader's season and game log ---------- */

const line = (lines, key) => sum(lines, key);
const each = (key) => (game) => asNumber(game[key]) ?? 0;
const ratioText = (made, tries) => `${made}/${tries}`;

// Columns per position group: what a game-log row shows, and the season tiles.
const CARD_SPECS = [
  { match: ['QB'], cols: [
    ['C/ATT', (g) => ratioText(each('passing_completions')(g), each('passing_attempts')(g))],
    ['YDS', each('passing_yards')], ['TD', each('passing_touchdowns')], ['INT', each('passing_interceptions')], ['RUSH', each('rushing_yards')],
  ], tiles: (l) => [
    [line(l, 'passing_yards').toLocaleString('en-US'), 'passing yards'],
    [line(l, 'passing_touchdowns'), 'passing touchdowns'],
    [line(l, 'passing_interceptions'), 'interceptions'],
    [line(l, 'passing_attempts') ? `${Math.round((line(l, 'passing_completions') / line(l, 'passing_attempts')) * 100)}%` : '—', 'completion rate'],
  ] },
  { match: ['RB', 'FB'], cols: [
    ['CAR', each('rushing_attempts')], ['YDS', each('rushing_yards')], ['TD', each('rushing_touchdowns')], ['REC', each('receptions')], ['REC YDS', each('receiving_yards')],
  ], tiles: (l) => [
    [line(l, 'rushing_yards').toLocaleString('en-US'), 'rushing yards'],
    [line(l, 'rushing_attempts') ? (line(l, 'rushing_yards') / line(l, 'rushing_attempts')).toFixed(1) : '—', 'yards per carry'],
    [line(l, 'rushing_touchdowns') + line(l, 'receiving_touchdowns'), 'touchdowns'],
    [line(l, 'receptions'), 'receptions'],
  ] },
  { match: ['WR', 'TE'], cols: [
    ['REC', each('receptions')], ['YDS', each('receiving_yards')], ['TD', each('receiving_touchdowns')],
  ], tiles: (l) => [
    [line(l, 'receptions'), 'receptions'],
    [line(l, 'receiving_yards').toLocaleString('en-US'), 'receiving yards'],
    [line(l, 'receiving_touchdowns'), 'touchdowns'],
    [line(l, 'receptions') ? (line(l, 'receiving_yards') / line(l, 'receptions')).toFixed(1) : '—', 'yards per catch'],
  ] },
  { match: ['DE', 'DT', 'NT', 'DL', 'EDGE', 'LB', 'ILB', 'OLB', 'MLB'], cols: [
    ['TKL', each('total_tackles')], ['SACK', each('defensive_sacks')], ['TFL', each('tackles_for_loss')],
  ], tiles: (l) => [
    [line(l, 'total_tackles'), 'tackles'],
    [line(l, 'defensive_sacks'), 'sacks'],
    [line(l, 'tackles_for_loss'), 'tackles for loss'],
    [line(l, 'passes_defended'), 'passes defended'],
  ] },
  { match: ['CB', 'S', 'SS', 'FS', 'DB'], cols: [
    ['TKL', each('total_tackles')], ['INT', each('defensive_interceptions')], ['PD', each('passes_defended')],
  ], tiles: (l) => [
    [line(l, 'total_tackles'), 'tackles'],
    [line(l, 'defensive_interceptions'), 'interceptions'],
    [line(l, 'passes_defended'), 'passes defended'],
    [line(l, 'tackles_for_loss'), 'tackles for loss'],
  ] },
  { match: ['PK', 'K'], cols: [
    ['FG', (g) => ratioText(each('field_goals_made')(g), each('field_goal_attempts')(g))], ['LONG', each('long_field_goal_made')], ['XP', each('extra_points_made')],
  ], tiles: (l) => [
    [ratioText(line(l, 'field_goals_made'), line(l, 'field_goal_attempts')), 'field goals'],
    [Math.max(0, ...l.map((game) => asNumber(game.long_field_goal_made) ?? 0)), 'longest field goal'],
    [line(l, 'extra_points_made'), 'extra points'],
  ] },
  { match: ['P'], cols: [
    ['PUNTS', each('punts')], ['AVG', (g) => (each('punts')(g) ? (each('punt_yards')(g) / each('punts')(g)).toFixed(1) : '—')], ['IN 20', each('punts_inside_20')],
  ], tiles: (l) => [
    [line(l, 'punts'), 'punts'],
    [line(l, 'punts') ? (line(l, 'punt_yards') / line(l, 'punts')).toFixed(1) : '—', 'yards per punt'],
    [line(l, 'punts_inside_20'), 'inside the 20'],
  ] },
];

/**
 * One player's season from the team's season payload: headline tiles and a
 * newest-first game log. Null when the player has no finished game.
 */
export function buildPlayerSeasonCard(season, playerId) {
  const games = finishedGames(season)
    .map((game) => ({ game, stat: (game.lines ?? []).find((entry) => entry.id === playerId) }))
    .filter((entry) => entry.stat);
  if (!games.length) return null;
  const position = String(games.at(-1).stat.pos ?? '').toUpperCase();
  const spec = CARD_SPECS.find((entry) => entry.match.includes(position));
  if (!spec) return null;
  const lines = games.map((entry) => entry.stat);
  return {
    id: playerId,
    name: games.at(-1).stat.n,
    position,
    games: games.length,
    tiles: spec.tiles(lines).map(([value, label]) => ({ value: String(value), label })),
    columns: spec.cols.map(([label]) => label),
    log: games.slice().reverse().map(({ game, stat }) => ({
      id: game.id,
      week: game.week,
      opp: game.opp,
      home: Boolean(game.home),
      result: game.pf > game.pa ? 'W' : game.pf < game.pa ? 'L' : 'T',
      score: `${game.pf}-${game.pa}`,
      values: spec.cols.map(([, read]) => String(read(stat))),
    })),
  };
}
