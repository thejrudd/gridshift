import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import useMediaQuery from '../hooks/useMediaQuery';
import { buildStatisticsStandings } from '../utils/statisticsStandings';
import { getTeamVisualTheme } from '../utils/teamVisualTheme';

const SCOPE_LABELS = { division: 'Division', conference: 'Conference' };

const COLUMNS = [
  { key: 'rank', full: 'Rank', short: '#' },
  { key: 'team', full: 'Team' },
  { key: 'record', full: 'Record', short: 'Rec' },
  { key: 'pct', full: 'Winning percentage', short: 'Pct' },
  { key: 'division', full: 'Division record', short: 'Div' },
  { key: 'conference', full: 'Conference record', short: 'Conf' },
  { key: 'differential', full: 'Point differential', short: '+/-' },
];

const teamLogo = (teamId) => `https://a.espncdn.com/i/teamlogos/nfl/500/${String(teamId).toLowerCase()}.png`;

function getTeamName(team = {}) {
  return team.name || [team.city, team.nickname].filter(Boolean).join(' ') || team.id || 'TBD';
}

function formatRecord(wins = 0, losses = 0, ties = 0) {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function formatPct(value = 0) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return safeValue.toFixed(3).replace(/^0/, '');
}

function formatDiff(value = 0) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function getStandingRowStyle(team, darkMode) {
  const theme = getTeamVisualTheme(team?.id, darkMode, { logoSide: 'start' });
  if (!theme?.gradient) return undefined;

  return {
    '--statistics-standings-row-bg': theme.gradient,
    '--statistics-standings-row-fg': theme.gradientFullForeground ?? theme.gradientForeground,
    '--statistics-standings-row-muted': theme.gradientFullMuted ?? theme.gradientMuted,
    '--statistics-standings-row-border': theme.borderColor,
  };
}

function TeamIdentity({ team, compact }) {
  const name = getTeamName(team);
  return (
    <div className="statistics-standings-team" aria-label={name}>
      {team?.id && (
        <img
          src={teamLogo(team.id)}
          alt=""
          className="statistics-standings-team-logo"
          loading="lazy"
          decoding="async"
          onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
        />
      )}
      <div className="statistics-standings-team-copy">
        <abbr className="statistics-standings-team-code" title={name}>{team?.id ?? 'TBD'}</abbr>
        {!compact && <span className="statistics-standings-team-name">{name}</span>}
      </div>
    </div>
  );
}

function StandingRow({ row, darkMode, compact }) {
  return (
    <div className="statistics-standings-row" role="row" style={getStandingRowStyle(row.team, darkMode)}>
      <div className="statistics-standings-cell" role="cell"><span className="statistics-standings-rank">{row.rank}</span></div>
      <div className="statistics-standings-cell" role="cell"><TeamIdentity team={row.team} compact={compact} /></div>
      <div className="statistics-standings-cell statistics-standings-record" role="cell">{formatRecord(row.wins, row.losses, row.ties)}</div>
      <div className="statistics-standings-cell" role="cell">{formatPct(row.winPct)}</div>
      <div className="statistics-standings-cell" role="cell">{formatRecord(row.divisionWins, row.divisionLosses, row.divisionTies)}</div>
      <div className="statistics-standings-cell" role="cell">{formatRecord(row.conferenceWins, row.conferenceLosses, row.conferenceTies)}</div>
      <div className="statistics-standings-cell" role="cell">{formatDiff(row.pointDifferential)}</div>
    </div>
  );
}

// One table per scope: the column header freezes at the top of the scroll
// area, and each division/conference group header freezes just below it while
// that group's rows scroll past underneath.
//
// This is built from divs with ARIA table roles instead of a real <table>
// specifically so each group is a genuine block container — the same reason
// Schedule's div-per-group kickoff headers hand off to each other for free.
// A sticky cell inside a <tbody>/<tr> has no such containing block (table row
// groups don't bound sticky descendants), so every group's header would lock
// into the same slot and stack instead of releasing; a plain div doesn't have
// that problem, and needs no JS to work around it.
function StandingsSection({ scope, groups, darkMode, compact, abbreviate }) {
  const scopeLabel = SCOPE_LABELS[scope] ?? scope;
  return (
    <section className="statistics-standings-section">
      <div className="statistics-standings-table" role="table" aria-label={`${scopeLabel} standings`}>
        <div className="statistics-standings-thead-row" role="row">
          {COLUMNS.map((column) => (
            <div key={column.key} className="statistics-standings-th" role="columnheader">
              {abbreviate && column.short
                ? <abbr title={column.full}>{column.short}</abbr>
                : column.full}
            </div>
          ))}
        </div>
        {groups.map((group) => (
          <div key={group.id} className="statistics-standings-group" role="rowgroup">
            <div className="statistics-standings-group-row" role="row">
              <div className="statistics-standings-group-name-cell" role="columnheader" aria-colspan={COLUMNS.length}>
                <span className="statistics-standings-group-name">{group.label}</span>
              </div>
            </div>
            {group.rows.map((row) => (
              <StandingRow key={row.teamId} row={row} darkMode={darkMode} compact={compact} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function StatisticsStandings({ teams = [], scheduleData = {} }) {
  const { darkMode } = useTheme();
  // Two independent narrowing steps: column labels abbreviate before the team
  // column gets tight enough that the full team name would have to be clipped.
  const abbreviate = useMediaQuery('(max-width: 1179px)');
  const compact = useMediaQuery('(max-width: 639px)');
  const standings = useMemo(
    () => buildStatisticsStandings({ teams, scheduleData }),
    [teams, scheduleData],
  );

  return (
    <div className="statistics-standings">
      <StandingsSection
        scope="division"
        groups={standings.divisionGroups}
        darkMode={darkMode}
        compact={compact}
        abbreviate={abbreviate}
      />

      <StandingsSection
        scope="conference"
        groups={standings.conferenceGroups}
        darkMode={darkMode}
        compact={compact}
        abbreviate={abbreviate}
      />
    </div>
  );
}
