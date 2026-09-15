import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import HorizontalScrollCue from './HorizontalScrollCue';
import useHorizontalScrollCue from '../hooks/useHorizontalScrollCue';
import {
  NFL_SEASON_PHASES,
  fetchEspnPreseason,
} from '../utils/espnNflScoreboard';
import {
  TEAM_LOGO_SIDE_SENSITIVE_GRADIENT_TEAMS,
  getTeamVisualTheme,
  mixHex,
  pickReadableForeground,
  tuneGradientStopForMode,
} from '../utils/teamVisualTheme';
import {
  STATISTICS_SCHEDULE_FILTERS,
  STATISTICS_SCHEDULE_MODES,
  buildTeamScheduleRows,
  filterTeamScheduleRows,
  getCurrentPreseasonWeekSelection,
  getDefaultScheduleWeek,
  getGameKickoffMs,
  getPopulatedScheduleWeeks,
  getScheduleGameTeamId,
  getScheduleWeeks,
  getScheduleGameScore,
  isFinalScheduleGame,
  normalizeScheduleTeamId,
  normalizeScheduleWeek,
  normalizeStatisticsScheduleFilter,
  normalizeStatisticsScheduleMode,
  scheduleGameMatchesFilter,
  scheduleHasGames,
} from '../utils/statisticsSchedule';
import { getScoreNetworkLabel } from '../utils/statisticsBroadcasts';

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
// Home/Away is only meaningful relative to a selected team, so it's appended
// for the By Team view only rather than shown alongside the By Week filters.
const TEAM_SCHEDULE_FILTER_OPTIONS = [
  ...SCHEDULE_FILTER_OPTIONS,
  { filter: STATISTICS_SCHEDULE_FILTERS.HOME, label: 'Home' },
  { filter: STATISTICS_SCHEDULE_FILTERS.AWAY, label: 'Away' },
];
const PRESEASON_HIDDEN_FILTERS = new Set([STATISTICS_SCHEDULE_FILTERS.PRIMETIME]);
const TEAM_ONLY_FILTERS = new Set([STATISTICS_SCHEDULE_FILTERS.HOME, STATISTICS_SCHEDULE_FILTERS.AWAY]);
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
  const network = getScoreNetworkLabel(game);
  return network ? [{ name: network }] : [];
}

function BroadcastDisplay({ game, darkMode }) {
  const broadcasts = getBroadcasts(game);
  if (broadcasts.length === 0) return null;
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

// Result and action chips sit on top of an arbitrary team gradient, so a fixed
// accent has no dependable ground beneath it. Each row hands its chips an
// opaque scrim plus the win/loss accents tuned for that scrim, which keeps the
// contrast constant no matter which two teams are being mixed.
function chipVarsForRowForeground(foreground) {
  const onDarkChip = foreground === '#FFFFFF';
  return {
    '--statistics-schedule-chip-bg': onDarkChip ? 'rgba(8,10,14,0.82)' : 'rgba(255,255,255,0.88)',
    '--statistics-schedule-chip-fg': onDarkChip ? '#F2F5F9' : '#0C0F14',
    '--statistics-schedule-chip-border': onDarkChip ? 'rgba(255,255,255,0.22)' : 'rgba(12,15,20,0.20)',
    '--statistics-schedule-chip-win': onDarkChip ? '#43DE86' : '#00702C',
    '--statistics-schedule-chip-loss': onDarkChip ? '#FF9585' : '#B81C08',
  };
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
    // These stops go through the same mode tuning as every other team surface.
    // Reading the palette raw let brand colours onto the row at full strength
    // (Steelers gold at 0.55 luminance against a 0.006 canvas), which made
    // Schedule the only surface in the app that ignored the dark-mode curve.
    const stop = SCHEDULE_LOGO_CONTRAST_GRADIENT_TEAMS.has(key) || SCHEDULE_LOGO_CONTRAST_GRADIENT_TEAMS.has(logoKey)
      ? (palette.secondary ?? palette.darkSecondary ?? primary)
      : (primary ?? theme?.primary ?? theme?.color);
    return stop ? tuneGradientStopForMode(stop, darkMode) : stop;
  };
  const start = getScheduleGradientStop(awayTeamId, awayTheme);
  const end = getScheduleGradientStop(homeTeamId, homeTheme);

  if (!start || !end) {
    return {
      style: {
        '--statistics-schedule-row-accent': homeTheme?.borderColor ?? awayTheme?.borderColor ?? 'var(--color-separator)',
        ...chipVarsForRowForeground(darkMode ? '#FFFFFF' : '#0C0F14'),
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
      ...chipVarsForRowForeground(foreground),
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

function GameStatsAction({ game, season, phase, week, onViewGameStats }) {
  if (!onViewGameStats || !isFinalScheduleGame(game) || !getGameStatsEventId(game)) return null;

  const awayTeamId = getScheduleGameTeamId(game, 'away');
  const homeTeamId = getScheduleGameTeamId(game, 'home');

  return (
    <button
      type="button"
      className="statistics-schedule-game-stats-button"
      onClick={() => onViewGameStats({ ...game, season, phase, week, awayTeamId, homeTeamId })}
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
  return TEAM_SCHEDULE_FILTER_OPTIONS.find((option) => option.filter === filter)?.label ?? 'All Games';
}

function getPreseasonWeekSelection(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^pre-[1-4]$/.test(normalized) ? normalized : null;
}

function buildWeekOptions(scheduleData, phase) {
  return getPopulatedScheduleWeeks(scheduleData).map((week) => {
    const preseason = phase === NFL_SEASON_PHASES.PRESEASON;
    return {
      ...week,
      phase,
      selection: preseason ? `pre-${week.week}` : week.week,
      chipLabel: preseason ? (week.shortLabel ?? `Pre ${week.week}`) : (week.label ?? `Week ${week.week}`),
      fullLabel: week.label ?? (preseason ? `Preseason Week ${week.week}` : `Week ${week.week}`),
    };
  });
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

function getTeamFilterAvailability(rows = []) {
  const games = rows.filter((row) => !row.isBye && row.game).map((row) => row.game);
  const availability = getFilterAvailability(games);
  availability[STATISTICS_SCHEDULE_FILTERS.HOME] = rows.some((row) => !row.isBye && row.isAway === false);
  availability[STATISTICS_SCHEDULE_FILTERS.AWAY] = rows.some((row) => !row.isBye && row.isAway === true);
  return availability;
}

function getAvailableFilterForGames(games = [], filter = STATISTICS_SCHEDULE_FILTERS.ALL) {
  if (filter === STATISTICS_SCHEDULE_FILTERS.ALL) return filter;
  return games.some((game) => scheduleGameMatchesFilter(game, filter))
    ? filter
    : STATISTICS_SCHEDULE_FILTERS.ALL;
}

function ScheduleFilterChips({ activeFilter, availability, onFilterChange, hiddenFilters = null, options = SCHEDULE_FILTER_OPTIONS }) {
  return (
    <div className="statistics-schedule-filter-rail" role="group" aria-label="Schedule filters">
      {options.filter((option) => !hiddenFilters?.has(option.filter)).map((option) => (
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

function IncludePreseasonControl({ checked, onChange }) {
  return (
    <button
      type="button"
      className={`statistics-schedule-toggle-chip${checked ? ' is-active' : ''}`}
      aria-pressed={checked}
      title="Include preseason weeks"
      onClick={() => onChange(!checked)}
    >
      Preseason
    </button>
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

function GameRow({ game, teamsById, darkMode, season, phase, week, onViewGameStats }) {
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
        <span className="statistics-schedule-venue">{formatVenue(game.location ?? game.venue)}</span>
        {game.neutralSite && <span className="statistics-schedule-pill">Neutral</span>}
        <GameStatsAction game={game} season={season} phase={phase} week={week} onViewGameStats={onViewGameStats} />
      </div>
    </article>
  );
}

function WeekScheduleView({
  weekOptions,
  teamsById,
  activeWeek,
  activeFilter,
  onWeekChange,
  onFilterChange,
  darkMode,
  season,
  onViewGameStats,
}) {
  const weekScrubberRef = useRef(null);
  const weekScrollCue = useHorizontalScrollCue(weekScrubberRef, [weekOptions.length, activeWeek]);
  const selectedWeekOption = weekOptions.find((week) => week.selection === activeWeek);
  const allGames = selectedWeekOption?.games ?? [];
  const games = allGames.filter((game) => scheduleGameMatchesFilter(game, activeFilter));
  const groups = buildKickoffGroups(games);
  const filterLabel = getFilterLabel(activeFilter);
  const filterAvailability = getFilterAvailability(allGames);
  const viewingPreseason = selectedWeekOption?.phase === NFL_SEASON_PHASES.PRESEASON;

  return (
    <div className="statistics-schedule-view">
      <ScheduleFilterChips
        activeFilter={activeFilter}
        availability={filterAvailability}
        onFilterChange={onFilterChange}
        hiddenFilters={viewingPreseason ? PRESEASON_HIDDEN_FILTERS : null}
      />

      <div className="statistics-schedule-week-shell">
        <div ref={weekScrubberRef} className="statistics-schedule-week-scrubber" aria-label="Schedule weeks">
          {weekOptions.map((week) => {
            const active = week.selection === activeWeek;
            return (
              <button
                key={week.selection}
                type="button"
                className={`statistics-schedule-week-chip${week.phase === NFL_SEASON_PHASES.PRESEASON ? ' is-preseason' : ''}${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => onWeekChange(week.selection)}
              >
                <span>{week.chipLabel}</span>
                <span>{week.games.length} {week.games.length === 1 ? 'game' : 'games'}</span>
              </button>
            );
          })}
        </div>
        <HorizontalScrollCue
          left={weekScrollCue.left}
          right={weekScrollCue.right}
          targetRef={weekScrubberRef}
          label="schedule weeks"
          className="horizontal-scroll-cue--schedule"
        />
      </div>

      {activeFilter !== STATISTICS_SCHEDULE_FILTERS.ALL && groups.length > 0 && (
        <p className="statistics-schedule-status statistics-schedule-status--slate">
          {`${games.length} of ${allGames.length} games · ${filterLabel}`}
        </p>
      )}

      {groups.length ? (
        <section
          className="statistics-schedule-sheet"
          aria-label={`${selectedWeekOption?.fullLabel ?? 'Selected week'} slate`}
        >
          {groups.map((group) => (
            <div key={group.key} className="statistics-schedule-kickoff-group">
              <h2 className="statistics-schedule-group-row">{formatKickoffSlot(group.kickoff)}</h2>
              {group.games.map((game) => (
                <GameRow
                  key={game.id}
                  game={game}
                  teamsById={teamsById}
                  darkMode={darkMode}
                  season={season}
                  phase={selectedWeekOption?.phase}
                  week={selectedWeekOption?.week}
                  onViewGameStats={onViewGameStats}
                />
              ))}
            </div>
          ))}
        </section>
      ) : (
        <InlineEmptyState
          title={activeFilter === STATISTICS_SCHEDULE_FILTERS.ALL ? 'No games for this week' : 'No games match this filter'}
          copy={activeFilter === STATISTICS_SCHEDULE_FILTERS.ALL
            ? 'Choose another week from the schedule rail.'
            : 'Choose All Games or another schedule filter.'}
        />
      )}
    </div>
  );
}

const TEAM_PICKER_SORTS = {
  DIVISION: 'division',
  ALPHA: 'alpha',
  CONFERENCE: 'conference',
  KICKOFF: 'kickoff',
};
const TEAM_PICKER_SORT_OPTIONS = [
  { sort: TEAM_PICKER_SORTS.ALPHA, label: 'A–Z' },
  { sort: TEAM_PICKER_SORTS.DIVISION, label: 'Division' },
  { sort: TEAM_PICKER_SORTS.CONFERENCE, label: 'Conference' },
  { sort: TEAM_PICKER_SORTS.KICKOFF, label: 'Next Kickoff' },
];
const TEAM_PICKER_SORT_VALUES = new Set(Object.values(TEAM_PICKER_SORTS));
const TEAM_PICKER_SORT_STORAGE_KEY = 'gridshift.statisticsScheduleTeamSort';
const RECENT_TEAM_STORAGE_KEY = 'gridshift.statisticsScheduleRecentTeam';
// The stored favorite comes from the local color data, which spells a couple of
// franchises differently than the schedule feed, so it is resolved against the
// loaded team list rather than compared directly.
const TEAM_ID_ALIASES = {
  LA: 'LAR',
  LAR: 'LA',
  WAS: 'WSH',
  WSH: 'WAS',
};

function readStoredTeamSort() {
  try {
    const stored = localStorage.getItem(TEAM_PICKER_SORT_STORAGE_KEY);
    return TEAM_PICKER_SORT_VALUES.has(stored) ? stored : TEAM_PICKER_SORTS.ALPHA;
  } catch {
    return TEAM_PICKER_SORTS.ALPHA;
  }
}

function writeStoredTeamSort(sort) {
  if (!TEAM_PICKER_SORT_VALUES.has(sort)) return;
  try {
    localStorage.setItem(TEAM_PICKER_SORT_STORAGE_KEY, sort);
  } catch {
    // Sort order is a preference only; the picker still renders without it.
  }
}

function readRecentTeamId() {
  try {
    return normalizeScheduleTeamId(localStorage.getItem(RECENT_TEAM_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeRecentTeamId(teamId) {
  const normalized = normalizeScheduleTeamId(teamId);
  if (!normalized) return;
  try {
    localStorage.setItem(RECENT_TEAM_STORAGE_KEY, normalized);
  } catch {
    // The recent-team shortcut is additive; routing remains the source of truth.
  }
}

function resolveTeamId(value, teamsById) {
  const normalized = normalizeScheduleTeamId(value);
  if (!normalized) return null;
  if (teamsById.has(normalized)) return normalized;
  const alias = TEAM_ID_ALIASES[normalized];
  return alias && teamsById.has(alias) ? alias : null;
}

function getTeamNickname(team, fallbackId) {
  return team?.nickname || team?.name || getTeamCode(team, fallbackId);
}

function getTeamConference(team) {
  const division = typeof team?.division === 'string' ? team.division.trim() : '';
  return division.split(' ')[0] || 'Other';
}

function matchesTeamQuery(team, query) {
  if (!query) return true;
  return [getTeamCode(team), getTeamName(team), getTeamNickname(team), team?.division]
    .filter((value) => typeof value === 'string' && value)
    .some((value) => value.toLowerCase().includes(query));
}

function compareTeamsByName(left, right) {
  return getTeamName(left).localeCompare(getTeamName(right));
}

// Weeks are walked in order and the earliest upcoming kickoff wins, so a team
// that has already played this week sorts by its next game rather than its last.
function buildNextGameIndex(schedules = [], nowMs) {
  const index = new Map();

  schedules.filter(Boolean).forEach((schedule) => {
    getScheduleWeeks(schedule).forEach((week) => {
      week.games.forEach((game) => {
        const kickoffMs = getGameKickoffMs(game);
        if (kickoffMs == null || kickoffMs < nowMs || isFinalScheduleGame(game)) return;
        const awayTeamId = getScheduleGameTeamId(game, 'away');
        const homeTeamId = getScheduleGameTeamId(game, 'home');
        [
          { teamId: awayTeamId, opponentTeamId: homeTeamId, isAway: true },
          { teamId: homeTeamId, opponentTeamId: awayTeamId, isAway: false },
        ].forEach(({ teamId, opponentTeamId, isAway }) => {
          if (!teamId) return;
          const current = index.get(teamId);
          if (current && current.kickoffMs <= kickoffMs) return;
          index.set(teamId, {
            kickoffMs,
            week: week.week,
            weekLabel: week.label ?? null,
            opponentTeamId,
            isAway,
          });
        });
      });
    });
  });

  return index;
}

function formatNextGameMeta(entry, teamsById) {
  if (!entry) return 'No game scheduled';
  const label = typeof entry.weekLabel === 'string' && entry.weekLabel.trim()
    ? entry.weekLabel.trim()
    : `Week ${entry.week}`;
  const compactLabel = label
    .replace(/preseason\s+week/i, 'Pre W')
    .replace(/^week\s+/i, 'W');
  const opponent = teamsById.get(entry.opponentTeamId);
  return `${compactLabel} · ${entry.isAway ? '@' : 'vs'} ${getTeamCode(opponent, entry.opponentTeamId)}`;
}

function sortTeamsForPicker(teams, sort, nextGameIndex) {
  const sorted = [...teams];
  if (sort !== TEAM_PICKER_SORTS.KICKOFF) return sorted.sort(compareTeamsByName);
  return sorted.sort((left, right) => {
    const leftMs = nextGameIndex.get(left.id)?.kickoffMs ?? Number.POSITIVE_INFINITY;
    const rightMs = nextGameIndex.get(right.id)?.kickoffMs ?? Number.POSITIVE_INFINITY;
    if (leftMs !== rightMs) return leftMs - rightMs;
    return compareTeamsByName(left, right);
  });
}

function buildTeamPickerGroups(teams, sort, nextGameIndex) {
  if (sort === TEAM_PICKER_SORTS.ALPHA || sort === TEAM_PICKER_SORTS.KICKOFF) {
    return [{ key: sort, label: null, teams: sortTeamsForPicker(teams, sort, nextGameIndex) }];
  }

  const keyFor = sort === TEAM_PICKER_SORTS.CONFERENCE
    ? getTeamConference
    : (team) => (typeof team?.division === 'string' ? team.division.trim() : '');
  const preferredOrder = sort === TEAM_PICKER_SORTS.CONFERENCE ? ['AFC', 'NFC'] : DIVISION_ORDER;
  const present = [...new Set(teams.map(keyFor))];
  // Anything the feed reports outside the known order still gets a group rather
  // than dropping out of the picker entirely.
  const order = [
    ...preferredOrder.filter((value) => present.includes(value)),
    ...present.filter((value) => value && !preferredOrder.includes(value)).sort(),
  ];

  return order
    .map((value) => ({
      key: value,
      label: value,
      teams: sortTeamsForPicker(teams.filter((team) => keyFor(team) === value), sort, nextGameIndex),
    }))
    .filter((group) => group.teams.length > 0);
}

function getTeamRowMeta(team, sort, nextGameIndex, teamsById) {
  if (sort === TEAM_PICKER_SORTS.KICKOFF) {
    return formatNextGameMeta(nextGameIndex.get(team.id), teamsById);
  }
  if (sort === TEAM_PICKER_SORTS.DIVISION) return null;
  return typeof team?.division === 'string' ? team.division : null;
}

function TeamPickerRow({ team, darkMode, onSelect, badge = null, meta = null, isFavorite = false }) {
  const theme = getTeamVisualTheme(team?.id, darkMode, { logoSide: 'start' });
  const code = getTeamCode(team);
  const gradient = [theme?.gradientOverlay, theme?.gradient].filter(Boolean).join(', ');

  return (
    <button
      type="button"
      className={`statistics-schedule-team-option${isFavorite ? ' is-favorite' : ''}`}
      style={{
        '--statistics-schedule-row-accent': theme?.borderColor ?? 'var(--color-separator)',
        '--statistics-schedule-team-gradient': gradient || 'var(--color-bg-tertiary)',
        '--statistics-schedule-team-gradient-fg': theme?.gradientFullForeground ?? 'var(--color-label)',
        '--statistics-schedule-team-gradient-muted': theme?.gradientFullMuted ?? 'var(--color-label-secondary)',
      }}
      onClick={() => onSelect(team.id)}
      aria-label={`View ${getTeamName(team)} schedule`}
    >
      {code !== 'TBD' && (
        <img
          src={teamLogo(code)}
          alt=""
          className="statistics-schedule-team-option-logo"
          loading="lazy"
          decoding="async"
          onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
        />
      )}
      <span className="statistics-schedule-team-option-code">{code}</span>
      <span className="statistics-schedule-team-option-name">{getTeamName(team)}</span>
      <span className="statistics-schedule-team-option-trail">
        {meta && <span className="statistics-schedule-team-option-meta">{meta}</span>}
        {badge && <span className="statistics-schedule-team-option-badge">{badge}</span>}
      </span>
    </button>
  );
}

function TeamPicker({
  teams,
  teamsById,
  onSelectTeam,
  darkMode,
  scheduleData,
  preseasonScheduleData,
  includePreseason,
  favoriteTeamId,
  recentTeamId,
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(readStoredTeamSort);

  // Pinned once per mount so the kickoff order stays stable across re-renders.
  const [nowMs] = useState(() => Date.now());

  const normalizedQuery = query.trim().toLowerCase();
  const searching = normalizedQuery.length > 0;

  // The next-kickoff order is the only sort that needs the slate itself, so the
  // index stays unbuilt until that sort is actually selected.
  const nextGameIndex = useMemo(() => (
    sort === TEAM_PICKER_SORTS.KICKOFF
      ? buildNextGameIndex([scheduleData, includePreseason ? preseasonScheduleData : null], nowMs)
      : new Map()
  ), [sort, scheduleData, preseasonScheduleData, includePreseason, nowMs]);

  const groups = useMemo(() => {
    const matched = teams.filter((team) => matchesTeamQuery(team, normalizedQuery));
    if (searching) {
      return matched.length
        ? [{
          key: 'results',
          label: `${matched.length} ${matched.length === 1 ? 'team' : 'teams'}`,
          teams: sortTeamsForPicker(matched, sort, nextGameIndex),
        }]
        : [];
    }
    return buildTeamPickerGroups(matched, sort, nextGameIndex);
  }, [teams, normalizedQuery, searching, sort, nextGameIndex]);

  const quickPicks = [favoriteTeamId, recentTeamId]
    .filter((teamId, index, list) => teamId && list.indexOf(teamId) === index)
    .map((teamId) => teamsById.get(teamId))
    .filter(Boolean);

  const selectSort = (nextSort) => {
    setSort(nextSort);
    writeStoredTeamSort(nextSort);
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === 'Escape') {
      setQuery('');
      return;
    }
    if (event.key !== 'Enter') return;
    const firstMatch = groups[0]?.teams?.[0];
    if (firstMatch) onSelectTeam(firstMatch.id);
  };


  return (
    <section className="statistics-schedule-team-picker-section" aria-label="Choose a team">
      <div className="statistics-schedule-team-finder">
        <div className="statistics-schedule-team-finder-row">
          <input
            type="search"
            className="statistics-schedule-team-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search teams"
            aria-label="Search teams by city, nickname, abbreviation, or division"
            autoComplete="off"
            spellCheck="false"
          />
          <div className="statistics-schedule-team-sort" role="group" aria-label="Sort teams">
            {TEAM_PICKER_SORT_OPTIONS.map((option) => (
              <button
                key={option.sort}
                type="button"
                className={`statistics-schedule-filter-chip${sort === option.sort ? ' is-active' : ''}`}
                aria-pressed={sort === option.sort}
                onClick={() => selectSort(option.sort)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {!searching && quickPicks.length > 0 && (
          <div className="statistics-schedule-team-quickpicks">
            <span className="statistics-schedule-eyebrow">Jump to</span>
            {quickPicks.map((team) => (
              <TeamPickerRow
                key={`quick-${team.id}`}
                team={team}
                darkMode={darkMode}
                onSelect={onSelectTeam}
                isFavorite={team.id === favoriteTeamId}
                badge={team.id === favoriteTeamId ? 'Your team' : 'Recent'}
              />
            ))}
          </div>
        )}
      </div>

      {groups.length ? (
        <div className="statistics-schedule-team-picker">
          {groups.map((group) => (
            <section key={group.key} className="statistics-schedule-team-picker-group">
              {group.label && <h3>{group.label}</h3>}
              <div className="statistics-schedule-team-picker-list">
                {group.teams.map((team) => (
                  <TeamPickerRow
                    key={team.id}
                    team={team}
                    darkMode={darkMode}
                    onSelect={onSelectTeam}
                    isFavorite={team.id === favoriteTeamId}
                    meta={getTeamRowMeta(team, sort, nextGameIndex, teamsById)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <InlineEmptyState
          title="No teams match that search"
          copy="Try a city, nickname, abbreviation, or division — Sea, Hawks, SEA, or NFC West."
        />
      )}
    </section>
  );
}

function TeamScheduleHeaderIdentity({ team, gameCount, byeCount }) {
  return (
    <div className="statistics-schedule-team-header-identity">
      <TeamIdentity team={team} />
      <div className="statistics-schedule-team-header-meta">
        {team?.division && <span>{team.division}</span>}
        <strong>{gameCount} games · {byeCount} {byeCount === 1 ? 'bye' : 'byes'}</strong>
      </div>
    </div>
  );
}

function TeamScheduleRow({ row, team, opponent, darkMode, season, onViewGameStats, preseason = false }) {
  const awayTeamId = getScheduleGameTeamId(row.game, 'away');
  const homeTeamId = getScheduleGameTeamId(row.game, 'home');
  const rowTheme = getTeamVisualTheme(team?.id, darkMode, { logoSide: 'start' });
  const rowPresentation = row.isBye
    ? {
        style: {
          '--statistics-schedule-row-accent': rowTheme?.borderColor ?? 'var(--color-separator)',
          ...chipVarsForRowForeground(darkMode ? '#FFFFFF' : '#0C0F14'),
        },
        preferDarkBroadcastLogo: darkMode,
      }
    : getMatchupRowPresentation(awayTeamId, homeTeamId, darkMode);

  return (
    <article
      className={`statistics-schedule-team-row${row.isBye ? ' is-bye' : ''}`}
      style={rowPresentation.style}
    >
      <div className="statistics-schedule-row-meta">
        <span>{row.weekLabel ?? `Week ${row.week}`}</span>
        {row.isBye ? <strong>{preseason ? 'No game' : 'Bye'}</strong> : <strong>{formatKickoffTime(row.game?.kickoff)}</strong>}
      </div>
      <div className="statistics-schedule-matchup">
        {row.isBye ? (
          <div className="statistics-schedule-bye-copy">
            <span className="statistics-schedule-at">{preseason ? 'OFF' : 'BYE'}</span>
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
          <span>{preseason ? 'No preseason game scheduled' : 'Regular season rest week'}</span>
        ) : (
          <>
            <GameResultBadge game={row.game} selectedTeamId={team?.id} />
            <BroadcastDisplay game={row.game} darkMode={rowPresentation.preferDarkBroadcastLogo} />
            <span className="statistics-schedule-date">{formatKickoffDate(row.game?.kickoff)}</span>
            <span className="statistics-schedule-venue">{formatVenue(row.game?.location ?? row.game?.venue)}</span>
            {row.game?.neutralSite && <span className="statistics-schedule-pill">Neutral</span>}
            <GameStatsAction game={row.game} season={season} phase={row.phase} week={row.week} onViewGameStats={onViewGameStats} />
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
  preseasonScheduleData,
  includePreseason,
  selectedTeamId,
  activeFilter,
  onSelectTeam,
  onFilterChange,
  darkMode,
  season,
  onViewGameStats,
  favoriteTeamId,
  recentTeamId,
}) {
  const selectedTeam = selectedTeamId ? teamsById.get(selectedTeamId) : null;
  const regularRows = buildTeamScheduleRows(scheduleData, selectedTeamId)
    .map((row) => ({ ...row, phase: NFL_SEASON_PHASES.REGULAR }));
  const preseasonRows = includePreseason
    ? buildTeamScheduleRows(preseasonScheduleData, selectedTeamId)
      .filter((row) => !row.isBye)
      .map((row) => ({ ...row, phase: NFL_SEASON_PHASES.PRESEASON }))
    : [];
  const rows = [...preseasonRows, ...regularRows];
  const visibleRows = filterTeamScheduleRows(rows, activeFilter);
  const teamTheme = getTeamVisualTheme(selectedTeam?.id, darkMode, { logoSide: 'start' });
  const gameCount = rows.filter((row) => !row.isBye).length;
  const byeCount = regularRows.filter((row) => row.isBye).length;
  const filterLabel = getFilterLabel(activeFilter);
  const filterAvailability = getTeamFilterAvailability(rows);

  if (!selectedTeam) {
    return (
      <TeamPicker
        teams={teams}
        teamsById={teamsById}
        onSelectTeam={onSelectTeam}
        darkMode={darkMode}
        scheduleData={scheduleData}
        preseasonScheduleData={preseasonScheduleData}
        includePreseason={includePreseason}
        favoriteTeamId={favoriteTeamId}
        recentTeamId={recentTeamId}
      />
    );
  }

  return (
    <section className="statistics-schedule-team-panel">
      <header
        className="statistics-schedule-team-header"
        style={{
          '--statistics-schedule-row-accent': teamTheme?.borderColor ?? 'var(--color-separator)',
        }}
      >
        <TeamScheduleHeaderIdentity team={selectedTeam} gameCount={gameCount} byeCount={byeCount} />
        <div className="statistics-schedule-team-select">
          <select
            aria-label="Team"
            value={selectedTeam.id}
            onChange={(event) => onSelectTeam(event.target.value)}
          >
            {teams
              .slice()
              .sort((left, right) => getTeamName(left).localeCompare(getTeamName(right)))
              .map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
          </select>
        </div>
      </header>

      <ScheduleFilterChips
        activeFilter={activeFilter}
        availability={filterAvailability}
        onFilterChange={onFilterChange}
        options={TEAM_SCHEDULE_FILTER_OPTIONS}
      />

      {visibleRows.length ? (
        <div className="statistics-schedule-sheet">
          {visibleRows.map((row) => (
            <TeamScheduleRow
              key={row.id}
              row={row}
              team={selectedTeam}
              opponent={teamsById.get(row.opponentTeamId)}
              darkMode={darkMode}
              season={season}
              onViewGameStats={onViewGameStats}
              preseason={row.phase === NFL_SEASON_PHASES.PRESEASON}
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
  const { darkMode, favoriteTeam } = useTheme();
  const scheduleSeason = scheduleData?.season ?? new Date().getFullYear();
  const initialPreseasonWeek = getPreseasonWeekSelection(week);
  const [includePreseason, setIncludePreseason] = useState(Boolean(initialPreseasonWeek));
  const [preseasonState, setPreseasonState] = useState({
    status: initialPreseasonWeek ? 'loading' : 'idle',
    data: null,
    error: null,
    season: initialPreseasonWeek ? scheduleSeason : null,
  });
  const selectCurrentPreseasonOnLoadRef = useRef(false);
  const routeMode = normalizeStatisticsScheduleMode(mode, null);
  const activeMode = routeMode ?? readStoredMode();
  const requestedFilter = normalizeStatisticsScheduleFilter(filter, STATISTICS_SCHEDULE_FILTERS.ALL);
  const selectedTeamId = normalizeScheduleTeamId(teamId);
  const routePreseasonWeek = getPreseasonWeekSelection(week);
  const routeRegularWeek = routePreseasonWeek ? null : normalizeScheduleWeek(week);
  const preseasonRequested = includePreseason || Boolean(routePreseasonWeek);
  const preseasonScheduleData = preseasonState.season === scheduleSeason ? preseasonState.data : null;
  const regularWeekOptions = useMemo(
    () => buildWeekOptions(scheduleData, NFL_SEASON_PHASES.REGULAR),
    [scheduleData],
  );
  const preseasonWeekOptions = useMemo(
    () => buildWeekOptions(preseasonScheduleData, NFL_SEASON_PHASES.PRESEASON),
    [preseasonScheduleData],
  );
  const weekOptions = useMemo(
    () => preseasonRequested ? [...preseasonWeekOptions, ...regularWeekOptions] : regularWeekOptions,
    [preseasonRequested, preseasonWeekOptions, regularWeekOptions],
  );
  const defaultRegularWeek = useMemo(() => getDefaultScheduleWeek(scheduleData), [scheduleData]);
  const activeWeek = routePreseasonWeek && weekOptions.some((entry) => entry.selection === routePreseasonWeek)
    ? routePreseasonWeek
    : routeRegularWeek && weekOptions.some((entry) => entry.selection === routeRegularWeek)
      ? routeRegularWeek
      : weekOptions.some((entry) => entry.selection === defaultRegularWeek)
        ? defaultRegularWeek
        : weekOptions[0]?.selection ?? null;
  const activeWeekOption = weekOptions.find((entry) => entry.selection === activeWeek);
  const viewingPreseason = activeWeekOption?.phase === NFL_SEASON_PHASES.PRESEASON;
  const activeFilter = viewingPreseason && requestedFilter === STATISTICS_SCHEDULE_FILTERS.PRIMETIME
    ? STATISTICS_SCHEDULE_FILTERS.ALL
    : requestedFilter;
  const hasRegularSchedule = scheduleHasGames(scheduleData);
  const hasSchedule = hasRegularSchedule || (preseasonRequested && scheduleHasGames(preseasonScheduleData));
  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const favoriteTeamId = useMemo(() => resolveTeamId(favoriteTeam, teamsById), [favoriteTeam, teamsById]);
  const [recentTeamId, setRecentTeamId] = useState(readRecentTeamId);
  const resolvedRecentTeamId = useMemo(
    () => (recentTeamId === favoriteTeamId ? null : resolveTeamId(recentTeamId, teamsById)),
    [recentTeamId, favoriteTeamId, teamsById],
  );
  const preseasonStatus = !preseasonRequested
    ? 'idle'
    : preseasonScheduleData
      ? 'ready'
      : preseasonState.season === scheduleSeason && preseasonState.status === 'error'
        ? 'error'
        : 'loading';
  const loadedWeekCount = weekOptions.length;
  const scheduleStatusLabel = preseasonStatus === 'loading' && hasRegularSchedule
    ? `${regularWeekOptions.length} regular weeks · Loading preseason…`
    : preseasonStatus === 'error' && hasRegularSchedule
      ? `${regularWeekOptions.length} regular weeks · Preseason unavailable`
      : hasSchedule
        ? `${loadedWeekCount} weeks loaded`
        : 'No schedule loaded';

  useEffect(() => {
    if (!preseasonRequested || preseasonScheduleData) return undefined;
    const controller = new AbortController();
    fetchEspnPreseason({ season: scheduleSeason, signal: controller.signal })
      .then((data) => setPreseasonState({ status: 'ready', data, error: null, season: scheduleSeason }))
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setPreseasonState({ status: 'error', data: null, error: error.message, season: scheduleSeason });
      });
    return () => controller.abort();
  }, [preseasonRequested, preseasonScheduleData, scheduleSeason]);

  useEffect(() => {
    if (!routeMode) return;
    writeStoredMode(routeMode);
  }, [routeMode]);

  const setMode = (nextMode) => {
    if (PRIMARY_SCHEDULE_MODES.has(nextMode)) {
      writeStoredMode(nextMode);
    }

    const nextFilter = nextMode === STATISTICS_SCHEDULE_MODES.WEEK && TEAM_ONLY_FILTERS.has(activeFilter)
      ? STATISTICS_SCHEDULE_FILTERS.ALL
      : activeFilter;

    onRouteChange?.({
      statisticsScheduleMode: nextMode,
      statisticsScheduleWeek: nextMode === STATISTICS_SCHEDULE_MODES.WEEK ? activeWeek : null,
      statisticsScheduleTeamId: nextMode === STATISTICS_SCHEDULE_MODES.TEAM ? selectedTeamId : null,
      statisticsScheduleFilter: nextFilter === STATISTICS_SCHEDULE_FILTERS.ALL ? null : nextFilter,
    });
  };

  const togglePreseason = (nextIncluded) => {
    setIncludePreseason(nextIncluded);
    selectCurrentPreseasonOnLoadRef.current = nextIncluded
      && activeMode === STATISTICS_SCHEDULE_MODES.WEEK;
    if (nextIncluded && !preseasonScheduleData) {
      setPreseasonState({ status: 'loading', data: null, error: null, season: scheduleSeason });
    }

    if (!nextIncluded && activeMode === STATISTICS_SCHEDULE_MODES.WEEK) {
      onRouteChange?.({
        statisticsScheduleMode: activeMode,
        statisticsScheduleWeek: defaultRegularWeek,
        statisticsScheduleTeamId: null,
        statisticsScheduleFilter: null,
      });
    }
  };

  const selectWeek = (nextWeek) => {
    const nextWeekOption = weekOptions.find((entry) => entry.selection === nextWeek);
    const nextFilter = nextWeekOption?.phase === NFL_SEASON_PHASES.PRESEASON
      && requestedFilter === STATISTICS_SCHEDULE_FILTERS.PRIMETIME
      ? STATISTICS_SCHEDULE_FILTERS.ALL
      : getAvailableFilterForGames(nextWeekOption?.games ?? [], requestedFilter);
    writeStoredMode(STATISTICS_SCHEDULE_MODES.WEEK);
    onRouteChange?.({
      statisticsScheduleMode: STATISTICS_SCHEDULE_MODES.WEEK,
      statisticsScheduleWeek: nextWeek,
      statisticsScheduleTeamId: null,
      statisticsScheduleFilter: nextFilter === STATISTICS_SCHEDULE_FILTERS.ALL ? null : nextFilter,
    });
  };

  useEffect(() => {
    if (!selectCurrentPreseasonOnLoadRef.current) return;
    if (preseasonStatus === 'error') {
      selectCurrentPreseasonOnLoadRef.current = false;
      return;
    }
    if (!preseasonScheduleData) return;

    selectCurrentPreseasonOnLoadRef.current = false;
    const currentPreseasonWeek = getCurrentPreseasonWeekSelection({
      preseasonWeekOptions,
      regularWeekOptions,
    });
    if (!currentPreseasonWeek) return;
    const nextWeekOption = preseasonWeekOptions.find((entry) => entry.selection === currentPreseasonWeek);
    const nextFilter = requestedFilter === STATISTICS_SCHEDULE_FILTERS.PRIMETIME
      ? STATISTICS_SCHEDULE_FILTERS.ALL
      : getAvailableFilterForGames(nextWeekOption?.games ?? [], requestedFilter);
    writeStoredMode(STATISTICS_SCHEDULE_MODES.WEEK);
    onRouteChange?.({
      statisticsScheduleMode: STATISTICS_SCHEDULE_MODES.WEEK,
      statisticsScheduleWeek: currentPreseasonWeek,
      statisticsScheduleTeamId: null,
      statisticsScheduleFilter: nextFilter === STATISTICS_SCHEDULE_FILTERS.ALL ? null : nextFilter,
    });
  }, [
    onRouteChange,
    preseasonScheduleData,
    preseasonStatus,
    preseasonWeekOptions,
    regularWeekOptions,
    requestedFilter,
  ]);

  const selectTeam = (nextTeamId) => {
    writeStoredMode(STATISTICS_SCHEDULE_MODES.TEAM);
    writeRecentTeamId(nextTeamId);
    setRecentTeamId(normalizeScheduleTeamId(nextTeamId));
    onRouteChange?.({
      statisticsScheduleMode: STATISTICS_SCHEDULE_MODES.TEAM,
      statisticsScheduleWeek: null,
      statisticsScheduleTeamId: nextTeamId,
      statisticsScheduleFilter: activeFilter === STATISTICS_SCHEDULE_FILTERS.ALL ? null : activeFilter,
    });
  };

  const selectFilter = (nextFilter) => {
    const normalizedFilter = normalizeStatisticsScheduleFilter(nextFilter, STATISTICS_SCHEDULE_FILTERS.ALL);
    if (viewingPreseason && normalizedFilter === STATISTICS_SCHEDULE_FILTERS.PRIMETIME) return;
    onRouteChange?.({
      statisticsScheduleMode: activeMode,
      statisticsScheduleWeek: activeMode === STATISTICS_SCHEDULE_MODES.WEEK ? activeWeek : null,
      statisticsScheduleTeamId: activeMode === STATISTICS_SCHEDULE_MODES.TEAM ? selectedTeamId : null,
      statisticsScheduleFilter: normalizedFilter === STATISTICS_SCHEDULE_FILTERS.ALL ? null : normalizedFilter,
    });
  };

  return (
    <div className="statistics-schedule">
      <div className="statistics-schedule-controlbar">
        <div className="statistics-schedule-mode-toggle" role="group" aria-label="Primary schedule view">
          <ModeButton
            mode={STATISTICS_SCHEDULE_MODES.WEEK}
            activeMode={activeMode}
            label="By Week"
            onClick={() => setMode(STATISTICS_SCHEDULE_MODES.WEEK)}
          />
          <ModeButton
            mode={STATISTICS_SCHEDULE_MODES.TEAM}
            activeMode={activeMode}
            label="By Team"
            onClick={() => setMode(STATISTICS_SCHEDULE_MODES.TEAM)}
          />
        </div>
        <IncludePreseasonControl
          checked={preseasonRequested}
          onChange={togglePreseason}
        />
        <span className="statistics-schedule-status">{scheduleStatusLabel}</span>
      </div>

      {!hasRegularSchedule && preseasonRequested && preseasonStatus === 'loading' ? (
        <section className="statistics-schedule-empty-section">
          <InlineEmptyState
            title="Loading the preseason schedule"
            copy="Fetching the latest NFL preseason slate from ESPN."
          />
        </section>
      ) : !hasSchedule ? (
        <section className="statistics-schedule-empty-section">
          <InlineEmptyState
            title={preseasonRequested && preseasonStatus === 'error' ? 'Preseason schedule is unavailable' : 'NFL schedule is not available yet'}
            copy={preseasonRequested && preseasonStatus === 'error'
              ? 'The live ESPN preseason feed could not be reached. Try again after reconnecting.'
              : 'Once the released schedule is loaded, weekly slates and team schedules will appear here.'}
          />
        </section>
      ) : activeMode === STATISTICS_SCHEDULE_MODES.TEAM ? (
        <TeamScheduleView
          teams={teams}
          teamsById={teamsById}
          scheduleData={scheduleData}
          preseasonScheduleData={preseasonScheduleData}
          includePreseason={preseasonRequested}
          selectedTeamId={selectedTeamId}
          activeFilter={activeFilter}
          onSelectTeam={selectTeam}
          onFilterChange={selectFilter}
          darkMode={darkMode}
          season={scheduleSeason}
          onViewGameStats={onViewGameStats}
          favoriteTeamId={favoriteTeamId}
          recentTeamId={resolvedRecentTeamId}
        />
      ) : (
        <WeekScheduleView
          weekOptions={weekOptions}
          teamsById={teamsById}
          activeWeek={activeWeek}
          activeFilter={activeFilter}
          onWeekChange={selectWeek}
          onFilterChange={selectFilter}
          darkMode={darkMode}
          season={scheduleSeason}
          onViewGameStats={onViewGameStats}
        />
      )}
    </div>
  );
}
