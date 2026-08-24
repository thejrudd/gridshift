export function isWaiverEligiblePlayerRecord(player) {
  if (!player) return false;

  const status = String(player.status ?? '').trim().toLowerCase();
  if (status.includes('retired')) return false;
  if (player.active === false) return false;
  if (String(player.active ?? '').trim().toLowerCase() === 'false') return false;

  return true;
}
