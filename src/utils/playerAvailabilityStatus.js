const COMPACT_LABELS = {
  Questionable: 'Q',
  Probable: 'P',
  Doubtful: 'D',
  Out: 'OUT',
  'Injured Reserve': 'IR',
  Suspended: 'SUS',
  PUP: 'PUP',
  NFI: 'NFI',
  Exempt: 'EXE',
  'COVID-19': 'COVID',
  DNP: 'DNP',
  Inactive: 'INA',
  Retired: 'RET',
  Reserve: 'RES',
};

const DESKTOP_LABELS = {
  'Injured Reserve': 'IR',
  PUP: 'PUP',
  NFI: 'NFI',
  'COVID-19': 'COVID-19',
  DNP: 'DNP',
};

function cleanStatus(status) {
  if (status == null) return '';
  return String(status)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCaseStatus(status) {
  return cleanStatus(status)
    .toLowerCase()
    .replace(/\b[a-z]/g, letter => letter.toUpperCase())
    .replace(/\bCovid\b/g, 'COVID')
    .replace(/\bNfl\b/g, 'NFL');
}

function compactFallbackLabel(status) {
  const compact = cleanStatus(status).replace(/[^a-z0-9]/gi, '');
  return (compact || cleanStatus(status)).slice(0, 3).toUpperCase();
}

export function canonicalizeAvailabilityStatus(status) {
  const value = cleanStatus(status);
  if (!value) return null;

  const lower = value.toLowerCase();
  if (lower === 'active' || lower === 'healthy') return null;
  if (lower === 'q' || lower.includes('questionable')) return 'Questionable';
  if (lower === 'p' || lower.includes('probable')) return 'Probable';
  if (lower === 'd' || lower.includes('doubtful')) return 'Doubtful';
  if (
    /^ir\b/.test(lower)
    || lower.includes('/ir')
    || lower.includes('injured reserve')
    || lower.includes('reserve/injured')
  ) return 'Injured Reserve';
  if (lower === 'out' || lower.startsWith('out ')) return 'Out';
  if (lower === 'sus' || lower.includes('suspend')) return 'Suspended';
  if (lower.includes('physically unable') || lower.includes('pup')) return 'PUP';
  if (lower === 'nfi' || lower.includes('non football')) return 'NFI';
  if (lower.includes('exempt')) return 'Exempt';
  if (lower.includes('covid')) return 'COVID-19';
  if (lower === 'dnp' || lower.includes('did not play')) return 'DNP';
  if (lower.includes('inactive')) return 'Inactive';
  if (lower.includes('retired')) return 'Retired';
  if (lower === 'reserve') return 'Reserve';

  return titleCaseStatus(value);
}

export function getPlayerAvailabilityStatus(player, { isReserve = false } = {}) {
  const candidates = [
    player?.injury_status,
    player?.injuryStatus,
    player?.status,
    isReserve ? 'Injured Reserve' : null,
  ];

  for (const candidate of candidates) {
    const status = canonicalizeAvailabilityStatus(candidate);
    if (status) return status;
  }

  return null;
}

export function getAvailabilityStatusLabel(status, compact = false) {
  const canonical = canonicalizeAvailabilityStatus(status);
  if (!canonical) return null;
  if (compact) return COMPACT_LABELS[canonical] ?? compactFallbackLabel(canonical);
  return DESKTOP_LABELS[canonical] ?? canonical;
}

export function getAvailabilityStatusTone(status) {
  const canonical = canonicalizeAvailabilityStatus(status);
  if (!canonical) return 'neutral';

  if (canonical === 'Questionable' || canonical === 'Probable') return 'warning';
  if (canonical === 'Suspended' || canonical === 'Exempt' || canonical === 'Retired' || canonical === 'Reserve') return 'neutral';
  if (canonical === 'PUP' || canonical === 'NFI') return 'accent';
  return 'danger';
}

export function getAvailabilityStatusBadgeStyle(status) {
  switch (getAvailabilityStatusTone(status)) {
    case 'danger':
      return {
        background: 'color-mix(in srgb, var(--color-accent-red) 14%, transparent)',
        color: 'var(--color-accent-red)',
      };
    case 'warning':
      return {
        background: 'color-mix(in srgb, var(--color-accent-orange) 14%, transparent)',
        color: 'var(--color-accent-orange)',
      };
    case 'accent':
      return {
        background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
        color: 'var(--color-accent)',
      };
    default:
      return {
        background: 'var(--color-fill-secondary)',
        color: 'var(--color-label-tertiary)',
      };
  }
}
