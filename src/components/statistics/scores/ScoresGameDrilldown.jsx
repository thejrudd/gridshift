import { useEffect, useMemo, useState } from 'react';
import { getStatisticsScoresGameDetail } from '../../../api/statisticsScoresApi';
import { useTheme } from '../../../context/ThemeContext';
import { getTeamVisualTheme, pickReadableForeground } from '../../../utils/teamVisualTheme';
import { buildScoreDetailFromGame } from '../../../utils/balldontlieNflScoreboard';
import { getScoreNetworkLabel } from '../../../utils/statisticsBroadcasts';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'team', label: 'Team Stats' },
  { id: 'players', label: 'Players' },
  { id: 'scoring', label: 'Scoring' },
  { id: 'plays', label: 'Play-by-Play' },
];
const LIVE_DETAIL_REFRESH_INTERVAL_MS = 30_000;

const teamLogo = (teamId) => `https://a.espncdn.com/i/teamlogos/nfl/500/${String(teamId).toLowerCase()}.png`;
function getNumericRatio(stat, side) {
  const ratio = side === 'away' ? stat.awayRatio : stat.homeRatio;
  if (Number.isFinite(ratio)) return ratio;
  const value = side === 'away' ? stat.away : stat.home;
  return Number.isFinite(value) ? value : 0;
}

function statWinner(stat) {
  if (stat.direction === 'neutral') return null;
  const away = getNumericRatio(stat, 'away');
  const home = getNumericRatio(stat, 'home');
  if (away === home) return null;
  if (stat.direction === 'lower') return away < home ? 'away' : 'home';
  return away > home ? 'away' : 'home';
}

function SectionHeading({ title, meta, action }) {
  return (
    <header className="scores-section-heading">
      <h2>{title}</h2>
      {meta && <span>{meta}</span>}
      {action}
    </header>
  );
}

function DetailUnavailable({ children }) {
  return <p className="scores-detail-unavailable">{children}</p>;
}

function detailCoverageMessage(detail, fallback) {
  if (detail.coverage?.detailStatus === 'loading') return 'Loading live game detail from BALLDONTLIE…';
  if (detail.coverage?.detailStatus === 'error') {
    return detail.coverage.detailError ?? 'BALLDONTLIE game detail could not be loaded.';
  }
  return fallback;
}

function StatAdvantageRail({ stat, awayId, homeId, awayColor, homeColor }) {
  const awayValue = Math.max(0, getNumericRatio(stat, 'away'));
  const homeValue = Math.max(0, getNumericRatio(stat, 'home'));
  const combinedValue = awayValue + homeValue;
  const awayShare = combinedValue > 0 ? (awayValue / combinedValue) * 100 : 50;
  const homeShare = 100 - awayShare;
  const winner = statWinner(stat);

  return (
    <div className="scores-stat-rail">
      <div className="scores-stat-rail-values">
        <strong className={winner === 'away' ? 'is-advantage' : winner === 'home' ? 'is-dimmed' : ''}>{stat.away}</strong>
        <span>{stat.label}</span>
        <strong className={winner === 'home' ? 'is-advantage' : winner === 'away' ? 'is-dimmed' : ''}>{stat.home}</strong>
      </div>
      <div
        className="scores-stat-rail-track"
        role="img"
        aria-label={`${stat.label}: ${awayId} ${stat.away}, ${Math.round(awayShare)} percent; ${homeId} ${stat.home}, ${Math.round(homeShare)} percent`}
      >
        <span className="is-away" style={{ width: `${awayShare}%`, background: awayColor }} />
        <span className="is-home" style={{ width: `${homeShare}%`, background: homeColor }} />
      </div>
      {stat.note && <small>{stat.note}</small>}
    </div>
  );
}

function DetailTeam({ team, score, side, record, loser, possession }) {
  return (
    <div className={`scores-detail-team is-${side}${loser ? ' is-loser' : ''}`}>
      <img src={teamLogo(team.id)} alt="" />
      <div>
        <span>{side === 'away' ? 'Away' : 'Home'}</span>
        <strong>{team.name}</strong>
        <b>{team.id}{record ? ` · ${record}` : ''}{possession === team.id ? ' · Ball' : ''}</b>
      </div>
      <em>{score ?? '—'}</em>
    </div>
  );
}

function ScoreHero({ game, detail, awayTheme, homeTheme }) {
  const final = detail.status === 'final';
  const awayLoser = final && detail.score.away < detail.score.home;
  const homeLoser = final && detail.score.home < detail.score.away;
  const centerForeground = pickReadableForeground([awayTheme?.gradientEnd, homeTheme?.gradientStart].filter(Boolean));
  const network = getScoreNetworkLabel({ ...game, network: detail.network }, { fallback: true });

  return (
    <section
      className="scores-detail-hero"
      style={{
        '--scores-away-gradient': `${awayTheme?.gradientOverlay}, ${awayTheme?.gradient}`,
        '--scores-home-gradient': `${homeTheme?.gradientOverlay}, ${homeTheme?.gradient}`,
        '--scores-away-fg': awayTheme?.gradientFullForeground,
        '--scores-away-muted': awayTheme?.gradientFullMuted,
        '--scores-home-fg': homeTheme?.gradientFullForeground,
        '--scores-home-muted': homeTheme?.gradientFullMuted,
        '--scores-center-fg': centerForeground,
      }}
    >
      <div className="scores-detail-hero-halves" aria-hidden="true"><span /><span /></div>
      <div className="scores-detail-hero-scan" aria-hidden="true" />
      <div className="scores-detail-scoreboard">
        <DetailTeam
          team={detail.away}
          score={detail.score.away}
          side="away"
          record={game.records?.away}
          loser={awayLoser}
          possession={detail.possession}
        />
        <div className="scores-detail-status">
          {detail.status === 'live' && <span className="scores-live-dot" aria-hidden="true" />}
          <strong>{detail.statusLabel}</strong>
          {game.live?.downDistance && <span>{game.live.downDistance} · {game.live.fieldPosition}</span>}
          {game.live?.redZone && <b>Red Zone</b>}
        </div>
        <DetailTeam
          team={detail.home}
          score={detail.score.home}
          side="home"
          record={game.records?.home}
          loser={homeLoser}
          possession={detail.possession}
        />
      </div>
      <footer>
        <span>{detail.venue}</span>
        {network && <><span>·</span><span>{network}</span></>}
        <span>·</span><span>{game.dateLabel}</span>
      </footer>
    </section>
  );
}

function LineScore({ detail }) {
  if (!detail.quarterLabels.length || !detail.lineScore.away.length || !detail.lineScore.home.length) {
    return <DetailUnavailable>Quarter-by-quarter scoring is not included in this provider response.</DetailUnavailable>;
  }
  return (
    <div className="scores-line-score-shell">
      <table className="scores-line-score" aria-label="Score by quarter">
        <thead><tr><th scope="col">Team</th>{detail.quarterLabels.map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>
          {[['away', detail.away], ['home', detail.home]].map(([side, team]) => (
            <tr key={side}>
              <th scope="row"><img src={teamLogo(team.id)} alt="" />{team.id}</th>
              {detail.lineScore[side].map((score, index) => <td key={`${side}-${detail.quarterLabels[index]}`}>{score}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LatestPlay({ detail, onOpenPlays }) {
  const drive = detail.drives.at(-1);
  const play = drive?.plays.at(-1);
  if (!drive || !play) return null;
  return (
    <section className="scores-latest-play">
      <img src={teamLogo(drive.team)} alt="" />
      <div>
        <span>{play.down} · {play.spot} · {drive.quarter} {play.time}</span>
        <strong>{play.description}</strong>
      </div>
      <button type="button" onClick={onOpenPlays}>Full play feed <span aria-hidden="true">→</span></button>
    </section>
  );
}

function Leaders({ detail }) {
  return (
    <div className="scores-detail-leaders">
      {detail.leaders.map((leader) => (
        <article key={leader.label}>
          <span>{leader.label}</span>
          <div><img src={teamLogo(detail.away.id)} alt="" /><strong>{leader.away}</strong></div>
          <div><img src={teamLogo(detail.home.id)} alt="" /><strong>{leader.home}</strong></div>
        </article>
      ))}
    </div>
  );
}

function Overview({ detail, awayTheme, homeTheme, onOpenPlays }) {
  const primaryStats = detail.statGroups.flatMap((group) => group.stats).slice(0, 10);
  return (
    <div className="scores-detail-overview">
      <SectionHeading title="Latest Play" meta="Updating with the game" />
      {detail.drives.length
        ? <LatestPlay detail={detail} onOpenPlays={onOpenPlays} />
        : <DetailUnavailable>{detail.provider === 'espn'
          ? 'ESPN supplies the score and game header here. Play-by-play requires a BALLDONTLIE API key for this league.'
          : detailCoverageMessage(detail, 'No play-by-play has been returned for this game yet.')}</DetailUnavailable>}

      <SectionHeading title="Line Score" />
      <LineScore detail={detail} />

      <SectionHeading title="Leaders" />
      {detail.leaders.length ? <Leaders detail={detail} /> : <DetailUnavailable>{detailCoverageMessage(detail, 'Player leaders are not included in this score feed.')}</DetailUnavailable>}

      <SectionHeading title="Matchup" meta={`${detail.away.id} left · ${detail.home.id} right`} />
      {primaryStats.length ? (
        <div className="scores-stat-grid">
          {primaryStats.map((stat) => (
            <StatAdvantageRail
              key={stat.label}
              stat={stat}
              awayId={detail.away.id}
              homeId={detail.home.id}
              awayColor={awayTheme?.borderColor ?? awayTheme?.color}
              homeColor={homeTheme?.borderColor ?? homeTheme?.color}
            />
          ))}
        </div>
      ) : <DetailUnavailable>{detailCoverageMessage(detail, 'Team comparison data is not included in this score feed.')}</DetailUnavailable>}
    </div>
  );
}

function TeamStats({ detail, awayTheme, homeTheme }) {
  return (
    <div>
      <SectionHeading title="Team Stats" meta={`${detail.away.id} left · ${detail.home.id} right`} />
      {detail.statGroups.length ? (
        <div className="scores-team-stat-groups">
          {detail.statGroups.map((group) => (
            <section key={group.id} className="scores-team-stat-group">
              <h3>{group.label}</h3>
              {group.stats.map((stat) => (
                <StatAdvantageRail
                  key={stat.label}
                  stat={stat}
                  awayId={detail.away.id}
                  homeId={detail.home.id}
                  awayColor={awayTheme?.borderColor ?? awayTheme?.color}
                  homeColor={homeTheme?.borderColor ?? homeTheme?.color}
                />
              ))}
            </section>
          ))}
        </div>
      ) : <DetailUnavailable>{detailCoverageMessage(detail, 'Team statistics are not included in this score feed.')}</DetailUnavailable>}
    </div>
  );
}

function PlayerStats({ detail }) {
  const [activeGroup, setActiveGroup] = useState(() => detail.playerGroups[0]?.id ?? '');
  const group = detail.playerGroups.find((entry) => entry.id === activeGroup) ?? detail.playerGroups[0];
  const effectiveActiveGroup = group?.id ?? '';
  if (!group) {
    return (
      <section className="scores-player-stats">
        <SectionHeading title="Player Statistics" meta="Complete box score" />
        <DetailUnavailable>{detailCoverageMessage(detail, 'Player statistics are not included in this score feed.')}</DetailUnavailable>
      </section>
    );
  }
  return (
    <section className="scores-player-stats">
      <SectionHeading title="Player Statistics" meta="Complete box score" />
      <div className="scores-player-category-rail" role="tablist" aria-label="Player statistic categories">
        {detail.playerGroups.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === effectiveActiveGroup}
            className={entry.id === effectiveActiveGroup ? 'is-active' : ''}
            onClick={() => setActiveGroup(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="scores-player-table-shell">
        <table className="scores-player-table">
          <thead><tr><th>Player</th>{group.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {group.rows.map((row) => (
              <tr key={`${row.team}-${row.player}`}>
                <th><span>{row.team}</span>{row.player}</th>
                {row.values.map((value, index) => <td key={`${row.player}-${group.columns[index]}`}>{value}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="scores-player-cards">
        {group.rows.map((row) => (
          <article key={`mobile-${row.team}-${row.player}`}>
            <header><span>{row.team}</span><strong>{row.player}</strong><b>{group.columns[0]} {row.values[0]}</b></header>
            <p>{group.columns.slice(1).map((column, index) => `${column} ${row.values[index + 1]}`).join(' · ')}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ScoringSummary({ detail }) {
  const quarters = [...new Set(detail.scoring.map((play) => play.quarter))];
  return (
    <section className="scores-scoring-summary">
      <SectionHeading title="Scoring Plays" meta="Chronological by quarter" />
      {quarters.length ? quarters.map((quarter) => (
        <section key={quarter} className="scores-scoring-quarter">
          <h3>{quarter} Quarter</h3>
          <div>
            {detail.scoring.filter((play) => play.quarter === quarter).map((play) => (
              <article key={`${play.quarter}-${play.time}-${play.title}`}>
                <time>{play.time}</time>
                <img src={teamLogo(play.team)} alt="" />
                <div><strong>{play.title}</strong><span>{play.detail}</span></div>
                <b>{play.score}</b>
              </article>
            ))}
          </div>
        </section>
      )) : <DetailUnavailable>{detailCoverageMessage(detail, 'Scoring-play detail is not included in this score feed.')}</DetailUnavailable>}
    </section>
  );
}

function PlayByPlay({ detail }) {
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(() => new Set());
  if (detail.coverage && detail.coverage.plays !== true) {
    const message = detail.coverage?.playsStatus === 'loading'
      ? 'Loading play-by-play from BALLDONTLIE…'
      : detail.coverage?.playsStatus === 'error'
        ? detail.coverage.playsError ?? 'BALLDONTLIE play-by-play could not be loaded.'
      : detail.provider === 'espn'
        ? 'Play-by-play requires a BALLDONTLIE API key for this league.'
        : 'Play-by-play requires BALLDONTLIE play access for this league.';
    return (
      <section className="scores-play-feed">
        <SectionHeading title="Play Feed" meta="Provider coverage" />
        <DetailUnavailable>{message}</DetailUnavailable>
      </section>
    );
  }
  const drives = filter === 'all' ? detail.drives : detail.drives.filter((drive) => drive.team === filter);
  const displayedDrives = [...drives].reverse();

  const toggleDrive = (driveId) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(driveId)) next.delete(driveId);
      else next.add(driveId);
      return next;
    });
  };

  return (
    <section className="scores-play-feed">
      <SectionHeading title="Play Feed" meta="Most recent play first" />
      <div className="scores-play-filter" role="group" aria-label="Filter drives by team">
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
        {[detail.away, detail.home].map((team) => (
          <button key={team.id} type="button" aria-pressed={filter === team.id} onClick={() => setFilter(team.id)}>
            <img src={teamLogo(team.id)} alt="" />{team.id}
          </button>
        ))}
      </div>
      <div className="scores-drive-list">
        {displayedDrives.map((drive) => {
          const open = expanded.has(drive.id);
          return (
            <article key={drive.id} className={`scores-drive${drive.score ? ' is-scoring' : ''}`}>
              <button type="button" className="scores-drive-header" aria-expanded={open} onClick={() => toggleDrive(drive.id)}>
                <img src={teamLogo(drive.team)} alt="" />
                <strong>{drive.result}</strong>
                <span>{drive.summary} · {drive.quarter}</span>
                <b>{drive.score}</b>
                <i aria-hidden="true">{open ? '−' : '+'}</i>
              </button>
              {open && (
                <div className="scores-drive-plays">
                  {[...drive.plays].reverse().map((play) => (
                    <div key={`${drive.id}-${play.time}-${play.down}`} className={play.scoring ? 'is-scoring' : ''}>
                      <b>{play.down}</b><span>{play.spot}</span><p>{play.description}</p><time>{play.time}</time>
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function ScoresGameDrilldown({ game, fixtureDetail = null, onBack }) {
  const fixtureData = game.provider === 'fixture' || String(game.id).startsWith('fixture-');
  const detailsProvider = game.detailsProvider ?? game.provider;
  const [section, setSection] = useState('overview');
  const gameKey = `${game.provider ?? 'espn'}:${game.bdlGameId ?? game.providerGameId ?? game.id}`;
  const [detailState, setDetailState] = useState({
    key: gameKey,
    status: detailsProvider === 'balldontlie' ? 'loading' : 'unavailable',
    data: null,
    error: null,
  });
  const visibleDetailState = useMemo(() => detailState.key === gameKey
    ? detailState
    : {
      key: gameKey,
      status: detailsProvider === 'balldontlie' ? 'loading' : 'unavailable',
      data: null,
      error: null,
    }, [detailState, detailsProvider, gameKey]);
  const { darkMode } = useTheme();
  useEffect(() => {
    if (fixtureData || detailsProvider !== 'balldontlie' || !game.bdlGameId) return undefined;
    const controller = new AbortController();
    const refreshesLiveDetail = ['live', 'halftime', 'delayed'].includes(game.status);
    let stopped = false;
    let requestInFlight = false;
    let timeoutId = null;

    const scheduleRefresh = () => {
      if (!refreshesLiveDetail || stopped || document.visibilityState === 'hidden' || !navigator.onLine) return;
      timeoutId = window.setTimeout(loadDetail, LIVE_DETAIL_REFRESH_INTERVAL_MS);
    };

    async function loadDetail() {
      if (stopped || requestInFlight || document.visibilityState === 'hidden' || !navigator.onLine) return;
      requestInFlight = true;
      try {
        const payload = await getStatisticsScoresGameDetail(game.bdlGameId, {
          phase: game.phase,
          signal: controller.signal,
        });
        if (stopped || controller.signal.aborted) return;
        setDetailState({ key: gameKey, status: 'ready', data: payload, error: null });
      } catch (error) {
        if (error.name === 'AbortError' || controller.signal.aborted || stopped) return;
        setDetailState((current) => current.key === gameKey && current.data
          ? { ...current, error: error.message }
          : { key: gameKey, status: 'error', data: null, error: error.message });
      } finally {
        requestInFlight = false;
        scheduleRefresh();
      }
    }

    const refreshNow = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = null;
      void loadDetail();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshNow();
      else if (timeoutId) window.clearTimeout(timeoutId);
    };
    const handleOffline = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = null;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', refreshNow);
    window.addEventListener('offline', handleOffline);
    void loadDetail();
    return () => {
      stopped = true;
      controller.abort();
      if (timeoutId) window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', refreshNow);
      window.removeEventListener('offline', handleOffline);
    };
  }, [detailsProvider, fixtureData, game.bdlGameId, game.phase, game.status, gameKey]);
  const detail = useMemo(
    () => fixtureData
      ? fixtureDetail
      : buildScoreDetailFromGame(game, {
        providerDetail: visibleDetailState.data,
        detailStatus: visibleDetailState.status,
        detailError: visibleDetailState.error,
      }),
    [fixtureData, fixtureDetail, game, visibleDetailState],
  );
  if (!detail) {
    return <p className="statistics-scores-state">Loading fixture comparison…</p>;
  }
  const awayTheme = getTeamVisualTheme(detail.away.id, darkMode, { logoSide: 'start' });
  const homeTheme = getTeamVisualTheme(detail.home.id, darkMode, { logoSide: 'end' });

  return (
    <div className="statistics-scores-detail page-frame-data">
      <button type="button" className="scores-detail-back" onClick={onBack}>
        <span aria-hidden="true">←</span> Back to Scores
      </button>

      <ScoreHero game={game} detail={detail} awayTheme={awayTheme} homeTheme={homeTheme} />

      <div className="scores-detail-tabs-shell">
        <nav className="scores-detail-tabs" role="tablist" aria-label="Game detail sections">
          {SECTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={section === entry.id}
              className={section === entry.id ? 'is-active' : ''}
              onClick={() => setSection(entry.id)}
            >{entry.label}</button>
          ))}
        </nav>
      </div>

      {section === 'overview' && <Overview detail={detail} awayTheme={awayTheme} homeTheme={homeTheme} onOpenPlays={() => setSection('plays')} />}
      {section === 'team' && <TeamStats detail={detail} awayTheme={awayTheme} homeTheme={homeTheme} />}
      {section === 'players' && <PlayerStats detail={detail} />}
      {section === 'scoring' && <ScoringSummary detail={detail} />}
      {section === 'plays' && <PlayByPlay detail={detail} />}
    </div>
  );
}
