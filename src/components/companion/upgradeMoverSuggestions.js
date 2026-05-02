export const DEFAULT_UPGRADE_MOVER_LIMIT = 8;

function toId(value) {
  if (value == null) return null;
  return String(value);
}

function getFromLookup(lookup, key) {
  if (!lookup || key == null) return null;
  if (lookup instanceof Map) return lookup.get(key) ?? lookup.get(String(key)) ?? null;
  return lookup[key] ?? lookup[String(key)] ?? null;
}

function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function compareNumbersDesc(a, b) {
  const left = asNumber(a);
  const right = asNumber(b);
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return right - left;
}

function compareTextAsc(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' });
}

function compareMoverRowsByValue(a, b) {
  return (
    compareNumbersDesc(a.value, b.value)
    || compareNumbersDesc(a.ppg, b.ppg)
    || compareTextAsc(a.name, b.name)
    || compareTextAsc(a.id, b.id)
  );
}

function rankLabelFromRank(rank) {
  if (!rank) return null;
  if (rank.label) return rank.label;
  if (rank.posLabel && rank.rank != null) return `${rank.posLabel}${rank.rank}`;
  if (rank.position && rank.rank != null) return `${rank.position}${rank.rank}`;
  return null;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value != null && String(value).trim()) return value;
  }
  return null;
}

function resolvePlayerId(player) {
  return toId(player?.id ?? player?.player_id ?? player?.sleeper_id);
}

function resolvePlayerValue(player, playerValueMap, getValue) {
  if (typeof getValue === 'function') {
    const value = asNumber(getValue(player));
    if (value != null) return value;
  }

  const id = resolvePlayerId(player);
  const mappedValue = asNumber(getFromLookup(playerValueMap, id));
  if (mappedValue != null) return mappedValue;

  return asNumber(player?.value ?? player?.tradeValue ?? player?.val);
}

function resolveRank(player, rankMap, getRank) {
  if (typeof getRank === 'function') {
    const rank = getRank(player);
    if (rank) return rank;
  }

  return getFromLookup(rankMap, resolvePlayerId(player));
}

export function buildUpgradeMoverRow(player, {
  sleeperPlayers = null,
  playerValueMap = null,
  rankMap = null,
  getValue = null,
  getRank = null,
  selectedIds = new Set(),
} = {}) {
  const id = resolvePlayerId(player);
  if (!id) return null;

  const sleeperPlayer = getFromLookup(sleeperPlayers, id) ?? {};
  const sleeperName = `${sleeperPlayer.first_name ?? ''} ${sleeperPlayer.last_name ?? ''}`.trim();
  const name = firstNonEmpty(
    sleeperPlayer.full_name,
    player.full_name,
    player.displayName,
    player.name,
    player.label,
    sleeperName,
    id,
  );
  const team = sleeperPlayer.team ?? player.team ?? '';
  const position = sleeperPlayer.position ?? player.position ?? '';
  const rank = resolveRank(player, rankMap, getRank);
  const label = rankLabelFromRank(rank);

  return {
    id,
    name,
    displayName: name,
    team,
    teamId: team,
    position,
    ppg: asNumber(player.ppg),
    value: resolvePlayerValue(player, playerValueMap, getValue),
    rank: rank ?? null,
    label,
    rankLabel: label,
    sourceLabel: player.label ?? null,
    selected: selectedIds.has(id),
    player,
  };
}

export function buildUpgradeMoverSuggestions({
  players = [],
  selectedTargetId = null,
  selectedOutgoingIds = [],
  sleeperPlayers = null,
  playerValueMap = null,
  rankMap = null,
  getValue = null,
  getRank = null,
  isMovablePlayer = null,
  limit = DEFAULT_UPGRADE_MOVER_LIMIT,
} = {}) {
  const targetId = toId(selectedTargetId);
  const selectedIds = new Set(selectedOutgoingIds.map(toId).filter(Boolean));
  const rowsById = new Map();

  for (const player of players) {
    const id = resolvePlayerId(player);
    if (!id || id === targetId || rowsById.has(id)) continue;
    if (typeof isMovablePlayer === 'function' && !isMovablePlayer(player)) continue;

    const row = buildUpgradeMoverRow(player, {
      sleeperPlayers,
      playerValueMap,
      rankMap,
      getValue,
      getRank,
      selectedIds,
    });
    if (row) rowsById.set(id, row);
  }

  const pinnedRows = selectedOutgoingIds
    .map(toId)
    .filter((id, index, ids) => id && id !== targetId && ids.indexOf(id) === index)
    .map((id) => rowsById.get(id))
    .filter(Boolean);

  const pinnedIds = new Set(pinnedRows.map((row) => row.id));
  const valueRows = Array.from(rowsById.values())
    .filter((row) => !pinnedIds.has(row.id))
    .sort(compareMoverRowsByValue);

  return [...pinnedRows, ...valueRows].slice(0, Math.max(0, limit));
}
