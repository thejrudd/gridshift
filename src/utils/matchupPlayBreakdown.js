// matchupPlayBreakdown.js — where one scoring play's fantasy points came from,
// for the Matchups scoring-play hover card.
//
// The rows are the play's own stat line scored through the league's settings
// (the shared buildFantasyScoringBreakdown labels and multipliers, with the
// player's position), so they add up to the play's own estimate. A reconciled
// play also carries the adjustment that brought the player's plays to the
// official total; it gets its own row so the card always sums to the points the
// row shows. Pure: no React, no fetching.

import { buildFantasyScoringBreakdown } from './fantasyBreakdownRows.js';
import { getPricedTackleKey } from './playByPlay/playStatDelta.js';

const EPSILON = 0.005;

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// The stat line as it was priced: a generic tackle becomes the solo or
// assisted tackle the league actually pays.
function pricedStats(event, scoringSettings) {
  const stats = { ...(event?.stats ?? {}) };
  const tackleKey = getPricedTackleKey(event?.play, stats, scoringSettings);
  if (tackleKey) {
    stats[tackleKey] = (Number(stats[tackleKey]) || 0) + Number(stats.idp_tkl);
    delete stats.idp_tkl;
  }
  return stats;
}

/**
 * `{ rows: [{ key, label, statVal, pts }], total }` for a Matchups feed event.
 * `event.pts` is the shown value; `event.rawPts` (reconciled plays) or
 * `event.pts - event.adjustment` is the play's own estimate.
 */
export function buildPlayPointsBreakdown(event, scoringSettings) {
  const total = round2(event?.pts);
  const adjustment = round2(event?.adjustment);
  const ownPoints = Number.isFinite(Number(event?.rawPts)) ? round2(event.rawPts) : round2(total - adjustment);
  const { rows } = buildFantasyScoringBreakdown(pricedStats(event, scoringSettings), scoringSettings, event?.position ?? null, {
    authoritativeTotal: ownPoints,
    preferRawStats: true,
    fallbackTotalLabel: 'Points',
    adjustmentLabel: 'Rounding',
  });
  const out = rows.map(({ key, label, statVal, pts }) => ({ key, label, statVal, pts }));
  if (Math.abs(adjustment) >= EPSILON) {
    out.push({ key: 'official_adjustment', label: 'Adjusted to official stats', statVal: null, pts: adjustment });
  }
  return { rows: out, total };
}
