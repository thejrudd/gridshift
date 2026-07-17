import { useMemo, useRef } from 'react';
import useLeagueHistoryData from '../../hooks/useLeagueHistoryData.js';
import useHorizontalScrollCue from '../../hooks/useHorizontalScrollCue.js';
import { buildSeasonStandings, normalizeSeasonBrackets } from '../../utils/leagueHistory.js';
import HorizontalScrollCue from '../HorizontalScrollCue.jsx';
import LeagueHistoryIcon from './LeagueHistoryIcon.jsx';
import LeagueHistoryState from './LeagueHistoryState.jsx';

function formatScore(value) {
  if (value == null) return '—';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function ordinal(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Placement';
  const remainder = numeric % 100;
  if (remainder >= 11 && remainder <= 13) return `${numeric}th`;
  if (numeric % 10 === 1) return `${numeric}st`;
  if (numeric % 10 === 2) return `${numeric}nd`;
  if (numeric % 10 === 3) return `${numeric}rd`;
  return `${numeric}th`;
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

function StandingRows({ rows, historical, playoffTeamCount }) {
  return (
    <div className="league-standings-table-scroll">
      <table className="league-standings-table">
        <thead><tr><th>Seed</th><th>Team</th><th>Record</th><th className="is-desktop-only">Last 5</th><th>PF</th><th className="is-desktop-only">PA</th></tr></thead>
        <tbody>{rows.map((row) => {
          const inPlayoffs = historical && playoffTeamCount > 0 && row.seed <= playoffTeamCount;
          return (
            <tr key={row.participantId} className={inPlayoffs ? 'is-playoff-team' : ''}>
              <td><span className={`league-seed${inPlayoffs ? ' is-playoff-seed' : ''}`}>{row.seed}</span></td>
              <td><strong>{row.teamName}</strong><small>{row.managerName}{inPlayoffs ? ' · Playoffs' : ''}</small></td>
              <td className="league-standing-record"><b>{row.wins}</b><span>-</span><em>{row.losses}</em>{row.ties > 0 && <><span>-</span><i>{row.ties}</i></>}</td>
              <td className="is-desktop-only"><span className="league-standing-form" aria-label={`Recent form: ${row.recentForm.join(', ') || 'none'}`}>{row.recentForm.map((result, index) => <i key={`${result}-${index}`} className={`is-${result.toLowerCase()}`} title={result === 'W' ? 'Win' : result === 'L' ? 'Loss' : 'Tie'} />)}</span></td>
              <td>{formatScore(row.pointsFor)}</td>
              <td className="is-desktop-only">{formatScore(row.pointsAgainst)}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

function matchupSides(matchup, preserveOrder = false) {
  const sides = [
    { team: matchup.team1, seed: matchup.team1Seed, score: matchup.team1Score },
    { team: matchup.team2, seed: matchup.team2Seed, score: matchup.team2Score },
  ];
  return preserveOrder
    ? sides
    : sides.sort((left, right) => (left.seed ?? Number.POSITIVE_INFINITY) - (right.seed ?? Number.POSITIVE_INFINITY));
}

function toiletBowlOutcome(matchup) {
  if (matchup.team1Score == null || matchup.team2Score == null || matchup.team1Score === matchup.team2Score) {
    return matchup.winner ?? matchup.loser ?? null;
  }
  return matchup.team1Score < matchup.team2Score ? matchup.team1 : matchup.team2;
}

function isToiletBowlFinal(matchup) {
  const outcome = toiletBowlOutcome(matchup);
  return Boolean(outcome?.id && matchup.winner?.id && outcome.id === matchup.winner.id);
}

function sortBracketMatchups(matchups, { toiletBowl = false, terminal = false } = {}) {
  return [...matchups].sort((left, right) => {
    if (toiletBowl && terminal) {
      const placementOrder = (right.placement ?? Number.NEGATIVE_INFINITY) - (left.placement ?? Number.NEGATIVE_INFINITY);
      if (placementOrder) return placementOrder;
      const leftMain = Number(isToiletBowlFinal(left));
      const rightMain = Number(isToiletBowlFinal(right));
      if (leftMain !== rightMain) return rightMain - leftMain;
    }
    const leftSeed = Math.min(left.team1Seed ?? Number.POSITIVE_INFINITY, left.team2Seed ?? Number.POSITIVE_INFINITY);
    const rightSeed = Math.min(right.team1Seed ?? Number.POSITIVE_INFINITY, right.team2Seed ?? Number.POSITIVE_INFINITY);
    return leftSeed - rightSeed || left.id.localeCompare(right.id);
  });
}

function orderRoundsByProgression(roundEntries, toiletBowl = false) {
  const ordered = roundEntries.map(([round, matchups], index) => [
    round,
    sortBracketMatchups(matchups, { toiletBowl, terminal: index === roundEntries.length - 1 }),
  ]);
  for (let roundIndex = ordered.length - 2; roundIndex >= 0; roundIndex -= 1) {
    const current = ordered[roundIndex][1];
    const next = ordered[roundIndex + 1][1];
    const remaining = new Set(current);
    const progressionOrder = [];

    next.forEach((nextMatchup) => {
      [nextMatchup.team1Source, nextMatchup.team2Source].forEach((source) => {
        if (!source?.matchupId) return;
        const feeder = current.find((matchup) => remaining.has(matchup) && matchup.id === source.matchupId);
        if (!feeder) return;
        progressionOrder.push(feeder);
        remaining.delete(feeder);
      });
    });

    ordered[roundIndex][1] = [...progressionOrder, ...current.filter((matchup) => remaining.has(matchup))];
  }
  return ordered;
}

function BracketMatch({ matchup, title, final = false, minor = false, winnerLabel = '', toiletBowl = false, preserveOrder = toiletBowl }) {
  if (matchup.isBye) {
    return (
      <article className="league-bracket-matchup is-bye">
        <div className="league-bracket-matchup__bye-row">
          <span className="league-bracket-matchup__seed">{matchup.team1Seed ?? '—'}</span>
          <span className="league-bracket-matchup__team"><strong>{matchup.team1?.teamName ?? 'TBD'}</strong><small>{matchup.team1?.managerName ?? 'Awaiting result'}</small></span>
          <span className="league-bracket-matchup__bye">BYE</span>
        </div>
      </article>
    );
  }
  const sides = matchupSides(matchup, preserveOrder);
  const outcome = toiletBowl ? toiletBowlOutcome(matchup) : matchup.winner;
  return (
    <article className={`league-bracket-matchup${final ? ' is-final' : ''}${minor ? ' is-minor' : ''}${matchup.winner ? ' has-result' : ''}`}>
      {winnerLabel && outcome && (
        <div className={`league-champion-banner${toiletBowl ? ' is-toilet-bowl' : ''}`}>
          {toiletBowl
            ? <span className="league-toilet-bowl-glyph" aria-hidden="true">🚽</span>
            : <LeagueHistoryIcon name="trophy" tone="signature" variant="medallion" />}
          <span><small>{winnerLabel}</small><strong>{outcome.teamName}</strong></span>
        </div>
      )}
      {title && <span className="league-bracket-matchup__cap">{title}</span>}
      {sides.map((side, index) => {
        const winner = side.team?.id && side.team.id === outcome?.id;
        return (
          <div key={side.team?.id ?? index} className={winner ? 'is-winner' : ''}>
            <span className="league-bracket-matchup__seed">{side.seed ?? '—'}</span>
            <span className="league-bracket-matchup__team"><strong>{side.team?.teamName ?? 'TBD'}</strong><small>{side.team?.managerName ?? 'Awaiting result'}</small></span>
            <span className="league-bracket-matchup__score">{formatScore(side.score)}</span>
          </div>
        );
      })}
    </article>
  );
}

function collectBracketAncestors(rows, finalMatch) {
  const rowsById = new Map(rows.map((matchup) => [matchup.id, matchup]));
  const ids = new Set();
  const visit = (matchup) => {
    if (!matchup?.id || ids.has(matchup.id)) return;
    ids.add(matchup.id);
    [matchup.team1Source, matchup.team2Source].forEach((source) => visit(rowsById.get(source?.matchupId)));
  };
  visit(finalMatch);
  return ids;
}

function BracketGrid({ rows, allRounds, gridColumns, finalMatch = null, champion = false, toiletBowl = false, thirdPlace = null, placementLane = false }) {
  const rounds = new Map();
  rows.forEach((matchup) => {
    if (!rounds.has(matchup.round)) rounds.set(matchup.round, []);
    rounds.get(matchup.round).push(matchup);
  });
  const roundEntries = [...rounds.entries()].sort(([left], [right]) => left - right);
  const orderedRounds = orderRoundsByProgression(roundEntries, toiletBowl);
  const totalRows = Math.max(2, ...orderedRounds.map(([, matchups]) => matchups.length * 2));
  const lastRoundColumn = 1 + (allRounds.length - 1) * 2;
  const cells = [];

  orderedRounds.forEach(([round, matchups], roundIndex) => {
    const absoluteRoundIndex = allRounds.indexOf(round);
    const column = 1 + absoluteRoundIndex * 2;
    const matchSpan = Math.max(1, Math.floor(totalRows / Math.max(1, matchups.length)));
    if (!placementLane) {
      const roundName = absoluteRoundIndex === allRounds.length - 1
        ? toiletBowl ? 'Finals' : 'Championship'
        : absoluteRoundIndex === allRounds.length - 2
          ? toiletBowl ? `Round ${round}` : 'Semifinals'
          : `Round ${round}`;
      cells.push(
        <span className="league-bracket-round__label" key={`${round}-label`} style={{ gridColumn: column, gridRow: 1 }}>
          {roundName}{matchups[0]?.week ? ` · Week ${matchups[0].week}` : ''}
        </span>,
      );
    }
    matchups.forEach((matchup, matchupIndex) => {
      const isFinal = matchup === finalMatch;
      cells.push(
        <div
          className="league-bracket-cell"
          data-bracket-matchup={matchup.id}
          data-bracket-lane={placementLane ? 'placement' : 'main'}
          data-bracket-round={matchup.round}
          key={matchup.id}
          style={{ gridColumn: column, gridRow: `${2 + matchupIndex * matchSpan} / span ${matchSpan}` }}
        >
          <BracketMatch
            matchup={matchup}
            final={isFinal}
            minor={Boolean(matchup.placement) && !isFinal}
            title={matchup.placement && !isFinal ? `${ordinal(matchup.placement)} place${matchup.week ? ` · Week ${matchup.week}` : ''}` : ''}
            winnerLabel={isFinal ? (toiletBowl ? 'Toilet Bowl winner' : champion ? 'League champion' : '') : ''}
            toiletBowl={toiletBowl && !placementLane}
            preserveOrder={toiletBowl}
          />
        </div>,
      );
    });
    if (roundIndex < orderedRounds.length - 1) {
      const nextMatchups = orderedRounds[roundIndex + 1][1];
      const connectorSpan = Math.max(1, Math.floor(totalRows / Math.max(1, nextMatchups.length)));
      const currentMatchupIds = new Set(matchups.map((matchup) => matchup.id));
      nextMatchups.forEach((matchup, matchupIndex) => {
        const feederMatchupIds = [matchup.team1Source, matchup.team2Source]
          .map((source) => source?.matchupId)
          .filter((matchupId) => matchupId && currentMatchupIds.has(matchupId));
        const feederCount = feederMatchupIds.length;
        if (feederCount === 0) return;
        const feederIndex = feederCount === 1
          ? matchups.findIndex((candidate) => candidate.id === feederMatchupIds[0])
          : -1;
        const sourceCenter = feederIndex >= 0
          ? ((feederIndex * matchSpan + matchSpan / 2) / totalRows) * 100
          : null;
        const targetCenter = ((matchupIndex * connectorSpan + connectorSpan / 2) / totalRows) * 100;
        const offsetSingleFeeder = sourceCenter != null && Math.abs(sourceCenter - targetCenter) > 0.01;
        const connectorClass = offsetSingleFeeder
          ? ` is-single-offset ${sourceCenter < targetCenter ? 'is-source-above' : 'is-source-below'}`
          : feederCount < 2 ? ' is-straight' : '';
        const connectorStyle = offsetSingleFeeder
          ? {
            gridColumn: column + 1,
            gridRow: `2 / span ${totalRows}`,
            '--rail-top': `${Math.min(sourceCenter, targetCenter)}%`,
            '--rail-height': `${Math.abs(sourceCenter - targetCenter)}%`,
            '--rail-target': `${targetCenter}%`,
          }
          : { gridColumn: column + 1, gridRow: `${2 + matchupIndex * connectorSpan} / span ${connectorSpan}` };
        cells.push(
          <span
            aria-hidden="true"
            className={`league-bracket-connector${connectorClass}`}
            data-source-matchups={feederMatchupIds.join(',')}
            data-target-matchup={matchup.id}
            key={`${round}-connector-${matchup.id}`}
            style={connectorStyle}
          />,
        );
      });
    }
  });

  if (champion && thirdPlace) {
    cells.push(
      <div className="league-bracket-cell league-bracket-third" key="third-place" style={{ gridColumn: lastRoundColumn, gridRow: totalRows + 2 }}>
        <BracketMatch matchup={thirdPlace} title={`Third place${thirdPlace.week ? ` · Week ${thirdPlace.week}` : ''}`} minor />
      </div>,
    );
  }

  return (
    <div
      className={`league-bracket-layout${placementLane ? ' is-placement-lane' : ''}${orderedRounds.length === 1 ? ' has-one-round' : ''}`}
      style={{ gridTemplateColumns: gridColumns, gridTemplateRows: `auto repeat(${totalRows}, minmax(52px, 1fr)) auto` }}
    >
      {cells}
    </div>
  );
}

function Bracket({ title, rows, champion = false, toiletBowl = false, meta = 'Verified Sleeper bracket' }) {
  const viewportRef = useRef(null);
  const thirdPlace = champion ? rows.find((matchup) => matchup.placement === 3) ?? null : null;
  const bracketRows = rows.filter((matchup) => matchup !== thirdPlace);
  const allRounds = [...new Set(bracketRows.map((matchup) => matchup.round))].sort((left, right) => left - right);
  const terminalRound = allRounds.at(-1);
  const terminalMatches = sortBracketMatchups(
    bracketRows.filter((matchup) => matchup.round === terminalRound),
    { toiletBowl, terminal: true },
  );
  const finalMatch = toiletBowl
    ? terminalMatches.find(isToiletBowlFinal) ?? terminalMatches[0] ?? null
    : bracketRows.find((matchup) => matchup.placement === 1)
      ?? terminalMatches.find((matchup) => matchup.winner)
      ?? null;
  const mainIds = toiletBowl ? collectBracketAncestors(bracketRows, finalMatch) : new Set(bracketRows.map((matchup) => matchup.id));
  const mainRows = bracketRows.filter((matchup) => mainIds.has(matchup.id));
  const placementRows = toiletBowl ? bracketRows.filter((matchup) => !mainIds.has(matchup.id)) : [];
  const gridColumns = allRounds.map((_, index) => (
    index === allRounds.length - 1
      ? 'minmax(var(--league-bracket-card-width), 1.05fr)'
      : 'minmax(var(--league-bracket-card-width), 1fr)'
  )).join(' 36px ');
  const minimumWidth = `calc(${allRounds.map(() => 'var(--league-bracket-card-width)').join(' + ')} + ${Math.max(0, allRounds.length - 1) * 36}px)`;
  const scrollCue = useHorizontalScrollCue(viewportRef, [minimumWidth, placementRows.length]);

  return (
    <section className="league-history-section league-bracket-section">
      <SectionHeading title={title} meta={meta} icon="trophy" />
      <div className="league-bracket-viewport-shell">
        <div ref={viewportRef} className="league-bracket-viewport">
          <div className="league-bracket-stack" style={{ minWidth: minimumWidth }}>
            <BracketGrid
              rows={mainRows}
              allRounds={allRounds}
              gridColumns={gridColumns}
              finalMatch={finalMatch}
              champion={champion}
              toiletBowl={toiletBowl}
              thirdPlace={thirdPlace}
            />
            {placementRows.length > 0 && (
              <div className="league-bracket-placement">
                <span className="league-bracket-placement__label">Placement games</span>
                <BracketGrid rows={placementRows} allRounds={allRounds} gridColumns={gridColumns} toiletBowl placementLane />
              </div>
            )}
          </div>
        </div>
        <HorizontalScrollCue
          left={scrollCue.left}
          right={scrollCue.right}
          targetRef={viewportRef}
          label={`${title} bracket`}
          className="horizontal-scroll-cue--league-bracket"
        />
      </div>
    </section>
  );
}

function losersBracketPresentation(type) {
  if (type === 'toilet-bowl') return { title: 'Toilet Bowl', meta: 'Loser advances · verified Sleeper bracket' };
  if (type === 'consolation') return { title: 'Consolation Bracket', meta: 'Winner advances · verified Sleeper bracket' };
  return { title: 'Losers Bracket', meta: 'Verified Sleeper bracket' };
}

export default function CompanionStandings() {
  const history = useLeagueHistoryData();
  const snapshot = history.snapshots?.find((entry) => String(entry.season) === history.season) ?? null;
  const historical = Boolean(snapshot?.completed);
  const standings = useMemo(() => snapshot ? buildSeasonStandings(snapshot, { historical }) : null, [snapshot, historical]);
  const brackets = useMemo(() => snapshot ? normalizeSeasonBrackets(snapshot) : null, [snapshot]);
  const hasStandings = Boolean(standings?.rows?.length && standings.throughWeek > 0);
  const state = <LeagueHistoryState platform={history.platform} loading={history.loading} error={history.error} empty={!hasStandings} noun="Standings" season={history.season} priorSeasonCount={Math.max(0, history.eligibleLeagueHistory.length - 1)} onRetry={history.retry} />;
  if (history.platform !== 'sleeper' || history.loading || history.error || !hasStandings) {
    return <div className="league-history-page league-history-page--state" data-tour="league-standings-content">{state}</div>;
  }
  const playoffTeamCount = standings.playoffTeamCount || Math.min(4, standings.rows.length);
  const losersBracket = losersBracketPresentation(brackets?.losersBracketType);
  return (
    <div className="league-history-page league-standings-page" data-tour="league-standings-content">
      <header className="league-history-heading">
        <div><span className="league-history-eyebrow">{historical ? 'Final table' : 'Frozen live table'}</span><h1>{history.season} Standings</h1><p>Results through completed <strong>Week {standings.throughWeek}</strong>. In-progress scoring never changes this order.</p></div>
      </header>
      <div className="league-division-grid">
        {standings.divisions.map((division) => (
          <section key={division.id} className="league-history-section">
            <SectionHeading title={division.label} meta={historical ? null : 'League seed at left'} />
            <StandingRows rows={division.rows} historical={historical} playoffTeamCount={playoffTeamCount} />
          </section>
        ))}
      </div>
      {historical && brackets?.hasChampionship && <Bracket title="Championship playoff" rows={brackets.championship} champion />}
      {historical && brackets?.hasConsolation && <Bracket title={losersBracket.title} meta={losersBracket.meta} rows={brackets.consolation} toiletBowl={brackets.losersBracketType === 'toilet-bowl'} />}
      {!historical && (
        <div className="league-standings-live-note">
          <LeagueHistoryIcon name="target" tone="blue" size="sm" />
          <span>Playoffs begin <strong>Week {snapshot?.league?.settings?.playoff_week_start ?? '—'}</strong> — the bracket appears here once Sleeper finalizes seeding.</span>
        </div>
      )}
    </div>
  );
}
