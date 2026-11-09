// Inline answer card, shown above the result list when a query asks something
// the cached data can answer directly.
//
// Copy is plain language throughout — a stat line reads as labelled numbers, not
// as the abbreviations the underlying data uses, and nothing here asks the
// reader to do arithmetic to get the answer they searched for.

import { useState } from 'react';

/**
 * Where a standings row leads: an NFL team's page, or a fantasy team's roster.
 */
function rowRoute(row) {
  if (row.teamId) {
    return { activeTab: 'statistics', statisticsView: 'team', statisticsTeamId: row.teamId };
  }
  if (row.rosterId != null) {
    return {
      activeTab: 'fantasy',
      companionView: 'rosters',
      leagueSubview: 'roster',
      leagueRosterId: String(row.rosterId),
    };
  }
  return null;
}

function StatValues({ values }) {
  return (
    <div className="global-search-answer__values">
      {values.map((value) => (
        <div key={value.key} className="global-search-answer__value">
          <span className="global-search-answer__value-number">{value.display}</span>
          <span className="global-search-answer__value-label">{value.label}</span>
        </div>
      ))}
    </div>
  );
}

function LeaderRows({ rows, onSelectPlayer }) {
  return (
    <ol className="global-search-answer__rows">
      {rows.map((row) => (
        <li key={row.sleeperId}>
          <button
            type="button"
            className="global-search-answer__row"
            onClick={() => onSelectPlayer?.(row.sleeperId)}
          >
            {/* The rank is the player's standing in the full field, carried
                through the position filter rather than renumbered. */}
            <span className="global-search-answer__rank">{row.rank}</span>
            <span className="global-search-answer__row-text">
              <span className="global-search-answer__row-label">{row.label}</span>
              <span className="global-search-answer__row-sublabel">{row.sublabel}</span>
            </span>
            <span className="global-search-answer__row-value">{row.display}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/**
 * A standings table.
 *
 * Built from divs with ARIA table roles and a shared grid template rather than
 * a <table>, matching the Standings section: it keeps the columns aligned
 * across rows while letting each row stay a single grid line that narrows
 * cleanly on a phone.
 */
function StandingsRows({ columns, rows, onSelectRow }) {
  const template = `1.5rem minmax(0, 1fr) repeat(${columns.length}, minmax(2.5rem, auto))`;

  return (
    <div className="global-search-answer__table" role="table">
      <div className="global-search-answer__table-head" role="row" style={{ gridTemplateColumns: template }}>
        <span role="columnheader" aria-label="Rank" />
        <span role="columnheader">Team</span>
        {columns.map((column) => (
          <span key={column.key} role="columnheader">{column.label}</span>
        ))}
      </div>
      <div role="rowgroup">
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            role="row"
            className="global-search-answer__table-row"
            style={{ gridTemplateColumns: template }}
            onClick={() => onSelectRow?.(row)}
          >
            <span role="cell" className="global-search-answer__rank">{row.rank}</span>
            <span role="cell" className="global-search-answer__table-team">
              <span className="global-search-answer__row-label">{row.label}</span>
              {row.sublabel ? (
                <span className="global-search-answer__row-sublabel">{row.sublabel}</span>
              ) : null}
            </span>
            {row.values.map((value, index) => (
              <span
                key={columns[index]?.key ?? index}
                role="cell"
                className="global-search-answer__table-value"
              >
                {value}
              </span>
            ))}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Two things side by side: a header naming each side, then one row per value
 * with the better side marked. Each side's name opens it.
 *
 * Div table roles and a shared grid template, like StandingsRows, so the two
 * value columns stay aligned and the label column takes what is left.
 */
function CompareRows({ sides, rows, onSelectPlayer, onRoute }) {
  const template = 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)';
  const openSide = (side) => {
    if (side.sleeperId) onSelectPlayer?.(side.sleeperId);
    else if (side.route) onRoute?.(side.route);
  };

  return (
    <div className="global-search-answer__table global-search-compare" role="table">
      <div className="global-search-compare__head" role="row" style={{ gridTemplateColumns: template }}>
        <span role="columnheader" aria-label="Value" />
        {sides.map((side) => (
          <span key={side.label} role="columnheader" className="global-search-compare__side">
            {side.sleeperId || side.route ? (
              <button
                type="button"
                className="global-search-compare__side-button"
                onClick={() => openSide(side)}
              >
                <span className="global-search-answer__row-label">{side.label}</span>
                {side.sublabel ? (
                  <span className="global-search-answer__row-sublabel">{side.sublabel}</span>
                ) : null}
              </button>
            ) : (
              <>
                <span className="global-search-answer__row-label">{side.label}</span>
                {side.sublabel ? (
                  <span className="global-search-answer__row-sublabel">{side.sublabel}</span>
                ) : null}
              </>
            )}
          </span>
        ))}
      </div>
      {rows.length ? (
        <div role="rowgroup">
          {rows.map((entry) => (
            <div
              key={entry.key}
              role="row"
              className="global-search-compare__row"
              style={{ gridTemplateColumns: template }}
            >
              <span role="rowheader" className="global-search-compare__label">{entry.label}</span>
              {['left', 'right'].map((side) => (
                <span
                  key={side}
                  role="cell"
                  className={`global-search-compare__value${entry.leader === side ? ' is-leader' : ''}`}
                >
                  {entry[side]}
                  {entry.leader === side ? <span className="sr-only"> (better)</span> : null}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Points by quarter under a started game: one column per period and the total,
 * so the shape of the game reads at a glance.
 */
function LineScore({ game }) {
  const { lineScore } = game;
  const template = `2.75rem repeat(${lineScore.periods.length}, minmax(1.5rem, 1fr)) 2rem`;
  const line = (side, teamId, scores, total) => (
    <div role="row" className="global-search-linescore__row" style={{ gridTemplateColumns: template }}>
      <span role="rowheader">{teamId}</span>
      {scores.map((score, index) => (
        <span role="cell" key={`${side}-${lineScore.periods[index]}-${index}`}>{score ?? ''}</span>
      ))}
      <span role="cell" className="global-search-linescore__total">{total ?? ''}</span>
    </div>
  );
  return (
    <div role="table" aria-label="Score by quarter" className="global-search-linescore">
      <div role="row" className="global-search-linescore__row global-search-linescore__head" style={{ gridTemplateColumns: template }}>
        <span role="columnheader" aria-label="Team" />
        {lineScore.periods.map((period, index) => (
          <span role="columnheader" key={`${period}-${index}`}>{period}</span>
        ))}
        <span role="columnheader">T</span>
      </div>
      {line('away', game.awayId, lineScore.away, game.awayScore)}
      {line('home', game.homeId, lineScore.home, game.homeScore)}
    </div>
  );
}

/**
 * The game's headline team stats, away and home, with the better side marked
 * the same way the compare card marks it.
 */
function GameHighlights({ game }) {
  const template = 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr)';
  return (
    <div role="table" aria-label="Game highlights" className="global-search-compare global-search-highlights">
      <div role="row" className="global-search-compare__row global-search-highlights__head" style={{ gridTemplateColumns: template }}>
        <span role="columnheader" aria-label="Stat" />
        <span role="columnheader" className="global-search-compare__value">{game.awayId}</span>
        <span role="columnheader" className="global-search-compare__value">{game.homeId}</span>
      </div>
      {game.highlights.map((stat) => (
        <div key={stat.label} role="row" className="global-search-compare__row" style={{ gridTemplateColumns: template }}>
          <span role="rowheader" className="global-search-compare__label">{stat.label}</span>
          {['away', 'home'].map((side) => (
            <span key={side} role="cell" className={`global-search-compare__value${stat.leader === side ? ' is-leader' : ''}`}>
              {stat[side]}
              {stat.leader === side ? <span className="sr-only"> (better)</span> : null}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * A scoreboard: each game as away and home with their scores and the game's
 * state. A game in progress carries the shared live dot. Each row opens the
 * game, on Scores once it has kicked off.
 */
function LiveGameRows({ games, onRoute, detailed = false }) {
  return (
    <ol className="global-search-answer__rows global-search-live">
      {games.map((game) => {
        const content = (
          <>
            <span className="global-search-live__teams">
              {[
                ['away', game.awayId, game.awayLogoId, game.awayScore],
                ['home', game.homeId, game.homeLogoId, game.homeScore],
              ].map(([side, teamId, logoId, score]) => {
                const other = side === 'away' ? game.homeScore : game.awayScore;
                const leading = score != null && other != null && score > other;
                return (
                  <span key={side} className={`global-search-live__team${leading ? ' is-leading' : ''}`}>
                    <img src={`/logos/${logoId}.png`} alt="" className="global-search-live__logo" loading="lazy" />
                    <span className="global-search-live__abbr">{teamId}</span>
                    <span className="global-search-live__score">{score ?? ''}</span>
                  </span>
                );
              })}
            </span>
            <span className="global-search-live__status">
              {game.inProgress ? <span className="matchup-live-dot" aria-hidden="true" /> : null}
              <span>{game.statusLabel}</span>
            </span>
          </>
        );
        const detail = detailed && game.started && (game.lineScore || game.highlights) ? (
          <div className="global-search-live__detail">
            {game.lineScore ? <LineScore game={game} /> : null}
            {game.highlights ? <GameHighlights game={game} /> : null}
          </div>
        ) : null;
        return (
          <li key={game.key}>
            {game.route ? (
              <button type="button" className="global-search-answer__row global-search-live__row" onClick={() => onRoute?.(game.route)}>
                {content}
              </button>
            ) : (
              <div className="global-search-answer__row global-search-live__row">{content}</div>
            )}
            {detail}
          </li>
        );
      })}
    </ol>
  );
}

export default function GlobalSearchAnswerCard({ answer, onSelectPlayer, onRoute }) {
  // A team's leaders card carries its whole qualifying group and shows the top
  // five, because five is the answer and the rest is the list.
  //
  // The expanded flag is stored against the answer it belongs to and compared
  // during render rather than reset in an effect: a new query has not been
  // expanded yet, and an effect would paint one frame of the previous answer's
  // expanded state before correcting itself.
  const [expandedFor, setExpandedFor] = useState(null);

  if (!answer) return null;

  const expanded = expandedFor != null && expandedFor === answer.title;
  const collapseAfter = answer.collapseAfter ?? null;
  // A compare card's rows are its own value lines, drawn by CompareRows.
  const rows = answer.kind === 'compare' ? null : (answer.rows ?? answer.games ?? null);
  const hiddenCount = rows && collapseAfter && !expanded
    ? Math.max(0, rows.length - collapseAfter)
    : 0;
  const visibleRows = rows && hiddenCount ? rows.slice(0, collapseAfter) : rows;

  return (
    <section className="global-search-answer" aria-label="Search answer">
      <header className="global-search-answer__header">
        <h2 className="global-search-answer__title">{answer.title}</h2>
        {answer.subtitle ? (
          <p className="global-search-answer__subtitle">{answer.subtitle}</p>
        ) : null}
      </header>

      {answer.values ? <StatValues values={answer.values} /> : null}
      {answer.kind === 'compare' ? (
        <CompareRows
          sides={answer.sides}
          rows={answer.rows}
          onSelectPlayer={onSelectPlayer}
          onRoute={onRoute}
        />
      ) : null}
      {visibleRows && answer.columns ? (
        <StandingsRows
          columns={answer.columns}
          rows={visibleRows}
          onSelectRow={(row) => onRoute?.(rowRoute(row))}
        />
      ) : visibleRows && answer.kind === 'liveGames' ? (
        <LiveGameRows games={visibleRows} onRoute={onRoute} detailed={!answer.collapseAfter} />
      ) : visibleRows ? (
        <LeaderRows rows={visibleRows} onSelectPlayer={onSelectPlayer} />
      ) : null}

      {(hiddenCount || answer.route) ? (
        <div className="global-search-answer__actions">
          {hiddenCount ? (
            <button
              type="button"
              className="global-search-answer__more"
              onClick={() => setExpandedFor(answer.title)}
            >
              {`Show all ${rows.length}`}
            </button>
          ) : null}
          {answer.route ? (
            <button
              type="button"
              className="global-search-answer__more"
              onClick={() => onRoute?.(answer.route)}
            >
              {answer.routeLabel ?? 'Open'}
            </button>
          ) : null}
        </div>
      ) : null}

      {answer.footnote ? (
        <p className="global-search-answer__footnote">{answer.footnote}</p>
      ) : null}
    </section>
  );
}
