export const FANTASY_POSITION_GROUPS = new Set(['QB', 'RB', 'WR', 'TE']);

const SLEEPER_PHOTO_BASE = 'https://sleepercdn.com/content/nfl/players/thumb';
const ESPN_COLLEGE_PHOTO_BASE = 'https://a.espncdn.com/i/headshots/college-football/players/full';
const PHOTO_FALLBACK = 'https://sleepercdn.com/images/v2/icons/player_default.webp';

export function playerPhotoUrl(player) {
  if (player?.espnCollegeId) return `${ESPN_COLLEGE_PHOTO_BASE}/${player.espnCollegeId}.png`;
  if (player?.sleeperPlayerId) return `${SLEEPER_PHOTO_BASE}/${player.sleeperPlayerId}.jpg`;
  return PHOTO_FALLBACK;
}

export function photoFallback(e) {
  e.currentTarget.src = PHOTO_FALLBACK;
  e.currentTarget.onerror = null;
}

export function formatHeight(inches) {
  if (inches == null) return '—';
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

export function formatForty(val) {
  if (val == null) return '—';
  return val.toFixed(2);
}

export function formatRank(rank) {
  return rank == null ? '—' : `#${rank}`;
}

export function formatDraftSlot(player) {
  if (!player || player.draftStatus !== 'drafted' || player.draftOverall == null) {
    return 'Not drafted yet';
  }
  const team = player.draftTeam ? ` ${player.draftTeam}` : '';
  return `#${player.draftOverall}${team}`;
}

export function formatDraftSelection(player) {
  if (!player || player.draftStatus !== 'drafted' || player.draftOverall == null) {
    return 'Not drafted yet';
  }
  return `#${player.draftOverall} Overall`;
}

export function draftRoundLabel(round, pick) {
  if (round == null || pick == null) return null;
  const suffix = round === 1 ? 'st' : round === 2 ? 'nd' : round === 3 ? 'rd' : 'th';
  return `Round ${round}${suffix}, Pick ${pick}`;
}

export function gradeFromPercentile(pct) {
  if (pct == null) return null;
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C+';
  if (pct >= 40) return 'C';
  if (pct >= 30) return 'D';
  return 'F';
}

export function gradeColor(grade) {
  if (!grade) return 'var(--color-label-tertiary)';
  if (grade.startsWith('A')) return 'var(--scout-grade-a)';
  if (grade.startsWith('B')) return 'var(--scout-grade-b)';
  if (grade.startsWith('C')) return 'var(--scout-grade-c)';
  if (grade.startsWith('D')) return 'var(--scout-grade-d)';
  return 'var(--scout-grade-f)';
}

export function positionColor(position, positionGroup) {
  switch (positionGroup || position) {
    case 'QB': return 'var(--scout-qb)';
    case 'RB': return 'var(--scout-rb)';
    case 'WR': return 'var(--scout-wr)';
    case 'TE': return 'var(--scout-te)';
    case 'DL': return 'var(--scout-dl)';
    case 'LB': return 'var(--scout-lb)';
    case 'DB': return 'var(--scout-db)';
    case 'OL': return 'var(--scout-ol)';
    case 'ST': return 'var(--scout-st)';
    default:   return 'var(--color-label-tertiary)';
  }
}

export function tierColor(tier) {
  switch (tier) {
    case 'Elite':         return 'var(--scout-tier-elite)';
    case 'Starter':       return 'var(--scout-tier-starter)';
    case 'Rotational':    return 'var(--scout-tier-rotational)';
    case 'Developmental': return 'var(--scout-tier-developmental)';
    default:              return 'var(--color-label-tertiary)';
  }
}

export function tierFg(tier) {
  return tier === 'Elite' ? 'var(--color-signature-fg)' : '#fff';
}

export function getCombineStatus(player) {
  const hasMeasurements = player?.combine?.heightIn != null || player?.combine?.weightLbs != null;
  const hasTesting = ['fortyYard', 'vertical', 'broadJump', 'threeCone', 'shuttle', 'benchPress']
    .some((metric) => player?.combine?.[metric] != null);

  if (player?.combineSource === 'pro-day' && !player?.combineInvite) return 'Pro Day Only';
  if (!player?.combineInvite && (hasMeasurements || hasTesting)) return 'Pro Day Only';
  if (player?.combineInvite && hasTesting) return 'Tested';
  if (player?.combineInvite && hasMeasurements) return 'Measured Only';
  if (player?.combineInvite) return 'Invitee';
  return 'No Combine';
}

export function combineStatusColor(status) {
  switch (status) {
    case 'Tested': return 'var(--color-accent-green)';
    case 'Measured Only': return 'var(--color-accent)';
    case 'Invitee': return 'var(--color-signature)';
    case 'Pro Day Only': return 'var(--scout-wr)';
    default: return 'var(--color-label-quaternary)';
  }
}
