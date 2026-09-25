function measurementText(value) {
  if (value == null) return '';
  const text = String(value).trim();
  return /^(?:-|—|n\/?a|null|unknown|0)$/i.test(text) ? '' : text;
}

export function formatPlayerHeight(value) {
  const raw = measurementText(value);
  if (!raw) return null;

  const parts = raw.match(/^(\d+)\s*(?:ft|feet|['′’]|-)\s*(\d{1,2})?\s*(?:"|″|in(?:ches?)?)?$/i);
  if (parts) {
    const feet = Number(parts[1]);
    const inches = parts[2] == null ? null : Number(parts[2]);
    if (inches == null || inches < 12) {
      return inches == null ? `${feet}′` : `${feet}′ ${inches}″`;
    }
  }

  // Sleeper occasionally supplies height as total inches instead of feet and
  // inches. Keep the accepted range narrow so unrelated numbers stay intact.
  if (/^\d{2,3}$/.test(raw)) {
    const totalInches = Number(raw);
    if (totalInches >= 48 && totalInches <= 96) {
      return `${Math.floor(totalInches / 12)}′ ${totalInches % 12}″`;
    }
  }

  return raw;
}

export function formatPlayerWeight(value) {
  const raw = measurementText(value);
  if (!raw) return null;

  const parts = raw.match(/^(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound|pounds)?$/i);
  if (!parts) return raw;

  const pounds = Number(parts[1]);
  if (!Number.isFinite(pounds) || pounds <= 0) return null;
  const display = Number.isInteger(pounds) ? String(pounds) : String(Number(pounds.toFixed(1)));
  return `${display} lb`;
}

export function normalizePlayerMeasurements(player = {}) {
  return {
    height: formatPlayerHeight(player.height),
    weight: formatPlayerWeight(player.weight),
  };
}

export function formatPlayerMeasurements(player = {}, { compact = false } = {}) {
  const height = formatPlayerHeight(player.height);
  const weight = formatPlayerWeight(player.weight);
  const parts = [];

  if (height) parts.push(`${compact ? 'HT' : 'Height'} ${height}`);
  if (weight) parts.push(`${compact ? 'WT' : 'Weight'} ${weight}`);
  return parts.length ? parts.join(' · ') : null;
}
