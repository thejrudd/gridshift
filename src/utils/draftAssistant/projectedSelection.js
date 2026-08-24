// Shared "Projected Selection" source for the live draft status banner shown on
// Draft War Room, Board, and Results. All three pages must derive the banner's
// projection from buildProjectedDraftSelection with the same Sleeper inputs so
// the pages can never disagree about who is projected next.
//
// Eligibility rules applied here (in order):
//   1. Player supports the draft assistant (fantasy-relevant position).
//   2. Player is a current NFL player (not retired/inactive).
//   3. Player has not already been picked in THIS draft.
//   4. Player matches the Sleeper draft's player pool setting
//      (draft.settings.player_type: 0 = all, 1 = rookies only, 2 = veterans only).
//   5. Player is not already rostered in the league when the draft pool excludes
//      rostered players (keeper/dynasty leagues and rookie/veteran-only drafts).
//
// Ranking degrades gracefully: the best market-ranked eligible player wins when
// market data is loaded; otherwise the best Sleeper-search-ranked eligible player
// is projected. Null is returned only when no eligible player has any ranking
// signal at all.
import { playerSupportsDraftAssistant } from './projections.js';

const MAX_USABLE_SEARCH_RANK = 5000;

const NON_CURRENT_PLAYER_STATUSES = new Set([
  'inactive',
  'retired',
  'reserve/retired',
  'reserve retired',
]);

function parseDraftInteger(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function firstDraftInteger(...values) {
  for (const value of values) {
    const parsed = parseDraftInteger(value);
    if (parsed != null) return parsed;
  }
  return null;
}

export function isDraftRookie(player, draftSeason) {
  const raw = player?.raw ?? player ?? {};
  const metadata = raw?.metadata ?? {};
  const yearsExp = firstDraftInteger(
    raw.years_exp,
    raw.yearsExp,
    raw.experience,
    metadata.years_exp,
    metadata.yearsExp,
    metadata.experience,
    player?.years_exp,
    player?.yearsExp,
  );
  if (yearsExp === 0) return true;

  const season = parseDraftInteger(draftSeason);
  if (season == null) return false;

  const rookieYear = firstDraftInteger(
    raw.rookie_year,
    raw.rookieYear,
    raw.rookie_season,
    raw.draft_year,
    metadata.rookie_year,
    metadata.rookieYear,
    metadata.rookie_season,
    metadata.draft_year,
  );

  return rookieYear === season;
}

// Sleeper exposes the draftable player pool on the same draft settings object the
// app already reads for pick_timer, rounds, and slots_qb:
// settings.player_type — 0 = all players, 1 = rookies only, 2 = veterans only.
export function getSleeperDraftPlayerPool(draft) {
  const playerType = parseDraftInteger(draft?.settings?.player_type);
  if (playerType === 1) return 'rookies';
  if (playerType === 2) return 'veterans';
  return 'all';
}

// Rosters persist through the draft in keeper and dynasty leagues
// (league.settings.type: 0 = redraft, 1 = keeper, 2 = dynasty) and whenever the
// draft pool is restricted (rookie/veteran-only drafts fill out existing rosters),
// so already-rostered players cannot be selected in those drafts.
export function shouldExcludeRosteredPlayers({ league, pool }) {
  if (pool !== 'all') return true;
  const leagueType = parseDraftInteger(league?.settings?.type);
  return leagueType === 1 || leagueType === 2;
}

function normalizePlayerStatus(player) {
  return String(player?.status ?? player?.metadata?.status ?? '').trim().toLowerCase();
}

function hasCurrentTeam(player) {
  const team = String(player?.team ?? player?.team_abbr ?? '').trim().toUpperCase();
  return Boolean(team) && team !== 'FA' && team !== 'NONE' && team !== '—';
}

function normalizeProjectionPosition(player) {
  const raw = player?.fantasy_positions?.[0] ?? player?.position ?? null;
  if (!raw) return null;
  const normalized = String(raw).toUpperCase();
  return normalized === 'DST' ? 'DEF' : normalized;
}

function normalizeSearchRank(value) {
  const rank = Number(value);
  if (!Number.isFinite(rank) || rank <= 0 || rank > MAX_USABLE_SEARCH_RANK) return null;
  return rank;
}

function getMarketRank(marketValuesByPlayerId, playerId) {
  if (!marketValuesByPlayerId) return null;
  const entry = marketValuesByPlayerId instanceof Map
    ? marketValuesByPlayerId.get(playerId)
    : marketValuesByPlayerId[playerId];
  const rank = Number(entry?.overallRank);
  return Number.isFinite(rank) && rank > 0 ? rank : null;
}

export function getDraftedPlayerIdSet(draftPicks = []) {
  const ids = new Set();
  for (const pick of draftPicks ?? []) {
    const playerId = pick?.player_id ?? pick?.playerId ?? pick?.metadata?.player_id ?? null;
    if (playerId != null && String(playerId).trim()) ids.add(String(playerId));
  }
  return ids;
}

function getRosteredPlayerIdSet(rosters = []) {
  const ids = new Set();
  for (const roster of rosters ?? []) {
    for (const playerId of [
      ...(roster?.players ?? []),
      ...(roster?.reserve ?? []),
      ...(roster?.taxi ?? []),
      ...(roster?.starters ?? []),
    ]) {
      if (playerId != null) ids.add(String(playerId));
    }
  }
  return ids;
}

export function isPlayerDraftEligible(player, {
  draftedIds = null,
  rosteredIds = null,
  pool = 'all',
  draftSeason = null,
} = {}) {
  const playerId = player?.player_id != null ? String(player.player_id) : null;
  if (!playerId) return false;
  if (draftedIds?.has(playerId)) return false;
  if (rosteredIds?.has(playerId)) return false;
  if (!playerSupportsDraftAssistant(player)) return false;
  if (player?.active === false) return false;
  if (NON_CURRENT_PLAYER_STATUSES.has(normalizePlayerStatus(player))) return false;
  if (pool === 'rookies' && !isDraftRookie(player, draftSeason)) return false;
  if (pool === 'veterans' && isDraftRookie(player, draftSeason)) return false;
  return true;
}

export function buildProjectedDraftSelection({
  draft = null,
  league = null,
  players = null,
  rosters = [],
  draftPicks = [],
  marketValuesByPlayerId = null,
}) {
  if (!players || typeof players !== 'object') return null;

  const pool = getSleeperDraftPlayerPool(draft);
  const draftSeason = draft?.season ?? league?.season ?? null;
  const draftedIds = getDraftedPlayerIdSet(draftPicks);
  const rosteredIds = shouldExcludeRosteredPlayers({ league, pool })
    ? getRosteredPlayerIdSet(rosters)
    : null;
  const eligibility = { draftedIds, rosteredIds, pool, draftSeason };

  let bestMarket = null;
  let bestSearch = null;
  for (const player of Object.values(players)) {
    if (!isPlayerDraftEligible(player, eligibility)) continue;

    const playerId = String(player.player_id);
    const marketRank = getMarketRank(marketValuesByPlayerId, playerId);
    const searchRank = normalizeSearchRank(player?.search_rank);
    if (marketRank == null && searchRank == null) continue;
    // Players without market data (or any rank at all) still need a current
    // team so long-departed entries in the Sleeper player table never project.
    if (marketRank == null && !hasCurrentTeam(player)) continue;

    if (marketRank != null && (bestMarket == null || marketRank < bestMarket.rank)) {
      bestMarket = { player, rank: marketRank };
    }
    if (searchRank != null && (bestSearch == null || searchRank < bestSearch.rank)) {
      bestSearch = { player, rank: searchRank };
    }
  }

  const usingMarket = bestMarket != null;
  const chosen = bestMarket ?? bestSearch;
  if (!chosen) return null;

  const { player, rank } = chosen;
  return {
    id: String(player.player_id),
    name: player.full_name
      || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim()
      || 'Player',
    position: normalizeProjectionPosition(player),
    team: String(player.team ?? 'FA').toUpperCase(),
    rank: { overallRank: rank },
    projection: { source: usingMarket ? 'leaguelogs_market' : 'sleeper_search_rank' },
    reason: usingMarket ? 'Best available by market rank' : 'Best available by Sleeper rank',
    pool,
    raw: player,
  };
}
