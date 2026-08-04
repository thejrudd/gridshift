import { useMemo } from 'react';
import GameScorebug, { CompactScorebug } from './GameScorebug';

function groupGames(games) {
  const groups = [];
  for (const game of games) {
    const key = game.slot ?? 'game-window';
    const existing = groups.find((entry) => entry.key === key);
    if (existing) existing.games.push(game);
    else groups.push({ key, label: game.slotLabel ?? 'Game Window', dateLabel: game.dateLabel, games: [game] });
  }
  return groups;
}

function DayGroup({ group, onOpenGame }) {
  return (
    <section className="scores-day-group">
      <header className="scores-day-heading">
        <h2>{group.label}</h2>
        <span>{group.dateLabel}</span>
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
  const groups = useMemo(() => groupGames(selectedWeek.games), [selectedWeek.games]);

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
