/** Sleeper stores reserve capacity separately from roster_positions. */
export function getReserveSlotCount(league) {
  const count = Number(league?.settings?.reserve_slots);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

export function getReservePlayerIds(roster) {
  return [...new Set((roster?.reserve ?? []).map(id => String(id ?? '').trim()))]
    .filter(id => id && id !== '0');
}

/** Reserve assignments are roster snapshots, not weekly matchup history. */
export function splitMatchupReserve({ roster, matchup, useRosterReserve }) {
  if (!roster || !matchup) return { bench: [], reserve: [] };
  const starters = new Set((matchup.starters ?? []).map(String));
  const reserve = useRosterReserve ? getReservePlayerIds(roster).filter(id => !starters.has(id)) : [];
  const reserveSet = new Set(reserve);
  const source = matchup.players?.length ? matchup.players : (roster.players ?? []);
  const bench = [...new Set(source.map(String))].filter(id => !starters.has(id) && !reserveSet.has(id));
  return { bench, reserve };
}
