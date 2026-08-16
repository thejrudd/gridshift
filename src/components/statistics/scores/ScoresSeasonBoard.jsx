import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveProviderAnchoredGameClock } from '../../../utils/providerAnchoredGameClock';
import { groupStatisticsScoresGames } from '../../../utils/statisticsScoresGrouping';
import GameScorebug, { CompactScorebug } from './GameScorebug';

function useProviderAnchoredWeek(week) {
  const [displayedClocks, setDisplayedClocks] = useState(() => new Map());
  const hasProviderClocks = week.games.some((game) => (
    game.status === 'live' && Boolean(game.live?.providerClockAnchor)
  ));
  const updateDisplayedClocks = useCallback((now) => {
    setDisplayedClocks((previousClocks) => {
      const nextClocks = new Map();
      week.games.forEach((game) => {
        const anchor = game.live?.providerClockAnchor;
        if (game.status !== 'live' || !anchor) return;
        const previous = previousClocks.get(game.id);
        const resolved = resolveProviderAnchoredGameClock({
          status: game.status,
          period: game.live.period,
          providerClock: game.live.clock,
          anchorChangedAt: anchor.changedAt,
          now,
          previousDisplayClock: previous?.clock,
          previousPeriod: previous?.period,
          feedStale: anchor.feedStale,
          staleAfterMs: anchor.staleAfterMs,
        });
        if (resolved) nextClocks.set(game.id, resolved);
      });
      return nextClocks;
    });
  }, [week]);

  useEffect(() => {
    if (!hasProviderClocks) return undefined;
    let intervalId = null;
    const stop = () => {
      if (intervalId) window.clearInterval(intervalId);
      intervalId = null;
    };
    const start = () => {
      stop();
      if (document.visibilityState === 'hidden' || !navigator.onLine) return;
      updateDisplayedClocks(Date.now());
      intervalId = window.setInterval(() => updateDisplayedClocks(Date.now()), 1000);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', start);
    window.addEventListener('offline', stop);
    start();
    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', start);
      window.removeEventListener('offline', stop);
    };
  }, [hasProviderClocks, updateDisplayedClocks]);

  return useMemo(() => {
    const games = week.games.map((game) => {
      const resolved = displayedClocks.get(game.id);
      if (!resolved) return game;
      return {
        ...game,
        statusLabel: `Q${game.live.period} · ${resolved.clock}`,
        live: {
          ...game.live,
          displayClock: resolved.clock,
          displayClockFrozen: resolved.frozen,
          displayClockStale: resolved.stale,
        },
      };
    });
    return { ...week, games };
  }, [displayedClocks, week]);
}

function DayGroup({ group, onOpenGame }) {
  return (
    <section className="scores-day-group">
      <header className="scores-day-heading">
        <h2>{group.label}</h2>
        {group.dateLabel && <span>{group.dateLabel}</span>}
      </header>
      <div className="scores-day-grid">
        {group.games.map((game) => (
          <GameScorebug key={game.id} game={game} onOpen={onOpenGame} />
        ))}
      </div>
    </section>
  );
}

function WeekPeek({ eyebrow, week, onSelectWeek, onOpenGame }) {
  if (!week) return null;
  return (
    <section className="scores-week-peek">
      <header>
        <span>{eyebrow} · {week.label}</span>
        <button type="button" onClick={() => onSelectWeek(week.id)}>Open {week.shortLabel} <span aria-hidden="true">→</span></button>
      </header>
      <div className="scores-week-peek-grid">
        {week.games.slice(0, 8).map((game) => (
          <CompactScorebug key={game.id} game={game} onOpen={onOpenGame} />
        ))}
        {week.games.length > 8 && (
          <button type="button" className="scores-week-peek-more" onClick={() => onSelectWeek(week.id)}>
            +{week.games.length - 8} more games
          </button>
        )}
      </div>
    </section>
  );
}

export default function ScoresSeasonBoard({ weeks, selectedWeekId, desktop, onOpenGame, onSelectWeek }) {
  const selectedIndex = Math.max(0, weeks.findIndex((week) => week.id === selectedWeekId));
  const selectedWeek = weeks[selectedIndex] ?? weeks[0];
  const displayedWeek = useProviderAnchoredWeek(selectedWeek);
  const groups = useMemo(
    () => groupStatisticsScoresGames(displayedWeek.games),
    [displayedWeek.games],
  );

  return (
    <div className="scores-hero-board">
      <div className="scores-selected-week" aria-label={`${selectedWeek.label} scores`}>
        {groups.map((group) => (
          <DayGroup key={group.key} group={group} onOpenGame={onOpenGame} />
        ))}
      </div>

      {desktop && (
        <div className="scores-neighbor-weeks">
          <WeekPeek
            eyebrow="Previous"
            week={weeks[selectedIndex - 1]}
            onSelectWeek={onSelectWeek}
            onOpenGame={onOpenGame}
          />
          <WeekPeek
            eyebrow="Up next"
            week={weeks[selectedIndex + 1]}
            onSelectWeek={onSelectWeek}
            onOpenGame={onOpenGame}
          />
        </div>
      )}
    </div>
  );
}
