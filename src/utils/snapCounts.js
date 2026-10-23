const NFLVERSE_BASE = 'https://github.com/nflverse/nflverse-data/releases/download';

export function parseCsv(text = '') {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const source = String(text).replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else value += char;
  }

  if (value || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).filter((cells) => cells.length > 1).map((cells) => (
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))
  ));
}

function finiteNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeGameType(value) {
  const type = String(value ?? '').toUpperCase();
  return type === 'POST' || type === 'POSTSEASON' ? 'post' : 'reg';
}

function normalizeTeam(value) {
  const team = String(value ?? '').toUpperCase();
  return ({
    LA: 'LAR',
    JAC: 'JAX',
    WAS: 'WSH',
    OAK: 'LV',
    SD: 'LAC',
  })[team] ?? team;
}

export function buildPlayerSnapCounts(playerCsv, snapCsv, espnPlayerId) {
  const pfrIds = new Set(
    playerCsv
      .filter((player) => String(player.espn_id) === String(espnPlayerId) && player.pfr_id)
      .map((player) => String(player.pfr_id)),
  );
  if (pfrIds.size === 0) return [];

  return snapCsv.flatMap((row) => {
    if (!pfrIds.has(String(row.pfr_player_id))) return [];
    const week = finiteNumber(row.week);
    if (week === null) return [];
    return [{
      week,
      gameType: normalizeGameType(row.game_type),
      team: normalizeTeam(row.team),
      offensePct: finiteNumber(row.offense_pct),
      defensePct: finiteNumber(row.defense_pct),
      stPct: finiteNumber(row.st_pct),
    }];
  });
}

export function selectGameSnapPercentage(game, snapCounts, position, season) {
  const meta = game?.meta ?? {};
  if (meta.isBye || meta.isInactive || !Number.isFinite(Number(meta.week))) return null;
  const group = String(position ?? '').toUpperCase();
  if (['DEF', 'DST', 'D/ST'].includes(group)) return null;
  const field = ['K', 'PK', 'P', 'LS'].includes(group)
    ? 'stPct'
    : ['DE', 'DT', 'NT', 'DL', 'ED', 'EDGE', 'LB', 'ILB', 'OLB', 'MLB', 'CB', 'S', 'SS', 'FS', 'DB'].includes(group)
      ? 'defensePct'
      : 'offensePct';
  const gameType = meta.isPostseason ? 'post' : 'reg';
  const playoffWeek = Number(meta.week);
  const snapWeek = meta.isPostseason
    ? ({
        1: Number(season) >= 2021 ? 19 : 18,
        2: Number(season) >= 2021 ? 20 : 19,
        3: Number(season) >= 2021 ? 21 : 20,
        5: Number(season) >= 2021 ? 22 : 21,
      })[playoffWeek]
    : Number(meta.week);
  if (!Number.isFinite(snapWeek)) return null;
  const team = normalizeTeam(meta.myTeam);
  const match = (snapCounts ?? []).find((row) => (
    Number(row.week) === snapWeek
    && row.gameType === gameType
    && normalizeTeam(row.team) === team
  ));
  const fraction = match?.[field];
  return Number.isFinite(fraction) ? Math.round(fraction * 1000) / 10 : null;
}

export async function fetchPlayerSnapCounts(season, playerId, fetchImpl = fetch) {
  const seasonNumber = Number(season);
  if (!Number.isInteger(seasonNumber) || seasonNumber < 2012 || !/^\d{1,10}$/.test(String(playerId))) return [];

  const [playersResponse, snapsResponse] = await Promise.all([
    fetchImpl(`${NFLVERSE_BASE}/players/players.csv`),
    fetchImpl(`${NFLVERSE_BASE}/snap_counts/snap_counts_${seasonNumber}.csv`),
  ]);
  if (!playersResponse.ok || !snapsResponse.ok) {
    throw new Error('NFL snap-count data is unavailable for this season.');
  }
  const [playersText, snapsText] = await Promise.all([playersResponse.text(), snapsResponse.text()]);
  return buildPlayerSnapCounts(parseCsv(playersText), parseCsv(snapsText), playerId);
}
