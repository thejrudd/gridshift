import { ordinal } from '../../../utils/playerSeason/dashboardModel.js';
import { TeamMark } from '../player/DashboardParts.jsx';

/** Record, home/away split, division place, and next game for one team-season. */
function seasonSummary(data, team) {
  if (!data) return null;
  const teams = data.teams ?? {};
  const me = teams[team] ?? {};
  const games = data.games ?? [];
  const wins = games.filter((game) => game.pf > game.pa).length;
  const ties = games.filter((game) => game.pf === game.pa).length;
  const home = games.filter((game) => game.home);
  const homeWins = home.filter((game) => game.pf > game.pa).length;
  const awayWins = wins - homeWins;
  const division = (data.standings ?? [])
    .filter((row) => teams[row.t]?.conf === me.conf && teams[row.t]?.div === me.div)
    .sort((a, b) => b.w - a.w || a.l - b.l || (b.pf - b.pa) - (a.pf - a.pa));
  const leader = division[0];
  return {
    record: `${wins}–${games.length - wins - ties}${ties ? `–${ties}` : ''}`,
    split: `${homeWins}–${home.length - homeWins} home · ${awayWins}–${games.length - home.length - awayWins} away`,
    place: division.findIndex((row) => row.t === team) + 1,
    divisionName: `${me.conf ?? ''} ${me.div ? me.div[0] + me.div.slice(1).toLowerCase() : ''}`.trim(),
    leaderNote: leader && leader.t !== team ? `${leader.t} leads at ${leader.w}–${leader.l}` : 'Division leader',
    next: data.schedule?.[0] ?? null,
    teams,
  };
}

function Pod({ value, label, note }) {
  return (
    <div className="statistics-team-hero__pod">
      <span className="statistics-team-hero__pod-value">{value}</span>
      <span className="statistics-team-hero__pod-label">{label}</span>
      {note && <span className="statistics-team-hero__pod-note">{note}</span>}
    </div>
  );
}

/**
 * Statistics team hero: identity, the selected season's record and division
 * place beside franchise honors, and the next game. Colors come from the
 * team's palette through CSS custom properties set by the caller.
 */
export default function TeamHero({ team, teamAbbr, history, season, seasonData, darkMode, colors, onViewSchedule, onOpenNextGame }) {
  const teamKey = team.id.toLowerCase();
  const summary = seasonSummary(seasonData, teamAbbr);
  const next = summary?.next;
  const logoUrl = `https://a.espncdn.com/i/teamlogos/nfl/500/${teamKey}.png`;
  return (
    <div className="statistics-team-hero" style={colors}>
      <img
        src={`/maps/${teamKey}.png`}
        aria-hidden="true"
        alt=""
        className="statistics-team-hero__map"
        onError={(event) => { event.currentTarget.style.display = 'none'; }}
      />
      <img src={logoUrl} alt="" aria-hidden="true" className="statistics-team-hero__watermark" onError={(event) => { event.currentTarget.style.display = 'none'; }} />

      <div className="statistics-team-hero__inner">
        <div className="statistics-team-hero__layout">
          <div className="statistics-team-hero__main">
            <div className="statistics-team-hero__identity">
              <img src={logoUrl} alt={team.name} className="statistics-team-hero__logo" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
              <div className="min-w-0">
                <h1 className="statistics-team-hero__title">{team.name}</h1>
                {history && <p className="statistics-team-hero__meta">{history.city}, {history.state} · Est. {history.founded} · {history.stadium}</p>}
              </div>
            </div>

            <div className="statistics-team-hero__pods">
              {summary && <Pod value={summary.record} label={`${season} record`} note={summary.split} />}
              {summary?.place > 0 && <Pod value={ordinal(summary.place)} label={summary.divisionName} note={summary.leaderNote} />}
              {history && (
                <Pod
                  value={history.superBowls}
                  label={history.superBowls === 1 ? 'Super Bowl' : 'Super Bowls'}
                  note={history.superBowlYears.length > 0 ? history.superBowlYears.join(', ') : null}
                />
              )}
              {history && <Pod value={history.divisionTitles} label={history.divisionTitles === 1 ? 'Division title' : 'Division titles'} />}
            </div>
          </div>

          {onViewSchedule && (
            <div className="statistics-team-hero__action-wrap">
              <button type="button" onClick={onViewSchedule} className="statistics-team-hero__schedule-button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M8 3v4M16 3v4M4 10h16M8 14h2M13 14h3M8 17h2M13 17h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                View Schedule
              </button>
            </div>
          )}
        </div>

        {next && onOpenNextGame && (
          <button
            type="button"
            className="statistics-team-hero__next is-link"
            onClick={() => onOpenNextGame(next)}
            aria-label={`Open the Week ${next.week} matchup ${next.home ? 'against' : 'at'} ${summary.teams[next.opp]?.name ?? next.opp} in the schedule`}
          >
            <span className="statistics-team-hero__tag">Next game</span>
            <span className="statistics-team-hero__next-opp">
              <TeamMark abbr={next.opp} darkMode={darkMode} size={22} />
              <b>{next.home ? 'vs' : 'at'} {summary.teams[next.opp]?.name ?? next.opp}</b>
            </span>
            <span>{new Date(next.date).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            {next.venue && <span>{next.venue}</span>}
            <span>Week {next.week}</span>
            <span className="statistics-team-hero__next-cta" aria-hidden="true">Matchup ›</span>
          </button>
        )}
        {next && !onOpenNextGame && (
          <div className="statistics-team-hero__next">
            <span className="statistics-team-hero__tag">Next game</span>
            <span className="statistics-team-hero__next-opp">
              <TeamMark abbr={next.opp} darkMode={darkMode} size={22} />
              <b>{next.home ? 'vs' : 'at'} {summary.teams[next.opp]?.name ?? next.opp}</b>
            </span>
            <span>{new Date(next.date).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            {next.venue && <span>{next.venue}</span>}
            <span>Week {next.week}</span>
          </div>
        )}
      </div>
    </div>
  );
}
