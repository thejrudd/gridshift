const YARDAGE_SCORING_KEYS = new Set([
  'pass_yd', 'rush_yd', 'rec_yd',
  'kr_yd', 'pr_yd', 'blk_kick_ret_yd', 'fg_ret_yd', 'fum_ret_yd',
  'idp_sack_yd', 'idp_int_ret_yd', 'idp_fr_yd',
  'fgm_yds', 'fgm_yds_over_30',
  'sack_yd', 'int_ret_yd',
  'yds_allow',
  'def_kr_yd', 'def_pr_yd',
]);

function formatSignedDecimal(value) {
  const rounded = Math.round(value * 100) / 100;
  const absText = Math.abs(rounded).toFixed(2);
  return `${rounded > 0 ? '+' : '-'}${absText}`;
}

export function isYardageScoringKey(key) {
  return YARDAGE_SCORING_KEYS.has(key);
}

export function formatScoringSettingValue(key, value, { zero = '—', compact = false, defaultSuffix = '' } = {}) {
  if (value === 0) return zero;
  if (!Number.isFinite(value)) return String(value);

  if (isYardageScoringKey(key)) {
    const absValue = Math.abs(value);
    if (absValue === 0) return zero;

    const yardsPerPoint = Math.max(1, Math.round(1 / absValue));
    const pointLabel = value > 0 ? '1 point' : '-1 point';
    if (compact) {
      return `${value > 0 ? '1' : '-1'} / ${yardsPerPoint} yds (${formatSignedDecimal(value)}/yd)`;
    }
    return `${pointLabel} every ${yardsPerPoint} yards (${formatSignedDecimal(value)} per yard)`;
  }

  return defaultSuffix ? `${value} ${defaultSuffix}` : String(value);
}
