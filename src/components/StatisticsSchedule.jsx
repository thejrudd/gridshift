import { useEffect, useMemo, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import HorizontalScrollCue from './HorizontalScrollCue';
import useHorizontalScrollCue from '../hooks/useHorizontalScrollCue';
import {
  TEAM_LOGO_SIDE_SENSITIVE_GRADIENT_TEAMS,
  getTeamVisualTheme,
  mixHex,
  pickReadableForeground,
} from '../utils/teamVisualTheme';
import {
  STATISTICS_SCHEDULE_FILTERS,
  STATISTICS_SCHEDULE_MODES,
  buildTeamScheduleRows,
  filterTeamScheduleRows,
  getDefaultScheduleWeek,
  getGameKickoffMs,
  getPopulatedScheduleWeeks,
  getScheduleGameTeamId,
  getScheduleGameScore,
  getScheduleWeeks,
  getWeekScheduleGames,
  isFinalScheduleGame,
  normalizeScheduleTeamId,
  normalizeScheduleWeek,
  normalizeStatisticsScheduleFilter,
  normalizeStatisticsScheduleMode,
  scheduleGameMatchesFilter,
  scheduleHasGames,
} from '../utils/statisticsSchedule';

const SCHEDULE_MODE_STORAGE_KEY = 'gridshift.statisticsScheduleMode';
const DIVISION_ORDER = [
  'AFC East',
  'AFC North',
  'AFC South',
  'AFC West',
  'NFC East',
  'NFC North',
  'NFC South',
  'NFC West',
];
const PRIMARY_SCHEDULE_MODES = new Set([
  STATISTICS_SCHEDULE_MODES.WEEK,
  STATISTICS_SCHEDULE_MODES.TEAM,
]);
const SCHEDULE_FILTER_OPTIONS = [
  { filter: STATISTICS_SCHEDULE_FILTERS.ALL, label: 'All Games' },
  { filter: STATISTICS_SCHEDULE_FILTERS.INTERNATIONAL, label: 'International' },
  { filter: STATISTICS_SCHEDULE_FILTERS.PRIMETIME, label: 'PrimeTime' },
  { filter: STATISTICS_SCHEDULE_FILTERS.HOLIDAY, label: 'Holiday' },
];
const SCHEDULE_LOGO_CONTRAST_GRADIENT_TEAMS = new Set([
  ...TEAM_LOGO_SIDE_SENSITIVE_GRADIENT_TEAMS,
  'la',
  'lar',
]);

const teamLogo = (teamId) => `https://a.espncdn.com/i/teamlogos/nfl/500/${String(teamId).toLowerCase()}.png`;

function readStoredMode() {
  try {
    const mode = normalizeStatisticsScheduleMode(localStorage.getItem(SCHEDULE_MODE_STORAGE_KEY), STATISTICS_SCHEDULE_MODES.WEEK);
    return PRIMARY_SCHEDULE_MODES.has(mode) ? mode : STATISTICS_SCHEDULE_MODES.WEEK;
  } catch {
    return STATISTICS_SCHEDULE_MODES.WEEK;
  }
}

function writeStoredMode(mode) {
  if (!PRIMARY_SCHEDULE_MODES.has(mode)) return;
  try {
    localStorage.setItem(SCHEDULE_MODE_STORAGE_KEY, mode);
  } catch {
    // Local storage is a preference only; routing remains the source of truth.
  }
}

function formatKickoffDate(value) {
  if (!value) return 'Date TBD';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date TBD';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatKickoffTime(value) {
  if (!value) return 'Time TBD';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time TBD';
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatKickoffSlot(value) {
  if (!value) return 'Kickoff TBD';
  return `${formatKickoffDate(value)} · ${formatKickoffTime(value)}`;
}

function formatVenue(value) {
  if (typeof value !== 'string' || !value.trim()) return 'Venue TBD';
  return value.trim().replace(/, USA$/, '');
}

function getTeamName(team, fallbackId) {
  return team?.name || team?.nickname || fallbackId || 'TBD';
}

function getTeamCode(team, fallbackId) {
  return team?.id || fallbackId || 'TBD';
}

function getBroadcasts(game = {}) {
  const broadcasts = Array.isArray(game.broadcasts)
    ? game.broadcasts.filter((broadcast) => broadcast?.name)
    : [];
  if (broadcasts.length > 0) return broadcasts;
  return [{ name: game.network || 'TV TBD' }];
}

function BroadcastDisplay({ game, darkMode }) {
  const broadcasts = getBroadcasts(game);
  const label = broadcasts.map((broadcast) => broadcast.name).join(' / ');

  return (
    <span className="statistics-schedule-broadcast" title={label} aria-label={label}>
      {broadcasts.map((broadcast) => {
        const src = darkMode ? (broadcast.darkLogo || broadcast.logo) : (broadcast.logo || broadcast.darkLogo);
        return src ? (
          <span key={broadcast.name} className="statistics-schedule-broadcast-logo">
            <img
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
                event.currentTarget.nextSibling?.removeAttribute('hidden');
              }}
            />
            <span hidden>{broadcast.name}</span>
          </span>
        ) : (
          <span
            key={broadcast.name}
            className={`statistics-schedule-network${/^netflix$/i.test(broadcast.name) ? ' statistics-schedule-network--netflix' : ''}`}
          >
            {broadcast.name}
          </span>
        );
      })}
    </span>
  );
}

function mutedForRowForeground(foreground) {
  return foreground === '#FFFFFF'
    ? 'rgba(255,255,255,0.72)'
    : 'rgba(12,15,20,0.66)';
}

function subtleForRowForeground(foreground) {
  return foreground === '#FFFFFF'
    ? 'rgba(255,255,255,0.18)'
    : 'rgba(12,15,20,0.14)';
}

function getMatchupRowPresentation(awayTeamId, homeTeamId, darkMode) {
  const awayTheme = getTeamVisualTheme(awayTeamId, darkMode, { middleStop: false });
  const homeTheme = getTeamVisualTheme(homeTeamId, darkMode, { middleStop: false });
  const getScheduleGradientStop = (teamId, theme) => {
    const key = String(teamId ?? theme?.logoKey ?? '').toLowerCase();
    const logoKey = String(theme?.logoKey ?? '').toLowerCase();
    const palette = theme?.palette;
    if (!palette) return theme?.primary ?? theme?.color;
    const primary = darkMode
      ? (palette.darkPrimary ?? palette.primary)
      : palette.primary;
    if (SCHEDULE_LOGO_CONTRAST_GRADIENT_TEAMS.has(key) || SCHEDULE_LOGO_CONTRAST_GRADIENT_TEAMS.has(logoKey)) {
      return palette.secondary ?? palette.darkSecondary ?? primary;
    }
    return primary ?? theme?.primary ?? theme?.color;
  };
  const start = getScheduleGradientStop(awayTeamId, awayTheme);
  const end = getScheduleGradientStop(homeTeamId, homeTheme);

  if (!start || !end) {
    return {
      style: {
        '--statistics-schedule-row-accent': homeTheme?.borderColor ?? awayTheme?.borderColor ?? 'var(--color-separator)',
      },
      preferDarkBroadcastLogo: darkMode,
    };
  }

  const mid = mixHex(start, end, 0.5);
  const foreground = pickReadableForeground([start, mid, end]);
  const scrim = foreground === '#FFFFFF'
    ? 'linear-gradient(90deg, rgba(12,15,20,0.40) 0%, rgba(12,15,20,0.34) 50%, rgba(12,15,20,0.40) 100%)'
    : 'linear-gradient(90deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0.22) 100%)';
  const gradient = `linear-gradient(90deg, ${start} 0%, ${mid} 50%, ${end} 100%)`;
  const background = `${scrim}, ${gradient}`;

  return {
    style: {
      '--statistics-schedule-row-accent': start,
      '--statistics-schedule-row-bg': background,
      '--statistics-schedule-row-hover-bg': background,
      '--statistics-schedule-row-fg': foreground,
      '--statistics-schedule-row-muted': mutedForRowForeground(foreground),
      '--statistics-schedule-row-subtle': subtleForRowForeground(foreground),
    },
    preferDarkBroadcastLogo: foreground === '#FFFFFF',
  };
}

function getGameStatsEventId(game = {}) {
  return game.espnEventId || game.eventId || null;
}

function GameResultBadge({ game, selectedTeamId = null }) {
  if (!isFinalScheduleGame(game)) return null;

  const awayTeamId = getScheduleGameTeamId(game, 'away');
  const homeTeamId = getScheduleGameTeamId(game, 'home');
  const awayScore = getScheduleGameScore(game, 'away');
  const homeScore = getScheduleGameScore(game, 'home');
  if (awayScore == null || homeScore == null) return null;

  const selectedId = normalizeScheduleTeamId(selectedTeamId);
  let tone = 'neutral';
  let label = `Final ${awayTeamId} ${awayScore}, ${homeTeamId} ${homeScore}`;

  if (selectedId === awayTeamId || selectedId === homeTeamId) {
    const selectedScore = selectedId === awayTeamId ? awayScore : homeScore;
    const opponentScore = selectedId === awayTeamId ? homeScore : awayScore;
    const outcome = selectedScore === opponentScore ? 'T' : selectedScore > opponentScore ? 'W' : 'L';
    tone = outcome === 'W' ? 'win' : outcome === 'L' ? 'loss' : 'tie';
    label = `${outcome} ${selectedScore}-${opponentScore}`;
  }

  return (
    <span className={`statistics-schedule-result-badge is-${tone}`}>
      {label}
    </span>
  );
}

function GameStatsAction({ game, onViewGameStats }) {
  if (!onViewGameStats || !isFinalScheduleGame(game) || !getGameStatsEventId(game)) return null;

  return (
    <button
      type="button"
      className="statistics-schedule-game-stats-button"
      onClick={() => onViewGameStats(game)}
    >
      Game Stats
    </button>
  );
}

function buildKickoffGroups(games = []) {
  const sortedGames = [...games].sort((left, right) => {
    const leftMs = getGameKickoffMs(left);
    const rightMs = getGameKickoffMs(right);
    if (leftMs == null && rightMs == null) return String(left.id ?? '').localeCompare(String(right.id ?? ''));
    if (leftMs == null) return 1;
    if (rightMs == null) return -1;
    return leftMs - rightMs;
  });

  const groups = [];
  for (const game of sortedGames) {
    const kickoffMs = getGameKickoffMs(game);
    const key = kickoffMs == null ? 'tbd' : String(kickoffMs);
    const current = groups[groups.length - 1];
    if (current?.key === key) {
      current.games.push(game);
    } else {
      groups.push({
        key,
        kickoff: kickoffMs == null ? null : game.kickoff,
        games: [game],
      });
    }
  }

  return groups;
}

function ModeButton({ mode, activeMode, label, onClick, variant = 'primary' }) {
  const active = activeMode === mode;
  return (
    <button
      type="button"
      className={`statistics-schedule-mode-button statistics-schedule-mode-button--${variant}${active ? ' is-active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function getFilterLabel(filter) {
  return SCHEDULE_FILTER_OPTIONS.find((option) => option.filter === filter)?.label ?? 'All Games';
}

function FilterChip({ filter, activeFilter, label, available, onClick }) {
  const active = activeFilter === filter;
  return (
    <button
      type="button"
      className={`statistics-schedule-filter-chip${active ? ' is-active' : ''}`}
      aria-pressed={active}
      disabled={!available}
      onClick={onClick}
      title={available ? label : `${label} is not available in this view`}
    >
      {label}
    </button>
  );
}

function getFilterAvailability(games = []) {
  return SCHEDULE_FILTER_OPTIONS.reduce((availability, option) => {
    availability[option.filter] = option.filter === STATISTICS_SCHEDULE_FILTERS.ALL
      ? games.length > 0
      : games.some((game) => scheduleGameMatchesFilter(game, option.filter));
    return availability;
  }, {});
}

function getAvailableFilterForGames(games = [], filter = STATISTICS_SCHEDULE_FILTERS.ALL) {
  if (filter === STATISTICS_SCHEDULE_FILTERS.ALL) return filter;
  return games.some((game) => scheduleGameMatchesFilter(game, filter))
    ? filter
    : STATISTICS_SCHEDULE_FILTERS.ALL;
}

function ScheduleFilterChips({ activeFilter, availability, onFilterChange }) {
  return (
    <div className="statistics-schedule-filter-rail" role="group" aria-label="Schedule filters">
      {SCHEDULE_FILTER_OPTIONS.map((option) => (
        <FilterChip
          key={option.filter}
          filter={option.filter}
          activeFilter={activeFilter}
          label={option.label}
          available={availability?.[option.filter] ?? true}
          onClick={() => onFilterChange(option.filter)}
        />
      ))}
    </div>
  );
}

function TeamIdentity({ team, fallbackId, compact = false }) {
  const code = getTeamCode(team, fallbackId);
  return (
    <div className={`statistics-schedule-team-identity${compact ? ' statistics-schedule-team-identity--compact' : ''}`}>
      {code !== 'TBD' && (
        <img
          src={teamLogo(code)}
          alt=""
          className="statistics-schedule-team-logo"
          loading="lazy"
          decoding="async"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      )}
      <div className="statistics-schedule-team-copy">
        <span className="statistics-schedule-team-code">{code}</span>
        {!compact && <span className="statistics-schedule-team-name">{getTeamName(team, fallbackId)}</span>}
      </div>
    </div>
  );
}

function GameRow({ game, teamsById, darkMode, onViewGameStats }) {
  const awayTeamId = getScheduleGameTeamId(game, 'away');
  const homeTeamId = getScheduleGameTeamId(game, 'home');
  const awayTeam = teamsById.get(awayTeamId);
  const homeTeam = teamsById.get(homeTeamId);
  const rowPresentation = getMatchupRowPresentation(awayTeamId, homeTeamId, darkMode);

  return (
    <article
      className="statistics-schedule-game-row"
      style={rowPresentation.style}
    >
      <div className="statistics-schedule-row-meta">
        <span>{formatKickoffDate(game.kickoff)}</span>
        <strong>{formatKickoffTime(game.kickoff)}</strong>
      </div>
      <div className="statistics-schedule-matchup">
        <TeamIdentity team={awayTeam} fallbackId={awayTeamId} compact />
        <span className="statistics-schedule-at">{game.neutralSite ? 'vs' : '@'}</span>
        <TeamIdentity team={homeTeam} fallbackId={homeTeamId} compact />
      </div>
      <div className="statistics-schedule-row-detail">
        <GameResultBadge game={game} />
        <BroadcastDisplay game={game} darkMode={rowPresentation.preferDarkBroadcastLogo} />
        <span>{formatVenue(game.location ?? game.venue)}</span>
        {game.neutralSite && <span className="statistics-schedule-pill">Neutral</span>}
        <GameStatsAction game={game} onViewGameStats={onViewGameStats} />
      </div>
    </article>
  );
}

function WeekScheduleView({
  scheduleData,
  teamsById,
  activeWeek,
  activeFilter,
  onWeekChange,
  onFilterChange,
  darkMode,
  onViewGameStats,
}) {
  const weekScrubberRef = useRef(null);
  const weekOptions = getPopulatedScheduleWeeks(scheduleData);
  const weekScrollCue = useHorizontalScrollCue(weekScrubberRef, [weekOptions.length, activeWeek]);
  const allGames = getWeekScheduleGames(scheduleData, activeWeek);
  const games = allGames.filter((game) => scheduleGameMatchesFilter(game, activeFilter));
  const groups = buildKickoffGroups(games);
  const filterLabel = getFilterLabel(activeFilter);
  const filterAvailability = getFilterAvailability(allGames);

  return (
    <div className="statistics-schedule-view">
      <ScheduleFilterChips
        activeFilter={activeFilter}
        availability={filterAvailability}
        onFilterChange={onFilterChange}
      />

      <div className="statistics-schedule-week-shell">
        <div ref={weekScrubberRef} className="statistics-schedule-week-scrubber" aria-label="Schedule weeks">
          {weekOptions.map((week) => {
            const active = week.week === activeWeek;
            return (
              <button
                key={week.week}
                type="button"
                className={`statistics-schedule-week-chip${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => onWeekChange(week.week)}
              >
                <span>Week {week.week}</span>
                <span>{week.games.length} games</span>
              </button>
            );
          })}
        </div>
        <HorizontalScrollCue
          left={weekScrollCue.left}
          right={weekScrollCue.right}
          className="horizontal-scroll-cue--schedule"
        />
      </div>

      <section className="statistics-schedule-panel">
        <header className="statistics-schedule-section-header">
          <p className="statistics-schedule-eyebrow">League slate</p>
          <h2>Week {activeWeek ?? '-'}</h2>
          <span>
            {activeFilter === STATISTICS_SCHEDULE_FILTERS.ALL
              ? `${games.length} ${games.length === 1 ? 'game' : 'games'}`
              : `${games.length} of ${allGames.length} games · ${filterLabel}`}
          </span>
        </header>

        {groups.length ? (
          <div className="statistics-schedule-groups">
            {groups.map((group) => (
              <section key={group.key} className="statistics-schedule-kickoff-group">
                <header className="statistics-schedule-group-header">
                  <span>{formatKickoffSlot(group.kickoff)}</span>
                  <span>{group.games.length}</span>
                </header>
                <div className="statistics-schedule-row-list">
                  {group.games.map((game) => (
                    <GameRow
                      key={game.id}
                      game={game}
                      teamsById={teamsById}
                      darkMode={darkMode}
                      onViewGameStats={onViewGameStats}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <InlineEmptyState
            title={activeFilter === STATISTICS_SCHEDULE_FILTERS.ALL ? 'No games for this week' : 'No games match this filter'}
            copy={activeFilter === STATISTICS_SCHEDULE_FILTERS.ALL
              ? 'Choose another week from the schedule rail.'
              : 'Choose All Games or another schedule filter.'}
          />
        )}
      </section>
    </div>
  );
}

function TeamPicker({ teams, onSelectTeam, darkMode }) {
  const divisions = DIVISION_ORDER
    .map((division) => ({
      division,
      teams: teams
        .filter((team) => team.division === division)
        .sort((left, right) => getTeamName(left).localeCompare(getTeamName(right))),
    }))
    .filter((group) => group.teams.length > 0);

  return (
    <section className="statistics-schedule-panel">
      <header className="statistics-schedule-section-header">
        <p className="statistics-schedule-eyebrow">Team schedule</p>
        <h2>Choose a Team</h2>
        <span>32 teams</span>
      </header>
      <div className="statistics-schedule-team-picker">
        {divisions.map((group) => (
          <section key={group.division} className="statistics-schedule-team-picker-group">
            <h3>{group.division}</h3>
            <div className="statistics-schedule-team-picker-grid">
              {group.teams.map((team) => {
                const theme = getTeamVisualTheme(team.id, darkMode, { logoSide: 'start' });
                return (
                  <button
                    key={team.id}
                    type="button"
                    className="statistics-schedule-team-option"
                    style={{ '--statistics-schedule-row-accent': theme?.borderColor ?? 'var(--color-separator)' }}
                    onClick={() => onSelectTeam(team.id)}
                  >
                    <TeamIdentity team={team} compact />
                    <span>{team.nickname ?? team.name}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function TeamScheduleHeaderIdentity({ team, gameCount, byeCount }) {
  return (
    <div className="statistics-schedule-team-header-identity">
      <TeamIdentity team={team} />
      <div className="statistics-schedule-team-header-meta">
        {team?.division && <span>{team.division}</span>}
        <strong>{gameCount} games · {byeCount} bye</strong>
      </div>
    </div>
  );
}

function TeamScheduleRow({ row, team, opponent, darkMode, onViewGameStats }) {
  const awayTeamId = getScheduleGameTeamId(row.game, 'away');
  const homeTeamId = getScheduleGameTeamId(row.game, 'home');
  const rowTheme = getTeamVisualTheme(team?.id, darkMode, { logoSide: 'start' });
  const rowPresentation = row.isBye
    ? {
        style: { '--statistics-schedule-row-accent': rowTheme?.borderColor ?? 'var(--color-separator)' },
        preferDarkBroadcastLogo: darkMode,
      }
    : getMatchupRowPresentation(awayTeamId, homeTeamId, darkMode);

  return (
    <article
      className={`statistics-schedule-team-row${row.isBye ? ' is-bye' : ''}`}
      style={rowPresentation.style}
    >
      <div className="statistics-schedule-row-meta">
        <span>Week {row.week}</span>
        {row.isBye ? <strong>Bye</strong> : <strong>{formatKickoffTime(row.game?.kickoff)}</strong>}
      </div>
      <div className="statistics-schedule-matchup">
        {row.isBye ? (
          <div className="statistics-schedule-bye-copy">
            <span className="statistics-schedule-at">BYE</span>
            <span>No game scheduled</span>
          </div>
        ) : (
          <>
            <span className="statistics-schedule-at">{row.isAway ? '@' : 'vs'}</span>
            <TeamIdentity team={opponent} fallbackId={row.opponentTeamId} compact />
          </>
        )}
      </div>
      <div className="statistics-schedule-row-detail">
        {row.isBye ? (
          <span>Regular season rest week</span>
        ) : (
          <>
            <GameResultBadge game={row.game} selectedTeamId={team?.id} />
            <BroadcastDisplay game={row.game} darkMode={rowPresentation.preferDarkBroadcastLogo} />
            <span>{formatKickoffDate(row.game?.kickoff)}</span>
            <span>{formatVenue(row.game?.location ?? row.game?.venue)}</span>
            {row.game?.neutralSite && <span className="statistics-schedule-pill">Neutral</span>}
            <GameStatsAction game={row.game} onViewGameStats={onViewGameStats} />
          </>
        )}
      </div>
    </article>
  );
}

function TeamScheduleView({
  teams,
  teamsById,
  scheduleData,
  selectedTeamId,
  activeFilter,
  onSelectTeam,
  onFilterChange,
  darkMode,
  onViewGameStats,
}) {
  const selectedTeam = selectedTeamId ? teamsById.get(selectedTeamId) : null;
  const rows = buildTeamScheduleRows(scheduleData, selectedTeamId);
  const visibleRows = filterTeamScheduleRows(rows, activeFilter);
  const games = rows.filter((row) => !row.isBye && row.game).map((row) => row.game);
  const teamTheme = getTeamVisualTheme(selectedTeam?.id, darkMode, { logoSide: 'start' });
  const gameCount = rows.filter((row) => !row.isBye).length;
  const byeCount = rows.filter((row) => row.isBye).length;
  const filterLabel = getFilterLabel(activeFilter);
  const filterAvailability = getFilterAvailability(games);

  if (!selectedTeam) {
    return <TeamPicker teams={teams} onSelectTeam={onSelectTeam} darkMode={darkMode} />;
  }

  return (
    <section className="statistics-schedule-panel statistics-schedule-team-panel">
      <header
        className="statistics-schedule-team-header"
        style={{
          '--statistics-schedule-row-accent': teamTheme?.borderColor ?? 'var(--color-separator)',
        }}
      >
        <TeamScheduleHeaderIdentity team={selectedTeam} gameCount={gameCount} byeCount={byeCount} />
        <label className="statistics-schedule-team-select">
          <span>Team</span>
          <select value={selectedTeam.id} onChange={(event) => onSelectTeam(event.target.value)}>
            {teams
              .slice()
              .sort((left, right) => getTeamName(left).localeCompare(getTeamName(right)))
              .map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
          </select>
        </label>
      </header>

      <ScheduleFilterChips
        activeFilter={activeFilter}
        availability={filterAvailability}
        onFilterChange={onFilterChange}
      />

      {visibleRows.length ? (
        <div className="statistics-schedule-row-list">
          {visibleRows.map((row) => (
            <TeamScheduleRow
              key={row.id}
              row={row}
              team={selectedTeam}
              opponent={teamsById.get(row.opponentTeamId)}
              darkMode={darkMode}
              onViewGameStats={onViewGameStats}
            />
          ))}
        </div>
      ) : (
        <InlineEmptyState
          title="No team games match this filter"
          copy={`${getTeamName(selectedTeam)} does not have ${filterLabel.toLowerCase()} in the loaded schedule.`}
        />
      )}
    </section>
  );
}

function InlineEmptyState({ title, copy }) {
  return (
    <div className="statistics-schedule-inline-empty">
      <p className="statistics-schedule-eyebrow">Schedule pending</p>
      <h3>{title}</h3>
      <p>{copy}</p>
    </div>
  );
}

export default function StatisticsSchedule({
  teams = [],
  scheduleData,
  mode = null,
  week = null,
  teamId = null,
  filter = null,
  onRouteChange,
  onViewGameStats,
}) {
  const { darkMode } = useTheme();
  const routeMode = normalizeStatisticsScheduleMode(mode, null);
  const activeMode = routeMode ?? readStoredMode();
  const activeFilter = normalizeStatisticsScheduleFilter(filter, STATISTICS_SCHEDULE_FILTERS.ALL);
  const selectedTeamId = normalizeScheduleTeamId(teamId);
  const defaultWeek = useMemo(() => getDefaultScheduleWeek(scheduleData), [scheduleData]);
  const routeWeek = normalizeScheduleWeek(week);
  const activeWeek = routeWeek ?? defaultWeek;
  const hasSchedule = scheduleHasGames(scheduleData);
  const scheduleWeeks = getScheduleWeeks(scheduleData);
  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const seasonLabel = scheduleData?.season ? `${scheduleData.season} Regular Season` : 'Regular Season';

  useEffect(() => {
    if (!routeMode) return;
    writeStoredMode(routeMode);
  }, [routeMode]);

  const setMode = (nextMode) => {
    if (PRIMARY_SCHEDULE_MODES.has(nextMode)) {
      writeStoredMode(nextMode);
    }

    onRouteChange?.({
      statisticsScheduleMode: nextMode,
      statisticsScheduleWeek: nextMode === STATISTICS_SCHEDULE_MODES.WEEK ? activeWeek : null,
      statisticsScheduleTeamId: nextMode === STATISTICS_SCHEDULE_MODES.TEAM ? selectedTeamId : null,
      statisticsScheduleFilter: activeFilter === STATISTICS_SCHEDULE_FILTERS.ALL ? null : activeFilter,
    });
  };

  const selectWeek = (nextWeek) => {
    const nextWeekGames = getWeekScheduleGames(scheduleData, nextWeek);
    const nextFilter = getAvailableFilterForGames(nextWeekGames, activeFilter);
    writeStoredMode(STATISTICS_SCHEDULE_MODES.WEEK);
    onRouteChange?.({
      statisticsScheduleMode: STATISTICS_SCHEDULE_MODES.WEEK,
      statisticsScheduleWeek: nextWeek,
      statisticsScheduleTeamId: null,
      statisticsScheduleFilter: nextFilter === STATISTICS_SCHEDULE_FILTERS.ALL ? null : nextFilter,
    });
  };

  const selectTeam = (nextTeamId) => {
    writeStoredMode(STATISTICS_SCHEDULE_MODES.TEAM);
    onRouteChange?.({
      statisticsScheduleMode: STATISTICS_SCHEDULE_MODES.TEAM,
      statisticsScheduleWeek: null,
      statisticsScheduleTeamId: nextTeamId,
      statisticsScheduleFilter: activeFilter === STATISTICS_SCHEDULE_FILTERS.ALL ? null : activeFilter,
    });
  };

  const selectFilter = (nextFilter) => {
    const normalizedFilter = normalizeStatisticsScheduleFilter(nextFilter, STATISTICS_SCHEDULE_FILTERS.ALL);
    onRouteChange?.({
      statisticsScheduleMode: activeMode,
      statisticsScheduleWeek: activeMode === STATISTICS_SCHEDULE_MODES.WEEK ? activeWeek : null,
      statisticsScheduleTeamId: activeMode === STATISTICS_SCHEDULE_MODES.TEAM ? selectedTeamId : null,
      statisticsScheduleFilter: normalizedFilter === STATISTICS_SCHEDULE_FILTERS.ALL ? null : normalizedFilter,
    });
  };

  return (
    <div className="statistics-schedule">
      <div className="statistics-schedule-toolbar">
        <div className="statistics-schedule-toolbar-copy">
          <p className="statistics-schedule-eyebrow">NFL Schedule</p>
          <h1>{seasonLabel}</h1>
          <span>{hasSchedule ? `${scheduleWeeks.length} weeks loaded` : 'No schedule loaded'}</span>
        </div>
        <div className="statistics-schedule-controls">
          <div className="statistics-schedule-mode-toggle" role="group" aria-label="Primary schedule view">
            <ModeButton
              mode={STATISTICS_SCHEDULE_MODES.WEEK}
              activeMode={activeMode}
              label="View by Week"
              onClick={() => setMode(STATISTICS_SCHEDULE_MODES.WEEK)}
            />
            <ModeButton
              mode={STATISTICS_SCHEDULE_MODES.TEAM}
              activeMode={activeMode}
              label="View by Team"
              onClick={() => setMode(STATISTICS_SCHEDULE_MODES.TEAM)}
            />
          </div>
        </div>
      </div>

      {!hasSchedule ? (
        <section className="statistics-schedule-panel">
          <InlineEmptyState
            title="NFL schedule is not available yet"
            copy="Once the released schedule is loaded, weekly slates and team schedules will appear here."
          />
        </section>
      ) : activeMode === STATISTICS_SCHEDULE_MODES.TEAM ? (
        <TeamScheduleView
          teams={teams}
          teamsById={teamsById}
          scheduleData={scheduleData}
          selectedTeamId={selectedTeamId}
          activeFilter={activeFilter}
          onSelectTeam={selectTeam}
          onFilterChange={selectFilter}
          darkMode={darkMode}
          onViewGameStats={onViewGameStats}
        />
      ) : (
        <WeekScheduleView
          scheduleData={scheduleData}
          teamsById={teamsById}
          activeWeek={activeWeek}
          activeFilter={activeFilter}
          onWeekChange={selectWeek}
          onFilterChange={selectFilter}
          darkMode={darkMode}
          onViewGameStats={onViewGameStats}
        />
      )}
    </div>
  );
}
