import {
  calcPoints,
  getPositionScoringSettings,
  STAT_TO_SCORING_KEY,
} from './scoringEngine.js';

const EPSILON = 0.005;
const TEAM_DEFENSE_POSITIONS = new Set(['DEF', 'DST', 'D/ST']);
const TEAM_DEFENSE_ALLOWED_BUCKETS = [
  ['pts_allow_0', 'pts_allow', 0, 0],
  ['pts_allow_1_6', 'pts_allow', 1, 6],
  ['pts_allow_7_13', 'pts_allow', 7, 13],
  ['pts_allow_14_17', 'pts_allow', 14, 17],
  ['pts_allow_18_21', 'pts_allow', 18, 21],
  ['pts_allow_22_27', 'pts_allow', 22, 27],
  ['pts_allow_14_20', 'pts_allow', 14, 20],
  ['pts_allow_21_27', 'pts_allow', 21, 27],
  ['pts_allow_28_34', 'pts_allow', 28, 34],
  ['pts_allow_35_45', 'pts_allow', 35, 45],
  ['pts_allow_46p', 'pts_allow', 46, Infinity],
  ['pts_allow_35p', 'pts_allow', 35, Infinity],
  ['yds_allow_0_100', 'yds_allow', 0, 100],
  ['yds_allow_100_199', 'yds_allow', 100, 199],
  ['yds_allow_200_299', 'yds_allow', 200, 299],
  ['yds_allow_300_349', 'yds_allow', 300, 349],
  ['yds_allow_350_399', 'yds_allow', 350, 399],
  ['yds_allow_400_449', 'yds_allow', 400, 449],
  ['yds_allow_450_499', 'yds_allow', 450, 499],
  ['yds_allow_500_549', 'yds_allow', 500, 549],
  ['yds_allow_550p', 'yds_allow', 550, Infinity],
];

function roundPoints(value) {
  return Math.round(Number(value) * 100) / 100;
}

function normalizeName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, '')
    .replace(/[.''-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPlayerName(player = {}) {
  return player.full_name
    ?? player.displayName
    ?? player.name
    ?? `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim()
    ?? '';
}

function addCandidate(candidates, value) {
  if (value == null) return;
  const normalized = String(value).trim();
  if (!normalized || candidates.includes(normalized)) return;
  candidates.push(normalized);
}

function getPlayerIdCandidates(query = {}) {
  const candidates = [];
  const rawIds = [
    query.playerId,
    query.id,
    query.sleeperId,
    query.espnId,
    query.espn_id,
  ];
  for (const id of rawIds) {
    addCandidate(candidates, id);
    if (id != null && /^\d+$/.test(String(id))) addCandidate(candidates, `espn:${id}`);
  }
  return candidates;
}

function buildFallbackPlayer(query = {}, id = null) {
  const displayName = query.playerName ?? query.player ?? query.name ?? id ?? '';
  return {
    full_name: displayName,
    position: query.position ?? null,
  };
}

export function findFantasyDiagnosticPlayer(players = {}, query = {}, weeklyStats = {}) {
  const candidates = getPlayerIdCandidates(query);
  for (const id of candidates) {
    if (players?.[id]) return { id, player: players[id], matchType: 'id' };
  }
  for (const id of candidates) {
    if (weeklyStats?.[id]) return { id, player: buildFallbackPlayer(query, id), matchType: 'weekly-id' };
  }

  const requestedName = normalizeName(query.playerName ?? query.player ?? query.name);
  if (!requestedName) return null;

  for (const [id, player] of Object.entries(players ?? {})) {
    const playerName = normalizeName(getPlayerName(player));
    if (playerName && playerName === requestedName) return { id, player, matchType: 'name' };
  }

  for (const [id, player] of Object.entries(players ?? {})) {
    const playerName = normalizeName(getPlayerName(player));
    if (playerName && playerName.includes(requestedName)) return { id, player, matchType: 'partial-name' };
  }

  return null;
}

function inferPositionFromStats(entry = {}) {
  if ((entry.pass_att ?? entry.pass_cmp ?? entry.pass_yd ?? entry.pass_td) != null) return 'QB';
  if ((entry.fgm ?? entry.xpm ?? entry.fgmiss ?? entry.xpmiss) != null) return 'K';
  if ((entry.pts_allow ?? entry.yds_allow ?? entry.sack ?? entry.int ?? entry.safe) != null) return 'DEF';
  return null;
}

function getAppliedFantasyTotal(entry = {}) {
  const value = entry._fantasyPoints ?? entry.fantasy_points ?? entry.appliedTotal;
  return Number.isFinite(Number(value)) ? roundPoints(value) : null;
}

function isTeamDefensePosition(position) {
  return TEAM_DEFENSE_POSITIONS.has(String(position ?? '').toUpperCase());
}

function getTeamDefenseTeam(player = {}) {
  return player.team
    ?? player.team_abbr
    ?? player.teamAbbr
    ?? player.proTeam
    ?? player.metadata?.team
    ?? null;
}

function flattenStatsJson(statsJson) {
  const flat = {};
  for (const category of statsJson?.splits?.categories ?? []) {
    for (const stat of category?.stats ?? []) {
      const key = stat?.name;
      const value = Number(stat?.value ?? stat?.displayValue);
      if (!key || !Number.isFinite(value)) continue;
      flat[key] = value;
    }
  }
  return flat;
}

function parseMetaScore(score) {
  const match = String(score ?? '').match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return [null, null];
  const left = Number(match[1]);
  const right = Number(match[2]);
  return [
    Number.isFinite(left) ? left : null,
    Number.isFinite(right) ? right : null,
  ];
}

function getEffectiveMetaResult(meta = {}) {
  const [teamScore, opponentScore] = parseMetaScore(meta.score);
  if (Number.isFinite(teamScore) && Number.isFinite(opponentScore)) {
    if (teamScore > opponentScore) return 'W';
    if (teamScore < opponentScore) return 'L';
    return 'T';
  }

  const result = String(meta.result ?? '-').toUpperCase();
  return ['W', 'L', 'T'].includes(result) ? result : '-';
}

function setRangeStat(target, key, value, min, max = Infinity) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return;
  target[key] = numericValue >= min && numericValue <= max ? 1 : 0;
}

function setTeamDefenseAllowanceBuckets(target) {
  for (const [key, sourceKey, min, max] of TEAM_DEFENSE_ALLOWED_BUCKETS) {
    setRangeStat(target, key, target[sourceKey], min, max);
  }
}

function clearTeamDefenseAllowanceBuckets(target) {
  for (const [key] of TEAM_DEFENSE_ALLOWED_BUCKETS) delete target[key];
}

function getUniqueNumericValues(values = []) {
  const unique = [];
  for (const value of values) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) continue;
    if (!unique.some((existing) => Math.abs(existing - numericValue) < EPSILON)) {
      unique.push(numericValue);
    }
  }
  return unique;
}

function withTeamDefenseAllowances(row, pointsAllowed, yardsAllowed) {
  const next = { ...row };
  clearTeamDefenseAllowanceBuckets(next);
  if (Number.isFinite(Number(pointsAllowed))) next.pts_allow = Number(pointsAllowed);
  if (Number.isFinite(Number(yardsAllowed))) next.yds_allow = Number(yardsAllowed);
  setTeamDefenseAllowanceBuckets(next);
  return next;
}

function buildTeamDefenseDerivedRow(game = {}) {
  if (!game?.statsJson || game?.meta?.isBye || game?.meta?.isInactive || game?.meta?.isPostseason) return null;
  const week = Number(game?.meta?.week);
  if (!Number.isFinite(week)) return null;
  const row = {
    ...flattenStatsJson(game.statsJson),
    week,
    opponent: game.meta?.opponent ?? null,
    result: game.meta?.result ?? null,
    score: game.meta?.score ?? null,
  };

  setTeamDefenseAllowanceBuckets(row);
  const result = getEffectiveMetaResult(game.meta);
  if (result === 'W') row.team_win = 1;
  if (result === 'L') row.team_loss = 1;
  if (result === 'T') row.team_tie = 1;
  return row;
}

function clearAppliedFantasyFields(row = {}) {
  const next = { ...row };
  delete next._fantasyPoints;
  delete next.fantasy_points;
  delete next.appliedTotal;
  delete next._fantasyContributions;
  delete next._espnAppliedStats;
  return next;
}

function getFantasyTotalDiff(row, scoringSettings, position, appliedTotal) {
  return Math.abs(roundPoints(calcPoints(clearAppliedFantasyFields(row), scoringSettings, position) - appliedTotal));
}

function getHiddenCandidateCount(row, key) {
  const value = Number(row?.[`_${key}`] ?? row?.[key] ?? 0);
  return Number.isFinite(value) ? Math.floor(Math.max(0, value)) : 0;
}

function addIncrementalStatCandidates(baseRows, row, statKey, candidateKeys = []) {
  const available = candidateKeys.reduce((sum, key) => sum + getHiddenCandidateCount(row, key), 0);
  if (available <= 0) return;

  for (const baseRow of [...baseRows]) {
    const currentValue = Number(baseRow?.[statKey] ?? 0) || 0;
    for (let count = 1; count <= available; count += 1) {
      baseRows.push({ ...baseRow, [statKey]: currentValue + count });
    }
  }
}

export function reconcileDstAppliedFantasyStats(row, scoringSettings, position = 'DEF') {
  if (!row || !scoringSettings || !isTeamDefensePosition(position)) return row;
  const appliedTotal = getAppliedFantasyTotal(row);
  if (!Number.isFinite(appliedTotal)) return row;

  let best = row;
  let bestDiff = getFantasyTotalDiff(row, scoringSettings, position, appliedTotal);
  if (bestDiff < EPSILON) return row;

  const baseRows = [row];
  if (Number(row.def_int_td ?? 0) > 0 && Number(row.int ?? 0) > 0) {
    baseRows.push({ ...row, int: Math.max(0, Number(row.int ?? 0) - 1) });
  }
  const failedTwoPointStops = Math.floor(Number(row._def_2pt_failed_stop ?? row.def_2pt_failed_stop ?? 0));
  if (failedTwoPointStops > 0) {
    for (const baseRow of [...baseRows]) {
      const currentTwoPointReturns = Number(baseRow.def_2pt ?? 0) || 0;
      for (let count = 1; count <= failedTwoPointStops; count += 1) {
        baseRows.push({ ...baseRow, def_2pt: currentTwoPointReturns + count });
      }
    }
  }
  const turnoverReturnForcedFumbles = Math.floor(Number(
    row._def_ff_turnover_return_candidate ?? row.def_ff_turnover_return_candidate ?? 0,
  ));
  if (turnoverReturnForcedFumbles > 0) {
    for (const baseRow of [...baseRows]) {
      const currentForcedFumbles = Number(baseRow.def_ff ?? 0) || 0;
      for (let count = 1; count <= turnoverReturnForcedFumbles; count += 1) {
        baseRows.push({ ...baseRow, def_ff: currentForcedFumbles + count });
      }
    }
  }
  addIncrementalStatCandidates(baseRows, row, 'fum_rec', [
    'fum_rec_own_recovery_candidate',
    'fum_rec_blocked_kick_candidate',
    'fum_rec_touchback_candidate',
    'fum_rec_out_of_bounds_candidate',
  ]);

  const pointsAllowedOptions = getUniqueNumericValues([
    row.pts_allow,
    row._pts_allow_adjusted,
    row.pts_allow_adjusted,
    row._pts_allow_raw,
    row.pts_allow_raw,
  ]);
  const yardsAllowedOptions = getUniqueNumericValues([
    row.yds_allow,
    row._yds_allow_raw,
    row.yds_allow_raw,
    row._yds_allow_with_return_tds,
    row.yds_allow_with_return_tds,
  ]);
  const candidates = [];
  for (const baseRow of baseRows) {
    candidates.push(baseRow);
    for (const pointsAllowed of pointsAllowedOptions.length ? pointsAllowedOptions : [baseRow.pts_allow]) {
      for (const yardsAllowed of yardsAllowedOptions.length ? yardsAllowedOptions : [baseRow.yds_allow]) {
        candidates.push(withTeamDefenseAllowances(baseRow, pointsAllowed, yardsAllowed));
      }
    }
  }

  for (const adjusted of candidates) {
    const adjustedDiff = getFantasyTotalDiff(adjusted, scoringSettings, position, appliedTotal);
    if (adjustedDiff + EPSILON < bestDiff) {
      best = adjusted;
      bestDiff = adjustedDiff;
    }
  }

  return best;
}

function mergeTeamDefenseFantasyRow(providedRow, derivedRow, scoringSettings, position = 'DEF') {
  const next = derivedRow ? { ...providedRow, ...derivedRow } : { ...providedRow };
  for (const key of ['_fantasyPoints', 'fantasy_points', 'appliedTotal', '_fantasyContributions', '_espnAppliedStats']) {
    if (providedRow?.[key] !== undefined) next[key] = providedRow[key];
  }
  return reconcileDstAppliedFantasyStats(next, scoringSettings, position);
}

function formatCandidate(candidate = {}) {
  const label = candidate.unitsNeeded > 0 ? 'missing' : 'overcount';
  const units = Math.abs(Number(candidate.unitsNeeded));
  const value = Number(candidate.value);
  const valueLabel = Number.isFinite(value) ? `${value > 0 ? '+' : ''}${roundPoints(value)} each` : 'n/a';
  return `${label} ${roundPoints(units)} x ${candidate.scoringKey} (${valueLabel})`;
}

function getRawStatKeys(entry = {}) {
  return Object.keys(entry)
    .filter((key) => Number.isFinite(Number(entry[key])) && Math.abs(Number(entry[key])) >= EPSILON)
    .sort();
}

function getBreakdownText(rows = []) {
  return rows
    .filter((row) => Math.abs(Number(row.points) || 0) >= EPSILON)
    .map((row) => `${row.scoringKey}:${row.points > 0 ? '+' : ''}${roundPoints(row.points)}`)
    .join(', ');
}

function isTeamDefensePlayer(player = {}, playerId = '') {
  if (isTeamDefensePosition(player.position)) return true;
  const name = getPlayerName(player).toLowerCase();
  return name.includes('defense') || name.includes('d/st') || String(playerId).includes('-160');
}

function getTeamDefenseWeeklyRows(weeklyStats = {}, playerId) {
  return (weeklyStats?.[playerId] ?? [])
    .filter((row) => Number.isFinite(Number(row?.week)) && !row?._isPostseason)
    .sort((left, right) => Number(left.week) - Number(right.week));
}

export async function buildEspnDstResidualDebugRows({
  players = {},
  weeklyStats = {},
  scoringSettings,
  season,
  includeClean = false,
  team = null,
  fetchTeamDefenseGameLog = null,
} = {}) {
  if (!scoringSettings) {
    return { ok: false, rows: [], residualRows: [], cleanRows: [], error: 'Missing scoring settings.' };
  }
  if (typeof fetchTeamDefenseGameLog !== 'function') {
    return { ok: false, rows: [], residualRows: [], cleanRows: [], error: 'Missing D/ST game-log fetcher.' };
  }

  const requestedTeam = team ? String(team).toUpperCase() : null;
  const dstPlayers = Object.entries(players ?? {})
    .filter(([playerId, player]) => isTeamDefensePlayer(player, playerId))
    .map(([playerId, player]) => ({
      playerId,
      player,
      name: getPlayerName(player),
      team: String(getTeamDefenseTeam(player) ?? '').toUpperCase(),
    }))
    .filter((entry) => entry.team && (!requestedTeam || entry.team === requestedTeam));

  const rows = [];
  const errors = [];

  await Promise.all(dstPlayers.map(async ({ playerId, player, name, team: teamAbbrev }) => {
    const weeklyRows = getTeamDefenseWeeklyRows(weeklyStats, playerId);
    if (!weeklyRows.length) return;

    let gameLog = [];
    try {
      gameLog = await fetchTeamDefenseGameLog(teamAbbrev, Number(season));
    } catch (err) {
      errors.push({ playerId, team: teamAbbrev, error: err?.message ?? String(err) });
      return;
    }

    const derivedByWeek = new Map(
      (gameLog ?? [])
        .map(buildTeamDefenseDerivedRow)
        .filter(Boolean)
        .map((row) => [Number(row.week), row]),
    );

    for (const providedRow of weeklyRows) {
      const week = Number(providedRow.week);
      const appliedTotal = getAppliedFantasyTotal(providedRow);
      if (!Number.isFinite(week) || !Number.isFinite(appliedTotal)) continue;
      const derivedRow = derivedByWeek.get(week) ?? null;
      const mergedRow = mergeTeamDefenseFantasyRow(providedRow, derivedRow, scoringSettings, player?.position ?? 'DEF');
      const explanation = explainFantasyScore(mergedRow, scoringSettings, player?.position ?? 'DEF');
      const visibleTotal = explanation.gridshiftTotal;
      const residual = roundPoints(appliedTotal - visibleTotal);
      const positionSettings = getPositionScoringSettings(scoringSettings, player?.position ?? 'DEF');
      const candidates = Math.abs(residual) >= EPSILON
        ? buildMissingCandidates(positionSettings, explanation.rows, residual, mergedRow)
        : [];
      const row = {
        playerId,
        team: teamAbbrev,
        name,
        week,
        opponent: derivedRow?.opponent ?? providedRow.opponent ?? null,
        result: derivedRow?.result ?? providedRow.result ?? null,
        fantasyPoints: appliedTotal,
        visibleTotal,
        residual,
        status: Math.abs(residual) < EPSILON ? 'match' : 'mismatch',
        topCandidates: candidates.slice(0, 5).map(formatCandidate).join(' | '),
        rawStats: getRawStatKeys(mergedRow).join(', '),
        breakdown: getBreakdownText(explanation.rows),
        row: mergedRow,
      };
      if (includeClean || row.status !== 'match') rows.push(row);
    }
  }));

  rows.sort((left, right) => (
    String(left.team).localeCompare(String(right.team))
    || Number(left.week) - Number(right.week)
  ));

  const residualRows = rows.filter((row) => row.status !== 'match');
  const cleanRows = includeClean ? rows.filter((row) => row.status === 'match') : [];

  return {
    ok: residualRows.length === 0 && errors.length === 0,
    season: String(season ?? ''),
    team: requestedTeam,
    teamCount: dstPlayers.length,
    rowCount: rows.length,
    residualCount: residualRows.length,
    cleanCount: cleanRows.length,
    rows,
    residualRows,
    cleanRows,
    errors,
  };
}

function addContribution(rows, { statKey, scoringKey, label, statValue, multiplier, source = 'raw' }) {
  const numericStat = Number(statValue);
  const numericMultiplier = Number(multiplier);
  if (!Number.isFinite(numericStat) || !Number.isFinite(numericMultiplier)) return;
  const points = numericStat * numericMultiplier;
  if (Math.abs(points) < EPSILON) return;
  rows.push({
    statKey,
    scoringKey,
    label: label ?? scoringKey,
    statValue: numericStat,
    multiplier: numericMultiplier,
    points: roundPoints(points),
    source,
  });
}

export function explainFantasyScore(entry, scoringSettings, position = null) {
  if (!entry || !scoringSettings) {
    return { appliedTotal: null, calculatedTotal: 0, gridshiftTotal: 0, rows: [] };
  }

  const positionSettings = getPositionScoringSettings(scoringSettings, position);
  const rows = [];

  for (const [statKey, scoringKey] of Object.entries(STAT_TO_SCORING_KEY)) {
    addContribution(rows, {
      statKey,
      scoringKey,
      statValue: entry[statKey],
      multiplier: positionSettings[scoringKey] ?? 0,
    });
  }

  if (position === 'TE' && entry.rec) {
    addContribution(rows, { statKey: 'rec', scoringKey: 'bonus_rec_te', statValue: entry.rec, multiplier: positionSettings.bonus_rec_te ?? 0, source: 'position-bonus' });
  }
  if (position === 'RB' && entry.rec) {
    addContribution(rows, { statKey: 'rec', scoringKey: 'bonus_rec_rb', statValue: entry.rec, multiplier: positionSettings.bonus_rec_rb ?? 0, source: 'position-bonus' });
  }
  if (position === 'WR' && entry.rec) {
    addContribution(rows, { statKey: 'rec', scoringKey: 'bonus_rec_wr', statValue: entry.rec, multiplier: positionSettings.bonus_rec_wr ?? 0, source: 'position-bonus' });
  }
  if (position === 'RB' && entry.rush_att) {
    addContribution(rows, { statKey: 'rush_att', scoringKey: 'bonus_rush_att', statValue: entry.rush_att, multiplier: positionSettings.bonus_rush_att ?? 0, source: 'position-bonus' });
  }
  if (position === 'QB') {
    addContribution(rows, { statKey: 'pass_fd+rush_fd', scoringKey: 'bonus_fd_qb', statValue: (entry.pass_fd ?? 0) + (entry.rush_fd ?? 0), multiplier: positionSettings.bonus_fd_qb ?? 0, source: 'position-bonus' });
  }
  if (position === 'RB') {
    addContribution(rows, { statKey: 'rush_fd+rec_fd', scoringKey: 'bonus_fd_rb', statValue: (entry.rush_fd ?? 0) + (entry.rec_fd ?? 0), multiplier: positionSettings.bonus_fd_rb ?? 0, source: 'position-bonus' });
  }
  if (position === 'WR') {
    addContribution(rows, { statKey: 'rec_fd', scoringKey: 'bonus_fd_wr', statValue: entry.rec_fd ?? 0, multiplier: positionSettings.bonus_fd_wr ?? 0, source: 'position-bonus' });
  }
  if (position === 'TE') {
    addContribution(rows, { statKey: 'rec_fd', scoringKey: 'bonus_fd_te', statValue: entry.rec_fd ?? 0, multiplier: positionSettings.bonus_fd_te ?? 0, source: 'position-bonus' });
  }

  const calculatedTotal = roundPoints(rows.reduce((sum, row) => sum + row.points, 0));
  const appliedTotal = getAppliedFantasyTotal(entry);
  const gridshiftTotal = roundPoints(calcPoints(clearAppliedFantasyFields(entry), scoringSettings, position));
  const appliedContributions = entry._fantasyContributions && typeof entry._fantasyContributions === 'object'
    ? { ...entry._fantasyContributions }
    : null;

  return {
    appliedTotal,
    appliedContributions,
    calculatedTotal,
    gridshiftTotal,
    rows,
  };
}

function isMissingCandidatePlausible(scoringKey, entry = {}) {
  switch (scoringKey) {
    case 'bonus_pass_yd_300':
      return Number(entry.pass_yd ?? 0) >= 300;
    case 'bonus_pass_yd_400':
      return Number(entry.pass_yd ?? 0) >= 400;
    case 'bonus_rush_yd_100':
      return Number(entry.rush_yd ?? 0) >= 100;
    case 'bonus_rush_yd_200':
      return Number(entry.rush_yd ?? 0) >= 200;
    case 'bonus_rec_yd_100':
      return Number(entry.rec_yd ?? 0) >= 100;
    case 'bonus_rec_yd_200':
      return Number(entry.rec_yd ?? 0) >= 200;
    case 'bonus_rush_rec_yd_100':
      return Number(entry.rush_yd ?? 0) + Number(entry.rec_yd ?? 0) >= 100;
    case 'bonus_rush_rec_yd_200':
      return Number(entry.rush_yd ?? 0) + Number(entry.rec_yd ?? 0) >= 200;
    case 'bonus_pass_cmp_25':
      return Number(entry.pass_cmp ?? 0) >= 25;
    case 'bonus_rush_att_20':
      return Number(entry.rush_att ?? 0) >= 20;
    case 'bonus_pass_td_40p':
    case 'bonus_pass_td_50p':
      return Number(entry.pass_td ?? 0) > 0;
    case 'bonus_rush_td_40p':
    case 'bonus_rush_td_50p':
      return Number(entry.rush_td ?? 0) > 0;
    case 'bonus_rec_td_40p':
    case 'bonus_rec_td_50p':
      return Number(entry.rec_td ?? 0) > 0;
    case 'bonus_rec_40p':
      return Number(entry.rec ?? 0) > 0;
    case 'bonus_rush_40p':
      return Number(entry.rush_att ?? 0) > 0;
    default:
      return true;
  }
}

function buildMissingCandidates(positionSettings, rows, delta, entry) {
  const usedKeys = new Set(rows.map((row) => row.scoringKey));
  const candidates = [];

  for (const [scoringKey, value] of Object.entries(positionSettings ?? {})) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || Math.abs(numericValue) < EPSILON) continue;
    if (usedKeys.has(scoringKey)) continue;
    if (!isMissingCandidatePlausible(scoringKey, entry)) continue;

    const unitsNeeded = delta / numericValue;
    const nearestWhole = Math.round(unitsNeeded);
    const nearWhole = Math.abs(unitsNeeded - nearestWhole) < 0.02;
    if (nearWhole && nearestWhole > 0 && nearestWhole <= 5) {
      candidates.push({
        scoringKey,
        value: numericValue,
        unitsNeeded: nearestWhole,
        wouldAdd: roundPoints(nearestWhole * numericValue),
      });
    }
  }

  return candidates.sort((left, right) => Math.abs(left.unitsNeeded) - Math.abs(right.unitsNeeded));
}

export function reconcileFantasyScore({
  players = {},
  weeklyStats = {},
  scoringSettings,
  playerId = null,
  player = null,
  playerName = null,
  name = null,
  week,
  position = null,
  expected = null,
  espn = null,
} = {}) {
  const match = findFantasyDiagnosticPlayer(players, { playerId, player, playerName, name, position }, weeklyStats);
  if (!match) {
    return {
      ok: false,
      error: 'Player not found in fantasy player map.',
      query: { playerId, player, playerName, name, week, expected: expected ?? espn },
    };
  }

  const numericWeek = Number(week);
  const weekly = weeklyStats?.[match.id] ?? [];
  const entry = weekly.find((row) => Number(row.week) === numericWeek) ?? null;
  if (!entry) {
    return {
      ok: false,
      error: 'Weekly fantasy row not found for player/week.',
      player: { id: match.id, name: getPlayerName(match.player), position: match.player?.position },
      availableWeeks: weekly.map((row) => row.week).filter((value) => value != null),
      query: { week: numericWeek, expected: expected ?? espn },
    };
  }

  const resolvedPosition = position ?? match.player?.position ?? inferPositionFromStats(entry);
  const explanation = explainFantasyScore(entry, scoringSettings, resolvedPosition);
  const expectedTotal = Number(expected ?? espn);
  const hasExpected = Number.isFinite(expectedTotal);
  const delta = hasExpected ? roundPoints(expectedTotal - explanation.gridshiftTotal) : null;
  const positionSettings = getPositionScoringSettings(scoringSettings, resolvedPosition);

  return {
    ok: true,
    player: {
      id: match.id,
      name: getPlayerName(match.player),
      position: resolvedPosition,
      matchType: match.matchType,
    },
    week: numericWeek,
    expected: hasExpected ? roundPoints(expectedTotal) : null,
    gridshiftTotal: explanation.gridshiftTotal,
    rawCalculatedTotal: explanation.calculatedTotal,
    espnAppliedTotal: explanation.appliedTotal,
    delta,
    status: hasExpected
      ? (Math.abs(delta) < 0.01 ? 'match' : 'mismatch')
      : 'no-expected-total',
    missingCandidates: hasExpected
      ? buildMissingCandidates(positionSettings, explanation.rows, delta, entry)
      : [],
    appliedContributions: explanation.appliedContributions,
    rows: explanation.rows,
    rawStats: Object.fromEntries(Object.entries(entry).filter(([, value]) => (
      typeof value === 'number' && Math.abs(value) >= EPSILON
    ))),
  };
}
