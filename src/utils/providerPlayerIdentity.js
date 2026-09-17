import { getTeamAbbr, normalizeName } from './liveScoringFeed.js';

const POSITION_FAMILIES = {
  DL: 'DL', DE: 'DL', DT: 'DL', NT: 'DL',
  LB: 'LB', ILB: 'LB', MLB: 'LB', OLB: 'LB', LILB: 'LB', RILB: 'LB', LOLB: 'LB', ROLB: 'LB',
  DB: 'DB', CB: 'DB', S: 'DB', FS: 'DB', SS: 'DB', NB: 'DB', SAF: 'DB',
  QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', K: 'K', P: 'P',
  DST: 'DST', DEF: 'DST', 'D/ST': 'DST', DEFENSE: 'DST',
};

export function normalizeProviderPlayerName(value) {
  return normalizeName(value).replace(/\s+(?:jr|sr|ii|iii|iv|v)$/i, '').trim();
}

export function normalizeProviderTeam(value) {
  return getTeamAbbr(value);
}

export function normalizeProviderPosition(value) {
  const position = String(value ?? '').trim().toUpperCase();
  return POSITION_FAMILIES[position] ?? null;
}

export function getProviderPlayerIdentity({ name, team, position } = {}) {
  const normalizedName = normalizeProviderPlayerName(name);
  const normalizedTeam = normalizeProviderTeam(team);
  const positionFamily = normalizeProviderPosition(position);
  if (!normalizedName || !normalizedTeam || !positionFamily || positionFamily === 'DST') return null;
  return { name: normalizedName, team: normalizedTeam, position: positionFamily };
}

export function getProviderIdentityKey(identity) {
  if (!identity) return null;
  const value = identity?.name ? identity : getProviderPlayerIdentity(identity);
  if (!value) return null;
  return `${value.name}|${value.team}|${value.position}`;
}

export function areCompatibleProviderIdentities(left, right) {
  const a = left?.name ? left : getProviderPlayerIdentity(left);
  const b = right?.name ? right : getProviderPlayerIdentity(right);
  return Boolean(a && b && a.name === b.name && a.team === b.team && a.position === b.position);
}

export { POSITION_FAMILIES };
