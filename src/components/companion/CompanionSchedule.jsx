import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSleeperBase } from '../../context/SleeperContext.jsx';
import {
  buildFantasyRematchMap,
  buildFantasyRosterScheduleRows,
  buildFantasyRosterSummaryMap,
  buildFantasyScheduleWeeks,
  getFantasyScheduleEdge,
  getFantasyScheduleWeekBounds,
  getRemainingOpponentAverage,
} from '../../utils/fantasySeasonSchedule.js';
import { getFantasyLeagueCurrentWeek } from '../../utils/fantasySeasonWeeks.js';
import {
  CompanionFantasyTeamMenu,
  CompanionSegmentedControl,
  CompanionSelectorButton,
  CompanionSelectorRail,
} from './CompanionSelectorControls.jsx';
import EmptyState from '../ui/EmptyState';
import LoadingSwap, { SkeletonRows } from '../ui/LoadingSwap.jsx';

const normalizeRosterId = (value) => (value == null || value === '' ? null : String(value));

// One season of matchup rows per league is stable for the whole visit, so the
// 14-or-so weekly requests are made once and shared across mounts.
const SEASON_SCHEDULE_CACHE = new Map();
const SEASON_SCHEDULE_IN_FLIGHT = new Map();

function formatEdge(edge) {
  if (edge == null) return null;
  const rounded = Math.abs(edge) < 0.05 ? 0 : edge;
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(1)}`;
}

function edgeColor(edge) {
  if (edge == null || Math.abs(edge) < 0.05) return 'var(--color-label-secondary)';
  return edge > 0 ? 'var(--color-accent-green)' : 'var(--color-accent-red)';
}

function TeamMark({ name, isMe = false }) {
  const initials = String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '—';
  return (
    <span
      className="companion-schedule-mark"
      style={isMe ? { boxShadow: 'inset 0 0 0 2px var(--color-signature)' } : null}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

function YouPill() {
  return <span className="companion-schedule-you">You</span>;
}

/**
 * Fantasy Schedule.
 *
 * Two readings of the same season of pairings: one roster's week-by-week card
 * ("My season", which any manager can be swapped into) and the full league
 * slate grouped by week ("All teams"). Scores only appear for weeks the
 * provider has scored; nothing here forecasts a result.
 */
export default function CompanionSchedule({
  mode = 'season',
  week = null,
  rosterId = null,
  onModeChange = null,
  onWeekChange = null,
  onRosterChange = null,
  onOpenWeek = null,
}) {
  const {
    platform, selectedLeagueId, league, season,
    rosters, leagueUsers, getUserDisplayName, myRoster, loadMatchups,
  } = useSleeperBase();

  const [seasonLoad, setSeasonLoad] = useState({ key: null, data: null, error: false });
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const [showPlayed, setShowPlayed] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const weekHeadingRefs = useRef(new Map());

  const bounds = useMemo(() => getFantasyScheduleWeekBounds(league), [league]);
  const currentWeek = useMemo(() => getFantasyLeagueCurrentWeek(league), [league]);
  // `myRoster` is a selector on the league context, not a value.
  const myRosterId = normalizeRosterId(myRoster?.()?.roster_id);
  const selectedRosterId = normalizeRosterId(rosterId) ?? myRosterId;
  const regularSeasonWeeks = bounds.regularSeasonWeeks;
  const fantasyPlatformLabel = platform === 'espn' ? 'ESPN' : 'Sleeper';

  const cacheKey = selectedLeagueId && regularSeasonWeeks >= 1
    ? `${platform}|${selectedLeagueId}|${season}|${regularSeasonWeeks}`
    : null;

  // A finished season sits in the module cache, so a remount reads it during
  // render rather than re-entering the loading state.
  const cachedSeason = cacheKey ? SEASON_SCHEDULE_CACHE.get(cacheKey) ?? null : null;
  const resolvedLoad = cachedSeason
    ? { key: cacheKey, data: cachedSeason, error: false }
    : (seasonLoad.key === cacheKey ? seasonLoad : { key: cacheKey, data: null, error: false });
  const matchupsByWeek = resolvedLoad.data;
  const loadError = resolvedLoad.error;
  const loading = Boolean(cacheKey) && !matchupsByWeek && !loadError;

  // Fetch the whole regular season once per league/season. A week that fails
  // is recorded as absent rather than empty so the view can say the pairing
  // has not loaded instead of implying a bye.
  useEffect(() => {
    if (!cacheKey || SEASON_SCHEDULE_CACHE.has(cacheKey)) return undefined;

    let cancelled = false;

    const request = SEASON_SCHEDULE_IN_FLIGHT.get(cacheKey) ?? Promise.all(
      Array.from({ length: regularSeasonWeeks }, (_, index) => index + 1).map((weekNumber) => (
        Promise.resolve(loadMatchups(selectedLeagueId, weekNumber))
          .then((rows) => [weekNumber, Array.isArray(rows) ? rows : null])
          .catch(() => [weekNumber, null])
      )),
    ).then((entries) => {
      const next = {};
      entries.forEach(([weekNumber, rows]) => { next[weekNumber] = rows; });
      // A season where every week failed is not a cacheable answer — leaving
      // it out lets a later mount retry instead of showing a permanent error.
      if (!Object.values(next).every((rows) => rows == null)) {
        SEASON_SCHEDULE_CACHE.set(cacheKey, next);
      }
      return next;
    }).finally(() => {
      SEASON_SCHEDULE_IN_FLIGHT.delete(cacheKey);
    });
    SEASON_SCHEDULE_IN_FLIGHT.set(cacheKey, request);

    request
      .then((next) => {
        if (cancelled) return;
        const every = Object.values(next).every((rows) => rows == null);
        setSeasonLoad({ key: cacheKey, data: every ? null : next, error: every });
      })
      .catch(() => {
        if (cancelled) return;
        setSeasonLoad({ key: cacheKey, data: null, error: true });
      });

    return () => { cancelled = true; };
  }, [cacheKey, loadMatchups, regularSeasonWeeks, selectedLeagueId]);

  const summaryMap = useMemo(() => buildFantasyRosterSummaryMap(rosters), [rosters]);

  const weeks = useMemo(() => buildFantasyScheduleWeeks({
    matchupsByWeek: matchupsByWeek ?? {},
    rosters,
    getUserDisplayName,
    userRosterId: myRosterId,
    regularSeasonWeeks,
    currentWeek,
  }), [currentWeek, getUserDisplayName, matchupsByWeek, myRosterId, regularSeasonWeeks, rosters]);

  const rosterOptions = useMemo(() => {
    const userById = new Map((leagueUsers ?? []).map((user) => [user.user_id, user]));
    return (rosters ?? []).map((roster) => ({
      id: normalizeRosterId(roster.roster_id),
      name: getUserDisplayName?.(roster.owner_id) ?? `Roster ${roster.roster_id}`,
      avatarHash: userById.get(roster.owner_id)?.avatar ?? null,
      isMe: normalizeRosterId(roster.roster_id) === myRosterId,
    })).filter((option) => option.id);
  }, [getUserDisplayName, leagueUsers, myRosterId, rosters]);

  const selectedRosterOption = useMemo(
    () => rosterOptions.find((option) => option.id === selectedRosterId) ?? null,
    [rosterOptions, selectedRosterId],
  );

  // A roster's display name is its team name when it has one, so the manager
  // behind it is a separate fact worth showing. Rosters whose display name is
  // already the manager are left out rather than repeated.
  const managerByRosterId = useMemo(() => {
    const userById = new Map((leagueUsers ?? []).map((user) => [user.user_id, user]));
    const map = new Map();
    (rosters ?? []).forEach((roster) => {
      const id = normalizeRosterId(roster.roster_id);
      const user = userById.get(roster.owner_id);
      const handle = user?.username ?? user?.display_name ?? null;
      const shown = getUserDisplayName?.(roster.owner_id) ?? null;
      if (id && handle && handle !== shown) map.set(id, `@${handle}`);
    });
    return map;
  }, [getUserDisplayName, leagueUsers, rosters]);

  const seasonRows = useMemo(
    () => buildFantasyRosterScheduleRows(weeks, selectedRosterId),
    [selectedRosterId, weeks],
  );
  const rematchMap = useMemo(() => buildFantasyRematchMap(seasonRows), [seasonRows]);
  const selectedSummary = selectedRosterId ? summaryMap.get(selectedRosterId) ?? null : null;
  const remainingOpponentAverage = useMemo(
    () => getRemainingOpponentAverage(seasonRows, summaryMap, currentWeek ?? 1),
    [currentWeek, seasonRows, summaryMap],
  );

  const visibleSeasonRows = useMemo(
    () => (showPlayed ? seasonRows : seasonRows.filter((row) => !row.isPlayed)),
    [seasonRows, showPlayed],
  );
  const playedCount = useMemo(
    () => seasonRows.filter((row) => row.isPlayed).length,
    [seasonRows],
  );

  const scrollToWeek = useCallback((weekNumber) => {
    onWeekChange?.(weekNumber);
    const node = weekHeadingRefs.current.get(weekNumber);
    node?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [onWeekChange]);

  if (!selectedLeagueId) {
    return (
      <EmptyState
        title="No league connected"
        hint={`Connect a ${fantasyPlatformLabel} league to see the full season schedule.`}
      />
    );
  }

  if (regularSeasonWeeks < 1) {
    return (
      <EmptyState
        title="No regular season weeks"
        hint="This league has not set a regular-season length yet."
      />
    );
  }

  const modeOptions = [
    { value: 'season', label: 'My Season' },
    { value: 'league', label: 'All Teams' },
  ];

  return (
    <div className="companion-schedule flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <CompanionSegmentedControl
          value={mode}
          options={modeOptions}
          onChange={(next) => onModeChange?.(next)}
          ariaLabel="Schedule view"
        />
        {mode === 'season' && rosterOptions.length > 0 && (
          <CompanionFantasyTeamMenu
            open={teamMenuOpen}
            options={rosterOptions}
            mode="single"
            includeAll={false}
            selectedIds={selectedRosterId ? [selectedRosterId] : []}
            selectedOptions={selectedRosterOption ? [selectedRosterOption] : []}
            onOpenChange={setTeamMenuOpen}
            kicker="Team"
            placeholder="Select a team"
            menuLabel="Schedule team selector"
            onChange={(nextIds) => onRosterChange?.(nextIds?.[0] ?? null)}
          />
        )}
        <div className="companion-schedule-controls__end flex flex-1 flex-wrap items-center justify-end gap-2">
          {mode === 'season' && playedCount > 0 && (
            <CompanionSelectorButton
              active={showPlayed}
              size="sm"
              onClick={() => setShowPlayed((current) => !current)}
            >
              {showPlayed ? 'Full season' : `Remaining (${seasonRows.length - playedCount})`}
            </CompanionSelectorButton>
          )}
          {mode === 'league' && myRosterId && (
            <CompanionSelectorButton
              active={onlyMine}
              size="sm"
              onClick={() => setOnlyMine((current) => !current)}
            >
              Only my matchups
            </CompanionSelectorButton>
          )}
        </div>
      </div>

      {mode === 'league' && (
        <CompanionSelectorRail ariaLabel="Jump to week">
          {weeks.map((entry) => (
            <CompanionSelectorButton
              key={entry.week}
              active={week === entry.week}
              size="sm"
              onClick={() => scrollToWeek(entry.week)}
            >
              {`Wk ${entry.week}`}
            </CompanionSelectorButton>
          ))}
        </CompanionSelectorRail>
      )}

      {loadError && !loading && (
        <EmptyState
          title="Schedule unavailable"
          hint={`GridShift could not load this season's matchups from ${fantasyPlatformLabel}.`}
        />
      )}

      {!loadError && (
        <LoadingSwap
          loading={loading && !matchupsByWeek}
          skeleton={<SkeletonRows count={8} height="3.25rem" />}
        >
          {mode === 'season' ? (
            <SeasonSchedule
              rows={visibleSeasonRows}
              rematchMap={rematchMap}
              managerByRosterId={managerByRosterId}
              summaryMap={summaryMap}
              selectedSummary={selectedSummary}
              remainingOpponentAverage={remainingOpponentAverage}
              myRosterId={myRosterId}
              onOpenWeek={onOpenWeek}
              fantasyPlatformLabel={fantasyPlatformLabel}
            />
          ) : (
            <LeagueSchedule
              weeks={weeks}
              summaryMap={summaryMap}
              myRosterId={myRosterId}
              onlyMine={onlyMine}
              onOpenWeek={onOpenWeek}
              weekHeadingRefs={weekHeadingRefs}
              fantasyPlatformLabel={fantasyPlatformLabel}
            />
          )}
        </LoadingSwap>
      )}

      {bounds.playoffStartWeek && (
        <div className="companion-schedule-playoffs">
          <span className="companion-schedule-playoffs__kicker">
            {bounds.maxWeek > bounds.playoffStartWeek
              ? `Weeks ${bounds.playoffStartWeek}–${bounds.maxWeek} · Playoffs`
              : `Week ${bounds.playoffStartWeek} · Playoffs`}
          </span>
          <span className="companion-schedule-playoffs__copy">
            {`Brackets are seeded after week ${bounds.playoffStartWeek - 1}. GridShift shows playoff matchups once ${fantasyPlatformLabel} posts them.`}
          </span>
        </div>
      )}
    </div>
  );
}

function SeasonStat({ label, value }) {
  return (
    <div className="companion-schedule-stat">
      <span className="companion-schedule-stat__label">{label}</span>
      <span className="companion-schedule-stat__value">{value ?? '—'}</span>
    </div>
  );
}

function SeasonSchedule({
  rows,
  rematchMap,
  managerByRosterId,
  summaryMap,
  selectedSummary,
  remainingOpponentAverage,
  myRosterId,
  onOpenWeek,
  fantasyPlatformLabel,
}) {
  if (!rows.length) {
    return (
      <EmptyState
        title="Nothing left on the schedule"
        hint="Every regular-season week for this team has been played."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="companion-schedule-stats">
        <SeasonStat label="Record" value={selectedSummary?.recordLabel} />
        <SeasonStat
          label="Points for"
          value={selectedSummary?.pointsFor != null ? selectedSummary.pointsFor.toFixed(1) : null}
        />
        <SeasonStat
          label="Points per game"
          value={selectedSummary?.pointsPerGame != null ? selectedSummary.pointsPerGame.toFixed(1) : null}
        />
        <SeasonStat
          label="Remaining opp PPG"
          value={remainingOpponentAverage != null ? remainingOpponentAverage.toFixed(1) : null}
        />
      </div>

      <div role="table" aria-label="Season schedule by week" className="companion-schedule-table">
        <div role="row" className="companion-schedule-row companion-schedule-row--head">
          <span role="columnheader" className="companion-schedule-head">Week</span>
          <span role="columnheader" className="companion-schedule-head">Opponent</span>
          <span role="columnheader" className="companion-schedule-head companion-schedule-cell--end">Record</span>
          <span role="columnheader" className="companion-schedule-head companion-schedule-cell--end">Opp PPG</span>
          <span role="columnheader" className="companion-schedule-head companion-schedule-cell--end">Edge</span>
        </div>

        {rows.map((row) => {
          const opponentSummary = row.opponent
            ? summaryMap.get(row.opponent.rosterId) ?? null
            : null;
          const edge = row.isPlayed
            ? null
            : getFantasyScheduleEdge(selectedSummary, opponentSummary);
          const rematchWeek = rematchMap.get(row.week) ?? null;
          const interactive = Boolean(onOpenWeek);
          const Cell = interactive ? 'button' : 'div';

          return (
            <Cell
              key={row.week}
              type={interactive ? 'button' : undefined}
              role="row"
              onClick={interactive ? () => onOpenWeek(row.week) : undefined}
              className={`companion-schedule-row${row.isCurrent ? ' companion-schedule-row--current' : ''}${interactive ? ' companion-schedule-row--interactive' : ''}`}
            >
              <span role="cell" className="companion-schedule-week">
                <span className="companion-schedule-week__number">{row.week}</span>
                {row.isCurrent && <span className="companion-schedule-week__now">Now</span>}
              </span>

              <span role="cell" className="companion-schedule-team">
                {row.isPending ? (
                  <span className="companion-schedule-muted">{`Not loaded from ${fantasyPlatformLabel}`}</span>
                ) : row.isUnscheduled ? (
                  <span className="companion-schedule-muted">Pairing not posted yet</span>
                ) : row.isBye ? (
                  <span className="companion-schedule-muted">Bye week</span>
                ) : (
                  <>
                    <TeamMark name={row.opponent.name} isMe={row.opponent.rosterId === myRosterId} />
                    <span className="companion-schedule-team__copy">
                      <span className="companion-schedule-team__name">
                        {row.opponent.name}
                        {row.opponent.rosterId === myRosterId && <YouPill />}
                      </span>
                      <span className="companion-schedule-team__meta">
                        {[managerByRosterId.get(row.opponent.rosterId), rematchWeek ? `Rematch of week ${rematchWeek}` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </>
                )}
              </span>

              {row.isPlayed ? (
                <>
                  <span role="cell" className="companion-schedule-cell--end">
                    <span
                      className="companion-schedule-result"
                      data-result={row.result ?? 'T'}
                    >
                      {row.result ?? 'T'}
                    </span>
                  </span>
                  <span role="cell" className="companion-schedule-cell--end companion-schedule-figure">
                    {row.pointsFor != null ? row.pointsFor.toFixed(1) : '—'}
                  </span>
                  <span role="cell" className="companion-schedule-cell--end companion-schedule-figure">
                    {row.pointsAgainst != null ? row.pointsAgainst.toFixed(1) : '—'}
                  </span>
                </>
              ) : (
                <>
                  <span role="cell" className="companion-schedule-cell--end companion-schedule-figure">
                    {opponentSummary?.recordLabel ?? '—'}
                  </span>
                  <span role="cell" className="companion-schedule-cell--end companion-schedule-figure">
                    {opponentSummary?.pointsPerGame != null ? opponentSummary.pointsPerGame.toFixed(1) : '—'}
                  </span>
                  <span
                    role="cell"
                    className="companion-schedule-cell--end companion-schedule-figure"
                    style={{ color: edgeColor(edge) }}
                  >
                    {formatEdge(edge) ?? '—'}
                  </span>
                </>
              )}
            </Cell>
          );
        })}
      </div>
    </div>
  );
}

function LeagueSchedule({
  weeks,
  summaryMap,
  myRosterId,
  onlyMine,
  onOpenWeek,
  weekHeadingRefs,
  fantasyPlatformLabel,
}) {
  const visibleWeeks = weeks
    .map((entry) => ({
      ...entry,
      visibleGroups: (entry.groups ?? []).filter((group) => !onlyMine || group.includesUser),
    }))
    .filter((entry) => entry.groups == null || entry.visibleGroups.length > 0);

  if (!visibleWeeks.length) {
    return (
      <EmptyState
        title="No matchups match this filter"
        hint="Clear the filter to see the rest of the league's weeks."
      />
    );
  }

  return (
    // LoadingSwap already wraps its content in the shared staggered reveal;
    // nesting another one would leave these rows at the entrance's start state.
    <div className="flex flex-col gap-5">
      {visibleWeeks.map((entry) => (
        <div key={entry.week} className="companion-schedule-group">
          <div
            className="companion-schedule-group__header"
            ref={(node) => {
              if (node) weekHeadingRefs.current.set(entry.week, node);
              else weekHeadingRefs.current.delete(entry.week);
            }}
          >
            <span className="companion-schedule-group__title">{`Week ${entry.week}`}</span>
            {entry.isCurrent && <span className="companion-schedule-week__now">This week</span>}
            {entry.isComplete && <span className="companion-schedule-group__meta">Final</span>}
          </div>

          {entry.groups == null ? (
            <div className="companion-schedule-muted px-3 py-3">
              {`Not loaded from ${fantasyPlatformLabel}`}
            </div>
          ) : (
            entry.visibleGroups.map((group) => {
              const [left, right] = group.sides;
              const leftSummary = left ? summaryMap.get(left.rosterId) ?? null : null;
              const rightSummary = right ? summaryMap.get(right.rosterId) ?? null : null;
              const interactive = Boolean(onOpenWeek);
              const Row = interactive ? 'button' : 'div';
              return (
                <Row
                  key={group.key}
                  type={interactive ? 'button' : undefined}
                  onClick={interactive ? () => onOpenWeek(entry.week) : undefined}
                  className={`companion-schedule-pair${group.includesUser ? ' companion-schedule-pair--mine' : ''}${interactive ? ' companion-schedule-row--interactive' : ''}`}
                >
                  <PairSide
                    side={left}
                    summary={leftSummary}
                    myRosterId={myRosterId}
                    align="end"
                    played={group.isPlayed}
                  />
                  <span className="companion-schedule-pair__center">
                    {right ? (
                      <span className="companion-schedule-pair__vs">vs</span>
                    ) : (
                      <span className="companion-schedule-pair__vs">Bye</span>
                    )}
                  </span>
                  <PairSide
                    side={right}
                    summary={rightSummary}
                    myRosterId={myRosterId}
                    align="start"
                    played={group.isPlayed}
                  />
                </Row>
              );
            })
          )}
        </div>
      ))}
    </div>
  );
}

function PairSide({ side, summary, myRosterId, align, played }) {
  if (!side) return <span className="companion-schedule-pair__side" />;
  const isMe = side.rosterId === myRosterId;
  const points = played && side.row?.points != null ? Number(side.row.points) : null;
  return (
    <span className={`companion-schedule-pair__side companion-schedule-pair__side--${align}`}>
      {align === 'end' && (
        <span className="companion-schedule-team__copy companion-schedule-team__copy--end">
          <span className="companion-schedule-team__name">
            {isMe && <YouPill />}
            {side.name}
          </span>
          <span className="companion-schedule-team__meta">
            {played && points != null
              ? `${points.toFixed(1)} pts`
              : summary
                ? `${summary.recordLabel}${summary.pointsPerGame != null ? ` · ${summary.pointsPerGame.toFixed(1)} PPG` : ''}`
                : ''}
          </span>
        </span>
      )}
      <TeamMark name={side.name} isMe={isMe} />
      {align === 'start' && (
        <span className="companion-schedule-team__copy">
          <span className="companion-schedule-team__name">
            {side.name}
            {isMe && <YouPill />}
          </span>
          <span className="companion-schedule-team__meta">
            {played && points != null
              ? `${points.toFixed(1)} pts`
              : summary
                ? `${summary.recordLabel}${summary.pointsPerGame != null ? ` · ${summary.pointsPerGame.toFixed(1)} PPG` : ''}`
                : ''}
          </span>
        </span>
      )}
    </span>
  );
}
