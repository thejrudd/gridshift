import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { getTeamVisualTheme } from '../utils/teamVisualTheme';
import {
  getScheduleGameScore,
  getScheduleGameTeamId,
  isFinalScheduleGame,
} from '../utils/statisticsSchedule';

const ESPN_SUMMARY_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';

const teamLogo = (teamId) => `https://a.espncdn.com/i/teamlogos/nfl/500/${String(teamId).toLowerCase()}.png`;

function findScheduleGame(scheduleData, gameId) {
  if (!gameId) return null;
  const games = Array.isArray(scheduleData?.games)
    ? scheduleData.games
    : (scheduleData?.weeks ?? []).flatMap((week) => week.games ?? []);

  return games.find((game) => (
    game?.espnEventId === gameId
    || game?.eventId === gameId
    || game?.id === gameId
  )) ?? null;
}

function formatKickoffDate(value) {
  if (!value) return 'Date TBD';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date TBD';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getSummaryCompetition(summary) {
  return summary?.header?.competitions?.[0] ?? null;
}

function getSummaryCompetitor(summary, side) {
  return getSummaryCompetition(summary)?.competitors?.find((competitor) => competitor.homeAway === side) ?? null;
}

function getSummaryScore(summary, side) {
  const score = getSummaryCompetitor(summary, side)?.score;
  if (score == null || score === '') return null;
  const parsed = Number.parseInt(String(score), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getStatusLabel(game, summary) {
  return game?.statusDetail
    ?? getSummaryCompetition(summary)?.status?.type?.shortDetail
    ?? getSummaryCompetition(summary)?.status?.type?.detail
    ?? (isFinalScheduleGame(game) ? 'Final' : 'Scheduled');
}

function getTeamName(team, summaryCompetitor, fallbackId) {
  return team?.name
    ?? summaryCompetitor?.team?.displayName
    ?? summaryCompetitor?.team?.shortDisplayName
    ?? fallbackId
    ?? 'TBD';
}

function getTeamStatRows(summary, awayTeamId, homeTeamId) {
  const teams = summary?.boxscore?.teams ?? [];
  if (teams.length < 2) return [];

  const buildStatsEntry = (entry) => {
    const stats = new Map();
    for (const stat of entry.statistics ?? []) {
      const label = stat.label ?? stat.name;
      if (!label) continue;
      stats.set(label, stat.displayValue ?? stat.value ?? '-');
    }
    return {
      teamId: entry.team?.abbreviation,
      stats,
    };
  };

  const statsByTeam = teams.map(buildStatsEntry);
  const awayStats = statsByTeam.find((team) => team.teamId === awayTeamId) ?? statsByTeam[0];
  const homeStats = statsByTeam.find((team) => team.teamId === homeTeamId) ?? statsByTeam[1];
  const labels = [...new Set([...(awayStats?.stats.keys() ?? []), ...(homeStats?.stats.keys() ?? [])])];
  return labels.map((label) => ({
    label,
    away: awayStats?.stats.get(label) ?? '-',
    home: homeStats?.stats.get(label) ?? '-',
  }));
}

function GameTeamBlock({ team, summaryCompetitor, fallbackId, score, align = 'left' }) {
  const code = team?.id ?? summaryCompetitor?.team?.abbreviation ?? fallbackId ?? 'TBD';
  return (
    <div className={`statistics-game-team-block statistics-game-team-block--${align}`}>
      {code !== 'TBD' && (
        <img
          src={teamLogo(code)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      )}
      <div>
        <span>{code}</span>
        <strong>{getTeamName(team, summaryCompetitor, fallbackId)}</strong>
      </div>
      {score != null && <b>{score}</b>}
    </div>
  );
}

export default function StatisticsGame({
  gameId,
  scheduleData,
  teams = [],
  onBackToSchedule,
}) {
  const { darkMode } = useTheme();
  const [summaryState, setSummaryState] = useState({ status: 'idle', data: null, error: null });
  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const scheduleGame = useMemo(() => findScheduleGame(scheduleData, gameId), [scheduleData, gameId]);
  const eventId = scheduleGame?.espnEventId ?? scheduleGame?.eventId ?? gameId;

  useEffect(() => {
    if (!eventId) return undefined;
    const controller = new AbortController();
    setSummaryState({ status: 'loading', data: null, error: null });

    fetch(`${ESPN_SUMMARY_URL}?event=${encodeURIComponent(eventId)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => setSummaryState({ status: 'ready', data, error: null }))
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setSummaryState({ status: 'error', data: null, error: error.message });
      });

    return () => controller.abort();
  }, [eventId]);

  const summary = summaryState.data;
  const awayTeamId = getScheduleGameTeamId(scheduleGame, 'away')
    ?? getSummaryCompetitor(summary, 'away')?.team?.abbreviation;
  const homeTeamId = getScheduleGameTeamId(scheduleGame, 'home')
    ?? getSummaryCompetitor(summary, 'home')?.team?.abbreviation;
  const awayTeam = teamsById.get(awayTeamId);
  const homeTeam = teamsById.get(homeTeamId);
  const awayScore = getScheduleGameScore(scheduleGame, 'away') ?? getSummaryScore(summary, 'away');
  const homeScore = getScheduleGameScore(scheduleGame, 'home') ?? getSummaryScore(summary, 'home');
  const rowTheme = getTeamVisualTheme(homeTeamId, darkMode, { logoSide: 'start' });
  const statRows = getTeamStatRows(summary, awayTeamId, homeTeamId);

  return (
    <div className="statistics-game">
      <button type="button" className="statistics-game-back-button" onClick={onBackToSchedule}>
        Back to Schedule
      </button>

      <section
        className="statistics-game-hero"
        style={{ '--statistics-game-accent': rowTheme?.borderColor ?? 'var(--color-separator)' }}
      >
        <div className="statistics-game-hero-meta">
          <p className="statistics-schedule-eyebrow">Game Statistics</p>
          <h1>{getStatusLabel(scheduleGame, summary)}</h1>
          <span>{formatKickoffDate(scheduleGame?.kickoff)}</span>
        </div>

        <div className="statistics-game-scoreboard">
          <GameTeamBlock
            team={awayTeam}
            summaryCompetitor={getSummaryCompetitor(summary, 'away')}
            fallbackId={awayTeamId}
            score={awayScore}
          />
          <span className="statistics-game-scoreboard-divider">{scheduleGame?.neutralSite ? 'vs' : '@'}</span>
          <GameTeamBlock
            team={homeTeam}
            summaryCompetitor={getSummaryCompetitor(summary, 'home')}
            fallbackId={homeTeamId}
            score={homeScore}
            align="right"
          />
        </div>
      </section>

      <section className="statistics-game-panel">
        <header className="statistics-schedule-section-header">
          <p className="statistics-schedule-eyebrow">Box Score</p>
          <h2>Team Stats</h2>
          <span>{summaryState.status === 'loading' ? 'Loading ESPN game data' : `${statRows.length} categories`}</span>
        </header>

        {statRows.length ? (
          <div className="statistics-game-team-stats" role="table" aria-label="Team game statistics">
            <div className="statistics-game-team-stats-row is-header" role="row">
              <span role="columnheader">Stat</span>
              <span role="columnheader">{awayTeamId ?? 'Away'}</span>
              <span role="columnheader">{homeTeamId ?? 'Home'}</span>
            </div>
            {statRows.map((row) => (
              <div key={row.label} className="statistics-game-team-stats-row" role="row">
                <span role="cell">{row.label}</span>
                <strong role="cell">{row.away}</strong>
                <strong role="cell">{row.home}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="statistics-schedule-inline-empty">
            <p className="statistics-schedule-eyebrow">{summaryState.status === 'error' ? 'ESPN unavailable' : 'Stats pending'}</p>
            <h3>Game stats are not available yet</h3>
            <p>
              {summaryState.status === 'error'
                ? 'The game route is ready, but the live statistics feed could not be loaded.'
                : 'Team box score data will appear here once ESPN publishes the game summary.'}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
