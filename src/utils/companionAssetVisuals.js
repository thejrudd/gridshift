import { normalizeIDPPos } from './idpEngine.js';
import { hexLuminance } from './teamVisualTheme.js';

export const POSITION_COLORS = {
  QB: '#5AADFF',
  RB: '#2ED578',
  WR: '#FF8C1A',
  TE: '#F5B700',
  K: '#9CA3AF',
  DL: '#FF4433',
  LB: '#00C2A8',
  DB: '#C084FC',
  DEF: '#64748B',
};

export function getCompanionPositionColor(position) {
  const normalized = normalizeIDPPos(position) ?? String(position ?? '').toUpperCase();
  if (normalized === 'DE' || normalized === 'DT') return POSITION_COLORS.DL;
  if (normalized === 'CB' || normalized === 'S') return POSITION_COLORS.DB;
  if (normalized === 'PK') return POSITION_COLORS.K;
  if (normalized === 'DST') return POSITION_COLORS.DEF;
  return POSITION_COLORS[normalized] ?? null;
}

export function getPositionTextColor(background) {
  return background && hexLuminance(background) > 0.42 ? '#0C0F14' : '#FFFFFF';
}

export function getSleeperPlayerImageUrl(playerId) {
  return playerId ? `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg` : null;
}

export function getEspnPlayerImageUrl(playerId) {
  if (playerId == null) return null;
  const normalized = String(playerId).trim();
  if (!normalized) return null;

  const espnId = normalized.startsWith('espn:')
    ? normalized.slice('espn:'.length)
    : normalized;
  return /^\d+$/.test(espnId)
    ? `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`
    : null;
}

export function getSleeperAvatarUrl(avatarHash) {
  return avatarHash ? `https://sleepercdn.com/avatars/thumbs/${avatarHash}` : null;
}

export function getNflTeamLogoUrl(logoKey) {
  return logoKey ? `https://a.espncdn.com/i/teamlogos/nfl/500/${logoKey}.png` : null;
}

export function getCompanionInitials(label, fallback = '?') {
  const initials = String(label ?? fallback)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return initials || fallback;
}

export function getCompanionPlayerImageUrl(player = {}) {
  return player.imageUrl
    ?? player.image_url
    ?? player.playerImageUrl
    ?? player.avatarUrl
    ?? getEspnPlayerImageUrl(player.espnId ?? player.espn_id ?? player.sourceIds?.espn)
    ?? (String(player.id ?? player.playerId ?? player.sleeperId ?? '').startsWith('espn:')
      ? getEspnPlayerImageUrl(player.id ?? player.playerId ?? player.sleeperId)
      : null)
    ?? getSleeperPlayerImageUrl(player.id ?? player.playerId ?? player.sleeperId)
    ?? null;
}

export function getCompanionTeamLogoUrl(player = {}, theme = null) {
  return player.teamLogoUrl
    ?? player.logoUrl
    ?? getNflTeamLogoUrl(player.logoKey ?? theme?.logoKey)
    ?? null;
}
