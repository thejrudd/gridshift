import { getLiveStatus, startLiveSession, getLiveGames, getLiveGamePlays } from '../api/liveApi.js';
import { buildPlayEvents, buildStarterNameIndex } from './livePlaysFeed.js';
import { getTeamAbbr } from './liveScoringFeed.js';

export function findPlayerTimelineGame(games, { season, week, team, opponent }) {
  const playerTeam = getTeamAbbr(team);
  const opponentTeam = getTeamAbbr(opponent);
  if (!playerTeam || !opponentTeam || playerTeam === opponentTeam) return null;
  const matches = (games ?? []).filter((game) => {
    const teams = [getTeamAbbr(game?.home_team), getTeamAbbr(game?.visitor_team)];
    return game?.id != null && Number(game.season) === Number(season)
      && Number(game.week) === Number(week)
      // Legacy BDL game records omit season_type. The live endpoint excludes
      // preseason; its explicit postseason flag distinguishes the two lanes.
      && (Number(game.season_type) === 2 || (game.season_type == null && game.postseason === false))
      && teams.includes(playerTeam) && teams.includes(opponentTeam);
  });
  return matches.length === 1 ? matches[0] : null;
}

// Index the whole NFL game, not only the selected player: ambiguous initials
// must remain unmatched rather than crediting the selected player by default.
export function buildPlayerTimelineEvents({ game, plays, playerId, players, team, scoringSettings }) {
  if (!game || !players?.[playerId]) return [];
  const id = String(playerId);
  const teams = new Set([getTeamAbbr(game.home_team), getTeamAbbr(game.visitor_team)]);
  const roster = Object.entries(players).map(([key, player]) => ({
    id: String(key),
    player: String(key) === id ? { ...player, team } : player,
  })).filter(({ player }) => teams.has(getTeamAbbr(player?.team)));
  const positions = new Map(roster.map((entry) => [entry.id, entry.player.position]));
  const events = buildPlayEvents(
    { [String(game.id)]: Array.isArray(plays) ? plays : [] },
    buildStarterNameIndex(roster), scoringSettings, positions,
    new Map([[String(game.id), game]]),
  );
  const seen = new Set();
  return events.filter((event) => {
    if (event.playerId !== id || !Number.isFinite(event.pts) || event.pts === 0 || seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  }).sort((left, right) => left.order - right.order);
}

const defaultApi = { getLiveStatus, startLiveSession, getLiveGames, getLiveGamePlays };
const unavailable = (message) => ({ status: 'unavailable', message, events: [], stale: false });

export async function loadPlayerMatchupTimeline(options, api = defaultApi) {
  const { leagueId, platform = 'sleeper', season, week, playerId, players, team, opponent, scoringSettings, signal } = options;
  const checkAbort = () => {
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  };
  checkAbort();
  if (platform !== 'sleeper' || !leagueId) return unavailable('The play timeline requires an enabled Fantasy Live league.');
  if (!team || !opponent || !players?.[playerId]) return unavailable('The NFL matchup could not be confirmed for this player.');
  let status = await api.getLiveStatus({ leagueId });
  checkAbort();
  if (status.live?.enabled !== true || status.live?.leagueAllowed !== true) {
    return unavailable('The play timeline is unavailable for this league. Fantasy Live access is required.');
  }
  if (status.live?.capabilities?.plays !== true) return unavailable('Play-by-play is unavailable with the current data coverage.');
  if (!status.session?.enabled && !status.live.accessCodeRequired) {
    await api.startLiveSession({ leagueId, provider: 'sleeper' });
    checkAbort();
    status = await api.getLiveStatus({ leagueId });
    checkAbort();
  }
  if (!status.session?.enabled) return unavailable('Enable Fantasy Live for this league to view the play timeline.');
  const games = await api.getLiveGames({ season, week, signal });
  checkAbort();
  const game = findPlayerTimelineGame(games.data, options);
  if (!game) return unavailable('Play-by-play is unavailable for this NFL matchup.');
  const payload = await api.getLiveGamePlays(String(game.id), { signal });
  checkAbort();
  if (!Array.isArray(payload.data)) throw new Error('The play timeline response was incomplete.');
  const events = buildPlayerTimelineEvents({ game, plays: payload.data, playerId, players, team, scoringSettings });
  return {
    status: events.length ? 'ready' : 'empty', events,
    stale: payload.cache?.stale === true || payload.freshness?.stale === true,
    message: events.length ? null : 'No scoring contributions could be matched to this player in the available plays.',
    gameId: String(game.id),
  };
}
