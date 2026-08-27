const teamId = (value) => String(typeof value === 'object' ? value?.id ?? '' : value ?? '').toUpperCase();

export function getLowestRemainingSeedTeam(seeds = [], candidates = []) {
  const seedByTeam = new Map(seeds.map((team, index) => [teamId(team), index + 1]));
  return [...candidates]
    .filter((team) => seedByTeam.has(teamId(team)))
    .sort((left, right) => seedByTeam.get(teamId(right)) - seedByTeam.get(teamId(left)))[0] ?? null;
}
