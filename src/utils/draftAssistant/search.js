import { matchesFilter, matchesJerseyNumber, parseSearchQuery } from '../parseSearchQuery.js';

function getDraftSearchName(player) {
  return player?.name
    || player?.raw?.full_name
    || `${player?.raw?.first_name ?? ''} ${player?.raw?.last_name ?? ''}`.trim()
    || '';
}

export function getDraftPlayerSearchNumber(player) {
  return player?.jersey
    ?? player?.number
    ?? player?.raw?.number
    ?? player?.raw?.jersey
    ?? player?.raw?.metadata?.number
    ?? player?.raw?.metadata?.jersey
    ?? '';
}

export function matchesDraftPlayerSearch(player, filters) {
  if (filters.name.length > 0) {
    const name = getDraftSearchName(player).toLowerCase();
    if (!filters.name.every((term) => name.includes(term))) return false;
  }
  if (filters.pos.size > 0
    && ![...filters.pos].some((position) => matchesFilter(player?.position, position))) {
    return false;
  }
  if (filters.team.size > 0) {
    const team = String(player?.team || player?.raw?.team || '').trim().toLowerCase();
    if (!filters.team.has(team)) return false;
  }
  if (filters.number.size > 0
    && ![...filters.number].some((number) => matchesJerseyNumber(getDraftPlayerSearchNumber(player), number))) {
    return false;
  }
  return true;
}

export function filterDraftPlayersBySearch(players, position, query) {
  const trimmedQuery = String(query ?? '').trim();
  if (!trimmedQuery) {
    return (players ?? []).filter((player) => position === 'ALL' || player?.position === position);
  }

  const filters = parseSearchQuery(trimmedQuery);
  const hasFilters = filters.pos.size || filters.team.size || filters.div.size
    || filters.conf.size || filters.number.size || filters.name.length;
  if (!hasFilters) return [];

  return (players ?? []).filter((player) => (
    (position === 'ALL' || player?.position === position)
    && matchesDraftPlayerSearch(player, filters)
  ));
}
