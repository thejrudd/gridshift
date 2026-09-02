const LOCAL_KICKOFF_OPTIONS = Object.freeze({
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

/**
 * Format a scheduled kickoff in the browser's local timezone.
 *
 * The optional timezone keeps the formatter deterministic for unit tests;
 * production callers omit it so Intl uses the user's runtime timezone.
 */
export function formatStatisticsScoresLocalKickoff(value, { timeZone } = {}) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('en-US', {
    ...LOCAL_KICKOFF_OPTIONS,
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}
