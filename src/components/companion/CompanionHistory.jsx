import { useEffect, useMemo } from 'react';
import { useFantasyStats } from '../../context/SleeperContext.jsx';
import useLeagueHistoryData from '../../hooks/useLeagueHistoryData.js';
import { buildLeagueHistoryModel } from '../../utils/leagueHistory.js';
import LeagueHistoryIcon from './LeagueHistoryIcon.jsx';
import LeagueHistoryState from './LeagueHistoryState.jsx';

function formatScore(value) {
  return Number(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function SectionHeading({ title, meta, icon }) {
  return (
    <div className="league-history-section__heading">
      <span className="league-history-section__title">
        {icon && <LeagueHistoryIcon name={icon} size="sm" />}
        <h2>{title}</h2>
      </span>
      {meta && <span>{meta}</span>}
    </div>
  );
}

function RecordTile({ label, primary, unit, secondary, tone, icon, matchup, onOpenMatchup }) {
  const clickable = Boolean(matchup && onOpenMatchup);
  const content = (
    <>
      <div className="league-record-tile__top">
        <LeagueHistoryIcon name={icon} tone={tone} />
        <span className="league-record-tile__label">{label}</span>
        {clickable && (
          <span className="league-record-tile__link-indicator" title="View matchup">
            <LeagueHistoryIcon name="open" tone={tone} size="sm" />
          </span>
        )}
      </div>
      <strong>{primary}<em>{unit}</em></strong>
      <span className="league-record-tile__meta">{secondary ?? 'No completed result yet'}</span>
    </>
  );

  if (!clickable) return <article className={`league-record-tile tone-${tone}`}>{content}</article>;
  return (
    <button
      type="button"
      className={`league-record-tile league-record-tile--link tone-${tone}`}
      aria-label={`${label}: ${primary} ${unit}. ${secondary}. View matchup.`}
      onClick={() => onOpenMatchup(matchup)}
    >
      {content}
    </button>
  );
}

function RecordGroup({ id, title, meta, records, onOpenMatchup }) {
  return (
    <div className="league-record-group" aria-labelledby={id}>
      <div className="league-record-group__heading">
        <h3 id={id}>{title}</h3>
        <span>{meta}</span>
      </div>
      <div className="league-record-grid">
        {records.map((record) => <RecordTile key={record.label} {...record} onOpenMatchup={onOpenMatchup} />)}
      </div>
    </div>
  );
}

function gameWinner(game) {
  if (!game?.winnerId) return null;
  return game.left.identity.id === game.winnerId ? game.left : game.right;
}

function rankTone(index) {
  if (index === 0) return ' is-gold';
  if (index === 1) return ' is-silver';
  if (index === 2) return ' is-bronze';
  return '';
}

export default function CompanionHistory({ onOpenMatchup = null }) {
  const history = useLeagueHistoryData();
  const { players, loadPlayers } = useFantasyStats();
  useEffect(() => { if (!players) void loadPlayers(); }, [loadPlayers, players]);
  const model = useMemo(
    () => history.snapshots?.length ? buildLeagueHistoryModel(history.snapshots, players ?? {}) : null,
    [history.snapshots, players],
  );
  const records = model?.records;
  const hasHistory = Boolean(model && (
    model.leaderboard.some((row) => row.games > 0)
    || model.champions.length > 0
    || records?.mostTrades
    || records?.mostWaiverAdds
  ));
  const state = (
    <LeagueHistoryState
      platform={history.platform}
      loading={history.loading}
      error={history.error}
      empty={!hasHistory}
      noun="League history"
      season={history.season}
      priorSeasonCount={Math.max(0, history.eligibleLeagueHistory.length - 1)}
      onRetry={history.retry}
    />
  );
  if (history.platform !== 'sleeper' || history.loading || history.error || !hasHistory) {
    return <div className="league-history-page league-history-page--state" data-tour="league-history-content">{state}</div>;
  }

  const biggestWinner = gameWinner(records.biggestBlowout);
  const narrowWinner = gameWinner(records.narrowestWin);
  const teamRecordTiles = [
    {
      label: 'Highest score', primary: records.highestScore ? formatScore(records.highestScore.score) : '—', unit: 'pts',
      secondary: records.highestScore ? `${records.highestScore.participant.teamName} · ${records.highestScore.season} W${records.highestScore.week}` : null,
      tone: 'signature', icon: 'star',
      matchup: records.highestScore ? { season: records.highestScore.season, week: records.highestScore.week, rosterId: records.highestScore.rosterId } : null,
    },
    {
      label: 'Highest score in a loss', primary: records.highestLosingScore ? formatScore(records.highestLosingScore.points) : '—', unit: 'pts',
      secondary: records.highestLosingScore ? `${records.highestLosingScore.identity.teamName} · ${records.highestLosingScore.season} W${records.highestLosingScore.week}` : null,
      tone: 'red', icon: 'bolt',
      matchup: records.highestLosingScore ? { season: records.highestLosingScore.season, week: records.highestLosingScore.week, rosterId: records.highestLosingScore.rosterId } : null,
    },
    {
      label: 'Lowest score in a win', primary: records.lowestWinningScore ? formatScore(records.lowestWinningScore.points) : '—', unit: 'pts',
      secondary: records.lowestWinningScore ? `${records.lowestWinningScore.identity.teamName} · ${records.lowestWinningScore.season} W${records.lowestWinningScore.week}` : null,
      tone: 'green', icon: 'target',
      matchup: records.lowestWinningScore ? { season: records.lowestWinningScore.season, week: records.lowestWinningScore.week, rosterId: records.lowestWinningScore.rosterId } : null,
    },
    {
      label: 'Lowest team score', primary: records.lowestScore ? formatScore(records.lowestScore.score) : '—', unit: 'pts',
      secondary: records.lowestScore ? `${records.lowestScore.participant.teamName} · ${records.lowestScore.season} W${records.lowestScore.week}` : null,
      tone: 'blue', icon: 'minus',
      matchup: records.lowestScore ? { season: records.lowestScore.season, week: records.lowestScore.week, rosterId: records.lowestScore.rosterId } : null,
    },
    {
      label: 'Biggest blowout', primary: records.biggestBlowout ? formatScore(records.biggestBlowout.value) : '—', unit: 'pts',
      secondary: biggestWinner ? `${biggestWinner.identity.teamName} · ${records.biggestBlowout.season} W${records.biggestBlowout.week}` : null,
      tone: 'red', icon: 'bolt',
      matchup: biggestWinner ? { season: records.biggestBlowout.season, week: records.biggestBlowout.week, rosterId: biggestWinner.rosterId } : null,
    },
    {
      label: 'Narrowest win', primary: records.narrowestWin ? formatScore(records.narrowestWin.value) : '—', unit: 'pts',
      secondary: narrowWinner ? `${narrowWinner.identity.teamName} · ${records.narrowestWin.season} W${records.narrowestWin.week}` : null,
      tone: 'blue', icon: 'target',
      matchup: narrowWinner ? { season: records.narrowestWin.season, week: records.narrowestWin.week, rosterId: narrowWinner.rosterId } : null,
    },
    {
      label: 'Highest combined score', primary: records.highestCombinedScore ? formatScore(records.highestCombinedScore.value) : '—', unit: 'pts',
      secondary: records.highestCombinedScore ? `${records.highestCombinedScore.left.identity.teamName} vs ${records.highestCombinedScore.right.identity.teamName} · ${records.highestCombinedScore.season} W${records.highestCombinedScore.week}` : null,
      tone: 'orange', icon: 'versus',
      matchup: records.highestCombinedScore ? { season: records.highestCombinedScore.season, week: records.highestCombinedScore.week, rosterId: records.highestCombinedScore.left.rosterId } : null,
    },
    {
      label: 'Longest win streak', primary: records.longestWinStreak?.value ?? '—', unit: 'wins',
      secondary: records.longestWinStreak?.participant?.teamName, tone: 'green', icon: 'flame',
    },
  ];
  const playerRecordTiles = [
    {
      label: 'Highest starter score', primary: records.highestStarterScore ? formatScore(records.highestStarterScore.score) : '—', unit: 'pts',
      secondary: records.highestStarterScore ? `${records.highestStarterScore.playerName} · ${records.highestStarterScore.participant.teamName} · ${records.highestStarterScore.season} W${records.highestStarterScore.week}` : null,
      tone: 'signature', icon: 'player',
      matchup: records.highestStarterScore ? { season: records.highestStarterScore.season, week: records.highestStarterScore.week, rosterId: records.highestStarterScore.rosterId } : null,
    },
    {
      label: 'Highest bench score', primary: records.highestBenchScore ? formatScore(records.highestBenchScore.score) : '—', unit: 'pts',
      secondary: records.highestBenchScore ? `${records.highestBenchScore.playerName} · ${records.highestBenchScore.participant.teamName} · ${records.highestBenchScore.season} W${records.highestBenchScore.week}` : null,
      tone: 'blue', icon: 'bench',
      matchup: records.highestBenchScore ? { season: records.highestBenchScore.season, week: records.highestBenchScore.week, rosterId: records.highestBenchScore.rosterId } : null,
    },
    {
      label: 'Most points left on bench', primary: records.mostBenchPoints ? formatScore(records.mostBenchPoints.score) : '—', unit: 'pts',
      secondary: records.mostBenchPoints ? `${records.mostBenchPoints.participant.teamName} · ${records.mostBenchPoints.season} W${records.mostBenchPoints.week}` : null,
      tone: 'red', icon: 'bench',
      matchup: records.mostBenchPoints ? { season: records.mostBenchPoints.season, week: records.mostBenchPoints.week, rosterId: records.mostBenchPoints.rosterId } : null,
    },
    {
      label: 'Largest share of team score', primary: records.largestStarterShare ? formatScore(records.largestStarterShare.share) : '—', unit: '%',
      secondary: records.largestStarterShare ? `${records.largestStarterShare.playerName} · ${records.largestStarterShare.participant.teamName} · ${records.largestStarterShare.season} W${records.largestStarterShare.week}` : null,
      tone: 'orange', icon: 'percent',
      matchup: records.largestStarterShare ? { season: records.largestStarterShare.season, week: records.largestStarterShare.week, rosterId: records.largestStarterShare.rosterId } : null,
    },
  ];
  const activityRecordTiles = [
    {
      label: 'Most completed trades', primary: records.mostTrades?.value ?? '—', unit: 'trades',
      secondary: records.mostTrades?.participant?.teamName, tone: 'orange', icon: 'swap',
    },
    {
      label: 'Most waiver additions', primary: records.mostWaiverAdds?.value ?? '—', unit: 'adds',
      secondary: records.mostWaiverAdds?.participant?.teamName, tone: 'blue', icon: 'plus',
    },
  ];

  return (
    <div className="league-history-page" data-tour="league-history-content">
      <header className="league-history-heading">
        <div>
          <span className="league-history-eyebrow">Record book</span>
          <h1>League History</h1>
          <p><strong>{history.snapshots.length} linked season{history.snapshots.length === 1 ? '' : 's'}</strong> through {history.season} · completed Sleeper events only.</p>
        </div>
      </header>

      <section className="league-history-section league-history-section--records" aria-labelledby="history-records-title">
        <SectionHeading title="League records" meta="The trophy case" icon="trophy" />
        <div className="league-record-groups" id="history-records-title">
          <RecordGroup id="history-team-records-title" title="Team records" meta="Weekly results" records={teamRecordTiles} onOpenMatchup={onOpenMatchup} />
          <RecordGroup id="history-player-records-title" title="Player records" meta="Starters and bench" records={playerRecordTiles} onOpenMatchup={onOpenMatchup} />
          <RecordGroup id="history-activity-records-title" title="Activity records" meta="Completed moves" records={activityRecordTiles} onOpenMatchup={onOpenMatchup} />
        </div>
      </section>

      <section className="league-history-section" aria-labelledby="history-champions-title">
        <SectionHeading title="Champions" meta="Completed championships" icon="crown" />
        <div className="league-champion-list" id="history-champions-title">
          {model.champions.length ? model.champions.map((champion) => (
            <div key={champion.season} className="league-champion-row">
              <span className="league-champion-row__year">{champion.season}</span>
              <LeagueHistoryIcon name="crown" tone="signature" variant="medallion" />
              <span className="league-champion-row__team">
                <strong>{champion.participant.teamName}</strong>
                <small>{champion.participant.managerName}{champion.runnerUp ? ` · def. ${champion.runnerUp.teamName}` : ''}</small>
              </span>
              <span className="league-champion-row__tag">Champion</span>
            </div>
          )) : <p className="league-history-inline-empty">No completed championships found.</p>}
        </div>
      </section>

      <section className="league-history-section" aria-labelledby="history-leaderboard-title">
        <SectionHeading title="Lifetime leaderboard" meta="Regular season + playoffs" />
        <div className="league-history-table-scroll">
          <table className="league-history-table" id="history-leaderboard-title">
            <thead><tr><th>Team</th><th className="is-desktop-only">Seasons</th><th>W</th><th>L</th><th className="is-desktop-only">T</th><th>PF</th><th className="is-desktop-only">PA</th></tr></thead>
            <tbody>
              {model.leaderboard.map((row, index) => (
                <tr key={row.id}>
                  <td><span className={`league-history-rank${rankTone(index)}`}>{index + 1}</span><span><strong>{row.teamName}</strong><small>{row.managerName}</small></span></td>
                  <td className="is-desktop-only">{row.seasons.length}</td><td className="is-win">{row.wins}</td><td>{row.losses}</td><td className="is-desktop-only">{row.ties}</td><td>{formatScore(row.pointsFor)}</td><td className="is-desktop-only">{formatScore(row.pointsAgainst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="league-history-section" aria-labelledby="history-rivalries-title">
        <SectionHeading title="Most-played rivalries" />
        <div className="league-rivalry-list" id="history-rivalries-title">
          {model.rivalries.slice(0, 6).map((rivalry) => {
            const [left, right] = rivalry.participants;
            const leftWins = rivalry.winsByParticipantId[left?.id] ?? 0;
            const rightWins = rivalry.winsByParticipantId[right?.id] ?? 0;
            return (
              <div key={rivalry.id} className="league-rivalry-row">
                <span><strong>{left?.teamName}</strong><small>{leftWins} wins</small></span>
                <span className="league-rivalry-row__games"><LeagueHistoryIcon name="versus" size="sm" />{rivalry.games}<small>games</small></span>
                <span><strong>{right?.teamName}</strong><small>{rightWins} wins{rivalry.ties ? ` · ${rivalry.ties} ties` : ''}</small></span>
                <span className="league-rivalry-row__bar" aria-hidden="true">
                  {leftWins > 0 && <i style={{ flexGrow: leftWins }} />}
                  {rivalry.ties > 0 && <i className="is-tie" style={{ flexGrow: rivalry.ties }} />}
                  {rightWins > 0 && <i className="is-right" style={{ flexGrow: rightWins }} />}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
