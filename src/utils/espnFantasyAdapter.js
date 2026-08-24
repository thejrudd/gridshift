import { importEspnScoringProfile, mapEspnStatIdToContributionKey, mapEspnStatIdToScoringKey } from './scoringEngine.js';

export const ESPN_CURRENT_USER_ID = 'espn:me';

const BENCH_SLOT_IDS = new Set([20, 21]);
const IR_SLOT_IDS = new Set([21]);

const ESPN_POSITION_ID = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'DEF',
};

const ESPN_LINEUP_SLOT = {
  0: 'QB',
  2: 'RB',
  4: 'WR',
  6: 'TE',
  7: 'SUPER_FLEX',
  16: 'DEF',
  17: 'K',
  20: 'BN',
  21: 'IR',
  23: 'FLEX',
  25: 'FLEX',
};

const ESPN_PRO_TEAM_ABBR = {
  0: 'FA',
  1: 'ATL',
  2: 'BUF',
  3: 'CHI',
  4: 'CIN',
  5: 'CLE',
  6: 'DAL',
  7: 'DEN',
  8: 'DET',
  9: 'GB',
  10: 'TEN',
  11: 'IND',
  12: 'KC',
  13: 'LV',
  14: 'LAR',
  15: 'MIA',
  16: 'MIN',
  17: 'NE',
  18: 'NO',
  19: 'NYG',
  20: 'NYJ',
  21: 'PHI',
  22: 'ARI',
  23: 'PIT',
  24: 'LAC',
  25: 'SF',
  26: 'SEA',
  27: 'TB',
  28: 'WAS',
  29: 'CAR',
  30: 'JAX',
  33: 'BAL',
  34: 'HOU',
};

const ESPN_PRO_TEAM_ID_BY_ABBR = Object.fromEntries(
  Object.entries(ESPN_PRO_TEAM_ABBR).map(([teamId, abbr]) => [abbr, Number(teamId)]),
);

const ESPN_TEAM_ABBR_ALIASES = {
  WSH: 'WAS',
  JAC: 'JAX',
};

export function toEspnPlayerId(id) {
  return id == null ? null : `espn:${id}`;
}

export function getEspnTeamDefensePlayerId(teamAbbr) {
  const normalized = String(teamAbbr ?? '').trim().toUpperCase();
  if (!normalized) return null;
  const canonical = ESPN_TEAM_ABBR_ALIASES[normalized] ?? normalized;
  const proTeamId = ESPN_PRO_TEAM_ID_BY_ABBR[canonical];
  return Number.isFinite(proTeamId) ? toEspnPlayerId(-16000 - proTeamId) : null;
}

function getTeamName(team) {
  return team?.name
    ?? [team?.location, team?.nickname].filter(Boolean).join(' ')
    ?? `Team ${team?.id ?? ''}`.trim();
}

function getOwnerKey(team, currentTeamId) {
  return Number(team?.id) === Number(currentTeamId) ? ESPN_CURRENT_USER_ID : `espn:team:${team?.id}`;
}

function getEntryPlayer(entry) {
  return entry?.playerPoolEntry?.player ?? entry?.player ?? entry;
}

function getEntryStats(entry) {
  return entry?.playerPoolEntry?.stats ?? entry?.stats ?? [];
}

function getPositiveInteger(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : null;
}

function getScheduleWeek(matchup) {
  return getPositiveInteger(matchup?.matchupPeriodId ?? matchup?.scoringPeriodId);
}

function getScheduleSideEntries(side) {
  return side?.rosterForCurrentScoringPeriod?.entries
    ?? side?.rosterForMatchupPeriod?.entries
    ?? side?.rosterForScoringPeriod?.entries
    ?? [];
}

function getScheduleSideStatContexts(side, matchupWeek, requestedWeek = null, scoringPeriodLength = 1) {
  const requestedScoringWeek = getPositiveInteger(requestedWeek);
  const matchupScoringWeek = getPositiveInteger(matchupWeek);
  const periodLength = getPositiveInteger(scoringPeriodLength) ?? 1;
  const currentWeek = requestedScoringWeek ?? matchupScoringWeek;
  const currentEntries = side?.rosterForCurrentScoringPeriod?.entries
    ?? side?.rosterForScoringPeriod?.entries;
  if (currentEntries?.length && currentWeek) {
    const isInsideMatchupSpan = !requestedScoringWeek
      || !matchupScoringWeek
      || (
        requestedScoringWeek >= matchupScoringWeek
        && requestedScoringWeek < matchupScoringWeek + periodLength
      );
    const hasMatchupPeriodRows = side?.rosterForMatchupPeriod?.entries?.length > 0;
    if (!isInsideMatchupSpan && !hasMatchupPeriodRows) {
      return [];
    }
    return currentEntries.map((entry) => ({ entry, scheduleWeek: currentWeek }));
  }

  const matchupEntries = side?.rosterForMatchupPeriod?.entries ?? [];
  if (!matchupEntries.length || !matchupScoringWeek) return [];
  if (requestedScoringWeek && matchupScoringWeek !== requestedScoringWeek) return [];
  return matchupEntries.map((entry) => ({ entry, scheduleWeek: matchupScoringWeek }));
}

function getPlayoffWeekStart(scheduleSettings = {}) {
  const explicitStart = getPositiveInteger(
    scheduleSettings.playoffMatchupPeriod
      ?? scheduleSettings.playoffStartMatchupPeriod
      ?? scheduleSettings.playoffStartPeriod
      ?? scheduleSettings.playoffStartWeek,
  );
  if (explicitStart) return explicitStart;

  const regularSeasonPeriods = getPositiveInteger(
    scheduleSettings.regularSeasonMatchupPeriodCount
      ?? scheduleSettings.regularSeasonMatchupPeriods
      ?? scheduleSettings.matchupPeriodCount,
  );
  return regularSeasonPeriods ? regularSeasonPeriods + 1 : null;
}

function getMaxScheduleWeek(payload) {
  let maxWeek = null;
  for (const matchup of payload?.schedule ?? []) {
    const week = getScheduleWeek(matchup);
    if (week) maxWeek = Math.max(maxWeek ?? week, week);
  }
  return maxWeek;
}

function getMaxFantasyScoringWeek(payload) {
  let maxWeek = null;
  const noteWeek = (value) => {
    const week = getPositiveInteger(value);
    if (week) maxWeek = Math.max(maxWeek ?? week, week);
  };

  const scheduleSettings = payload?.settings?.scheduleSettings ?? {};
  const playoffWeekStart = getPlayoffWeekStart(scheduleSettings);
  const playoffMatchupPeriodLength = getPositiveInteger(scheduleSettings.playoffMatchupPeriodLength) ?? 1;

  for (const matchup of payload?.schedule ?? []) {
    noteWeek(matchup?.scoringPeriodId);
    noteWeek(matchup?.matchupPeriodId);

    const matchupWeek = getPositiveInteger(matchup?.matchupPeriodId);
    if (matchupWeek && playoffWeekStart && matchupWeek >= playoffWeekStart) {
      noteWeek(matchupWeek + playoffMatchupPeriodLength - 1);
    }

    for (const side of [matchup?.home, matchup?.away]) {
      for (const entry of getScheduleSideEntries(side)) {
        for (const statRow of getEntryStats(entry)) {
          if (Number(statRow?.statSplitTypeId) === 1) noteWeek(statRow?.scoringPeriodId);
        }
      }
    }
  }

  return maxWeek;
}

function buildScheduleRosterSnapshots(payload) {
  const snapshots = new Map();
  for (const matchup of payload?.schedule ?? []) {
    const week = getScheduleWeek(matchup) ?? 0;
    for (const side of [matchup?.home, matchup?.away]) {
      const teamId = Number(side?.teamId);
      if (!Number.isFinite(teamId)) continue;
      const entries = getScheduleSideEntries(side);
      if (!entries.length) continue;
      const previous = snapshots.get(teamId);
      if (!previous || week >= previous.week) {
        snapshots.set(teamId, { week, entries });
      }
    }
  }
  return snapshots;
}

function getDefaultPosition(player) {
  return player?.defaultPositionId === 16
    ? 'DEF'
    : ESPN_POSITION_ID[player?.defaultPositionId] ?? player?.defaultPosition ?? 'FLEX';
}

function getEntryPosition(entry) {
  const player = getEntryPlayer(entry);
  return player ? getDefaultPosition(player) : null;
}

export function normalizeEspnPlayer(entry) {
  const player = getEntryPlayer(entry);
  const espnId = player?.id ?? entry?.playerId;
  const playerId = toEspnPlayerId(espnId);
  if (!playerId) return null;

  const fullName = player.fullName
    ?? player.full_name
    ?? player.displayName
    ?? player.name
    ?? `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim()
    ?? 'Unknown Player';
  const position = getDefaultPosition(player);
  const team = ESPN_PRO_TEAM_ABBR[player.proTeamId] ?? player.proTeamAbbreviation ?? null;

  return {
    id: playerId,
    player_id: playerId,
    espn_id: espnId,
    sourceIds: { espn: espnId },
    first_name: player.firstName ?? fullName.split(' ')[0] ?? '',
    last_name: player.lastName ?? fullName.split(' ').slice(1).join(' ') ?? '',
    full_name: fullName,
    search_full_name: fullName.toLowerCase(),
    position,
    fantasy_positions: [position],
    team,
    age: player.age ?? null,
    injury_status: player.injuryStatus ?? null,
    status: player.injuryStatus ?? null,
    image_url: player.headshot?.href ?? null,
    imageUrl: player.headshot?.href ?? null,
    metadata: {
      provider: 'espn',
      proTeamId: player.proTeamId ?? null,
    },
  };
}

function getAppliedStatsTotal(appliedStats) {
  if (!appliedStats || typeof appliedStats !== 'object') return null;
  let total = 0;
  let hasAppliedStat = false;
  for (const value of Object.values(appliedStats)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    total += numeric;
    hasAppliedStat = true;
  }
  return hasAppliedStat ? total : null;
}

function getFirstFiniteNumber(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function getAppliedScoringContributions(appliedStats, context = {}) {
  if (!appliedStats || typeof appliedStats !== 'object') return null;
  const contributions = {};
  for (const [statId, value] of Object.entries(appliedStats)) {
    const contributionKey = mapEspnStatIdToContributionKey(statId, context);
    if (!contributionKey || !Number.isFinite(Number(value))) continue;
    contributions[contributionKey] = (contributions[contributionKey] ?? 0) + Number(value);
  }
  return Object.keys(contributions).length > 0 ? contributions : null;
}

function getParentAppliedStatTotal(entry, scheduleWeek, statRow) {
  const rowWeek = Number(statRow?.scoringPeriodId);
  const contextWeek = Number(scheduleWeek);
  if (!Number.isFinite(contextWeek) || contextWeek <= 0) return null;
  if (Number.isFinite(contextWeek) && contextWeek > 0 && Number.isFinite(rowWeek) && contextWeek !== rowWeek) return null;

  const entryAppliedTotal = getFirstFiniteNumber(entry?.appliedStatTotal);
  if (entryAppliedTotal != null) return entryAppliedTotal;

  const statRowAppliedTotal = getFirstFiniteNumber(statRow?.appliedTotal);
  const statRowAppliedStatsTotal = getAppliedStatsTotal(statRow?.appliedStats);
  if (statRowAppliedTotal == null && statRowAppliedStatsTotal == null) {
    return getFirstFiniteNumber(entry?.playerPoolEntry?.appliedStatTotal);
  }

  return null;
}

function normalizeEspnStatRow(statRow, context = {}) {
  if (!statRow || Number(statRow.statSourceId) !== 0) return null;
  const stats = {};
  const position = context.position ?? getEntryPosition(context.entry);
  for (const [statId, value] of Object.entries(statRow.stats ?? {})) {
    const scoringKey = mapEspnStatIdToScoringKey(statId, { position });
    if (!scoringKey || !Number.isFinite(Number(value))) continue;
    stats[scoringKey] = (stats[scoringKey] ?? 0) + Number(value);
  }

  const appliedTotal = Number(statRow.appliedTotal);
  const appliedStatsTotal = getAppliedStatsTotal(statRow.appliedStats);
  const parentAppliedTotal = getParentAppliedStatTotal(context.entry, context.scheduleWeek, statRow);
  const fallbackParentAppliedTotal = Number.isFinite(Number(context.scheduleWeek))
    ? getFirstFiniteNumber(context.entry?.playerPoolEntry?.appliedStatTotal)
    : null;
  const fantasyTotal = parentAppliedTotal
    ?? (Number.isFinite(appliedTotal) ? appliedTotal : null)
    ?? appliedStatsTotal
    ?? fallbackParentAppliedTotal;
  if (Number.isFinite(fantasyTotal)) {
    stats._fantasyPoints = fantasyTotal;
    stats.fantasy_points = fantasyTotal;
  }
  if (statRow.appliedStats) stats._espnAppliedStats = statRow.appliedStats;
  const appliedContributions = getAppliedScoringContributions(statRow.appliedStats, { position });
  if (appliedContributions) stats._fantasyContributions = appliedContributions;
  if (Number.isFinite(Number(statRow.scoringPeriodId))) stats.week = Number(statRow.scoringPeriodId);
  if (Number.isFinite(Number(context.scheduleWeek)) && Number(context.scheduleWeek) > 0) stats._espnScheduleEntry = true;
  if ((stats.gp ?? 0) <= 0 && (Object.keys(stats).length > 0 || Number.isFinite(fantasyTotal))) stats.gp = 1;
  return stats;
}

function normalizeEspnAppliedEntryRow(entry, scheduleWeek) {
  const week = Number(scheduleWeek);
  if (!Number.isFinite(week) || week <= 0) return null;
  const applied = getFirstFiniteNumber(entry?.appliedStatTotal, entry?.playerPoolEntry?.appliedStatTotal);
  if (!Number.isFinite(applied)) return null;
  const appliedStats = entry?.appliedStats ?? entry?.playerPoolEntry?.appliedStats;
  const position = getEntryPosition(entry);
  const appliedContributions = getAppliedScoringContributions(appliedStats, { position });
  const row = {
    _fantasyPoints: applied,
    fantasy_points: applied,
    week,
    _espnAppliedEntryOnly: true,
    _espnScheduleEntry: true,
    gp: 1,
  };
  if (appliedStats) row._espnAppliedStats = appliedStats;
  if (appliedContributions) row._fantasyContributions = appliedContributions;
  return row;
}

function normalizeEspnSeasonAppliedEntryRow(entry) {
  const applied = getFirstFiniteNumber(entry?.playerPoolEntry?.appliedStatTotal, entry?.appliedStatTotal);
  if (!Number.isFinite(applied)) return null;
  const appliedStats = entry?.appliedStats ?? entry?.playerPoolEntry?.appliedStats;
  const position = getEntryPosition(entry);
  const appliedContributions = getAppliedScoringContributions(appliedStats, { position });
  const row = {
    _fantasyPoints: applied,
    fantasy_points: applied,
    _espnAppliedSeasonEntry: true,
  };
  if (appliedStats) row._espnAppliedStats = appliedStats;
  if (appliedContributions) row._fantasyContributions = appliedContributions;
  return row;
}

function collectEntries(payload) {
  const entries = [];
  for (const team of payload?.teams ?? []) {
    entries.push(...(team?.roster?.entries ?? []));
  }
  for (const poolEntry of payload?.players ?? []) {
    entries.push(poolEntry);
  }
  for (const matchup of payload?.schedule ?? []) {
    entries.push(...getScheduleSideEntries(matchup?.home));
    entries.push(...getScheduleSideEntries(matchup?.away));
  }
  return entries;
}

function collectStatEntryContexts(payload, requestedScoringPeriodId = null) {
  const contexts = [];
  const requestedWeek = Number(requestedScoringPeriodId);
  const hasRequestedWeek = Number.isFinite(requestedWeek) && requestedWeek > 0;
  const scheduleSettings = payload?.settings?.scheduleSettings ?? {};
  const playoffWeekStart = getPlayoffWeekStart(scheduleSettings);
  const playoffMatchupPeriodLength = getPositiveInteger(scheduleSettings.playoffMatchupPeriodLength) ?? 1;
  const requestedPeriodLength = hasRequestedWeek
    && playoffWeekStart
    && requestedWeek >= playoffWeekStart
    ? playoffMatchupPeriodLength
    : 1;
  for (const team of payload?.teams ?? []) {
    for (const entry of team?.roster?.entries ?? []) contexts.push({ entry, scheduleWeek: null });
  }
  for (const entry of payload?.players ?? []) {
    contexts.push({ entry, scheduleWeek: null });
  }
  for (const matchup of payload?.schedule ?? []) {
    const scheduleWeek = getScheduleWeek(matchup);
    contexts.push(...getScheduleSideStatContexts(
      matchup?.home,
      scheduleWeek,
      hasRequestedWeek ? requestedWeek : null,
      requestedPeriodLength,
    ));
    contexts.push(...getScheduleSideStatContexts(
      matchup?.away,
      scheduleWeek,
      hasRequestedWeek ? requestedWeek : null,
      requestedPeriodLength,
    ));
  }
  return contexts;
}

function buildPlayers(payload) {
  const players = {};
  for (const entry of collectEntries(payload)) {
    const normalized = normalizeEspnPlayer(entry);
    if (normalized) players[normalized.player_id] = { ...(players[normalized.player_id] ?? {}), ...normalized };
  }
  return players;
}

function mergeNumericStats(target, source) {
  for (const [key, value] of Object.entries(source ?? {})) {
    if (key === '_fantasyContributions' && value && typeof value === 'object') {
      target._fantasyContributions ??= {};
      for (const [contributionKey, contributionValue] of Object.entries(value)) {
        if (!Number.isFinite(Number(contributionValue))) continue;
        target._fantasyContributions[contributionKey] = (target._fantasyContributions[contributionKey] ?? 0) + Number(contributionValue);
      }
      continue;
    }
    if (typeof value !== 'number') continue;
    target[key] = (target[key] ?? 0) + value;
  }
}

function getRowAppliedScoringLevel(row) {
  if (Number.isFinite(Number(row?._fantasyPoints ?? row?.fantasy_points ?? row?.appliedTotal))) return 2;
  if (row?._fantasyContributions && Object.keys(row._fantasyContributions).length > 0) return 1;
  return 0;
}

function countRawStatValues(row = {}) {
  return Object.entries(row).filter(([key, value]) => (
    !key.startsWith('_')
    && !['week', 'gp', 'fantasy_points', 'appliedTotal'].includes(key)
    && typeof value === 'number'
  )).length;
}

function shouldPreferIncomingStatRow(existing, incoming) {
  const existingLevel = getRowAppliedScoringLevel(existing);
  const incomingLevel = getRowAppliedScoringLevel(incoming);
  if (incomingLevel !== existingLevel) return incomingLevel > existingLevel;
  if (incoming?._espnScheduleEntry && !existing?._espnScheduleEntry) return true;
  if (!incoming?._espnAppliedEntryOnly && existing?._espnAppliedEntryOnly) return true;
  return countRawStatValues(incoming) > countRawStatValues(existing);
}

function mergeDuplicateStatRows(existing, incoming) {
  if (!existing) return incoming;
  const incomingIsRicher = shouldPreferIncomingStatRow(existing, incoming);
  const merged = incomingIsRicher
    ? { ...existing, ...incoming }
    : { ...incoming, ...existing };
  const existingContributions = existing._fantasyContributions ?? {};
  const incomingContributions = incoming._fantasyContributions ?? {};
  const contributions = incomingIsRicher
    ? { ...existingContributions, ...incomingContributions }
    : { ...incomingContributions, ...existingContributions };
  if (Object.keys(contributions).length > 0) merged._fantasyContributions = contributions;
  return merged;
}

function upsertWeeklyStatRow(weeklyStats, playerId, normalized) {
  weeklyStats[playerId] ??= [];
  const existingIndex = weeklyStats[playerId].findIndex((row) => row.week === normalized.week);
  if (existingIndex === -1) {
    weeklyStats[playerId].push(normalized);
    return;
  }
  weeklyStats[playerId][existingIndex] = mergeDuplicateStatRows(weeklyStats[playerId][existingIndex], normalized);
}

function buildStats(payload, options = {}) {
  const weeklyStats = {};
  const seasonStats = {};
  const seenRows = new Set();
  const requestedWeek = Number(options.scoringPeriodId);
  const hasRequestedWeek = Number.isFinite(requestedWeek) && requestedWeek > 0;

  for (const { entry, scheduleWeek } of collectStatEntryContexts(payload, options.scoringPeriodId)) {
    const playerId = toEspnPlayerId(getEntryPlayer(entry)?.id ?? entry?.playerId);
    if (!playerId) continue;
    let hasWeeklyStatRowForScheduleEntry = false;
    for (const statRow of getEntryStats(entry)) {
      if (
        hasRequestedWeek
        && Number(statRow?.statSplitTypeId) === 1
        && Number(statRow?.scoringPeriodId) !== requestedWeek
      ) {
        continue;
      }
      const parentAppliedTotal = getParentAppliedStatTotal(entry, scheduleWeek, statRow);
      const rowKey = [
        playerId,
        statRow?.statSourceId,
        statRow?.statSplitTypeId,
        statRow?.scoringPeriodId ?? 'season',
        JSON.stringify(statRow?.stats ?? {}),
        JSON.stringify(statRow?.appliedStats ?? {}),
        statRow?.appliedTotal ?? '',
        parentAppliedTotal ?? '',
      ].join('|');
      if (seenRows.has(rowKey)) continue;
      seenRows.add(rowKey);
      const normalized = normalizeEspnStatRow(statRow, { entry, scheduleWeek });
      if (!normalized) continue;
      if (Number(statRow.statSplitTypeId) === 1 && normalized.week) {
        if (Number(normalized.week) === Number(scheduleWeek)) hasWeeklyStatRowForScheduleEntry = true;
        upsertWeeklyStatRow(weeklyStats, playerId, normalized);
      } else if (Number(statRow.statSplitTypeId) === 0) {
        seasonStats[playerId] ??= {};
        mergeNumericStats(seasonStats[playerId], normalized);
      }
    }
    if (!hasWeeklyStatRowForScheduleEntry) {
      const appliedOnlyRow = normalizeEspnAppliedEntryRow(entry, scheduleWeek);
      if (appliedOnlyRow) upsertWeeklyStatRow(weeklyStats, playerId, appliedOnlyRow);
    }
  }

  for (const { entry, scheduleWeek } of collectStatEntryContexts(payload, options.scoringPeriodId)) {
    if (scheduleWeek) continue;
    const playerId = toEspnPlayerId(getEntryPlayer(entry)?.id ?? entry?.playerId);
    if (!playerId) continue;
    if (Object.keys(seasonStats[playerId] ?? {}).length > 0) continue;
    const appliedSeasonRow = normalizeEspnSeasonAppliedEntryRow(entry);
    if (appliedSeasonRow) {
      seasonStats[playerId] ??= {};
      mergeNumericStats(seasonStats[playerId], appliedSeasonRow);
    }
  }

  for (const [playerId, rows] of Object.entries(weeklyStats)) {
    rows.sort((a, b) => a.week - b.week);
    seasonStats[playerId] ??= {};
    if (Object.keys(seasonStats[playerId]).length === 0) {
      for (const row of rows) mergeNumericStats(seasonStats[playerId], row);
      seasonStats[playerId].gp = seasonStats[playerId].gp ?? rows.length;
    }
  }

  return { weeklyStats, seasonStats };
}

function buildRosterPositions(lineupSlotCounts = {}) {
  const positions = [];
  for (const [slotId, count] of Object.entries(lineupSlotCounts)) {
    const label = ESPN_LINEUP_SLOT[slotId];
    if (!label || count <= 0) continue;
    for (let i = 0; i < Number(count); i += 1) positions.push(label);
  }
  return positions.length ? positions : ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'];
}

function inferLineupSlotCounts(payload) {
  const scheduleRosters = buildScheduleRosterSnapshots(payload);
  const maxCountsBySlot = {};

  for (const team of payload?.teams ?? []) {
    const currentEntries = team?.roster?.entries ?? [];
    const fallbackSnapshot = scheduleRosters.get(Number(team.id));
    const entries = currentEntries.length ? currentEntries : (fallbackSnapshot?.entries ?? []);
    const teamCounts = {};

    for (const entry of entries) {
      const slotId = Number(entry?.lineupSlotId);
      if (!Number.isFinite(slotId) || !ESPN_LINEUP_SLOT[slotId]) continue;
      teamCounts[slotId] = (teamCounts[slotId] ?? 0) + 1;
    }

    for (const [slotId, count] of Object.entries(teamCounts)) {
      maxCountsBySlot[slotId] = Math.max(maxCountsBySlot[slotId] ?? 0, count);
    }
  }

  return maxCountsBySlot;
}

function getEntryPlayerId(entry) {
  return toEspnPlayerId(getEntryPlayer(entry)?.id ?? entry?.playerId);
}

function getLineupSlotSortValue(entry) {
  const slotId = Number(entry?.lineupSlotId);
  return Number.isFinite(slotId) ? slotId : Number.MAX_SAFE_INTEGER;
}

function sortEntriesByLineupSlot(entries = []) {
  return entries
    .map((entry, index) => ({ entry, index, slot: getLineupSlotSortValue(entry) }))
    .sort((a, b) => (a.slot - b.slot) || (a.index - b.index))
    .map(({ entry }) => entry);
}

function getStarterEntries(entries = []) {
  return sortEntriesByLineupSlot(
    entries.filter((entry) => !BENCH_SLOT_IDS.has(Number(entry.lineupSlotId))),
  );
}

function buildRosters(payload, currentTeamId) {
  const scheduleRosters = buildScheduleRosterSnapshots(payload);
  return (payload?.teams ?? []).map((team) => {
    const currentEntries = team?.roster?.entries ?? [];
    const fallbackSnapshot = scheduleRosters.get(Number(team.id));
    const entries = currentEntries.length ? currentEntries : (fallbackSnapshot?.entries ?? []);
    const starterEntries = getStarterEntries(entries);
    const players = entries.map(getEntryPlayerId).filter(Boolean);
    const starters = starterEntries
      .map(getEntryPlayerId)
      .filter(Boolean);
    const reserve = entries
      .filter((entry) => IR_SLOT_IDS.has(Number(entry.lineupSlotId)))
      .map(getEntryPlayerId)
      .filter(Boolean);
    const record = team.record?.overall ?? {};
    return {
      roster_id: Number(team.id),
      owner_id: getOwnerKey(team, currentTeamId),
      players,
      starters,
      reserve,
      settings: {
        wins: record.wins ?? 0,
        losses: record.losses ?? 0,
        ties: record.ties ?? 0,
        fpts: record.pointsFor ?? 0,
        fpts_against: record.pointsAgainst ?? 0,
      },
      metadata: {
        platform: 'espn',
        teamName: getTeamName(team),
        abbreviation: team.abbrev ?? null,
        rosterSource: currentEntries.length ? 'team' : fallbackSnapshot ? 'schedule' : 'empty',
      },
    };
  });
}

function buildLeagueUsers(payload, currentTeamId) {
  return (payload?.teams ?? []).map((team) => ({
    user_id: getOwnerKey(team, currentTeamId),
    display_name: getTeamName(team),
    username: team.abbrev ?? getTeamName(team),
    metadata: {
      team_name: getTeamName(team),
      platform: 'espn',
    },
  }));
}

function getWeekPoints(entry, week) {
  const matching = getEntryStats(entry).find((statRow) => (
    statRow.statSourceId === 0
    && statRow.statSplitTypeId === 1
    && Number(statRow.scoringPeriodId) === Number(week)
  ));
  const applied = getFirstFiniteNumber(
    entry?.appliedStatTotal,
    matching?.appliedTotal,
    getAppliedStatsTotal(matching?.appliedStats),
    entry?.playerPoolEntry?.appliedStatTotal,
  );
  return Number.isFinite(applied) ? applied : 0;
}

function buildMatchupSide(side, matchupId, week, rosterById = new Map()) {
  if (!side?.teamId) return null;
  const entries = getScheduleSideEntries(side);
  const fallbackRoster = rosterById.get(Number(side.teamId)) ?? null;
  const starterEntries = getStarterEntries(entries);
  const entryPlayers = entries.map(getEntryPlayerId).filter(Boolean);
  const entryStarters = starterEntries
    .map(getEntryPlayerId)
    .filter(Boolean);
  const players = entryPlayers.length ? entryPlayers : (fallbackRoster?.players ?? []);
  const starters = entryStarters.length ? entryStarters : (fallbackRoster?.starters ?? []);
  const playersPoints = {};
  for (const entry of entries) {
    const playerId = getEntryPlayerId(entry);
    if (playerId) playersPoints[playerId] = getWeekPoints(entry, week);
  }
  return {
    roster_id: Number(side.teamId),
    matchup_id: matchupId,
    points: Number(side.totalPoints ?? side.cumulativeScore?.score ?? 0),
    starters,
    players,
    players_points: playersPoints,
    metadata: {
      platform: 'espn',
      teamId: Number(side.teamId),
      week,
      isBye: false,
    },
  };
}

function buildMatchupsByWeek(payload, rosters = []) {
  const byWeek = {};
  const rosterById = new Map((rosters ?? []).map((roster) => [Number(roster.roster_id), roster]));
  for (const matchup of payload?.schedule ?? []) {
    const week = getScheduleWeek(matchup);
    if (!week) continue;
    const matchupId = matchup.id ?? `${week}-${matchup.home?.teamId ?? 'home'}-${matchup.away?.teamId ?? 'away'}`;
    const rows = [
      buildMatchupSide(matchup.home, matchupId, week, rosterById),
      buildMatchupSide(matchup.away, matchupId, week, rosterById),
    ].filter(Boolean);
    if (rows.length === 1) {
      rows[0] = {
        ...rows[0],
        metadata: {
          ...(rows[0].metadata ?? {}),
          isBye: true,
        },
      };
    }
    if (rows.length) byWeek[week] = [...(byWeek[week] ?? []), ...rows];
  }
  return byWeek;
}

export function normalizeEspnLeaguePayload(payload, { season, leagueId, teamId = null, scoringPeriodId = null } = {}) {
  const settings = payload?.settings ?? {};
  const currentTeamId = teamId ?? payload?._gridshift?.currentTeamId ?? null;
  const scoringSettings = importEspnScoringProfile(settings.scoringSettings ?? {});
  const scheduleSettings = settings.scheduleSettings ?? {};
  const playoffWeekStart = getPlayoffWeekStart(scheduleSettings);
  const maxScheduleWeek = getMaxScheduleWeek(payload);
  const maxFantasyScoringWeek = getMaxFantasyScoringWeek(payload);
  const lineupSlotCounts = Object.keys(settings.rosterSettings?.lineupSlotCounts ?? {}).length
    ? settings.rosterSettings.lineupSlotCounts
    : inferLineupSlotCounts(payload);
  const league = {
    league_id: String(payload?.id ?? leagueId),
    name: settings.name ?? payload?.name ?? 'ESPN League',
    season: String(settings.seasonId ?? season ?? payload?.seasonId ?? new Date().getFullYear()),
    total_rosters: settings.size ?? payload?.teams?.length ?? 0,
    roster_positions: buildRosterPositions(lineupSlotCounts),
    scoring_settings: scoringSettings,
    settings: {
      type: settings.isKeeper ? 1 : 0,
      playoff_week_start: playoffWeekStart,
      matchup_periods: Math.max(maxFantasyScoringWeek ?? maxScheduleWeek ?? 0, 17),
      max_matchup_period: maxScheduleWeek,
      last_scored_leg: null,
    },
    platform: 'espn',
  };

  const players = buildPlayers(payload);
  const { weeklyStats, seasonStats } = buildStats(payload, { scoringPeriodId });
  const rosters = buildRosters(payload, currentTeamId);

  return {
    platform: 'espn',
    fantasyUser: {
      user_id: ESPN_CURRENT_USER_ID,
      display_name: 'ESPN League',
      username: 'espn',
      avatar: null,
      platform: 'espn',
    },
    leagues: [league],
    league,
    rosters,
    leagueUsers: buildLeagueUsers(payload, currentTeamId),
    players,
    weeklyStats,
    seasonStats,
    scheduleMap: null,
    matchupsByWeek: buildMatchupsByWeek(payload, rosters),
    scoringSettings,
    selectedLeagueId: league.league_id,
    season: league.season,
    availableSeasons: [league.season],
    leaguesBySeason: { [league.season]: [league] },
  };
}
