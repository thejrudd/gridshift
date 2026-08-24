import { getTeamAbbr, normalizeName } from './liveScoringFeed.js';
import { positionMatchesLeagueFilter } from './leaguePositions.js';

function normalizePosition(position) {
  const value = String(position ?? '').trim().toUpperCase();
  if (['DST', 'D/ST', 'DEF', 'DEFENSE'].includes(value)) return 'DST';
  if (['QB', 'RB', 'WR', 'TE', 'K'].includes(value)) return value;
  return null;
}

function getPlayerName(player) {
  return player?.full_name
    || [player?.first_name, player?.last_name].filter(Boolean).join(' ')
    || '';
}

function getAdpPosition(row) {
  return [
    row?.position,
    row?.player?.position_abbreviation,
    row?.player?.position,
  ].map(normalizePosition).find(Boolean) ?? null;
}

function getAdpTeam(row) {
  const candidates = [
    row?.team?.abbreviation,
    row?.team?.short_name,
    row?.team?.name,
    row?.team,
    row?.player?.team?.abbreviation,
    row?.player?.team?.short_name,
    row?.player?.team?.name,
    row?.player?.team,
  ];
  return candidates
    .map((candidate) => getTeamAbbr(candidate))
    .find((team) => team && team.length <= 3) ?? '';
}

function getAdpName(row) {
  const player = row?.player ?? {};
  return player.full_name
    || [player.first_name, player.last_name].filter(Boolean).join(' ')
    || row?.full_name
    || [row?.first_name, row?.last_name].filter(Boolean).join(' ')
    || '';
}

function getAdpValue(row) {
  const value = Number(row?.average_draft_position ?? row?.averageDraftPosition ?? row?.adp);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function makePlayerKey({ name, team, position }) {
  const normalizedPosition = normalizePosition(position);
  const normalizedTeam = getTeamAbbr(team);
  if (!normalizedPosition || !normalizedTeam) return null;
  if (normalizedPosition === 'DST') return `dst|${normalizedTeam}`;
  const normalizedName = normalizeName(name);
  return normalizedName ? `${normalizedName}|${normalizedTeam}|${normalizedPosition}` : null;
}

/**
 * Builds a conservative crosswalk from BALLDONTLIE's public player IDs to
 * GridShift/Sleeper player IDs. A row is usable only when its name, NFL team,
 * and fantasy position resolve to exactly one player on each side.
 */
export function mapFantasyAdpToSleeperPlayers({ players, adpRows } = {}) {
  const sleeperIdsByKey = new Map();

  Object.entries(players ?? {}).forEach(([playerId, player]) => {
    const key = makePlayerKey({
      name: getPlayerName(player),
      team: player?.team,
      position: player?.position,
    });
    if (!key) return;
    const current = sleeperIdsByKey.get(key) ?? [];
    current.push(String(playerId));
    sleeperIdsByKey.set(key, current);
  });

  const adpRowsByKey = new Map();
  (adpRows ?? []).forEach((row) => {
    const averageDraftPosition = getAdpValue(row);
    if (averageDraftPosition == null) return;
    const key = makePlayerKey({
      name: getAdpName(row),
      team: getAdpTeam(row),
      position: getAdpPosition(row),
    });
    if (!key) return;
    const current = adpRowsByKey.get(key) ?? [];
    current.push(row);
    adpRowsByKey.set(key, current);
  });

  const matched = new Map();
  adpRowsByKey.forEach((rows, key) => {
    const sleeperIds = sleeperIdsByKey.get(key) ?? [];
    if (rows.length !== 1 || sleeperIds.length !== 1) return;
    const [row] = rows;
    matched.set(sleeperIds[0], {
      // Keep the provider player nested under adpRow. The consumer's `player`
      // field must always remain the GridShift/Sleeper player for rendering.
      adpRow: row,
      averageDraftPosition: getAdpValue(row),
      source: 'balldontlie',
    });
  });
  return matched;
}

/**
 * Applies the connected league's position scope without treating an
 * uninitialized roster-position list (`['ALL']`) as a filter that excludes
 * every otherwise valid ADP match.
 */
export function getFantasyAdpPlayersForLeague({ players, adpRows, availablePositions } = {}) {
  const matched = mapFantasyAdpToSleeperPlayers({ players, adpRows });
  const configuredPositions = (availablePositions ?? [])
    .map((position) => String(position ?? '').trim().toUpperCase())
    .filter((position) => position && position !== 'ALL');
  if (!configuredPositions.length) return matched;

  return new Map([...matched].filter(([playerId]) => (
    positionMatchesLeagueFilter(players?.[String(playerId)]?.position, 'ALL', {
      availableFilters: ['ALL', ...configuredPositions],
    })
  )));
}

export function getFantasyAdpSnapshotUpdatedAt(adpRows = []) {
  return (adpRows ?? [])
    .map((row) => row?.market_updated_at ?? row?.collected_at ?? null)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
}
