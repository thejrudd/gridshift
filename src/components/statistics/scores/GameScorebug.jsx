import { useMemo } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { getTeamVisualTheme } from '../../../utils/teamVisualTheme';

const teamLogo = (teamId) => `https://a.espncdn.com/i/teamlogos/nfl/500/${String(teamId).toLowerCase()}.png`;

function TimeoutMarkers({ count, teamName }) {
  if (!Number.isFinite(count)) return null;
  return (
    <span className="scores-timeouts" aria-label={`${teamName} ${count} timeouts remaining`}>
      {[0, 1, 2].map((index) => (
        <span key={index} className={index < count ? 'is-available' : ''} aria-hidden="true" />
      ))}
    </span>
  );
}

function TeamLine({ team, score, opponentScore, record, game, side }) {
  const final = game.status === 'final';
  const winner = final && Number.isFinite(score) && Number.isFinite(opponentScore) && score > opponentScore;
  const loser = final && Number.isFinite(score) && Number.isFinite(opponentScore) && score < opponentScore;
  const possession = game.status === 'live' && game.live?.possession === team.id;
  const timeoutCount = side === 'away' ? game.live?.awayTimeouts : game.live?.homeTimeouts;

  return (
    <span className={`scores-scorebug-team${winner ? ' is-winner' : ''}${loser ? ' is-loser' : ''}`}>
      <span className="scores-scorebug-at" aria-hidden="true">{side === 'home' ? '@' : ''}</span>
      <img src={teamLogo(team.id)} alt="" loading="lazy" decoding="async" />
      <span className="scores-scorebug-team-copy">
        <strong>{team.id}</strong>
        {winner && <span className="scores-winner-mark" aria-hidden="true">◀</span>}
        {possession && <span className="scores-possession is-active" title="Possession" aria-label={`${team.name} possession`} />}
        {record && <small>{record}</small>}
      </span>
      <TimeoutMarkers count={timeoutCount} teamName={team.name} />
      <b>{score ?? ''}</b>
    </span>
  );
}

function statusTone(status) {
  if (status === 'live') return 'live';
  if (status === 'halftime' || status === 'delayed') return 'attention';
  if (status === 'postponed' || status === 'unavailable' || status === 'offline') return 'muted';
  return 'neutral';
}

function statusMeta(game) {
  if (game.status === 'scheduled') return `${game.dateLabel} · ${game.network}`;
  if (game.status === 'offline') return `Cached · as of ${game.asOf}`;
  if (game.status === 'final') return game.network;
  return game.network;
}

function situationContent(game) {
  if (game.status === 'scheduled') return <><span>{game.venue}</span></>;
  if (game.live) {
    return (
      <>
        {game.live.redZone && <strong>Red Zone</strong>}
        <span>{game.live.downDistance}</span>
        <span>{game.live.fieldPosition ? `· ${game.live.fieldPosition}` : ''}</span>
      </>
    );
  }
  if (game.dataNotice) return <><span aria-hidden="true">△</span><span>{game.dataNotice}</span></>;
  return null;
}

export function CompactScorebug({ game, onOpen }) {
  const final = game.status === 'final';
  const awayWinner = final && game.score?.away > game.score?.home;
  const homeWinner = final && game.score?.home > game.score?.away;
  const detailsAvailable = game.detailsAvailable !== false && Boolean(onOpen);

  return (
    <button
      type="button"
      className="scores-mini-scorebug"
      onClick={() => detailsAvailable && onOpen(game)}
      aria-label={detailsAvailable
        ? `Open ${game.away.name} at ${game.home.name} game details`
        : `${game.away.name} at ${game.home.name}`}
      aria-disabled={!detailsAvailable || undefined}
    >
      <span className={awayWinner ? '' : 'is-muted'}>{game.away.id}</span>
      <b className={awayWinner ? '' : 'is-muted'}>{game.score?.away ?? ''}</b>
      <span className={homeWinner ? '' : 'is-muted'}>{game.home.id}</span>
      <b className={homeWinner ? '' : 'is-muted'}>{game.score?.home ?? ''}</b>
      <small>{game.status === 'live' ? `● ${game.statusLabel}` : game.statusLabel}</small>
    </button>
  );
}

export default function GameScorebug({ game, onOpen }) {
  const { darkMode } = useTheme();
  const favoriteTeamId = game.favoriteTeamId ?? (game.favorite ? game.away.id : null);
  const favoriteTheme = useMemo(
    () => favoriteTeamId ? getTeamVisualTheme(favoriteTeamId, darkMode, { logoSide: 'start' }) : null,
    [darkMode, favoriteTeamId],
  );
  const situation = situationContent(game);
  const disabled = game.status === 'unavailable' || game.detailsAvailable === false || !onOpen;

  return (
    <button
      type="button"
      className={`scores-scorebug${game.favorite ? ' is-favorite' : ''} is-${game.status}${game.live?.redZone ? ' is-red-zone' : ''}`}
      style={game.favorite ? {
        '--scores-favorite-gradient': `${favoriteTheme?.gradientOverlay}, ${favoriteTheme?.gradient}`,
        '--scores-favorite-fg': favoriteTheme?.gradientFullForeground,
        '--scores-favorite-muted': favoriteTheme?.gradientFullMuted,
        '--scores-favorite-border': favoriteTheme?.borderColor,
      } : undefined}
      onClick={() => !disabled && onOpen(game)}
      aria-label={disabled
        ? `${game.away.name} at ${game.home.name}`
        : `Open ${game.away.name} at ${game.home.name} game details`}
      aria-disabled={disabled || undefined}
    >
      {game.favorite && (
        <span className="scores-favorite-band">
          <span className="scores-favorite-badge"><span aria-hidden="true">★</span> Favorite</span>
          <strong>{favoriteTeamId}</strong>
          <span>{game.venue}</span>
        </span>
      )}

      <span className="scores-scorebug-inner">
        <span className="scores-scorebug-topline">
          <span className={`scores-status is-${statusTone(game.status)}`}>
            {game.status === 'live' && <span className="scores-live-dot" aria-hidden="true" />}
            {game.status === 'live' ? `Live · ${game.statusLabel}` : game.statusLabel}
          </span>
          <span>{statusMeta(game)}</span>
        </span>

        <span className="scores-scorebug-teams">
          <TeamLine
            team={game.away}
            score={game.score?.away}
            opponentScore={game.score?.home}
            record={game.records?.away}
            game={game}
            side="away"
          />
          <TeamLine
            team={game.home}
            score={game.score?.home}
            opponentScore={game.score?.away}
            record={game.records?.home}
            game={game}
            side="home"
          />
        </span>

        {situation && <span className="scores-scorebug-situation">{situation}</span>}
      </span>
      {!disabled && <span className="scores-scorebug-go" aria-hidden="true">→</span>}
    </button>
  );
}
