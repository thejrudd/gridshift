import { useState } from 'react';
import { teamLogo } from '../../../utils/nflPlays/fieldGeometry.js';
import Modal from '../../Modal.jsx';
import { PlayerAvatar } from '../../shared/PlayerAvatar.jsx';
import { LivePosChip } from '../../companion/live/LiveAtoms.jsx';
import { DetailUnavailable, SectionHeading } from './ScoresOverview.jsx';

// The pregame Overview — matchup ranks, recent form, and season leaders — and
// the season game log behind a pregame Team Stats row. Everything comes from
// the two teams' season payloads (statisticsScoresSeasonContext.js); the away
// team always reads on the left, as it does in the hero.

function RankCell({ team, side, align, better }) {
  if (!side) return <div className={`scores-rank-side is-${align}`} />;
  return (
    <div className={`scores-rank-side is-${align}`}>
      <img src={teamLogo(team)} alt="" />
      <span className={`scores-rank-n${better ? ' is-better' : ''}`}>{side.rank != null ? `#${side.rank}` : '—'}</span>
      <span>{side.label}</span>
    </div>
  );
}

function MatchupRanks({ detail, ranks }) {
  if (!ranks.length) return null;
  const awayId = detail.away.id;
  const homeId = detail.home.id;
  const better = (row, side) => {
    const own = row[side]?.rank;
    const other = row[side === 'away' ? 'home' : 'away']?.rank;
    return own != null && other != null && own < other;
  };
  return (
    <section className="scores-overview-section" aria-labelledby="scores-pregame-ranks">
      <SectionHeading title={<span id="scores-pregame-ranks">Matchup ranks</span>} meta="League rank of 32" />
      {ranks.map((group) => (
        <div key={group.offense} className="scores-rank-group">
          <h3>{group.offense === awayId ? detail.away.name : detail.home.name} on offense</h3>
          {group.rows.map((row) => (
            <div key={row.id} className="scores-rank-row">
              <RankCell team={awayId} side={row.away} align="start" better={better(row, 'away')} />
              <span className="scores-rank-vs">VS</span>
              <RankCell team={homeId} side={row.home} align="end" better={better(row, 'home')} />
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function RecentForm({ detail, form, onOpenGame }) {
  const [preview, setPreview] = useState(null);
  const teams = [detail.away, detail.home].filter((team) => form[team.id]?.length);
  if (!teams.length) return null;
  return (
    <section className="scores-overview-section" aria-labelledby="scores-pregame-form">
      <SectionHeading title={<span id="scores-pregame-form">Recent form</span>} meta="Last five, oldest first" />
      {teams.map((team) => (
        <div key={team.id} className="scores-form-row">
          <div className="scores-form-team"><img src={teamLogo(team.id)} alt="" /><strong>{team.name}</strong></div>
          <div className="scores-form-games">
            {form[team.id].map((game) => {
              const label = `Week ${game.week}, ${game.home ? 'vs' : 'at'} ${game.opp}, ${game.result === 'W' ? 'won' : game.result === 'L' ? 'lost' : 'tied'} ${game.pf} to ${game.pa}`;
              const showing = preview?.team === team.id && preview?.id === game.id;
              return (
                <button
                  key={game.id}
                  type="button"
                  className={`scores-form-chip is-${game.result}`}
                  aria-label={`${label}. Opens the game.`}
                  onClick={() => onOpenGame?.(game)}
                  onPointerEnter={(event) => { if (event.pointerType !== 'touch') setPreview({ team: team.id, id: game.id }); }}
                  onPointerLeave={() => setPreview(null)}
                  onFocus={() => setPreview({ team: team.id, id: game.id })}
                  onBlur={() => setPreview(null)}
                >
                  {game.result}
                  {showing && (
                    <span className="scores-form-preview" role="tooltip">
                      <small>Week {game.week} · {game.home ? 'vs' : 'at'} {game.opp} · Final</small>
                      <strong><b className={`is-${game.result}`}>{game.result}</b> {game.pf}-{game.pa}</strong>
                      {game.totalYards != null && (
                        <span>{game.totalYards} total yards · {game.turnovers ?? 0} turnover{game.turnovers === 1 ? '' : 's'}</span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

function LeaderCell({ entry, align, advantage, photo = null, onOpen = null }) {
  if (!entry) return <div className={`scores-leader-side is-${align} is-empty`}><span>No leader yet</span></div>;
  const content = (
    <>
      <PlayerAvatar player={{ espnId: photo, team: entry.team }} name={entry.name} size={40} className="scores-player-face" />
      <span className="scores-leader-name">
        <strong>{entry.name}</strong>
        <small className={advantage ? 'is-advantage' : ''}>{entry.line}</small>
      </span>
    </>
  );
  if (!onOpen) return <div className={`scores-leader-side is-${align}`}>{content}</div>;
  return (
    <button type="button" className={`scores-leader-side is-${align}`} aria-haspopup="dialog" onClick={() => onOpen(entry)}>
      {content}
    </button>
  );
}

function SeasonLeaders({ detail, leaders, colors, espnFor, onOpenPlayer }) {
  if (!leaders.length) return null;
  return (
    <section className="scores-overview-section" aria-labelledby="scores-pregame-leaders">
      <SectionHeading title={<span id="scores-pregame-leaders">Season leaders</span>} meta={`${detail.away.id} left · ${detail.home.id} right · by position`} />
      <div className="scores-leader-units">
        {leaders.map((group) => (
          <section key={group.unit}>
            <h3>{group.unit}</h3>
            {group.rows.map((row) => {
              const awayValue = row.away?.value ?? 0;
              const homeValue = row.home?.value ?? 0;
              const share = awayValue + homeValue > 0 ? (awayValue / (awayValue + homeValue)) * 100 : 50;
              const cell = (entry, align, advantage) => (
                <LeaderCell
                  entry={entry}
                  align={align}
                  advantage={advantage}
                  photo={entry ? espnFor?.(entry.team, entry.name)?.id ?? null : null}
                  onOpen={onOpenPlayer}
                />
              );
              return (
                <div key={row.pos} className="scores-leader-row">
                  {cell(row.away, 'start', awayValue > homeValue)}
                  <span className="scores-leader-category"><LivePosChip position={row.pos} /></span>
                  {cell(row.home, 'end', homeValue > awayValue)}
                  <span className="scores-leader-rail" aria-hidden="true">
                    <span style={{ width: `${share}%`, background: colors.away }} />
                    <span style={{ width: `${100 - share}%`, background: colors.home }} />
                  </span>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </section>
  );
}

/**
 * A season leader's card before kickoff: season tiles and a newest-first game
 * log. "Full stats" opens the Statistics player page when the player's ESPN id is known.
 */
export function PlayerSeasonCard({ card, team, teamName, espnPlayer = null, onClose, onOpenStatistics = null, onOpenGame = null }) {
  const titleId = `scores-player-card-${card.id}`;
  return (
    <Modal onClose={onClose} mobileSheet ariaLabel={`${card.name} season`} containerClassName="scores-player-card" containerStyle={{ maxWidth: '560px' }}>
      <header className="scores-player-card__head">
        <PlayerAvatar player={{ espnId: espnPlayer?.id ?? null, team }} name={card.name} size={56} className="scores-player-face" />
        <div>
          <strong id={titleId}>{card.name}</strong>
          <small><LivePosChip position={card.position} /><img src={teamLogo(team)} alt="" />{teamName}</small>
        </div>
        <button type="button" className="scores-player-card__close" onClick={onClose} aria-label="Close player season">✕</button>
      </header>
      <div className="scores-player-card__body">
        <p className="scores-player-card__kicker"><span>Season</span><span>{card.games} {card.games === 1 ? 'game' : 'games'}</span></p>
        <div className="scores-player-card__tiles">
          {card.tiles.map((tile) => <div key={tile.label}><b>{tile.value}</b><span>{tile.label}</span></div>)}
        </div>
        <p className="scores-player-card__kicker"><span>Game log</span><span>Newest first</span></p>
        <table className="scores-player-card__log" aria-labelledby={titleId}>
          <thead>
            <tr><th scope="col">Wk</th><th scope="col">Opponent</th><th scope="col">Result</th>{card.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
          </thead>
          <tbody>
            {card.log.map((game) => (
              <tr key={game.id}>
                <td>W{game.week}</td>
                <td>
                  {onOpenGame
                    ? <button type="button" onClick={() => { onClose(); onOpenGame(game); }}>{game.home ? 'vs' : 'at'} {game.opp}</button>
                    : `${game.home ? 'vs' : 'at'} ${game.opp}`}
                </td>
                <td><span className={`is-${game.result}`}>{game.result}</span> {game.score}</td>
                {game.values.map((value, index) => <td key={card.columns[index]} className={index === 0 ? 'is-lead' : ''}>{value}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {espnPlayer && onOpenStatistics && (
        <footer className="scores-player-card__foot">
          <span>Splits, every play, and ranks</span>
          <button type="button" className="scores-player-card__link" onClick={() => onOpenStatistics(espnPlayer)}>Full stats ›</button>
        </footer>
      )}
    </Modal>
  );
}

export function PregameOverview({ detail, context, colors, onOpenGame, espnFor = null, onOpenPlayer = null }) {
  if (context.status === 'loading') return <p className="scores-detail-unavailable">Loading both teams’ seasons…</p>;
  if (context.status === 'error') return <DetailUnavailable>{context.error}</DetailUnavailable>;
  if (!context.ranks?.length && !context.leaders?.length) {
    return <DetailUnavailable>Season numbers appear once both teams have finished a game.</DetailUnavailable>;
  }
  return (
    <div className="scores-detail-overview" data-tour="statistics-scores-pregame">
      <MatchupRanks detail={detail} ranks={context.ranks} />
      <RecentForm detail={detail} form={context.form} onOpenGame={onOpenGame} />
      <SeasonLeaders detail={detail} leaders={context.leaders} colors={colors} espnFor={espnFor} onOpenPlayer={onOpenPlayer} />
    </div>
  );
}

/**
 * A pregame Team Stats row's game log: the week in the middle, the away team's
 * games on the left and the home team's mirrored on the right, each team's NFL
 * rank in the header. An opponent opens that game.
 */
export function SeasonGameLog({ stat, detail, awayColor, homeColor, onOpenGame }) {
  const awayId = detail.away.id;
  const homeId = detail.home.id;
  const logs = stat.season.logs;
  const weeks = [...new Set([...(logs[awayId] ?? []), ...(logs[homeId] ?? [])].map((game) => game.week))].sort((a, b) => a - b);
  const byWeek = (team) => new Map((logs[team] ?? []).map((game) => [game.week, game]));
  const away = byWeek(awayId);
  const home = byWeek(homeId);
  const magnitude = (game) => {
    if (!game?.value) return 0;
    return stat.season.ratio ? (game.value.tries ? game.value.made / game.value.tries : 0) : Math.abs(game.value.value);
  };
  const max = Math.max(0.0001, ...[...away.values(), ...home.values()].map(magnitude));
  const rank = (team) => stat.season.ranks[team];
  const header = (team, align) => (
    <span className={`scores-gamelog-head is-${align}`}>
      <img src={teamLogo(team)} alt="" />
      {rank(team) != null && <span className={`scores-rank-chip${rank(team) <= 10 ? ' is-top' : ''}`}>#{rank(team)} in NFL</span>}
    </span>
  );
  const side = (game, align, color) => {
    if (!game) return <span className={`scores-gamelog-side is-${align} is-bye`}>Bye</span>;
    return (
      <span className={`scores-gamelog-side is-${align}`}>
        <button type="button" className="scores-gamelog-opp" onClick={() => onOpenGame?.(game)}>{game.home ? 'vs' : '@'} {game.opp}</button>
        <span className={`scores-gamelog-result is-${game.result}`}>{game.result} {game.score}</span>
        <b>{game.display}</b>
        <span className="scores-gamelog-bar" aria-hidden="true"><i style={{ width: `${(magnitude(game) / max) * 100}%`, background: color }} /></span>
      </span>
    );
  };
  return (
    <div className="scores-gamelog">
      <div className="scores-gamelog-row is-head">{header(awayId, 'start')}<span />{header(homeId, 'end')}</div>
      {weeks.map((week) => (
        <div key={week} className="scores-gamelog-row">
          {side(away.get(week), 'start', awayColor)}
          <span className="scores-gamelog-week">W{week}</span>
          {side(home.get(week), 'end', homeColor)}
        </div>
      ))}
    </div>
  );
}
