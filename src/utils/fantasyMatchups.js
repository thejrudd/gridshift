function normalizeRosterId(value) {
  if (value == null || value === '') return null;
  return String(value);
}

function getRosterName(roster, getUserDisplayName) {
  const ownerName = roster?.owner_id != null ? getUserDisplayName?.(roster.owner_id) : null;
  if (ownerName && ownerName !== 'Unknown') return ownerName;
  return roster?.metadata?.teamName
    || roster?.metadata?.team_name
    || `Roster ${roster?.roster_id ?? ''}`.trim();
}

function compareSides(left, right) {
  const leftNumber = Number(left.rosterId);
  const rightNumber = Number(right.rosterId);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return left.name.localeCompare(right.name) || left.rosterId.localeCompare(right.rosterId);
}

function compareGroupIds(left, right) {
  const leftId = left.matchupId;
  const rightId = right.matchupId;
  const leftNumber = Number(leftId);
  const rightNumber = Number(rightId);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return String(leftId ?? left.key).localeCompare(String(rightId ?? right.key), undefined, { numeric: true });
}

/**
 * Normalizes a provider's flat weekly matchup rows into ordered matchup groups.
 * The signed-in user's matchup is first and their team is kept on the left.
 * Null matchup ids are retained as single-team bye/unpaired groups.
 */
export function buildFantasyMatchupGroups(rows, rosters, getUserDisplayName, userRosterId = null) {
  const rosterById = new Map(
    (rosters ?? []).map((roster) => [normalizeRosterId(roster?.roster_id), roster]),
  );
  const userId = normalizeRosterId(userRosterId);
  const groups = new Map();

  (rows ?? []).forEach((row, index) => {
    const rosterId = normalizeRosterId(row?.roster_id);
    if (!rosterId) return;
    const matchupId = row?.matchup_id == null ? null : String(row.matchup_id);
    const key = matchupId == null ? `solo:${rosterId}:${index}` : `matchup:${matchupId}`;
    const roster = rosterById.get(rosterId) ?? null;
    const side = {
      row,
      roster,
      rosterId,
      name: getRosterName(roster ?? { roster_id: row.roster_id }, getUserDisplayName),
      isUser: userId != null && rosterId === userId,
    };
    const group = groups.get(key) ?? { key, matchupId, sides: [] };
    group.sides.push(side);
    groups.set(key, group);
  });

  return Array.from(groups.values())
    .map((group) => {
      const sides = [...group.sides].sort((left, right) => {
        if (left.isUser !== right.isUser) return left.isUser ? -1 : 1;
        return compareSides(left, right);
      });
      return {
        ...group,
        sides,
        includesUser: sides.some((side) => side.isUser),
      };
    })
    .sort((left, right) => {
      if (left.includesUser !== right.includesUser) return left.includesUser ? -1 : 1;
      return compareGroupIds(left, right);
    });
}

export function findMatchupGroupIndexByRosterId(groups, rosterId) {
  const normalized = normalizeRosterId(rosterId);
  if (!normalized) return -1;
  return (groups ?? []).findIndex((group) => (
    group.sides.some((side) => side.rosterId === normalized)
  ));
}
