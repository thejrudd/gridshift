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

export function formatProjectedPick(player) {
  if (!player || player.projectedOverall == null) return '—';
  return `#${player.projectedOverall}`;
}

export function formatScoutSlot(player) {
  if (player?.draftStatus === 'drafted' && player?.draftOverall != null) {
    return formatDraftSlot(player);
  }
  if (player?.projectedOverall != null) {
    return `Proj. ${formatProjectedPick(player)}`;
  }
  return 'No projection';
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

export function hasCombineData(player) {
  if (!player?.combine) return false;
  return [
    'fortyYard',
    'vertical',
    'broadJump',
    'threeCone',
    'shuttle',
    'benchPress',
  ].some((metric) => player.combine?.[metric] != null);
}

export function getCombineStatusDescription(status) {
  switch (status) {
    case 'Tested':
      return 'Combine invitee with at least one official drill result.';
    case 'Measured Only':
      return 'Combine invitee with official measurements but no published drill testing.';
    case 'Invitee':
      return 'Combine invitee with no verified measurements or drills loaded yet.';
    case 'Pro Day Only':
      return 'No combine result on file; measurements or drills came from a pro day.';
    default:
      return 'No verified combine or pro day data loaded yet.';
  }
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

export function getTierDescription(tier) {
  switch (tier) {
    case 'Elite':
      return 'Blue-chip prospect expected to go near the top of the class.';
    case 'Starter':
      return 'Strong prospect with a realistic path to becoming an NFL starter.';
    case 'Rotational':
      return 'Projected contributor or role player rather than a locked-in starter.';
    case 'Developmental':
      return 'Traits-based prospect who likely needs more time before a major NFL role.';
    default:
      return '';
  }
}

function formatNumber(value) {
  return value == null ? null : Number(value).toLocaleString();
}

function ratio(made, attempted, suffix = '') {
  if (made == null && attempted == null) return null;
  if (made != null && attempted != null) return `${made}/${attempted}${suffix}`;
  return made != null ? `${made}${suffix}` : null;
}

export function getCollegeProductionRows(player) {
  const s = player?.collegeStats;
  if (!s) return [];

  if (player.position === 'QB') {
    const pct = s.completions && s.attempts
      ? `${((s.completions / s.attempts) * 100).toFixed(1)}%`
      : null;
    return [
      { label: 'Completion %', value: pct },
      { label: 'Pass Yards', value: formatNumber(s.passYards) },
      { label: 'Pass TDs', value: s.passTDs },
      { label: 'Interceptions', value: s.interceptions },
      { label: 'Rush Yards', value: formatNumber(s.rushYards) },
      { label: 'Rush TDs', value: s.rushTDs },
    ].filter((row) => row.value != null);
  }

  if (player.position === 'RB') {
    return [
      { label: 'Rush Yards', value: formatNumber(s.rushYards) },
      { label: 'Carries', value: s.carries },
      { label: 'Rush TDs', value: s.rushTDs },
      { label: 'Receptions', value: s.receptions },
      { label: 'Rec Yards', value: formatNumber(s.recYards) },
      { label: 'Rec TDs', value: s.recTDs },
    ].filter((row) => row.value != null);
  }

  if (player.positionGroup === 'WR' || player.positionGroup === 'TE') {
    return [
      { label: 'Targets', value: s.recTargets },
      { label: 'Receptions', value: s.receptions },
      { label: 'Rec Yards', value: formatNumber(s.recYards) },
      { label: 'Rec TDs', value: s.recTDs },
    ].filter((row) => row.value != null);
  }

  if (['DL', 'LB', 'DB'].includes(player.positionGroup)) {
    return [
      { label: 'Total Tackles', value: s.totalTackles },
      { label: 'Solo Tackles', value: s.soloTackles },
      { label: 'Tackles for Loss', value: s.tacklesForLoss },
      { label: 'Sacks', value: s.sacks },
      { label: 'Interceptions', value: s.defInterceptions },
      { label: 'Passes Defended', value: s.passesDefended },
      { label: 'Forced Fumbles', value: s.forcedFumbles },
      { label: 'Defensive TDs', value: s.defTDs },
    ].filter((row) => row.value != null);
  }

  if (player.positionGroup === 'ST') {
    return [
      { label: 'Field Goals', value: ratio(s.fieldGoalsMade, s.fieldGoalsAttempted) },
      { label: 'Extra Points', value: ratio(s.extraPointsMade, s.extraPointsAttempted) },
      { label: 'Kicking Points', value: s.kickingPoints },
      { label: 'Long FG', value: s.longFieldGoal != null ? `${s.longFieldGoal} yds` : null },
      { label: 'Punts', value: s.punts },
      { label: 'Punt Yards', value: formatNumber(s.puntYards) },
      { label: 'Punt Average', value: s.puntAverage != null ? `${Number(s.puntAverage).toFixed(1)}` : null },
      { label: 'Inside 20', value: s.puntsInside20 },
      { label: 'Kick Return Yards', value: formatNumber(s.kickReturnYards) },
      { label: 'Punt Return Yards', value: formatNumber(s.puntReturnYards) },
      { label: 'Return TDs', value: (s.kickReturnTDs ?? 0) + (s.puntReturnTDs ?? 0) || null },
    ].filter((row) => row.value != null);
  }

  return [];
}

export function getCollegeProductionSummary(player) {
  const s = player?.collegeStats;
  if (!s) return null;

  if (player.position === 'QB') {
    const pct = s.completions && s.attempts
      ? `${((s.completions / s.attempts) * 100).toFixed(0)}% · `
      : '';
    if (s.passYards == null && s.passTDs == null) return null;
    return `${pct}${formatNumber(s.passYards) ?? '—'} YDS · ${s.passTDs ?? '—'} TD`;
  }

  if (player.position === 'RB') {
    if (s.rushYards == null && s.rushTDs == null) return null;
    return `${formatNumber(s.rushYards) ?? '—'} YDS · ${s.rushTDs ?? '—'} TD`;
  }

  if (player.positionGroup === 'WR' || player.positionGroup === 'TE') {
    if (s.recYards == null && s.recTDs == null) return null;
    return `${formatNumber(s.recYards) ?? '—'} YDS · ${s.recTDs ?? '—'} TD`;
  }

  if (['DL', 'LB', 'DB'].includes(player.positionGroup)) {
    const parts = [
      s.totalTackles != null ? `${s.totalTackles} TKL` : null,
      s.sacks != null ? `${s.sacks} SACK` : null,
      s.defInterceptions != null ? `${s.defInterceptions} INT` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  }

  if (player.positionGroup === 'ST') {
    if (s.fieldGoalsMade != null || s.fieldGoalsAttempted != null) {
      return `${ratio(s.fieldGoalsMade, s.fieldGoalsAttempted)} FG`;
    }
    if (s.punts != null || s.puntAverage != null) {
      return `${s.punts ?? '—'} P · ${s.puntAverage != null ? Number(s.puntAverage).toFixed(1) : '—'} AVG`;
    }
    const returnYards = (s.kickReturnYards ?? 0) + (s.puntReturnYards ?? 0);
    return returnYards ? `${returnYards.toLocaleString()} RET YDS` : null;
  }

  return null;
}
