import { createPredictionShareView } from '../components/predictions/share/shareCardModel.js';
import { getLowestRemainingSeedTeam } from './playoffBracket.js';

const CONFERENCES = ['AFC', 'NFC'];

const getTeamId = (value) => String(typeof value === 'object' ? value?.id ?? '' : value ?? '').toUpperCase();

function getScheduleWeeks(schedule = {}) {
  return (Array.isArray(schedule?.weeks) ? schedule.weeks : [])
    .map((week, index) => {
      const games = Array.isArray(week?.games) ? week.games : [];
      const kickoffs = games
        .map((game) => Date.parse(game?.kickoff))
        .filter(Number.isFinite);
      return {
        week: Number(week?.week ?? index + 1),
        kickoff: kickoffs.length ? Math.min(...kickoffs) : null,
      };
    })
    .filter((week) => Number.isInteger(week.week) && week.week > 0);
}

export function getPredictionPickWeekContext(schedule = {}, now = new Date()) {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(timestamp)) throw new TypeError('A valid prediction snapshot time is required.');

  const weeks = getScheduleWeeks(schedule).filter((week) => Number.isFinite(week.kickoff));
  if (!weeks.length || timestamp < weeks[0].kickoff) {
    return { pickWeek: 1, weekLabel: 'Before Week 1' };
  }

  const active = weeks.reduce((latest, week) => (
    week.kickoff <= timestamp && (!latest || week.kickoff > latest.kickoff) ? week : latest
  ), null);
  const pickWeek = Math.min(18, Math.max(1, active?.week ?? 1));
  return { pickWeek, weekLabel: `Week ${pickWeek}` };
}

function matchup(teams, winnerId) {
  return { teams: teams.filter(Boolean), winnerId: getTeamId(winnerId) };
}

function buildConferenceBracket(conference, seeds, picks) {
  const seed = (number) => seeds[number - 1];
  const wildCardSpecs = [[2, 7], [3, 6], [4, 5]];
  const wildCard = wildCardSpecs.map(([top, bottom]) => {
    const id = `${conference}-wc-${top}-${bottom}`;
    return matchup([seed(top), seed(bottom)], picks[id]);
  });
  const wildCardWinners = wildCard
    .map((game) => seeds.find((team) => getTeamId(team) === game.winnerId))
    .filter(Boolean);
  const lowestRemaining = getLowestRemainingSeedTeam(seeds, wildCardWinners);
  const otherRemaining = wildCardWinners.filter((team) => getTeamId(team) !== getTeamId(lowestRemaining));
  const divisional = [
    matchup([seed(1), lowestRemaining], picks[`${conference}-div-1`]),
    matchup(otherRemaining, picks[`${conference}-div-2`]),
  ];
  const divisionalWinners = divisional
    .map((game) => seeds.find((team) => getTeamId(team) === game.winnerId))
    .filter(Boolean);
  const conferenceRound = [matchup(divisionalWinners, picks[`${conference}-championship`])];

  return { wildCard, divisional, conference: conferenceRound };
}

export function buildPredictionShareModel({ snapshot, teams = [], schedule = null } = {}) {
  if (!snapshot) throw new TypeError('A prediction snapshot is required.');
  const { weekLabel } = getPredictionPickWeekContext(schedule, snapshot.createdAt);
  const base = createPredictionShareView({
    season: snapshot.season,
    weekLabel,
    picksLabel: snapshot.mode === 'advanced' ? '272 games picked' : '32 records complete',
    teams,
    records: snapshot.records,
  });
  const playoff = Object.fromEntries(CONFERENCES.map((conference) => [
    conference,
    buildConferenceBracket(conference, base.seeds[conference] ?? [], snapshot.playoffPicks ?? {}),
  ]));
  const byId = Object.fromEntries(base.teams.map((team) => [getTeamId(team), team]));
  const conferenceChampions = Object.fromEntries(CONFERENCES.map((conference) => [
    conference,
    byId[getTeamId(snapshot.playoffPicks?.[`${conference}-championship`])] ?? null,
  ]));
  const champion = byId[getTeamId(snapshot.playoffPicks?.['super-bowl'])] ?? null;

  return {
    ...base,
    playoff,
    conferenceChampions,
    champion,
  };
}
