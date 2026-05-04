import { getTeamColorKey } from '../../../data/teamColors';
import { normalizeIDPPos } from '../../../utils/idpEngine';
import {
  POSITION_COLORS,
  getCompanionPositionColor,
} from '../../../utils/companionAssetVisuals';
import {
  contrastRatio,
  darkenHex,
  getTeamVisualTheme,
  hexLuminance,
  hexToRgb,
  mixHex,
  pickReadableForeground,
} from '../../../utils/teamVisualTheme';

export const ROSTER_BROWSE_OFFENSE_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);

export const UPGRADE_TRADE_POSTURES = [
  { level: 0, label: 'Underpay', description: 'Try to buy low' },
  { level: 1, label: 'Lean Under', description: 'Slight edge to me' },
  { level: 2, label: 'Fair', description: 'Close to even' },
  { level: 3, label: 'Lean Over', description: 'Pay a little extra' },
  { level: 4, label: 'Overpay', description: 'Pay up for the upgrade' },
];

export { POSITION_COLORS };

// ── Team color helpers ────────────────────────────────────────────────────────

export {
  contrastRatio,
  darkenHex,
  hexLuminance,
  hexToRgb,
  mixHex,
  pickReadableForeground,
};

export function toTeamKey(sleeperTeam) {
  return getTeamColorKey(sleeperTeam) ?? '';
}

export function normalizeRosterId(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function teamPalette(sleeperTeam, darkMode, options = {}) {
  return getTeamVisualTheme(sleeperTeam, darkMode, options);
}


/** True for IDP (DL/LB/DB sub-positions) or D/ST (DEF) players. */
export function isIDPDSTPos(position) {
  return normalizeIDPPos(position) !== null || position === 'DEF';
}

export function scheduleDeferredTradeTask(callback, timeout = 240) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(() => callback(), { timeout });
    return () => window.cancelIdleCallback(idleId);
  }
  const timerId = window.setTimeout(callback, 0);
  return () => window.clearTimeout(timerId);
}

export function getTradePositionColor(position) {
  return getCompanionPositionColor(position);
}
