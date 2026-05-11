import { useEffect, useMemo, useState } from 'react';
import { useSleeperBase, useSleeperStatsEnhancing } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { STADIUMS } from '../../data/stadiums';
import useMediaQuery from '../../hooks/useMediaQuery.js';
import {
  DEFAULT_DEFENSE_RANKING_STATE,
  DEFENSE_RANKING_POSITIONS,
  buildDefenseRankingRows,
  filterDefenseRankingRows,
  getDefaultDefenseRankingStat,
  getDefenseRankingStatOption,
  getDefenseRankingStatOptions,
  normalizeDefenseRankingDir,
  normalizeDefenseRankingMode,
  normalizeDefenseRankingPosition,
  normalizeDefenseRankingSort,
  normalizeDefenseRankingStat,
} from '../../utils/defenseRankings.js';
import { getNflTeamLogoUrl } from '../../utils/companionAssetVisuals.js';
import Modal from '../Modal.jsx';
import { CompanionSearchField, CompanionSelectorButton, CompanionSelectorRail } from './CompanionSelectorControls.jsx';
import CompanionPlayerRow, { CompanionPlayerMetric } from './CompanionPlayerRow.jsx';

const ALL_TEAMS = Object.keys(STADIUMS).sort();
const ESPN_LOGO_KEY = { WAS: 'wsh' };
const COMPACT_ROW_QUERY = '(max-width: 720px)';
const TEAM_DISPLAY_NAMES = {
  ARI: 'Arizona Cardinals',
  ATL: 'Atlanta Falcons',
  BAL: 'Baltimore Ravens',
  BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers',
  CHI: 'Chicago Bears',
  CIN: 'Cincinnati Bengals',
  CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys',
  DEN: 'Denver Broncos',
  DET: 'Detroit Lions',
  GB: 'Green Bay Packers',
  HOU: 'Houston Texans',
  IND: 'Indianapolis Colts',
  JAX: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs',
  LAC: 'Los Angeles Chargers',
  LAR: 'Los Angeles Rams',
  LV: 'Las Vegas Raiders',
  MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings',
  NE: 'New England Patriots',
  NO: 'New Orleans Saints',
  NYG: 'New York Giants',
  NYJ: 'New York Jets',
  PHI: 'Philadelphia Eagles',
  PIT: 'Pittsburgh Steelers',
  SEA: 'Seattle Seahawks',
  SF: 'San Francisco 49ers',
  TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans',
  WAS: 'Washington Commanders',
};

function getTeamLogoUrl(team) {
  return getNflTeamLogoUrl((ESPN_LOGO_KEY[team] ?? team)?.toLowerCase());
}

function getTeamDisplayName(team) {
  return TEAM_DISPLAY_NAMES[team] ?? team;
}

function normalizeRouteState(routeState) {
  const position = normalizeDefenseRankingPosition(routeState?.position);
  return {
    mode: normalizeDefenseRankingMode(routeState?.mode),
    position,
    stat: normalizeDefenseRankingStat(routeState?.stat, position),
    sort: normalizeDefenseRankingSort(routeState?.sort),
    dir: normalizeDefenseRankingDir(routeState?.dir),
    query: String(routeState?.query ?? ''),
  };
}

function fmtValue(value, mode, stat) {
  if (value == null || !Number.isFinite(value)) return '-';
  const wholeNumberStats = new Set(['pass_td', 'pass_int', 'rush_td', 'rush_att', 'rec', 'rec_td']);
  if (mode === 'stats' && wholeNumberStats.has(stat)) return Math.round(value).toLocaleString();
  return value.toLocaleString(undefined, {
    minimumFractionDigits: mode === 'fantasy' ? 1 : 0,
    maximumFractionDigits: mode === 'fantasy' ? 1 : 1,
  });
}

function getValueLabel(mode, position, stat) {
  return mode === 'fantasy'
    ? `Fantasy Points Allowed to ${position}`
    : `${getDefenseRankingStatOption(position, stat).label} Allowed to ${position}`;
}

function groupContributionsByWeek(row) {
  if (!row) return [];
  const byWeek = new Map();
  row.contributions.forEach((entry) => {
    if (!byWeek.has(entry.week)) {
      byWeek.set(entry.week, {
        week: entry.week,
        opponent: entry.opponent,
        total: 0,
        players: [],
      });
    }
    const week = byWeek.get(entry.week);
    week.total += entry.value;
    week.players.push(entry);
  });
  return [...byWeek.values()]
    .sort((a, b) => a.week - b.week)
    .map(week => ({
      ...week,
      players: week.players.sort((a, b) => b.value - a.value || a.playerName.localeCompare(b.playerName)),
    }));
}

function SortHeader({ active, dir, children, onClick, align = 'right' }) {
  return (
    <button
      type="button"
      className={`companion-defense-sort-header${active ? ' is-active' : ''}`}
      onClick={onClick}
      style={{ justifyContent: align === 'left' ? 'flex-start' : 'flex-end' }}
      aria-label={`Sort by ${children}${active ? ` ${dir}` : ''}`}
    >
      {children}{active ? (dir === 'asc' ? ' Asc' : ' Desc') : ''}
    </button>
  );
}

export default function CompanionDefense({ routeState, onRouteStateChange }) {
  const {
    hasLeague,
    players,
    weeklyStats,
    scheduleMap,
    statsLoading,
    loadPlayers,
    loadSeasonStats,
    activeScoringSettings,
  } = useSleeperBase();
  const statsEnhancing = useSleeperStatsEnhancing();
  const { darkMode } = useTheme();
  const compactRows = useMediaQuery(COMPACT_ROW_QUERY);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const state = useMemo(() => normalizeRouteState(routeState ?? DEFAULT_DEFENSE_RANKING_STATE), [routeState]);
  const statOptions = useMemo(() => getDefenseRankingStatOptions(state.position), [state.position]);
  const activeStatLabel = getValueLabel(state.mode, state.position, state.stat);

  useEffect(() => {
    if (hasLeague && !players) loadPlayers?.();
  }, [hasLeague, players, loadPlayers]);

  useEffect(() => {
    if (hasLeague && (!weeklyStats || !scheduleMap) && !statsLoading) loadSeasonStats?.();
  }, [hasLeague, weeklyStats, scheduleMap, statsLoading, loadSeasonStats]);

  const updateRouteState = (patch) => {
    onRouteStateChange?.({ ...state, ...patch });
  };

  const setSort = (sort) => {
    if (state.sort === sort) {
      updateRouteState({ dir: state.dir === 'desc' ? 'asc' : 'desc' });
      return;
    }
    updateRouteState({ sort, dir: 'desc' });
  };

  const rows = useMemo(() => (
    buildDefenseRankingRows({
      weeklyStats,
      players,
      scheduleMap,
      scoringSettings: activeScoringSettings,
      position: state.position,
      mode: state.mode,
      stat: state.stat,
      sort: state.sort,
      dir: state.dir,
      teams: ALL_TEAMS,
    })
  ), [activeScoringSettings, players, scheduleMap, state.dir, state.mode, state.position, state.sort, state.stat, weeklyStats]);

  const filteredRows = useMemo(() => {
    const query = state.query.trim().toUpperCase();
    if (!query) return rows;
    const abbreviationMatches = new Set(filterDefenseRankingRows(rows, state.query).map(row => row.team));
    return rows.filter(row => abbreviationMatches.has(row.team) || getTeamDisplayName(row.team).toUpperCase().includes(query));
  }, [rows, state.query]);
  const selectedRow = useMemo(() => rows.find(row => row.team === selectedTeam) ?? null, [rows, selectedTeam]);
  const detailWeeks = useMemo(() => groupContributionsByWeek(selectedRow), [selectedRow]);
  const loading = !players || !weeklyStats || !scheduleMap || statsLoading || statsEnhancing;

  return (
    <div className="companion-defense-shell pb-6">
      <div className="companion-defense-toolbar px-4 pb-3">
        <div className="companion-defense-filter-stack">
          <CompanionSelectorRail ariaLabel="Defense value mode">
            {[
              { id: 'stats', label: 'Game Stats' },
              { id: 'fantasy', label: 'Fantasy Value' },
            ].map(option => (
              <CompanionSelectorButton
                key={option.id}
                active={state.mode === option.id}
                onClick={() => updateRouteState({ mode: option.id })}
              >
                {option.label}
              </CompanionSelectorButton>
            ))}
          </CompanionSelectorRail>

          <CompanionSelectorRail ariaLabel="Offensive position allowed">
            {DEFENSE_RANKING_POSITIONS.map(position => (
              <CompanionSelectorButton
                key={position}
                active={state.position === position}
                onClick={() => updateRouteState({
                  position,
                  stat: getDefaultDefenseRankingStat(position),
                })}
              >
                {position}
              </CompanionSelectorButton>
            ))}
          </CompanionSelectorRail>

          <CompanionSelectorRail ariaLabel="Allowed stat category">
            {state.mode === 'stats' ? (
              statOptions.map(option => (
                <CompanionSelectorButton
                  key={option.id}
                  active={state.stat === option.id}
                  onClick={() => updateRouteState({ stat: option.id })}
                >
                  {option.shortLabel}
                </CompanionSelectorButton>
              ))
            ) : (
              <CompanionSelectorButton active>
                Fantasy Points
              </CompanionSelectorButton>
            )}
          </CompanionSelectorRail>
        </div>

        <div className="companion-defense-search-wrap">
          <CompanionSearchField
            value={state.query}
            onChange={(event) => updateRouteState({ query: event.target.value })}
            placeholder="Search team"
          />
        </div>
      </div>

      <div className="companion-defense-summary-row px-4">
        <div>
          <p className="companion-defense-subtitle">{activeStatLabel} - season to date - most allowed first</p>
        </div>
      </div>

      {loading ? (
        <div className="companion-defense-empty">
          {statsEnhancing ? 'Preparing defensive rankings...' : 'Load season stats to see defensive rankings.'}
        </div>
      ) : (
        <div className="companion-defense-table-frame">
          <div className="companion-defense-row-header">
            <span>Rank</span>
            <SortHeader active={state.sort === 'team'} dir={state.dir} align="left" onClick={() => setSort('team')}>Defense</SortHeader>
            <div className="companion-defense-row-header__metrics">
              <SortHeader active={state.sort === 'total'} dir={state.dir} onClick={() => setSort('total')}>Total</SortHeader>
              <SortHeader active={state.sort === 'avg'} dir={state.dir} onClick={() => setSort('avg')}>Per Game</SortHeader>
            </div>
            <span aria-hidden="true" />
          </div>
          <div className="companion-defense-row-list">
            {filteredRows.map(row => (
              <CompanionPlayerRow
                key={row.team}
                player={{
                  id: row.team,
                  name: getTeamDisplayName(row.team),
                  team: row.team,
                  position: 'DEF',
                  logoKey: (ESPN_LOGO_KEY[row.team] ?? row.team).toLowerCase(),
                }}
                darkMode={darkMode}
                interactive
                compact={compactRows}
                showAvatar={false}
                showPosition={false}
                showTeamLogo={false}
                identityAccessory={(
                  <img
                    className="companion-defense-inline-logo"
                    src={getTeamLogoUrl(row.team)}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                  />
                )}
                gridTemplate="44px minmax(0,1fr) minmax(164px, 224px) 12px"
                compactGridTemplate="38px minmax(0,1fr) minmax(112px, 1fr) 12px"
                columnGridTemplate={compactRows ? 'repeat(2, minmax(0, 1fr))' : '112px 112px'}
                columns={[
                  <CompanionPlayerMetric key="total" value={fmtValue(row.total, state.mode, state.stat)} label="Total" />,
                  <CompanionPlayerMetric key="avg" value={fmtValue(row.avg, state.mode, state.stat)} label="Per Game" />,
                ]}
                leading={(
                  <span className="companion-defense-rank">#{row.rank}</span>
                )}
                trailing={<span className="companion-defense-row-chevron" aria-hidden="true">&gt;</span>}
                onClick={() => setSelectedTeam(row.team)}
                ariaLabel={`Open ${getTeamDisplayName(row.team)} defense details`}
                className="companion-defense-row"
                style={{
                  borderLeftWidth: 4,
                  borderRadius: 0,
                  borderBottom: '1px solid var(--color-separator)',
                }}
              />
            ))}
          </div>
          {filteredRows.length === 0 && (
            <div className="companion-defense-empty">No defenses match that team search.</div>
          )}
        </div>
      )}

      {selectedRow && (
        <Modal
          onClose={() => setSelectedTeam(null)}
          ariaLabel={`${getTeamDisplayName(selectedRow.team)} defense details`}
          containerClassName="companion-defense-modal-panel"
          containerStyle={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-separator)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
          }}
        >
          <div className="companion-defense-modal-header">
            <div className="companion-defense-modal-title-row">
              <img
                src={getTeamLogoUrl(selectedRow.team)}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
              />
              <div>
                <h3>{getTeamDisplayName(selectedRow.team)}</h3>
                <p>{activeStatLabel} - weekly breakdown</p>
              </div>
            </div>
            <button type="button" onClick={() => setSelectedTeam(null)} aria-label="Close defense details">Close</button>
          </div>
          <div className="companion-defense-modal-stats">
            <span><strong>#{selectedRow.rank}</strong>Rank</span>
            <span><strong>{fmtValue(selectedRow.total, state.mode, state.stat)}</strong>Total Allowed</span>
            <span><strong>{fmtValue(selectedRow.avg, state.mode, state.stat)}</strong>Per Game</span>
          </div>
          <div className="companion-defense-modal-body">
            {detailWeeks.length > 0 ? detailWeeks.map(week => (
              <div key={week.week} className="companion-defense-week-card">
                <div className="companion-defense-week-card__header">
                  <span>Week {week.week}{week.opponent ? ` vs ${week.opponent}` : ''}</span>
                  <strong>{fmtValue(week.total, state.mode, state.stat)}</strong>
                </div>
                <div className="companion-defense-contrib-list">
                  {week.players.map(player => (
                    <div key={`${week.week}-${player.playerId}-${player.playerName}`} className="companion-defense-contrib-row">
                      <span>{player.playerName}</span>
                      <span>{player.position}</span>
                      <strong>{fmtValue(player.value, state.mode, state.stat)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )) : (
              <div className="companion-defense-empty">No weekly contributions are available for this selection.</div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
