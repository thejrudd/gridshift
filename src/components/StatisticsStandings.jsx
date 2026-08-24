import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import useMediaQuery from '../hooks/useMediaQuery';
import { buildStatisticsStandings } from '../utils/statisticsStandings';
import { getTeamVisualTheme } from '../utils/teamVisualTheme';

const MOBILE_COLUMN_WIDTHS = ['8%', '22%', '14%', '13%', '13%', '15%', '15%'];
const MOBILE_CELL_STYLE = {
  padding: '8px 2px',
  overflow: 'hidden',
  letterSpacing: '0.02em',
  textOverflow: 'clip',
  whiteSpace: 'nowrap',
};

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

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
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

function TeamIdentity({ team, compact = false }) {
  const name = getTeamName(team);
  return (
    <div
      className={`statistics-standings-team${compact ? ' statistics-standings-team--compact' : ''}`}
      aria-label={name}
      style={compact ? { gap: '3px' } : undefined}
    >
      {team?.id && (
        <img
          src={teamLogo(team.id)}
          alt=""
          className="statistics-standings-team-logo"
          style={compact ? { width: '20px', height: '20px' } : undefined}
          loading="lazy"
          decoding="async"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      )}
      <div className="statistics-standings-team-copy">
        <abbr
          className="statistics-standings-team-code"
          title={name}
          style={compact ? { fontSize: 'var(--type-label)', textDecoration: 'none' } : undefined}
        >
          {team?.id ?? 'TBD'}
        </abbr>
        {!compact && <span className="statistics-standings-team-name">{name}</span>}
      </div>
    </div>
  );
}

function StandingRow({ row, darkMode, compact }) {
  return (
    <tr className="statistics-standings-row" style={getStandingRowStyle(row.team, darkMode)}>
      <td style={compact ? MOBILE_CELL_STYLE : undefined}>
        <span className="statistics-standings-rank">{row.rank}</span>
      </td>
      <td style={compact ? MOBILE_CELL_STYLE : undefined}>
        <TeamIdentity team={row.team} compact={compact} />
      </td>
      <td className="statistics-standings-record" style={compact ? MOBILE_CELL_STYLE : undefined}>{formatRecord(row.wins, row.losses, row.ties)}</td>
      <td style={compact ? MOBILE_CELL_STYLE : undefined}>{formatPct(row.winPct)}</td>
      <td style={compact ? MOBILE_CELL_STYLE : undefined}>{formatRecord(row.divisionWins, row.divisionLosses, row.divisionTies)}</td>
      <td style={compact ? MOBILE_CELL_STYLE : undefined}>{formatRecord(row.conferenceWins, row.conferenceLosses, row.conferenceTies)}</td>
      <td style={compact ? MOBILE_CELL_STYLE : undefined}>{formatDiff(row.pointDifferential)}</td>
    </tr>
  );
}

function CompactHeading({ compact, full, short = full }) {
  return compact ? <abbr title={full} style={{ textDecoration: 'none' }}>{short}</abbr> : full;
}

function StandingsTableCard({ group, darkMode, scope, compact }) {
  return (
    <section className="statistics-standings-table-card">
      <header className="statistics-standings-table-header">
        <span>{group.label}</span>
        <span>{pluralize(group.rows.length, 'team')}</span>
      </header>
      <div
        className="statistics-standings-table-scroll"
        style={compact ? { overflowX: 'hidden' } : undefined}
      >
        <table
          className="statistics-standings-table"
          aria-label={`${group.label} ${scope} standings`}
          style={compact ? { minWidth: 0, tableLayout: 'fixed' } : undefined}
        >
          {compact && (
            <colgroup>
              {MOBILE_COLUMN_WIDTHS.map((width, index) => <col key={`${group.id}-column-${index}`} style={{ width }} />)}
            </colgroup>
          )}
          <thead>
            <tr>
              <th style={compact ? MOBILE_CELL_STYLE : undefined}><CompactHeading compact={compact} full="Rank" short="#" /></th>
              <th style={compact ? MOBILE_CELL_STYLE : undefined}>Team</th>
              <th style={compact ? MOBILE_CELL_STYLE : undefined}><CompactHeading compact={compact} full="Record" short="Rec" /></th>
              <th style={compact ? MOBILE_CELL_STYLE : undefined}><CompactHeading compact={compact} full="Winning percentage" short="Pct" /></th>
              <th style={compact ? MOBILE_CELL_STYLE : undefined}><CompactHeading compact={compact} full="Division record" short="Div" /></th>
              <th style={compact ? MOBILE_CELL_STYLE : undefined}><CompactHeading compact={compact} full="Conference record" short="Conf" /></th>
              <th style={compact ? MOBILE_CELL_STYLE : undefined}><CompactHeading compact={compact} full="Point differential" short="+/-" /></th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => (
              <StandingRow key={row.teamId} row={row} darkMode={darkMode} compact={compact} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StandingsPanel({ eyebrow, title, summary, groups, darkMode, scope, compact }) {
  return (
    <section className="statistics-standings-panel">
      <header className="statistics-schedule-section-header">
        <p className="statistics-schedule-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <span>{summary}</span>
      </header>
      <div className="statistics-standings-grid">
        {groups.map((group) => (
          <StandingsTableCard
            key={group.id}
            group={group}
            darkMode={darkMode}
            scope={scope}
            compact={compact}
          />
        ))}
      </div>
    </section>
  );
}

export default function StatisticsStandings({ teams = [], scheduleData = {} }) {
  const { darkMode } = useTheme();
  const compact = useMediaQuery('(max-width: 639px)');
  const standings = useMemo(
    () => buildStatisticsStandings({ teams, scheduleData }),
    [teams, scheduleData],
  );
  const seasonLabel = standings.season ? `${standings.season}` : 'NFL';
  const finalLabel = `${pluralize(standings.completedGames, 'final game')} - ${pluralize(standings.scheduledGames, 'scheduled game')}`;

  return (
    <div className="statistics-standings">
      <header className="statistics-schedule-toolbar statistics-standings-toolbar">
        <div className="statistics-schedule-toolbar-copy">
          <p className="statistics-schedule-eyebrow">NFL standings</p>
          <h1>{seasonLabel} Standings</h1>
          <span>{finalLabel}</span>
        </div>
        <div className="statistics-standings-summary" aria-label="Standings summary">
          <span>
            <strong>{standings.divisionGroups.length}</strong>
            Divisions
          </span>
          <span>
            <strong>{standings.conferenceGroups.length}</strong>
            Conferences
          </span>
        </div>
      </header>

      <StandingsPanel
        eyebrow="Division table"
        title="Division Standings"
        summary={pluralize(standings.divisionGroups.length, 'division')}
        groups={standings.divisionGroups}
        darkMode={darkMode}
        scope="division"
        compact={compact}
      />

      <StandingsPanel
        eyebrow="Conference table"
        title="Conference Standings"
        summary={pluralize(standings.conferenceGroups.length, 'conference')}
        groups={standings.conferenceGroups}
        darkMode={darkMode}
        scope="conference"
        compact={compact}
      />
    </div>
  );
}
