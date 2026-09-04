import { forwardRef } from 'react';
import { getTeamVisualTheme } from '../../../utils/teamVisualTheme.js';
import { getShareCardTitle } from './shareCardTitles.js';
import {
  createPredictionShareView,
  formatPredictionRecord,
  getBracketRound,
  getPredictionShareTeamLogoUrl,
  getShareCardTeamId,
} from './shareCardModel.js';
import './predictionShareCards.css';

const CARD_SPECS = {
  board: { kicker: 'Standings', subtitle: 'All 32 teams · every record called' },
  champions: { kicker: 'My champions', subtitle: 'Super Bowl and conference winners' },
  divisions: { kicker: 'Division winners', subtitle: 'Every division called' },
  seeding: { kicker: 'Playoff picture', subtitle: 'Seeds 1–7 · both conferences' },
  bracket: { kicker: 'My bracket', subtitle: 'Wild card through Super Bowl' },
  'team-record': { kicker: 'Team forecast', subtitle: 'Every regular-season matchup called' },
};

const teamName = (team) => team?.nickname ?? team?.name ?? team?.id ?? 'TBD';
const teamFullName = (team) => team?.name ?? [team?.city, team?.nickname].filter(Boolean).join(' ') ?? 'TBD';

function TeamMark({ team, className = 'prediction-share-card__team-logo' }) {
  if (!team) return <span className={`${className} prediction-share-card__team-logo--empty`} aria-hidden="true" />;
  return <img
    className={className}
    src={getPredictionShareTeamLogoUrl(team)}
    alt=""
    onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
  />;
}

function TeamSurface({ team, tone, children, className = '', style = {} }) {
  const theme = getTeamVisualTheme(team?.id, tone === 'dark', { logoSide: 'start' });
  return (
    <div
      className={`prediction-share-card__team-surface ${className}`}
      style={{
        '--prediction-share-team-bg': theme.gradient ?? 'var(--color-fill)',
        '--prediction-share-team-fg': theme.gradientFullForeground ?? theme.gradientForeground ?? 'var(--color-label)',
        '--prediction-share-team-muted': theme.gradientFullMuted ?? theme.gradientMuted ?? 'var(--color-label-secondary)',
        '--prediction-share-team-border': theme.borderColor ?? 'var(--color-separator)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({ view, format, titleId }) {
  const hasTitle = titleId != null;
  const [lineOne, lineTwo] = hasTitle ? getShareCardTitle(format, titleId) : ['', ''];
  const spec = CARD_SPECS[format];
  return (
    <header className="prediction-share-card__header" data-has-title={hasTitle}>
      <div>
        <p className="prediction-share-card__kicker">{spec.kicker}</p>
        <h2 aria-hidden={!hasTitle || undefined}><span>{lineOne || '\u00a0'}</span><span>{lineTwo || '\u00a0'}</span></h2>
        <p className="prediction-share-card__subtitle">{spec.subtitle}</p>
      </div>
      <div className="prediction-share-card__stamp">
        <span>{view.season} season</span>
        {view.weekLabel && <span>{view.weekLabel}</span>}
        {view.picksLabel && <span>{view.picksLabel}</span>}
      </div>
    </header>
  );
}

function CardFooter({ managerName, qrImage, shareLabel }) {
  return (
    <footer className="prediction-share-card__footer">
      <strong>{managerName}</strong>
      <span className="prediction-share-card__footer-spacer" />
      <span className="prediction-share-card__brand">GRIDSHIFT<span>{shareLabel ?? 'Predictions'}</span></span>
      {qrImage && <img className="prediction-share-card__qr" src={qrImage} alt="Scan to open these GridShift predictions" />}
    </footer>
  );
}

function BoardCard({ view, tone }) {
  return <div className="prediction-share-card__body prediction-share-card__board">
    {view.divisions.map(division => <section key={division.id} className="prediction-share-card__board-division">
      <h3>{division.label}</h3>
      <div className="prediction-share-card__board-teams">
        {division.teams.map(team => <TeamSurface key={team.id} team={team} tone={tone} className="prediction-share-card__board-team">
          <TeamMark team={team} />
          <b>{team.id}</b><span>{formatPredictionRecord(team.record)}</span>
        </TeamSurface>)}
      </div>
    </section>)}
  </div>;
}

function ChampionsCard({ view, tone }) {
  const champion = view.champion;
  return <div className="prediction-share-card__body prediction-share-card__champions">
    <TeamSurface team={champion} tone={tone} className="prediction-share-card__champion-hero">
      <TeamMark team={champion} className="prediction-share-card__champion-logo" />
      <div><p>Super Bowl champion</p><span>{teamFullName(champion)}</span><b>{formatPredictionRecord(champion?.record)}</b></div>
    </TeamSurface>
    <div className="prediction-share-card__conference-pair">
      {['AFC', 'NFC'].map(conference => {
        const team = view.conferenceChampions[conference];
        return <TeamSurface key={conference} team={team} tone={tone} className="prediction-share-card__conference-champion">
          <TeamMark team={team} /><div><p>{conference} champion</p><b>{teamName(team)}</b><span>{formatPredictionRecord(team?.record)}</span></div>
        </TeamSurface>;
      })}
    </div>
  </div>;
}

function DivisionsCard({ view, tone }) {
  return <div className="prediction-share-card__body prediction-share-card__division-winners">
    {view.divisionWinners.map(team => <TeamSurface key={team.division} team={team} tone={tone} className="prediction-share-card__division-winner">
      <p>{team.division}</p><TeamMark team={team} /><div><b>{teamName(team)}</b><span>{formatPredictionRecord(team.record)}</span></div>
    </TeamSurface>)}
  </div>;
}

function SeedingCard({ view, tone }) {
  return <div className="prediction-share-card__body prediction-share-card__seeding">
    <div className="prediction-share-card__seed-columns">
      {['AFC', 'NFC'].map(conference => <section key={conference}><h3>{conference}</h3>
        {view.seeds[conference].map((team, index) => <TeamSurface key={team.id} team={team} tone={tone} className="prediction-share-card__seed-row">
          <i>{index + 1}</i><TeamMark team={team} /><b>{team.id}</b><span>{formatPredictionRecord(team.record)}</span>
        </TeamSurface>)}
      </section>)}
    </div>
    {view.champion && <TeamSurface team={view.champion} tone={tone} className="prediction-share-card__seed-champion">
      <TeamMark team={view.champion} /><span>Projected champion</span><b>{teamFullName(view.champion)}</b>
    </TeamSurface>}
  </div>;
}

function BracketTeam({ team, outcome = 'pending', tone }) {
  return <TeamSurface team={team} tone={tone} className={`prediction-share-card__bracket-team is-${outcome}`}>
    <TeamMark team={team} />
    <div className="prediction-share-card__bracket-identity">
      <b>{team?.id ?? 'TBD'}</b>
      <span className="prediction-share-card__bracket-record">{team ? formatPredictionRecord(team.record) : ''}</span>
    </div>
    {outcome === 'winner' && <span className="prediction-share-card__bracket-outcome" aria-hidden="true">✓</span>}
    <span className="prediction-share-card__bracket-outcome-label">{outcome === 'winner' ? 'Winner' : outcome === 'loser' ? 'Eliminated' : 'Pending'}</span>
  </TeamSurface>;
}

function bracketOutcome(team, winnerId) {
  if (!winnerId) return 'pending';
  return getShareCardTeamId(team) === winnerId ? 'winner' : 'loser';
}

function matchupsFor(view, conference, round) {
  const raw = getBracketRound(view.playoff, conference, round);
  const byId = Object.fromEntries(view.teams.map(team => [getShareCardTeamId(team), team]));
  return raw.map((matchup) => {
    const teams = (Array.isArray(matchup) ? matchup : matchup?.teams ?? [matchup?.top, matchup?.bottom])
      .map(entry => typeof entry === 'string' ? byId[getShareCardTeamId(entry)] : entry)
      .filter(Boolean);
    const winnerId = getShareCardTeamId(matchup?.winner ?? matchup?.winnerId);
    return { teams, winnerId };
  });
}

// Match boxes are 30% wide, separated by 5%, and centered within each round.
function bracketMatchCenter(index, count) {
  return 50 + (index - (count - 1) / 2) * 35;
}

function BracketRound({ view, conference, round, label, tone, previousRound }) {
  const matchups = matchupsFor(view, conference, round);
  const previous = previousRound ? matchupsFor(view, conference, previousRound) : [];
  return <div className={`prediction-share-card__bracket-round${previousRound ? ' has-feeders' : ''}`}>
    {previousRound && <svg className="prediction-share-card__bracket-connectors" viewBox="0 0 100 48" preserveAspectRatio="none" aria-hidden="true">
      {previous.map((matchup, index) => {
        const target = matchups.findIndex(next => matchup.winnerId && next.teams.some(team => getShareCardTeamId(team) === matchup.winnerId));
        if (target < 0) return null;
        const from = bracketMatchCenter(index, previous.length);
        const to = bracketMatchCenter(target, matchups.length);
        return <path key={index} d={`M ${from} 0 V 12 H ${to} V 48`} vectorEffect="non-scaling-stroke" />;
      })}
    </svg>}
    <h3>{label}</h3>
    <div className="prediction-share-card__bracket-matches">{matchups.length ? matchups.map((matchup, index) => <div className="prediction-share-card__bracket-match" key={`${round}-${index}`} role="group" aria-label={`${conference} ${label}: ${matchup.teams.map(team => team.id).join(' versus ')}`}>
      {matchup.teams.map(team => <BracketTeam key={team.id} team={team} outcome={bracketOutcome(team, matchup.winnerId)} tone={tone} />)}
    </div>) : <p className="prediction-share-card__bracket-empty">Awaiting picks</p>}</div>
  </div>;
}

function BracketCard({ view, tone }) {
  const superBowlTeams = ['AFC', 'NFC'].map(conference => view.conferenceChampions[conference]).filter(Boolean);
  const championId = getShareCardTeamId(view.champion);
  return <div className="prediction-share-card__body prediction-share-card__bracket">
    {['AFC', 'NFC'].map(conference => <section key={conference} className={`prediction-share-card__bracket-conference prediction-share-card__bracket-conference--${conference.toLowerCase()}`}>
      <div className="prediction-share-card__bracket-label">
        <span className="prediction-share-card__bracket-mark" aria-hidden="true">{conference === 'AFC' ? 'A' : 'N'}</span>
        <strong>{conference}</strong>
        <i aria-hidden="true" />
      </div>
      <div className="prediction-share-card__bracket-grid">
        <BracketRound view={view} conference={conference} round="wildCard" label="Wild card" tone={tone} />
        <BracketRound view={view} conference={conference} round="divisional" previousRound="wildCard" label="Divisional" tone={tone} />
        <BracketRound view={view} conference={conference} round="conference" previousRound="divisional" label="Championship" tone={tone} />
      </div>
    </section>)}
    <section className="prediction-share-card__bracket-super-bowl">
      <div className="prediction-share-card__bracket-super-bowl-heading"><span>Super Bowl</span></div>
      <div className={`prediction-share-card__bracket-super-bowl-matchup${view.champion ? ' has-champion' : ''}`}>
        {superBowlTeams.length ? [...superBowlTeams].sort((a, b) => Number(getShareCardTeamId(b) === championId) - Number(getShareCardTeamId(a) === championId)).map(team => {
          const isChampion = getShareCardTeamId(team) === championId;
          return <div key={team.id} className={`prediction-share-card__finalist ${isChampion ? 'is-champion' : ''}`}>
            <TeamMark team={team} />
            <div><span>{isChampion ? 'Champion' : view.champion ? 'Runner-up' : `${team.conference} champion`}</span>
              <b>{teamName(team)}</b>
              <p>{team.conference} · {formatPredictionRecord(team.record)}</p>
            </div>
          </div>;
        }) : <p className="prediction-share-card__bracket-empty">Awaiting picks</p>}
      </div>
    </section>
  </div>;
}

function TeamRecordCard({ view, tone }) {
  const team = view.teamRecord?.team;
  const matchups = view.teamRecord?.matchups ?? [];
  return <div className="prediction-share-card__body prediction-share-card__team-record">
    <TeamSurface team={team} tone={tone} className="prediction-share-card__team-record-hero">
      <TeamMark team={team} className="prediction-share-card__team-record-logo" />
      <div><p>{team?.division}</p><b>{teamFullName(team)}</b></div>
      <strong>{formatPredictionRecord(team?.record)}</strong>
    </TeamSurface>
    <div className="prediction-share-card__team-record-grid">
      {matchups.map((matchup) => <TeamSurface key={matchup.gameId ?? `${matchup.week}-${matchup.gameIndex}`} team={matchup.opponent} tone={tone} className="prediction-share-card__team-record-game">
        <span className="prediction-share-card__team-record-week">W{matchup.week}</span>
        <span className="prediction-share-card__team-record-venue">{matchup.venue === 'away' ? '@' : 'vs'}</span>
        <TeamMark team={matchup.opponent} />
        <b>{matchup.opponent?.id ?? 'TBD'}</b>
        <strong data-result={matchup.result}>{matchup.result}</strong>
      </TeamSurface>)}
    </div>
  </div>;
}

/**
 * Fixed-size, image-exportable prediction card. `model` is a canonical
 * prediction snapshot or the derived model supplied by the share feature.
 * The manager name and QR are deliberately injected by the owning flow; this
 * presentation layer never accepts a free-form handle and never builds a QR.
 */
export const PredictionShareCard = forwardRef(function PredictionShareCard({
  model,
  format = 'board',
  size = 'square',
  titleId = 0,
  tone = 'dark',
  managerName,
  qrImage,
  shareLabel,
  className = '',
}, ref) {
  const view = createPredictionShareView(model);
  const body = {
    board: <BoardCard view={view} tone={tone} />,
    champions: <ChampionsCard view={view} tone={tone} />,
    divisions: <DivisionsCard view={view} tone={tone} />,
    seeding: <SeedingCard view={view} tone={tone} />,
    bracket: <BracketCard view={view} tone={tone} />,
    'team-record': <TeamRecordCard view={view} tone={tone} />,
  }[format] ?? <BoardCard view={view} tone={tone} />;

  return <article
    ref={ref}
    className={`prediction-share-card prediction-share-card--${tone} ${className}`}
    data-share-format={format}
    data-share-size={size === 'tall' ? 'tall' : 'square'}
  >
    <CardHeader view={view} format={format} titleId={titleId} />
    {body}
    <CardFooter managerName={managerName ?? 'GridShift manager'} qrImage={qrImage} shareLabel={shareLabel} />
  </article>;
});

export default PredictionShareCard;
