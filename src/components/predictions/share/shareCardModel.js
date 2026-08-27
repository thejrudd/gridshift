const DIVISION_ORDER = [
  'AFC East', 'AFC North', 'AFC South', 'AFC West',
  'NFC East', 'NFC North', 'NFC South', 'NFC West',
];

const CONFERENCES = ['AFC', 'NFC'];

const teamId = (team) => String(typeof team === 'string' ? team : team?.id ?? '').toUpperCase();

export const getShareCardTeamId = teamId;

export function getPredictionShareTeamLogoUrl(team) {
  const id = teamId(team);
  return id ? `/logos/${id}.png` : null;
}

export function formatPredictionRecord(record = {}) {
  const wins = Number(record.wins ?? record.w ?? 0);
  const losses = Number(record.losses ?? record.l ?? 0);
  const ties = Number(record.ties ?? record.t ?? 0);
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function recordFor(team, records) {
  const id = teamId(team);
  return team?.record ?? records[id] ?? records[id.toLowerCase()] ?? {};
}

function conferenceFor(team) {
  return String(team?.conference ?? team?.conf ?? team?.division ?? '').toUpperCase().startsWith('NFC') ? 'NFC' : 'AFC';
}

function divisionFor(team) {
  const division = String(team?.division ?? '').trim();
  if (/^(AFC|NFC)\s/i.test(division)) return division;
  const conference = conferenceFor(team);
  return division ? `${conference} ${division}` : `${conference} Other`;
}

function compareTeams(a, b) {
  const aRecord = a.record ?? {};
  const bRecord = b.record ?? {};
  return (Number(bRecord.wins ?? bRecord.w ?? 0) - Number(aRecord.wins ?? aRecord.w ?? 0))
    || (Number(aRecord.losses ?? aRecord.l ?? 0) - Number(bRecord.losses ?? bRecord.l ?? 0))
    || (Number(bRecord.divisionWins ?? 0) - Number(aRecord.divisionWins ?? 0))
    || teamId(a).localeCompare(teamId(b));
}

function expandTeam(entry, byId, records) {
  const source = typeof entry === 'string' ? byId[teamId(entry)] : entry;
  if (!source) return null;
  return {
    ...source,
    id: teamId(source),
    conference: conferenceFor(source),
    division: divisionFor(source),
    record: recordFor(source, records),
  };
}

function resolveList(entries, byId, records) {
  return (entries ?? []).map(entry => expandTeam(entry, byId, records)).filter(Boolean);
}

/**
 * Normalizes the share snapshot into the presentation-only contract used by
 * cards. Callers should supply a canonical, already-validated snapshot;
 * fallbacks below exist only to keep preview rendering resilient.
 */
export function createPredictionShareView(model = {}) {
  const records = model.records ?? model.recordsByTeam ?? {};
  const teams = resolveList(model.teams, {}, records);
  const byId = Object.fromEntries(teams.map(team => [team.id, team]));
  const divisions = (model.divisions?.length
    ? model.divisions.map((division) => ({
      id: division.id ?? division.name ?? division.label,
      label: division.label ?? division.name ?? division.id,
      conference: division.conference ?? String(division.label ?? division.name ?? '').slice(0, 3).toUpperCase(),
      teams: resolveList(division.teams, byId, records),
    }))
    : DIVISION_ORDER.map((division) => ({
      id: division,
      label: division,
      conference: division.slice(0, 3),
      teams: teams.filter(team => team.division === division),
    })))
    .filter(division => division.teams.length)
    .map(division => ({ ...division, teams: [...division.teams].sort(compareTeams) }));

  const divisionWinners = model.divisionWinners?.length
    ? resolveList(model.divisionWinners, byId, records)
    : divisions.map(division => division.teams[0]).filter(Boolean);

  const seeds = Object.fromEntries(CONFERENCES.map((conference) => {
    const supplied = model.seeds?.[conference] ?? model.playoffSeeds?.[conference];
    if (supplied?.length) return [conference, resolveList(supplied, byId, records)];
    const divisionWinnerIds = new Set(divisionWinners.filter(team => team.conference === conference).map(team => team.id));
    return [conference, teams
      .filter(team => team.conference === conference)
      .sort((a, b) => Number(divisionWinnerIds.has(b.id)) - Number(divisionWinnerIds.has(a.id)) || compareTeams(a, b))
      .slice(0, 7)];
  }));

  const playoff = model.playoff ?? model.bracket ?? {};
  const champion = expandTeam(model.champion ?? playoff.champion ?? model.championId, byId, records);
  const conferenceChampions = Object.fromEntries(CONFERENCES.map((conference) => [
    conference,
    expandTeam(model.conferenceChampions?.[conference] ?? playoff.conferenceChampions?.[conference], byId, records)
      ?? seeds[conference]?.[0]
      ?? null,
  ]));

  const selectedTeam = expandTeam(model.teamRecord?.team ?? model.teamRecord?.teamId, byId, records);
  const teamRecord = selectedTeam ? {
    team: selectedTeam,
    matchups: (model.teamRecord?.matchups ?? model.teamRecord?.rows ?? []).map((row) => ({
      ...row,
      opponent: expandTeam(row.opponent ?? row.opponentId, byId, records),
    })),
  } : null;

  return {
    season: model.season ?? 'Season',
    weekLabel: model.weekLabel ?? model.progressLabel ?? null,
    picksLabel: model.picksLabel ?? null,
    teams,
    divisions,
    divisionWinners,
    seeds,
    playoff,
    champion,
    conferenceChampions,
    teamRecord,
  };
}

export function getBracketRound(playoff, conference, round) {
  const source = playoff?.[conference] ?? playoff?.[conference.toLowerCase()] ?? {};
  return source?.[round] ?? source?.[round === 'wildCard' ? 'wildcard' : round] ?? [];
}
