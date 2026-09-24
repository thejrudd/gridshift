import { useEffect, useMemo, useState } from 'react';
import { getPlayerDesignations } from '../../api/playerDesignationsApi.js';
import { useSleeperLeague, useSleeperStats } from '../../context/SleeperContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { getTeamColorKey } from '../../data/teamColors.js';
import useMediaQuery from '../../hooks/useMediaQuery.js';
import { getNflTeamLogoUrl } from '../../utils/companionAssetVisuals.js';
import {
  buildFantasyInjuryReport,
  filterFantasyInjuryReport,
  getFantasyInjuryPositionOptions,
  getFantasyInjurySleeperCandidateTeams,
  getFantasyInjuryPracticeLabel,
  getFantasyInjuryStatusLabel,
  isFantasyInjuryCurrentSeason,
  isFantasyInjuryLeagueSnapshotReady,
} from '../../utils/fantasyInjuries.js';
import EmptyState from '../ui/EmptyState.jsx';
import LoadingSwap, { SkeletonRows } from '../ui/LoadingSwap.jsx';
import CompanionPlayerRow, { CompanionPlayerStatus } from './CompanionPlayerRow.jsx';
import PlayerStatusBadge from './PlayerStatusBadge.jsx';
import {
  CompanionFantasyTeamMenu,
  CompanionSearchField,
  CompanionSelectorButton,
  CompanionSelectorRail,
} from './CompanionSelectorControls.jsx';

const COMPACT_PHONE_QUERY = '(max-width: 480px)';

function isValidNflState(state) {
  const season = Number(state?.season);
  const week = Number(state?.week);
  return Number.isInteger(season) && season >= 2002 && season <= 2100
    && Number.isInteger(week) && week >= 1 && week <= 18;
}

function formatTimestamp(value, { includeTime = true } = {}) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(date);
}

function getPracticeTone(status) {
  if (status === 'Full practice') return 'positive';
  if (status === 'Limited practice') return 'warning';
  if (status === 'Did not practice') return 'negative';
  return 'neutral';
}

function getSourceCopy(sourceState) {
  if (sourceState.status === 'ready') {
    return sourceState.response?.freshness?.stale
      ? 'BALLDONTLIE delayed snapshot'
      : 'BALLDONTLIE weekly designations';
  }
  if (sourceState.status === 'loading') return 'Checking BALLDONTLIE availability';
  if (sourceState.status === 'not-needed') return 'Sleeper concern report';
  return 'Sleeper-only report';
}

function EvidenceItem({ label, children }) {
  if (children == null || children === '') return null;
  return (
    <div className="fantasy-injuries-evidence__item">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function PlayerEvidence({ row, regionId }) {
  const bdl = row.bdl;
  return (
    <div id={regionId} className="fantasy-injuries-evidence" role="region" aria-label={`${row.displayName} availability details`}>
      <dl className="fantasy-injuries-evidence__grid">
        <EvidenceItem label="Sleeper roster status">
          {row.sleeper?.label ?? row.sleeper?.status ?? 'Not reported'}
        </EvidenceItem>
        <EvidenceItem label="Injury reason">{bdl?.injury ?? 'Not reported'}</EvidenceItem>
        <EvidenceItem label="Game status">{bdl?.gameStatus ?? 'Not reported'}</EvidenceItem>
        <EvidenceItem label="Active status">
          {bdl?.active == null ? 'Not reported' : bdl.active ? 'Active' : 'Inactive'}
        </EvidenceItem>
        {bdl?.starter != null && (
          <EvidenceItem label="Postgame starter">{bdl.starter ? 'Started' : 'Did not start'}</EvidenceItem>
        )}
        {bdl?.didNotPlay != null && (
          <EvidenceItem label="Postgame participation">{bdl.didNotPlay ? 'Did not play' : 'Played'}</EvidenceItem>
        )}
        <EvidenceItem label="Provider updated">{formatTimestamp(bdl?.updatedAt) ?? 'Not reported'}</EvidenceItem>
      </dl>

      {bdl?.practiceReports?.length > 0 ? (
        <div className="fantasy-injuries-practice-history">
          <h3>Practice reports</h3>
          <ol>
            {bdl.practiceReports.map((report, index) => (
              <li key={`${report.date ?? 'undated'}-${report.status}-${index}`}>
                <time dateTime={report.date ?? undefined}>{formatTimestamp(report.date, { includeTime: false }) ?? 'Date unavailable'}</time>
                <span>{report.status}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="fantasy-injuries-evidence__note">
          {bdl
            ? 'No practice report was included in this designation.'
            : 'No unique weekly designation is available. Missing data is unknown, not a healthy confirmation.'}
        </p>
      )}
    </div>
  );
}

function InjuryRow({ row, darkMode, compact, expanded, onToggle }) {
  const regionId = `fantasy-injury-${String(row.playerId).replace(/[^a-z0-9_-]/gi, '-')}`;
  const practiceLabel = getFantasyInjuryPracticeLabel(row, compact);
  const primaryLabel = getFantasyInjuryStatusLabel(row, compact);
  const primaryIsPractice = ['Did not practice', 'Limited practice', 'Full practice'].includes(row.status);
  const summaryStatus = (
    <div className="fantasy-injuries-row__status">
      {row.status && !primaryIsPractice && (
        <PlayerStatusBadge
          status={row.status}
          compact={compact}
          detail={row.sleeper?.status === row.status ? row.sleeper?.detail : null}
          localContrast={false}
        />
      )}
      {row.status && primaryIsPractice && (
        <CompanionPlayerStatus
          tone={getPracticeTone(row.status)}
          localContrast={false}
          title={row.status}
        >
          {primaryLabel}
        </CompanionPlayerStatus>
      )}
      {practiceLabel && practiceLabel !== primaryLabel && (
        <CompanionPlayerStatus
          tone={getPracticeTone(row.bdl?.latestPractice?.status)}
          className="fantasy-injuries-practice-status"
          localContrast={false}
          title={row.bdl?.latestPractice?.status}
        >
          {practiceLabel}
        </CompanionPlayerStatus>
      )}
    </div>
  );

  return (
    <article className={`fantasy-injuries-row${expanded ? ' is-expanded' : ''}`} data-testid="fantasy-injury-row">
      <CompanionPlayerRow
        player={{ ...row, id: row.playerId, name: row.displayName }}
        name={row.displayName}
        darkMode={darkMode}
        compact={compact}
        showAccentRail={false}
        showTeamLogo={!compact}
        gridTemplate="40px 34px minmax(200px, 1fr) 36px auto 44px"
        compactGridTemplate="36px 30px minmax(0, 1fr) 44px"
        metaSegments={[row.team, row.fantasyTeamName, row.ownerName]}
        status={summaryStatus}
        actions={(
          <button
            type="button"
            className="fantasy-injuries-disclosure"
            aria-label={`${expanded ? 'Hide' : 'Show'} ${row.displayName} availability details`}
            aria-expanded={expanded}
            aria-controls={regionId}
            onClick={onToggle}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
        className="fantasy-injuries-player-row"
        dataTestId={`fantasy-injury-player-${row.playerId}`}
      />
      {expanded && <PlayerEvidence row={row} regionId={regionId} />}
    </article>
  );
}

export default function CompanionInjuries() {
  const {
    platform,
    selectedLeagueId,
    league,
    season,
    seasonSwitching,
    connectLoading,
    nflState,
    nflStateLoading,
    nflStateError,
    rosters,
    leagueUsers,
    sleeperUser,
  } = useSleeperLeague();
  const { players, loadPlayers } = useSleeperStats();
  const { darkMode } = useTheme();
  const compact = useMediaQuery(COMPACT_PHONE_QUERY);
  const [sourceState, setSourceState] = useState({ status: 'idle', nflState: null, response: null, error: null });
  const [refreshKey, setRefreshKey] = useState(0);
  const [position, setPosition] = useState('ALL');
  const [rosterFilter, setRosterFilter] = useState({ scope: '', ids: [] });
  const [nflTeams, setNflTeams] = useState([]);
  const [playerQuery, setPlayerQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fantasyMenuOpen, setFantasyMenuOpen] = useState(false);
  const [nflMenuOpen, setNflMenuOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const leagueSnapshotReady = isFantasyInjuryLeagueSnapshotReady({
    season,
    leagueSeason: league?.season,
    seasonSwitching,
  });
  const sleeperCandidateTeams = useMemo(() => getFantasyInjurySleeperCandidateTeams({
    players: players ?? {},
    rosters: rosters ?? [],
  }), [players, rosters]);
  // Roster synchronization can replace the array every 30 seconds. The
  // designation request should restart only when the actual team set changes.
  const sleeperCandidateTeamKey = sleeperCandidateTeams.join(',');
  const stableSleeperCandidateTeams = useMemo(
    () => (sleeperCandidateTeamKey ? sleeperCandidateTeamKey.split(',') : []),
    [sleeperCandidateTeamKey],
  );

  useEffect(() => {
    if (platform === 'sleeper') void loadPlayers();
  }, [loadPlayers, platform]);

  useEffect(() => {
    if (platform !== 'sleeper' || !selectedLeagueId) return undefined;
    if (!leagueSnapshotReady || !players) return undefined;

    const controller = new AbortController();
    let cancelled = false;

    async function loadDesignationSnapshot() {
      await Promise.resolve();
      if (cancelled) return;
      setSourceState((current) => ({ ...current, status: 'loading', error: null }));
      if (nflStateLoading || !nflState) {
        if (!cancelled && nflStateLoading) {
          setSourceState((current) => ({ ...current, status: 'loading', nflState: null, error: null }));
        } else if (!cancelled) {
          setSourceState({
            status: 'unavailable',
            nflState: null,
            response: null,
            error: nflStateError
              ? new Error(nflStateError)
              : new Error('Current NFL week unavailable.'),
          });
        }
        return;
      }

      if (!isValidNflState(nflState)) {
        if (!cancelled) setSourceState({ status: 'unavailable', nflState: null, response: null, error: new Error('Current NFL week unavailable.') });
        return;
      }

      if (!isFantasyInjuryCurrentSeason({ selectedSeason: season, nflSeason: nflState.season })) {
        if (!cancelled) setSourceState({ status: 'out-of-scope', nflState, response: null, error: null });
        return;
      }

      // The Sleeper-backed report can render while optional BALLDONTLIE
      // enrichment is still loading. Keep the current snapshot during a
      // manual refresh so an existing report does not disappear meanwhile.
      if (!cancelled) {
        setSourceState((current) => ({
          ...current,
          status: 'loading',
          nflState,
          error: null,
        }));
      }

      if (stableSleeperCandidateTeams.length === 0) {
        if (!cancelled) setSourceState({ status: 'not-needed', nflState, response: null, error: null });
        return;
      }

      try {
        const response = await getPlayerDesignations({
          season: Number(nflState.season),
          week: Number(nflState.week),
          teams: stableSleeperCandidateTeams,
          signal: controller.signal,
        });
        if (!cancelled) setSourceState({ status: 'ready', nflState, response, error: null });
      } catch (error) {
        if (cancelled || error?.name === 'AbortError') return;
        setSourceState({ status: 'unavailable', nflState, response: null, error });
      }
    }

    void loadDesignationSnapshot();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    leagueSnapshotReady,
    nflState,
    nflStateError,
    nflStateLoading,
    platform,
    players,
    refreshKey,
    season,
    selectedLeagueId,
    stableSleeperCandidateTeams,
  ]);

  const currentSeasonReady = isFantasyInjuryCurrentSeason({
    selectedSeason: season,
    nflSeason: sourceState.nflState?.season,
  });
  const reportScopeReady = leagueSnapshotReady && currentSeasonReady;
  const report = useMemo(() => buildFantasyInjuryReport({
    players: reportScopeReady ? players ?? {} : {},
    rosters: reportScopeReady ? rosters : [],
    leagueUsers: reportScopeReady ? leagueUsers : [],
    sleeperUser,
    designationRows: reportScopeReady ? sourceState.response?.data ?? [] : [],
  }), [leagueUsers, players, reportScopeReady, rosters, sleeperUser, sourceState]);

  const positionOptions = useMemo(() => getFantasyInjuryPositionOptions(report), [report]);
  const currentUserId = sleeperUser?.user_id ?? sleeperUser?.userId ?? sleeperUser?.id ?? null;
  const fantasyTeamOptions = useMemo(() => {
    const usersById = new Map((leagueUsers ?? []).map((user) => [
      String(user?.user_id ?? user?.userId ?? user?.id ?? ''), user,
    ]));
    const options = new Map();

    (rosters ?? []).forEach((roster) => {
      const id = String(roster?.roster_id ?? roster?.rosterId ?? '');
      if (!id) return;
      const ownerId = roster?.owner_id ?? roster?.ownerId ?? null;
      const owner = usersById.get(String(ownerId ?? ''));
      const ownerName = owner?.display_name ?? owner?.displayName ?? owner?.username ?? 'Unknown owner';
      options.set(id, {
        id,
        name: owner?.metadata?.team_name ?? ownerName,
        avatarHash: owner?.avatar ?? null,
        isMe: currentUserId != null && String(ownerId) === String(currentUserId),
      });
    });

    report.forEach((row) => {
      const id = String(row.rosterId ?? '');
      if (!id || options.has(id)) return;
      options.set(id, {
        id,
        name: row.fantasyTeamName,
        avatarHash: row.ownerAvatar,
        isMe: row.isCurrentUser,
      });
    });
    return [...options.values()].sort((left, right) => Number(right.isMe) - Number(left.isMe) || left.name.localeCompare(right.name));
  }, [currentUserId, leagueUsers, report, rosters]);
  const filterScope = `${platform}:${selectedLeagueId ?? ''}:${season ?? ''}:${String(currentUserId ?? '')}`;
  const currentUserOption = fantasyTeamOptions.find((option) => option.isMe);
  const defaultRosterIds = currentUserOption ? [currentUserOption.id] : [];
  const rosterIds = rosterFilter.scope === filterScope ? rosterFilter.ids : defaultRosterIds;
  const nflTeamOptions = useMemo(() => (
    [...new Set(report.map((row) => row.team).filter(Boolean))].sort().map((team) => ({
      id: team,
      name: team,
      logoUrl: getNflTeamLogoUrl(getTeamColorKey(team)),
    }))
  ), [report]);
  const filteredReport = useMemo(() => filterFantasyInjuryReport(report, {
    position: position === 'ALL' ? null : position,
    rosterIds,
    nflTeams,
    playerQuery,
  }), [nflTeams, playerQuery, position, report, rosterIds]);
  const filtering = position !== 'ALL' || rosterIds.length > 0 || nflTeams.length > 0 || playerQuery.trim() !== '';
  const activeFilterCount = [
    position !== 'ALL',
    rosterIds.length > 0,
    nflTeams.length > 0,
    playerQuery.trim() !== '',
  ].filter(Boolean).length;
  const loading = platform === 'sleeper' && (
    !players
    || connectLoading
    || seasonSwitching != null
    || nflStateLoading
    || (leagueSnapshotReady && !sourceState.nflState && (sourceState.status === 'idle' || sourceState.status === 'loading'))
  );
  const currentWeekUnavailable = sourceState.status === 'unavailable' && !currentSeasonReady;
  const week = sourceState.nflState?.week ?? null;
  const freshnessTime = formatTimestamp(sourceState.response?.freshness?.providerFetchedAt);

  const clearFilters = () => {
    setPosition('ALL');
    setRosterFilter({ scope: filterScope, ids: [] });
    setNflTeams([]);
    setPlayerQuery('');
  };

  const toggleFilters = () => {
    setFiltersOpen((open) => {
      if (open) {
        setFantasyMenuOpen(false);
        setNflMenuOpen(false);
      }
      return !open;
    });
  };

  const toggleExpanded = (playerId) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  if (platform !== 'sleeper') {
    return (
      <div className="page-frame-data pb-6 fantasy-injuries-page" data-testid="fantasy-injuries-page">
        <EmptyState title="Injuries is available for Sleeper leagues only." hint="Connect or switch to a Sleeper league to view rostered availability concerns." />
      </div>
    );
  }

  if (!loading && sourceState.status === 'out-of-scope') {
    return (
      <div className="page-frame-data pb-6 fantasy-injuries-page" data-testid="fantasy-injuries-page">
        <EmptyState
          title="Injuries is available for the current league season only."
          hint="Switch to the current league season to view this week’s rostered availability concerns."
        />
      </div>
    );
  }

  if (!loading && !leagueSnapshotReady) {
    return (
      <div className="page-frame-data pb-6 fantasy-injuries-page" data-testid="fantasy-injuries-page">
        <EmptyState
          title="Current league snapshot unavailable."
          hint="The selected season’s league roster could not be loaded, so stale manager and player data is hidden."
        />
      </div>
    );
  }

  return (
    <div className="page-frame-data pb-6 fantasy-injuries-page" data-testid="fantasy-injuries-page">
      <section className="fantasy-injuries-source" aria-label="Injury report source and freshness">
        <div className="fantasy-injuries-source__week">
          <span>{week ? `Week ${week}` : 'Current week unavailable'}</span>
          <strong>{report.length} {report.length === 1 ? 'concern' : 'concerns'}</strong>
        </div>
        <div className="fantasy-injuries-source__provider">
          <span>{getSourceCopy(sourceState)}</span>
          {freshnessTime && <time dateTime={sourceState.response?.freshness?.providerFetchedAt}>Updated {freshnessTime}</time>}
        </div>
        <button
          type="button"
          className="fantasy-injuries-refresh"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={sourceState.status === 'loading'}
        >
          {sourceState.status === 'loading' ? 'Refreshing…' : 'Refresh'}
        </button>
      </section>

      {sourceState.status === 'unavailable' && (
        <div className="fantasy-injuries-fallback" role="status">
          <strong>Sleeper-only operation</strong>
          <span>Weekly designations are unavailable. Missing BALLDONTLIE data is unknown and is not treated as healthy.</span>
        </div>
      )}

      <section className="fantasy-injuries-controls" aria-label="Filter injury report">
        <CompanionSelectorButton
          active={filtersOpen}
          className="companion-filter-toggle fantasy-injuries-filter-toggle"
          size="md"
          aria-expanded={filtersOpen}
          aria-controls="fantasy-injuries-filter-panel"
          data-testid="fantasy-injuries-filter-toggle"
          onClick={toggleFilters}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          <span>Filters</span>
          <span className="companion-filter-toggle__summary fantasy-injuries-filter-toggle__summary" aria-hidden="true">
            {filtering ? `${activeFilterCount} active` : 'All concerns'}
          </span>
        </CompanionSelectorButton>

        <div
          id="fantasy-injuries-filter-panel"
          className={`fantasy-injuries-filter-panel${!filtersOpen ? ' is-collapsed' : ''}`}
          data-testid="fantasy-injuries-filter-panel"
        >
          <CompanionSelectorRail label="Position" ariaLabel="Filter injuries by position">
            <CompanionSelectorButton active={position === 'ALL'} onClick={() => setPosition('ALL')}>All</CompanionSelectorButton>
            {positionOptions.map((option) => (
              <CompanionSelectorButton key={option} active={position === option} onClick={() => setPosition(option)}>
                {option}
              </CompanionSelectorButton>
            ))}
          </CompanionSelectorRail>

          <div className="fantasy-injuries-controls__menus">
            <CompanionFantasyTeamMenu
              open={fantasyMenuOpen}
              options={fantasyTeamOptions}
              selectedIds={rosterIds}
              onOpenChange={(open) => {
                setFantasyMenuOpen(open);
                if (open) setNflMenuOpen(false);
              }}
              onChange={(ids) => setRosterFilter({ scope: filterScope, ids })}
              placeholder="All Fantasy Teams"
              allLabel="All Fantasy Teams"
              kicker="Fantasy Team"
              menuLabel="Fantasy team injury filter"
            />
            <CompanionFantasyTeamMenu
              open={nflMenuOpen}
              options={nflTeamOptions}
              selectedIds={nflTeams}
              onOpenChange={(open) => {
                setNflMenuOpen(open);
                if (open) setFantasyMenuOpen(false);
              }}
              onChange={setNflTeams}
              placeholder="All NFL Teams"
              allLabel="All NFL Teams"
              kicker="NFL Team"
              menuLabel="NFL team injury filter"
              pluralLabel="NFL Teams"
            />
            <CompanionSearchField
              value={playerQuery}
              onChange={(event) => setPlayerQuery(event.target.value)}
              placeholder="Search players"
              inputProps={{ 'aria-label': 'Search injuries by player' }}
            />
            {filtering && (
              <button type="button" className="fantasy-injuries-clear" onClick={clearFilters}>Clear filters</button>
            )}
          </div>
        </div>
      </section>

      {!loading && currentWeekUnavailable && (
        <EmptyState title="Current NFL week unavailable." hint="The injury report is paused until Sleeper provides the current season and week." />
      )}
      {!loading && report.length === 0 && sourceState.status === 'ready' && (
        <EmptyState title="No rostered concerns this week." hint="No actionable Sleeper status or unique weekly designation was found." />
      )}
      {!loading && report.length === 0 && sourceState.status === 'unavailable' && (
        <EmptyState title="No Sleeper roster concerns found." hint="BALLDONTLIE is unavailable, so unmatched and missing designations remain unknown." />
      )}
      {!loading && report.length > 0 && filteredReport.length === 0 && (
        <EmptyState
          title="No concerns match these filters."
          hint="Clear one or more filters to return to the full report."
          action={<button type="button" className="fantasy-injuries-empty-action" onClick={clearFilters}>Clear filters</button>}
        />
      )}
      {/* Loading motion: shared skeleton -> reveal handoff. Timing and gesture
          come from the --gs-load-* tokens; see docs/Loading Motion.md. */}
      {(loading || filteredReport.length > 0) && (
        <LoadingSwap
          loading={loading}
          resetKey={`${platform}:${week ?? ''}`}
          role="region"
          aria-label={loading ? 'Loading injury report' : `${filteredReport.length} rostered injury concerns`}
          className="fantasy-injuries-list"
          skeletonClassName="fantasy-injuries-list"
          skeleton={<SkeletonRows count={5} height="3.75rem" />}
        >
          {filteredReport.map((row) => (
            <InjuryRow
              key={`${row.rosterId}-${row.playerId}`}
              row={row}
              darkMode={darkMode}
              compact={compact}
              expanded={expandedIds.has(row.playerId)}
              onToggle={() => toggleExpanded(row.playerId)}
            />
          ))}
        </LoadingSwap>
      )}
    </div>
  );
}
