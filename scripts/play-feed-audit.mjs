#!/usr/bin/env node
// Play feed audit: rebuilds every player's stat line for completed NFL weeks
// from the BALLDONTLIE play feed exactly as Fantasy Live reads it, then diffs
// each stat against the official record (Sleeper's final weekly stat lines,
// cross-checked with ESPN's box score). Mismatches are the evidence for parser
// and play-pricing fixes: find real errors, then refine around them.
//
// Usage (the BDL key stays server-side, read from .env):
//   node --env-file=.env scripts/play-feed-audit.mjs [--season 2026] [--week 8 | --weeks 1-8] [--refresh]
//
// Output: tmp/play-audit/<season>/week-<n>/mismatches.json and summary.md.
// Raw downloads are cached under tmp/play-audit/cache/ (finished games never
// change; --refresh refetches them).

import fs from 'node:fs';
import path from 'node:path';
import { buildPlayEvents, buildStarterNameIndex } from '../src/utils/livePlaysFeed.js';
import { getTeamAbbr } from '../src/utils/liveScoringFeed.js';
import { canonicalTeam } from '../src/utils/nflPlays/fieldSpots.js';

const BDL_BASE = 'https://api.balldontlie.io';
const SLEEPER_BASE = 'https://api.sleeper.app/v1';
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const ROOT = path.resolve('tmp/play-audit');

// Sleeper stat keys compared, grouped for the summary. Tackles are compared
// as one total, since a play only knows a tackle happened.
export const AUDIT_STATS = {
  passing: ['pass_att', 'pass_cmp', 'pass_yd', 'pass_td', 'pass_int', 'pass_fd', 'pass_2pt'],
  rushing: ['rush_att', 'rush_yd', 'rush_td', 'rush_fd', 'rush_2pt'],
  receiving: ['rec', 'rec_yd', 'rec_td', 'rec_fd', 'rec_2pt'],
  ballSecurity: ['fum', 'fum_lost'],
  kicking: ['fgm', 'fgmiss', 'xpm', 'xpmiss'],
  defense: ['idp_tkl', 'idp_sack', 'idp_int', 'idp_ff', 'idp_fr', 'idp_pd', 'idp_qbhit'],
};
const ALL_STATS = Object.values(AUDIT_STATS).flat();
// A weight for every compared stat, so no involvement is dropped as "worth
// nothing" before it reaches the stat line: play points round to hundredths,
// so counts weigh 1 and yards 0.01 (a -3 yard carry still nets 0.97).
const AUDIT_SCORING = Object.fromEntries([...ALL_STATS, 'idp_tkl_solo', 'idp_tkl_ast']
  .map((key) => [key, key.endsWith('_yd') ? 0.01 : 1]));
const TACKLE_KEYS = ['idp_tkl', 'idp_tkl_solo', 'idp_tkl_ast'];

function parseArgs(argv) {
  const args = { season: null, weeks: null, refresh: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--season') args.season = Number(argv[++i]);
    else if (arg === '--week') args.weeks = [Number(argv[++i])];
    else if (arg === '--weeks') {
      const [from, to] = String(argv[++i]).split('-').map(Number);
      args.weeks = Array.from({ length: (to ?? from) - from + 1 }, (_, index) => from + index);
    } else if (arg === '--refresh') args.refresh = true;
    else if (arg === '--help') {
      console.log('Usage: node --env-file=.env scripts/play-feed-audit.mjs [--season 2026] [--week 8 | --weeks 1-8] [--refresh]');
      process.exit(0);
    }
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function fetchJson(url, { headers = {}, attempts = 5 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, { headers });
    if (response.status === 429 || response.status >= 500) {
      await sleep(2000 * attempt);
      continue;
    }
    if (!response.ok) throw new Error(`${response.status} for ${url.toString().replace(/api_key=[^&]+/, 'api_key=…')}`);
    return response.json();
  }
  throw new Error(`Gave up after ${attempts} attempts: ${url}`);
}

function cached(file, refresh, load) {
  return (async () => {
    if (!refresh && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    const value = await load();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
    return value;
  })();
}

function bdlHeaders() {
  const key = process.env.GRIDSHIFT_BDL_API_KEY;
  if (!key) throw new Error('GRIDSHIFT_BDL_API_KEY is not set. Run with node --env-file=.env.');
  return { Authorization: key };
}

async function bdlPaged(pathname, params) {
  const rows = [];
  let cursor = null;
  do {
    const url = new URL(pathname, BDL_BASE);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set('per_page', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const page = await fetchJson(url, { headers: bdlHeaders() });
    rows.push(...(page.data ?? []));
    cursor = page.meta?.next_cursor ?? null;
    await sleep(300);
  } while (cursor);
  return rows;
}

const isFinal = (game) => /final/i.test(String(game?.status ?? ''));
const isRegularSeason = (game) => Number(game?.season_type) === 2 || (game?.season_type == null && game?.postseason === false);

async function loadWeek(season, week, refresh) {
  const dir = path.join(ROOT, 'cache', String(season), `week-${week}`);
  // The game list is refetched every run until every game is final.
  const gamesFile = path.join(dir, 'games.json');
  let games = !refresh && fs.existsSync(gamesFile) ? JSON.parse(fs.readFileSync(gamesFile, 'utf8')) : null;
  if (!games || !games.every(isFinal)) {
    games = (await bdlPaged('/nfl/v1/games', { 'seasons[]': season, 'weeks[]': week })).filter(isRegularSeason);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(gamesFile, JSON.stringify(games));
  }
  const finalGames = games.filter(isFinal);
  const playsByGame = {};
  for (const game of finalGames) {
    playsByGame[String(game.id)] = await cached(path.join(dir, `plays-${game.id}.json`), refresh, () => bdlPaged('/nfl/v1/plays', { game_id: game.id }));
  }
  const sleeperStats = await cached(path.join(dir, 'sleeper-stats.json'), refresh, () => fetchJson(`${SLEEPER_BASE}/stats/nfl/regular/${season}/${week}`));
  const scoreboard = await cached(path.join(dir, 'espn-scoreboard.json'), refresh, () => fetchJson(`${ESPN_BASE}/scoreboard?seasontype=2&week=${week}&dates=${season}`));
  const espnBoxScores = {};
  for (const event of scoreboard.events ?? []) {
    if (!event?.status?.type?.completed) continue;
    espnBoxScores[event.id] = await cached(path.join(dir, `espn-summary-${event.id}.json`), refresh, async () => {
      const summary = await fetchJson(`${ESPN_BASE}/summary?event=${event.id}`);
      return { teams: event.competitions?.[0]?.competitors?.map((team) => canonicalTeam(team.team?.abbreviation)) ?? [], players: summary.boxscore?.players ?? [] };
    });
  }
  return { games, finalGames, playsByGame, sleeperStats, espnBoxScores };
}

// ESPN box score columns → Sleeper keys, per statistics group.
const ESPN_COLUMNS = {
  passing: { 'C/ATT': ['pass_cmp', 'pass_att'], YDS: 'pass_yd', TD: 'pass_td', INT: 'pass_int' },
  rushing: { CAR: 'rush_att', YDS: 'rush_yd', TD: 'rush_td' },
  receiving: { REC: 'rec', YDS: 'rec_yd', TD: 'rec_td' },
  fumbles: { FUM: 'fum', LOST: 'fum_lost' },
  kicking: { FG: ['fgm', 'fg_att'], XP: ['xpm', 'xp_att'] },
  defensive: { TOT: 'idp_tkl', SACKS: 'idp_sack', PD: 'idp_pd', 'QB HTS': 'idp_qbhit' },
  interceptions: { INT: 'idp_int' },
};

export function readEspnBoxScore(boxScore) {
  const byEspnId = new Map();
  for (const team of boxScore?.players ?? []) {
    for (const group of team.statistics ?? []) {
      const columns = ESPN_COLUMNS[group.name];
      if (!columns) continue;
      for (const athlete of group.athletes ?? []) {
        const id = String(athlete.athlete?.id ?? '');
        const line = byEspnId.get(id) ?? { name: athlete.athlete?.displayName, team: canonicalTeam(team.team?.abbreviation) };
        (group.labels ?? []).forEach((label, index) => {
          const target = columns[label];
          const raw = athlete.stats?.[index];
          if (!target || raw == null || raw === '--') return;
          if (Array.isArray(target)) {
            const [made, attempted] = String(raw).split('/').map(Number);
            if (Number.isFinite(made)) line[target[0]] = made;
            if (Number.isFinite(attempted)) line[target[1]] = attempted;
          } else if (Number.isFinite(Number(raw))) line[target] = Number(raw);
        });
        if (line.fg_att != null && line.fgm != null) line.fgmiss = line.fg_att - line.fgm;
        if (line.xp_att != null && line.xpm != null) line.xpmiss = line.xp_att - line.xpm;
        byEspnId.set(id, line);
      }
    }
  }
  return byEspnId;
}

// Sleeper spells some defensive stats differently from the play feed's keys
// (the same aliases the live reconciler reads).
const OFFICIAL_ALIASES = { idp_fr: ['idp_fum_rec'], idp_pd: ['idp_pass_def'], idp_qbhit: ['idp_qb_hit'] };

function officialValue(line, key) {
  if (!line) return 0;
  const aliases = OFFICIAL_ALIASES[key];
  if (aliases) return Math.max(Number(line[key]) || 0, ...aliases.map((alias) => Number(line[alias]) || 0));
  if (key === 'idp_tkl') {
    const generic = Number(line.idp_tkl) || 0;
    const split = (Number(line.idp_tkl_solo) || 0) + (Number(line.idp_tkl_ast) || 0);
    return Math.max(generic, split);
  }
  return Number(line[key]) || 0;
}

function addStats(target, stats) {
  Object.entries(stats ?? {}).forEach(([key, value]) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) target[key] = (target[key] ?? 0) + numeric;
  });
  return target;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Diff one finished game: every player either the feed credited or an
 * official source lists, every audited stat, exact match required.
 */
export function auditGame({ game, plays, players, sleeperStats, espnLines = null }) {
  const teams = new Set([getTeamAbbr(game.home_team), getTeamAbbr(game.visitor_team)]);
  // Today's rosters, plus everyone the official box score lists for this game
  // on the team they played for: a player traded since then is otherwise
  // missing from the game, or indexed under his new team.
  const playedFor = new Map();
  if (espnLines) {
    const sleeperIdByEspnId = new Map(Object.entries(players)
      .filter(([, player]) => player?.espn_id != null)
      .map(([id, player]) => [String(player.espn_id), String(id)]));
    espnLines.forEach((line, espnId) => {
      const id = sleeperIdByEspnId.get(espnId);
      if (id && teams.has(getTeamAbbr(line.team))) playedFor.set(id, getTeamAbbr(line.team));
    });
  }
  const roster = Object.entries(players)
    .filter(([id, player]) => playedFor.has(String(id)) || teams.has(getTeamAbbr(player?.team)))
    .map(([id, player]) => ({ id: String(id), player: playedFor.has(String(id)) ? { ...player, team: playedFor.get(String(id)) } : player }));
  const positions = new Map(roster.map(({ id, player }) => [id, player.position]));
  const events = buildPlayEvents({ [String(game.id)]: plays }, buildStarterNameIndex(roster), AUDIT_SCORING, positions, new Map([[String(game.id), game]]));

  const lines = new Map();
  for (const event of events) {
    const line = lines.get(event.playerId) ?? { stats: {}, events: [] };
    addStats(line.stats, event.stats);
    line.events.push(event);
    lines.set(event.playerId, line);
  }

  const espnBySleeperId = new Map();
  if (espnLines) {
    for (const { id, player } of roster) {
      const espn = player.espn_id != null ? espnLines.get(String(player.espn_id)) : null;
      if (espn) espnBySleeperId.set(id, espn);
    }
  }

  const playerIds = new Set([...lines.keys(), ...espnBySleeperId.keys()]);
  const checks = [];
  const mismatches = [];
  for (const playerId of playerIds) {
    const official = sleeperStats?.[playerId];
    if (!official) continue;
    const ours = lines.get(playerId)?.stats ?? {};
    const espn = espnBySleeperId.get(playerId) ?? null;
    const player = players[playerId] ?? {};
    for (const key of ALL_STATS) {
      const oursValue = key === 'idp_tkl'
        ? Math.max(Number(ours.idp_tkl) || 0, (Number(ours.idp_tkl_solo) || 0) + (Number(ours.idp_tkl_ast) || 0))
        : Number(ours[key]) || 0;
      const sleeperValue = officialValue(official, key);
      if (!oursValue && !sleeperValue) continue;
      const espnValue = espn && espn[key] != null ? Number(espn[key]) : null;
      const match = round(oursValue) === round(sleeperValue);
      checks.push({ key, match });
      if (match) continue;
      const surname = String(player.last_name ?? '').trim();
      const credited = (lines.get(playerId)?.events ?? []).filter((event) => Number(event.stats?.[key]) || (key === 'idp_tkl' && TACKLE_KEYS.some((tackle) => Number(event.stats?.[tackle]))));
      const creditedIds = new Set((lines.get(playerId)?.events ?? []).map((event) => String(event.play?.raw?.id ?? event.sharedPlayId)));
      mismatches.push({
        gameId: String(game.id),
        matchup: `${getTeamAbbr(game.visitor_team)} @ ${getTeamAbbr(game.home_team)}`,
        playerId,
        name: player.full_name ?? `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
        position: player.position ?? null,
        team: getTeamAbbr(player.team),
        stat: key,
        gridshift: round(oursValue),
        official: round(sleeperValue),
        espn: espnValue,
        // Official sources disagreeing usually means a stat correction one
        // of them has not applied yet; that is not evidence against the parser.
        officialSourcesAgree: espnValue == null ? null : round(espnValue) === round(sleeperValue),
        creditedPlays: credited.map((event) => ({
          id: String(event.play?.raw?.id ?? event.sharedPlayId),
          clock: event.glance?.clock ?? null,
          type: event.play?.raw?.type_slug ?? null,
          value: key === 'idp_tkl' ? TACKLE_KEYS.reduce((sum, tackle) => sum + (Number(event.stats?.[tackle]) || 0), 0) : Number(event.stats?.[key]),
          shortText: event.play?.raw?.short_text ?? null,
          text: event.play?.raw?.text ?? null,
        })),
        // Feed rows naming the player that credited them nothing at all: the
        // usual place a missed carry, catch or tackle hides.
        uncreditedMentions: surname
          ? plays
            .filter((play) => !creditedIds.has(String(play.id)) && new RegExp(`\\b${surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(`${play.text ?? ''} ${play.short_text ?? ''}`))
            .slice(0, 12)
            .map((play) => ({ id: String(play.id), clock: `Q${play.period} ${play.clock_display}`, type: play.type_slug, shortText: play.short_text, text: play.text }))
          : [],
      });
    }
  }
  return { checks, mismatches };
}

function espnLinesForGame(game, espnBoxScores) {
  const teams = [getTeamAbbr(game.home_team), getTeamAbbr(game.visitor_team)].map(canonicalTeam).sort().join('|');
  const entry = Object.values(espnBoxScores).find((box) => [...box.teams].sort().join('|') === teams);
  return entry ? readEspnBoxScore(entry) : null;
}

function summarize(season, week, results) {
  const byStat = new Map();
  results.checks.forEach(({ key, match }) => {
    const row = byStat.get(key) ?? { compared: 0, matched: 0 };
    row.compared += 1;
    if (match) row.matched += 1;
    byStat.set(key, row);
  });
  const lines = [
    `# Play feed audit — ${season} week ${week}`,
    '',
    `Games audited: ${results.gamesAudited} of ${results.gamesTotal} (finished games only).`,
    `Player stats compared: ${results.checks.length}; mismatches: ${results.mismatches.length}` +
      ` (${results.mismatches.filter((row) => row.officialSourcesAgree === false).length} where Sleeper and ESPN disagree with each other).`,
    '',
    '| Group | Stat | Compared | Matched | Rate |',
    '|---|---|---:|---:|---:|',
  ];
  Object.entries(AUDIT_STATS).forEach(([group, keys]) => keys.forEach((key) => {
    const row = byStat.get(key);
    if (!row) return;
    lines.push(`| ${group} | ${key} | ${row.compared} | ${row.matched} | ${(100 * row.matched / row.compared).toFixed(1)}% |`);
  }));
  lines.push('', '## Mismatches', '');
  results.mismatches
    .slice()
    .sort((left, right) => Math.abs(right.gridshift - right.official) - Math.abs(left.gridshift - left.official))
    .forEach((row) => {
      lines.push(`- ${row.matchup} · ${row.name} (${row.position}) · ${row.stat}: GridShift ${row.gridshift}, official ${row.official}${row.espn != null ? `, ESPN ${row.espn}` : ''}`);
    });
  return lines.join('\n');
}

async function lastCompletedWeek(season) {
  const state = await fetchJson(`${SLEEPER_BASE}/state/nfl`);
  const start = Number(state.season) === season ? Math.max(1, Number(state.week)) : 18;
  for (let week = start; week >= 1; week -= 1) {
    const games = (await bdlPaged('/nfl/v1/games', { 'seasons[]': season, 'weeks[]': week })).filter(isRegularSeason);
    if (games.length && games.every(isFinal)) return week;
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv);
  const state = args.season ? null : await fetchJson(`${SLEEPER_BASE}/state/nfl`);
  const season = args.season ?? Number(state.season);
  const weeks = args.weeks ?? [await lastCompletedWeek(season)].filter(Boolean);
  if (!weeks.length) throw new Error('No completed week found.');

  const players = await cached(path.join(ROOT, 'cache', `sleeper-players-${new Date().toISOString().slice(0, 10)}.json`), args.refresh, () => fetchJson(`${SLEEPER_BASE}/players/nfl`));

  for (const week of weeks) {
    const data = await loadWeek(season, week, args.refresh);
    const results = { season, week, gamesTotal: data.games.length, gamesAudited: data.finalGames.length, checks: [], mismatches: [] };
    for (const game of data.finalGames) {
      const { checks, mismatches } = auditGame({
        game,
        plays: data.playsByGame[String(game.id)],
        players,
        sleeperStats: data.sleeperStats,
        espnLines: espnLinesForGame(game, data.espnBoxScores),
      });
      results.checks.push(...checks);
      results.mismatches.push(...mismatches);
    }
    const outDir = path.join(ROOT, String(season), `week-${week}`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'mismatches.json'), JSON.stringify({ ...results, checks: undefined, generatedAt: new Date().toISOString() }, null, 2));
    fs.writeFileSync(path.join(outDir, 'summary.md'), summarize(season, week, results));
    const matched = results.checks.filter((check) => check.match).length;
    console.log(`Week ${week}: ${results.gamesAudited}/${results.gamesTotal} games, ${matched}/${results.checks.length} stats match, ${results.mismatches.length} mismatches → ${path.relative(process.cwd(), outDir)}/`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
