import EmptyState from '../ui/EmptyState.jsx';

function emptyCopy({ noun, season, priorSeasonCount }) {
  const year = season || 'this league year';
  const renewed = Number(priorSeasonCount) > 0;
  if (noun === 'Standings') {
    return {
      title: `No standings available for ${year} yet.`,
      hint: renewed
        ? `This renewed league has no completed matchups in ${year}. Standings will appear after the first matchup is finalized.`
        : `Standings will appear after the first matchup in ${year} is finalized.`,
    };
  }
  if (noun === 'League activity') {
    return {
      title: `No activity recorded for ${year} yet.`,
      hint: renewed
        ? `This renewed league has no completed trades, waivers, signings, or draft-pick moves in ${year} yet.`
        : `Completed trades, waivers, signings, and draft-pick moves will appear here as the ${year} league year gets underway.`,
    };
  }
  return {
    title: renewed ? `No completed history is available yet.` : 'Your league history is just getting started.',
    hint: renewed
      ? `The linked prior seasons do not contain completed records yet. This record book will fill in as league games and transactions are completed.`
      : 'League records, champions, rivalries, and lifetime standings will appear after the league has completed games or transactions.',
  };
}

export default function LeagueHistoryState({ platform, loading, error, empty, noun, season, priorSeasonCount, onRetry }) {
  if (platform !== 'sleeper') {
    return <EmptyState title={`${noun} is available for Sleeper leagues only.`} hint="ESPN Fantasy development is currently paused." />;
  }
  if (loading) return <EmptyState title={`Loading ${noun.toLowerCase()}...`} />;
  if (error) {
    return (
      <EmptyState
        title={`${noun} is unavailable right now.`}
        hint={error}
        action={(
          <button type="button" className="league-history-state-action" onClick={onRetry}>Try again</button>
        )}
      />
    );
  }
  if (empty) {
    const copy = emptyCopy({ noun, season, priorSeasonCount });
    return <EmptyState title={copy.title} hint={copy.hint} />;
  }
  return null;
}
