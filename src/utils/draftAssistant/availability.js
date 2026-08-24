function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getAvailabilityLabel(score) {
  if (score >= 0.76) return 'Likely survives';
  if (score >= 0.46) return 'Could go either way';
  return 'Take now';
}

export function buildAvailabilityEstimate({
  player,
  picksUntilUser,
  teamsBeforeUser = [],
  recentPositionRun = 0,
}) {
  const position = player?.position ?? null;
  const needPressure = teamsBeforeUser.reduce((sum, team) => sum + Math.min(1, Number(team.needByPosition?.[position] ?? 0)), 0);

  let availabilityScore = 0.92;
  availabilityScore -= Math.min(0.6, picksUntilUser * 0.055);
  availabilityScore -= Math.min(0.22, needPressure * 0.11);
  availabilityScore -= Math.min(0.18, recentPositionRun * 0.05);

  const normalizedScore = clamp(Math.round(availabilityScore * 100) / 100, 0.06, 0.96);
  return {
    score: normalizedScore,
    label: getAvailabilityLabel(normalizedScore),
    needPressure: Math.round(needPressure * 100) / 100,
    recentPositionRun,
  };
}
