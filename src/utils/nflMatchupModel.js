// Statistics › Schedule NFL matchup drill-in — pure model helpers.
//
// Everything here is NFL-only: records and points come from the hydrated
// schedule, unit ranks from buildUnitMatchupTable (defenseRankings.js), season
// team rates from the ESPN team-stats sidecar, and in-game numbers from ESPN's
// game summary. No betting lines and no fantasy points.

import { MATCHUP_UNITS } from './defenseRankings.js';
import {
  getScheduleGameScore,
  getScheduleGameTeamId,
  getScheduleWeeks,
  isFinalScheduleGame,
  scheduleHasGames,
} from './statisticsSchedule.js';

export const UNIT_EDGE_GAP = 8;
export const GAME_PACE_THRESHOLD = 0.15;
const MIN_PACE_MINUTES = 5;

const finite = (value) => (value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null);

// ── Game phase ───────────────────────────────────────────────────────────────

/** 'pre' | 'live' | 'final' from the ESPN summary when present, else the schedule. */
export function resolveMatchupPhase(game, summary = null) {
  const state = summary?.status?.state;
  if (state === 'post') return 'final';
  if (state === 'in') return 'live';
  if (state === 'pre') return 'pre';
  return isFinalScheduleGame(game) ? 'final' : 'pre';
}

// ── Season record and results from the schedule ─────────────────────────────

/**
 * Record, points and per-game results for one team from the hydrated schedule.
 * `throughWeek` is inclusive; `beforeWeek` is exclusive (a pregame view).
 */
export function buildTeamSeasonSummary(schedule, teamId, { throughWeek = null, beforeWeek = null } = {}) {
  const team = String(teamId ?? '').toUpperCase();
  const summary = { team, wins: 0, losses: 0, ties: 0, games: 0, pointsFor: 0, pointsAgainst: 0, results: [] };
  if (!team || !scheduleHasGames(schedule)) return summary;
  for (const week of getScheduleWeeks(schedule)) {
    const weekNumber = Number(week.week);
    if (throughWeek != null && weekNumber > throughWeek) continue;
    if (beforeWeek != null && weekNumber >= beforeWeek) continue;
    for (const game of week.games ?? []) {
      const away = getScheduleGameTeamId(game, 'away');
      const home = getScheduleGameTeamId(game, 'home');
      if (away !== team && home !== team) continue;
      if (!isFinalScheduleGame(game)) continue;
      const awayScore = getScheduleGameScore(game, 'away');
      const homeScore = getScheduleGameScore(game, 'home');
      if (awayScore == null || homeScore == null) continue;
      const isHome = home === team;
      const pf = isHome ? homeScore : awayScore;
      const pa = isHome ? awayScore : homeScore;
      const result = pf === pa ? 'T' : pf > pa ? 'W' : 'L';
      summary.games += 1;
      summary.pointsFor += pf;
      summary.pointsAgainst += pa;
      if (result === 'W') summary.wins += 1;
      else if (result === 'L') summary.losses += 1;
      else summary.ties += 1;
      summary.results.push({ week: weekNumber, opponent: isHome ? away : home, isHome, pointsFor: pf, pointsAgainst: pa, result });
    }
  }
  summary.results.sort((a, b) => a.week - b.week);
  return summary;
}

export function formatRecord(summary) {
  if (!summary) return '0–0';
  return summary.ties ? `${summary.wins}–${summary.losses}–${summary.ties}` : `${summary.wins}–${summary.losses}`;
}

export function formatSigned(value, digits = 0) {
  if (value == null || !Number.isFinite(value)) return '—';
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return digits ? (0).toFixed(digits) : '0';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(digits)}`;
}

// ── ESPN season team stats ───────────────────────────────────────────────────

function pickStat(stats, candidates, games) {
  for (const candidate of candidates) {
    const [key, mode = 'value'] = Array.isArray(candidate) ? candidate : [candidate];
    const entry = stats?.[key];
    if (!entry) continue;
    if (mode === 'perGame') {
      if (entry.perGameValue != null) return entry.perGameValue;
      if (entry.value != null && games > 0) return entry.value / games;
      continue;
    }
    if (entry.value != null) return entry.value;
  }
  return null;
}

const asPercent = (value) => (value == null ? null : value <= 1 ? value * 100 : value);

function formatClockSeconds(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The "Season at a glance" rows for two teams. Each row carries raw numbers
 * (for bars and leaders) and display strings; rows neither team has are left out.
 */
export function buildSeasonGlanceRows({ left, right }) {
  const side = ({ summary, stats }) => {
    const games = summary?.games ?? 0;
    return {
      ppg: games ? summary.pointsFor / games : null,
      papg: games ? summary.pointsAgainst / games : null,
      diff: games ? summary.pointsFor - summary.pointsAgainst : null,
      yards: pickStat(stats, ['passing.yardsPerGame', ['passing.totalYards', 'perGame'], ['general.totalYards', 'perGame']], games),
      pass: pickStat(stats, ['passing.netPassingYardsPerGame', ['passing.netPassingYards', 'perGame']], games),
      rush: pickStat(stats, ['rushing.rushingYardsPerGame', ['rushing.rushingYards', 'perGame']], games),
      third: asPercent(pickStat(stats, ['miscellaneous.thirdDownConvPct'], games)),
      redZone: asPercent(pickStat(stats, ['miscellaneous.redzoneTouchdownPct', 'miscellaneous.redzoneScoringPct', 'miscellaneous.redzoneEfficiencyPct'], games)),
      turnovers: pickStat(stats, ['miscellaneous.turnOverDifferential'], games),
      sacks: pickStat(stats, ['defensive.sacks'], games),
      possession: pickStat(stats, [['miscellaneous.possessionTimeSeconds', 'perGame']], games),
    };
  };
  const a = side(left);
  const b = side(right);
  const one = (value) => (value == null ? '—' : value.toFixed(1));
  const pct = (value) => (value == null ? '—' : `${value.toFixed(1)}%`);
  const rows = [
    { id: 'ppg', label: 'Points / game', format: one },
    { id: 'papg', label: 'Points allowed / game', format: one, lowerWins: true },
    { id: 'diff', label: 'Point differential', format: (v) => formatSigned(v) },
    { id: 'yards', label: 'Yards / game', format: one },
    { id: 'pass', label: 'Pass yards / game', format: one },
    { id: 'rush', label: 'Rush yards / game', format: one },
    { id: 'third', label: '3rd-down conversion', format: pct },
    { id: 'redZone', label: 'Red-zone TD rate', format: pct },
    { id: 'turnovers', label: 'Turnover margin', format: (v) => formatSigned(v) },
    { id: 'sacks', label: 'Sacks', format: (v) => (v == null ? '—' : String(Math.round(v))) },
    { id: 'possession', label: 'Time of possession / game', format: formatClockSeconds },
  ];
  return rows
    .filter((row) => a[row.id] != null || b[row.id] != null)
    .map((row) => ({
      id: row.id,
      label: row.label,
      a: row.format(a[row.id]),
      b: row.format(b[row.id]),
      aValue: a[row.id],
      bValue: b[row.id],
      lowerWins: Boolean(row.lowerWins),
    }));
}

// ── Unit vs unit ─────────────────────────────────────────────────────────────

/** 'offense' | 'defense' | 'even' | null from two ranks (1 = strongest). */
export function getUnitEdge(offenseRank, defenseRank, gap = UNIT_EDGE_GAP) {
  if (offenseRank == null || defenseRank == null) return null;
  const delta = defenseRank - offenseRank;
  if (delta >= gap) return 'offense';
  if (delta <= -gap) return 'defense';
  return 'even';
}

export function getRankTier(rank) {
  if (rank == null) return null;
  if (rank <= 6) return 'a';
  if (rank <= 12) return 'b';
  if (rank <= 20) return 'c';
  if (rank <= 26) return 'd';
  return 'f';
}

export function formatUnitValue(unitId, value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return unitId === 'K' ? value.toFixed(1) : value.toFixed(1);
}

/**
 * One panel: `offenseTeam`'s offense against `defenseTeam`'s defense. Rows are
 * in MATCHUP_UNITS order; each carries the unit, both averages and ranks, and
 * the edge. A unit with no sample on either side is dropped.
 */
export function buildUnitPanel(table, offenseTeam, defenseTeam) {
  const offense = table?.get(offenseTeam);
  const defense = table?.get(defenseTeam);
  if (!offense || !defense) return [];
  return MATCHUP_UNITS.map((unit) => {
    const off = offense.offense[unit.id];
    const def = defense.defense[unit.id];
    return {
      unit,
      offense: { team: offenseTeam, avg: off.avg, rank: off.rank },
      defense: { team: defenseTeam, avg: def.avg, rank: def.rank },
      edge: getUnitEdge(off.rank, def.rank),
    };
  }).filter((row) => row.offense.avg != null || row.defense.avg != null);
}

const UNIT_NOUNS = { PASS: 'passing game', RUN: 'ground game', QB: 'quarterbacks', RB: 'running backs', WR: 'receivers', TE: 'tight ends', K: 'kicking game' };
const UNIT_MEASURES = {
  PASS: 'passing yards',
  RUN: 'rushing yards',
  QB: 'passing yards',
  RB: 'scrimmage yards',
  WR: 'receiving yards',
  TE: 'receiving yards',
  K: 'field goals made',
};

/**
 * "Where it tilts": the widest unit-vs-unit gaps from both panels, largest
 * first. Each key is structured text so the view can emphasise the numbers.
 */
export function buildMatchupKeys(panels, teamNames = {}, limit = 3) {
  const name = (team) => teamNames[team] ?? team;
  const candidates = [];
  for (const rows of panels) {
    for (const row of rows) {
      if (!row.edge || row.edge === 'even') continue;
      const gap = Math.abs(row.defense.rank - row.offense.rank);
      const noun = UNIT_NOUNS[row.unit.id] ?? row.unit.label;
      const measure = UNIT_MEASURES[row.unit.id] ?? row.unit.sub.replace(/ \/ game$/, '');
      if (row.edge === 'offense') {
        candidates.push({
          id: `${row.offense.team}-off-${row.unit.id}`,
          gap,
          tag: `${row.offense.team} offense · ${row.unit.label}`,
          parts: [
            { text: `${name(row.offense.team)}’s ${noun} rank ` },
            { text: `#${row.offense.rank}`, emphasis: true },
            { text: ` (${formatUnitValue(row.unit.id, row.offense.avg)} ${measure} per game), and ${name(row.defense.team)} ranks ` },
            { text: `#${row.defense.rank}`, emphasis: true },
            { text: ' defending them.' },
          ],
        });
      } else {
        candidates.push({
          id: `${row.defense.team}-def-${row.unit.id}`,
          gap,
          tag: `${row.defense.team} defense · ${row.unit.label}`,
          parts: [
            { text: `${name(row.defense.team)} allows ` },
            { text: `${formatUnitValue(row.unit.id, row.defense.avg)} ${measure} per game (#${row.defense.rank})`, emphasis: true },
            { text: ` against ${noun}, a tough draw for a ${name(row.offense.team)} unit ranked ` },
            { text: `#${row.offense.rank}`, emphasis: true },
            { text: '.' },
          ],
        });
      }
    }
  }
  return candidates.sort((a, b) => b.gap - a.gap || a.id.localeCompare(b.id)).slice(0, limit);
}

// ── Season leaders from weekly player stats ─────────────────────────────────

function playerName(player, playerId) {
  return player?.full_name || `${player?.first_name ?? ''} ${player?.last_name ?? ''}`.trim() || String(playerId);
}

/** Top passer, rusher and receiver for one team from Sleeper-shaped weekly stats. */
export function buildTeamSeasonLeaders({ weeklyStats, players, teamId, throughWeek = null }) {
  const team = String(teamId ?? '').toUpperCase();
  const totals = new Map();
  for (const [playerId, weeks] of Object.entries(weeklyStats ?? {})) {
    const player = players?.[playerId];
    if (!player || !['QB', 'RB', 'WR', 'TE'].includes(player.position)) continue;
    for (const entry of weeks ?? []) {
      const week = Number(entry?.week);
      if (throughWeek != null && week > throughWeek) continue;
      const entryTeam = String(entry?.team ?? player.team ?? '').toUpperCase();
      if (entryTeam !== team) continue;
      const current = totals.get(playerId) ?? {
        id: playerId,
        name: playerName(player, playerId),
        position: player.position,
        sleeperId: playerId,
        espnId: player.espn_id ?? player.espnId ?? null,
        games: 0,
        pass_yd: 0, pass_td: 0, pass_int: 0, rush_att: 0, rush_yd: 0, rush_td: 0, rec: 0, rec_yd: 0, rec_td: 0,
      };
      current.games += 1;
      for (const key of ['pass_yd', 'pass_td', 'pass_int', 'rush_att', 'rush_yd', 'rush_td', 'rec', 'rec_yd', 'rec_td']) {
        current[key] += Number(entry[key] ?? 0) || 0;
      }
      totals.set(playerId, current);
    }
  }
  const list = [...totals.values()];
  const top = (key) => list.filter((row) => row[key] > 0).sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name))[0] ?? null;
  const leaders = [];
  const passer = top('pass_yd');
  if (passer) leaders.push({ ...passer, kind: 'passing', big: Math.round(passer.pass_yd), bigLabel: 'Pass yds', meta: `${passer.position} · ${passer.pass_td} TD · ${passer.pass_int} INT` });
  const rusher = top('rush_yd');
  if (rusher && rusher.id !== passer?.id) {
    const ypc = rusher.rush_att ? ` · ${(rusher.rush_yd / rusher.rush_att).toFixed(1)} ypc` : '';
    leaders.push({ ...rusher, kind: 'rushing', big: Math.round(rusher.rush_yd), bigLabel: 'Rush yds', meta: `${rusher.position} · ${rusher.rush_td} TD${ypc}` });
  }
  const receiver = top('rec_yd');
  if (receiver && !leaders.some((row) => row.id === receiver.id)) {
    leaders.push({ ...receiver, kind: 'receiving', big: Math.round(receiver.rec_yd), bigLabel: 'Rec yds', meta: `${receiver.position} · ${receiver.rec} rec · ${receiver.rec_td} TD` });
  }
  return leaders;
}

// ── ESPN game summary (live and final) ──────────────────────────────────────

function readStatBlock(group) {
  const keys = group?.keys ?? [];
  return (group?.athletes ?? []).map((row) => {
    const values = {};
    keys.forEach((key, index) => { values[key] = row?.stats?.[index] ?? null; });
    return {
      id: row?.athlete?.id != null ? String(row.athlete.id) : null,
      name: row?.athlete?.displayName ?? row?.athlete?.shortName ?? '',
      shortName: row?.athlete?.shortName ?? row?.athlete?.displayName ?? '',
      position: String(row?.athlete?.position?.abbreviation ?? '').toUpperCase() || null,
      imageUrl: row?.athlete?.headshot?.href ?? null,
      values,
    };
  });
}

function splitPair(value) {
  const match = String(value ?? '').match(/^(\d+)\s*[-/]\s*(\d+)/);
  return match ? [Number(match[1]), Number(match[2])] : [null, null];
}

function parseClockMinutes(clock) {
  const match = String(clock ?? '').match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) + Number(match[2]) / 60 : null;
}

/** Minutes of game time played, or null when the clock can't be read. */
export function getElapsedGameMinutes(period, clock) {
  const quarter = Number(period);
  const remaining = parseClockMinutes(clock);
  if (!Number.isInteger(quarter) || quarter < 1 || remaining == null) return null;
  if (quarter <= 4) return (quarter - 1) * 15 + (15 - remaining);
  return 60 + (quarter - 5) * 10 + (10 - Math.min(10, remaining));
}

/**
 * Normalize ESPN's `/summary?event=` payload into the drill-in's live/final
 * shape. Unknown or missing blocks come back empty rather than throwing.
 */
export function normalizeEspnGameSummary(summary) {
  if (!summary || typeof summary !== 'object') return null;
  const competition = summary?.header?.competitions?.[0] ?? {};
  const statusType = competition?.status?.type ?? {};
  const teams = {};
  for (const competitor of competition?.competitors ?? []) {
    const abbr = String(competitor?.team?.abbreviation ?? '').toUpperCase();
    if (!abbr) continue;
    teams[abbr === 'WSH' ? 'WAS' : abbr] = {
      espnId: competitor?.team?.id != null ? String(competitor.team.id) : competitor?.id != null ? String(competitor.id) : null,
      homeAway: competitor?.homeAway ?? null,
      score: finite(competitor?.score),
      linescores: (competitor?.linescores ?? []).map((line) => finite(line?.displayValue ?? line?.value)),
      possession: competitor?.possession === true,
      winner: competitor?.winner === true,
    };
  }
  const abbrByEspnId = new Map(Object.entries(teams).map(([abbr, team]) => [team.espnId, abbr]));
  const teamFromRef = (value) => {
    if (!value) return null;
    const direct = String(value?.abbreviation ?? '').toUpperCase();
    if (direct) return direct === 'WSH' ? 'WAS' : direct;
    const id = value?.id != null ? String(value.id) : String(value).match(/teams\/(\d+)/)?.[1] ?? String(value);
    return abbrByEspnId.get(id) ?? null;
  };

  const situationSource = summary?.situation ?? competition?.situation ?? null;
  const situation = situationSource ? {
    possessionTeam: teamFromRef(situationSource.possession) ?? Object.entries(teams).find(([, team]) => team.possession)?.[0] ?? null,
    downDistanceText: situationSource.downDistanceText ?? situationSource.shortDownDistanceText ?? null,
    yardLine: finite(situationSource.yardLine),
    possessionText: situationSource.possessionText ?? null,
    isRedZone: situationSource.isRedZone === true,
    homeTimeouts: finite(situationSource.homeTimeouts),
    awayTimeouts: finite(situationSource.awayTimeouts),
  } : null;

  const teamStats = {};
  for (const block of summary?.boxscore?.teams ?? []) {
    const abbr = teamFromRef(block?.team);
    if (!abbr) continue;
    teamStats[abbr] = Object.fromEntries((block?.statistics ?? []).map((stat) => [stat?.name, stat?.displayValue ?? null]));
  }

  const playersByTeam = {};
  for (const block of summary?.boxscore?.players ?? []) {
    const abbr = teamFromRef(block?.team);
    if (!abbr) continue;
    playersByTeam[abbr] = Object.fromEntries((block?.statistics ?? []).map((group) => [group?.name, readStatBlock(group)]));
  }

  const drivePlays = [];
  const collectDrive = (drive) => {
    const team = teamFromRef(drive?.team);
    for (const play of drive?.plays ?? []) {
      drivePlays.push({
        id: play?.id != null ? String(play.id) : `${drive?.id}-${drivePlays.length}`,
        team,
        period: finite(play?.period?.number),
        clock: play?.clock?.displayValue ?? null,
        text: play?.text ?? '',
        downDistanceText: play?.start?.shortDownDistanceText ?? play?.start?.downDistanceText ?? null,
        possessionText: play?.start?.possessionText ?? null,
        yards: finite(play?.statYardage),
        scoring: play?.scoringPlay === true,
        type: play?.type?.text ?? null,
        awayScore: finite(play?.awayScore),
        homeScore: finite(play?.homeScore),
      });
    }
  };
  (summary?.drives?.previous ?? []).forEach(collectDrive);
  const current = summary?.drives?.current ?? null;
  if (current && !(summary?.drives?.previous ?? []).some((drive) => drive?.id === current?.id)) collectDrive(current);

  const currentDrive = current ? {
    team: teamFromRef(current.team),
    plays: finite(current.offensivePlays) ?? (current.plays ?? []).length,
    yards: finite(current.yards),
    time: current?.timeElapsed?.displayValue ?? null,
  } : null;

  const scoringPlays = (summary?.scoringPlays ?? []).map((play, index) => ({
    id: play?.id != null ? String(play.id) : `score-${index}`,
    team: teamFromRef(play?.team),
    period: finite(play?.period?.number),
    clock: play?.clock?.displayValue ?? null,
    text: play?.text ?? '',
    kind: play?.scoringType?.abbreviation ?? play?.type?.abbreviation ?? null,
    awayScore: finite(play?.awayScore),
    homeScore: finite(play?.homeScore),
  }));

  return {
    status: {
      state: statusType.state ?? null,
      completed: statusType.completed === true,
      detail: statusType.shortDetail ?? statusType.detail ?? null,
      period: finite(competition?.status?.period),
      clock: competition?.status?.displayClock ?? null,
    },
    teams,
    situation,
    currentDrive,
    recentPlays: drivePlays.filter((play) => play.text).slice(-5).reverse(),
    scoringPlays,
    teamStats,
    playersByTeam,
  };
}

function sumPlayers(rows, key, positions = null) {
  let total = 0;
  let found = false;
  for (const row of rows ?? []) {
    if (positions && (!row.position || !positions.includes(row.position))) continue;
    const value = finite(String(row.values?.[key] ?? '').replace(/,/g, ''));
    if (value == null) continue;
    total += value;
    found = true;
  }
  return found ? total : null;
}

const hasPositions = (groups) => Object.values(groups ?? {}).some((rows) => (rows ?? []).some((row) => row.position));

/** One team's in-game production per matchup unit from a normalized summary. */
export function getGameUnitValues(game, teamId) {
  const groups = game?.playersByTeam?.[teamId] ?? {};
  const stats = game?.teamStats?.[teamId] ?? {};
  const positional = hasPositions(groups);
  const passing = groups.passing ?? [];
  const rushing = groups.rushing ?? [];
  const receiving = groups.receiving ?? [];
  const kicking = groups.kicking ?? [];
  const values = {
    PASS: finite(String(stats.netPassingYards ?? '').replace(/,/g, '')) ?? sumPlayers(passing, 'passingYards'),
    RUN: finite(String(stats.rushingYards ?? '').replace(/,/g, '')) ?? sumPlayers(rushing, 'rushingYards'),
    QB: positional ? sumPlayers(passing, 'passingYards', ['QB']) : sumPlayers(passing, 'passingYards'),
    RB: positional
      ? ((sumPlayers(rushing, 'rushingYards', ['RB']) ?? 0) + (sumPlayers(receiving, 'receivingYards', ['RB']) ?? 0))
      : null,
    WR: positional ? sumPlayers(receiving, 'receivingYards', ['WR']) ?? 0 : null,
    TE: positional ? sumPlayers(receiving, 'receivingYards', ['TE']) ?? 0 : null,
    K: (() => {
      let made = null;
      for (const row of kicking) {
        const [fgm] = splitPair(row.values?.['fieldGoalsMade/fieldGoalAttempts']);
        if (fgm != null) made = (made ?? 0) + fgm;
      }
      return made ?? (kicking.length ? 0 : null);
    })(),
  };
  return values;
}

/**
 * Game tracker rows: what each offense has done in this game against what the
 * defense allowed per game entering the week. Live values are scaled to 60
 * minutes (pace); final values are compared as-is.
 */
export function buildGameTrackerPanel({ game, table, tableAfter = null, offenseTeam, defenseTeam, live }) {
  const values = getGameUnitValues(game, offenseTeam);
  const defense = table?.get(defenseTeam) ?? null;
  const defenseAfter = tableAfter?.get(defenseTeam) ?? null;
  const elapsed = live ? getElapsedGameMinutes(game?.status?.period, game?.status?.clock) : null;
  const paceFactor = live && elapsed != null && elapsed >= MIN_PACE_MINUTES ? 60 / elapsed : null;
  return MATCHUP_UNITS.map((unit) => {
    const value = values[unit.id];
    if (value == null) return null;
    const avg = defense?.defense?.[unit.id]?.avg ?? null;
    const compare = live ? (paceFactor != null ? value * paceFactor : null) : value;
    let verdict = null;
    let ratio = null;
    if (compare != null && avg != null && avg > 0) {
      ratio = (compare - avg) / avg;
      verdict = ratio > GAME_PACE_THRESHOLD ? 'above' : ratio < -GAME_PACE_THRESHOLD ? 'under' : 'par';
    }
    return {
      unit,
      offenseTeam,
      defenseTeam,
      value,
      pace: live && paceFactor != null ? value * paceFactor : null,
      defenseAvg: avg,
      defenseRank: defense?.defense?.[unit.id]?.rank ?? null,
      defenseRankAfter: defenseAfter?.defense?.[unit.id]?.rank ?? null,
      ratio,
      verdict,
    };
  }).filter(Boolean);
}

/** Pair of team-stat rows for this game from the summary's team box score. */
export function buildGameTeamStatRows(game, leftTeam, rightTeam) {
  const a = game?.teamStats?.[leftTeam] ?? {};
  const b = game?.teamStats?.[rightTeam] ?? {};
  const num = (value) => finite(String(value ?? '').replace(/,/g, ''));
  const pairRate = (value) => { const [made, att] = splitPair(value); return made != null && att ? made / att : null; };
  const pairFirst = (value) => splitPair(value)[0];
  const clock = (value) => parseClockMinutes(value);
  const defs = [
    { id: 'totalYards', label: 'Total yards', read: num },
    { id: 'netPassingYards', label: 'Passing yards', read: num },
    { id: 'rushingYards', label: 'Rushing yards', read: num },
    { id: 'firstDowns', label: 'First downs', read: num },
    { id: 'thirdDownEff', label: '3rd down', read: pairRate },
    { id: 'turnovers', label: 'Turnovers', read: num, lowerWins: true },
    { id: 'possessionTime', label: 'Time of possession', read: clock },
    { id: 'totalPenaltiesYards', label: 'Penalties', read: pairFirst, lowerWins: true },
  ];
  const rows = defs
    .filter((def) => a[def.id] != null || b[def.id] != null)
    .map((def) => ({
      id: def.id,
      label: def.label,
      a: a[def.id] ?? '—',
      b: b[def.id] ?? '—',
      aValue: def.read(a[def.id]),
      bValue: def.read(b[def.id]),
      lowerWins: Boolean(def.lowerWins),
    }));
  // A team's sacks are the times it brought the other quarterback down.
  const aSacks = pairFirst(b.sacksYardsLost);
  const bSacks = pairFirst(a.sacksYardsLost);
  if (aSacks != null || bSacks != null) {
    rows.push({ id: 'sacks', label: 'Sacks', a: aSacks ?? '—', b: bSacks ?? '—', aValue: aSacks, bValue: bSacks, lowerWins: false });
  }
  return rows;
}

/** Top passer, rusher and receiver for one side of a game box score. */
export function buildGameLeaders(game, teamId) {
  const groups = game?.playersByTeam?.[teamId] ?? {};
  const top = (rows, key) => [...(rows ?? [])]
    .map((row) => ({ row, value: finite(String(row.values?.[key] ?? '').replace(/,/g, '')) }))
    .filter((entry) => entry.value != null)
    .sort((x, y) => y.value - x.value)[0] ?? null;
  const leaders = [];
  const pass = top(groups.passing, 'passingYards');
  if (pass) {
    const v = pass.row.values;
    leaders.push({ id: pass.row.id ?? pass.row.name, espnId: pass.row.id, imageUrl: pass.row.imageUrl, name: pass.row.name, position: pass.row.position ?? 'QB', big: pass.value, bigLabel: 'Pass yds', meta: [v['completions/passingAttempts'], v.passingTouchdowns != null ? `${v.passingTouchdowns} TD` : null, v.interceptions != null ? `${v.interceptions} INT` : null].filter(Boolean).join(' · ') });
  }
  const rush = top(groups.rushing, 'rushingYards');
  if (rush && !leaders.some((l) => l.id === (rush.row.id ?? rush.row.name))) {
    const v = rush.row.values;
    leaders.push({ id: rush.row.id ?? rush.row.name, espnId: rush.row.id, imageUrl: rush.row.imageUrl, name: rush.row.name, position: rush.row.position ?? 'RB', big: rush.value, bigLabel: 'Rush yds', meta: [v.rushingAttempts != null ? `${v.rushingAttempts} car` : null, v.rushingTouchdowns != null ? `${v.rushingTouchdowns} TD` : null].filter(Boolean).join(' · ') });
  }
  const rec = top(groups.receiving, 'receivingYards');
  if (rec && !leaders.some((l) => l.id === (rec.row.id ?? rec.row.name))) {
    const v = rec.row.values;
    leaders.push({ id: rec.row.id ?? rec.row.name, espnId: rec.row.id, imageUrl: rec.row.imageUrl, name: rec.row.name, position: rec.row.position ?? 'WR', big: rec.value, bigLabel: 'Rec yds', meta: [v.receptions != null ? `${v.receptions} rec` : null, v.receivingTouchdowns != null ? `${v.receivingTouchdowns} TD` : null].filter(Boolean).join(' · ') });
  }
  return leaders;
}
