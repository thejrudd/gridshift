/**
 * Compact, non-animated labels shared by the full play feed and the live
 * scorecard preview. Geometry is still used for classification, but the
 * preview deliberately does not render the trajectory strip.
 */
export function gainedFirstDown(play, geometry) {
  const startDown = Number(play?.startDown);
  const distance = Number(play?.startDistance);
  if (geometry.flag || !Number.isFinite(startDown) || startDown < 1) return false;
  if (Number(play?.endDown) !== 1) return false;
  return Number.isFinite(distance) && geometry.yards != null && geometry.yards >= distance;
}

/** The one outcome tag that matters most on a play. */
export function getPlayTag(play, geometry) {
  const yards = geometry.yards;
  if (geometry.flag === 'td') return ['td', 'Touchdown'];
  if (geometry.scoring && geometry.type === 'kick') return ['td', 'Good'];
  if (geometry.flag === 'fg') return ['loss', 'No good'];
  if (geometry.flag === 'int') return ['loss', 'Intercepted'];
  if (geometry.flag === 'fumble') return ['loss', 'Fumble'];
  // Incompletions and penalties come before yardage: enforcement can leave an
  // incomplete pass with a negative net without making it a rushing loss.
  if (geometry.flag === 'incomplete') return ['', 'Incomplete'];
  if (geometry.flag === 'penalty') return ['', 'Penalty'];
  if (gainedFirstDown(play, geometry)) return ['fd', '1st down'];
  if (yards != null && yards < 0 && geometry.type !== 'kick') return ['loss', `${yards} yds`];
  return null;
}

/** Whether the provider row indicates that the next snap belongs to the other side. */
export function isPossessionChange(play, geometry = {}) {
  const slug = String(play?.typeSlug ?? play?.type ?? play?.description ?? '').toLowerCase();
  if (/kickoff|punt|interception/.test(slug)) return true;
  if (/field.?goal.?(?:missed|blocked)|blocked.?field.?goal/.test(slug)) return true;
  return geometry.flag === 'fumble'
    && /fumble/.test(slug)
    && /opp|opponent/.test(slug);
}
