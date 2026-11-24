import { useEffect, useId, useMemo, useState } from 'react';
import { CaretDownIcon } from '@phosphor-icons/react/CaretDown';
import { getPlayerDesignations } from '../../api/playerDesignationsApi.js';
import { fetchGameLog, fetchPlayerSnapCounts, fetchTeamDefenseGameLog } from '../../utils/playerApi.js';
import { getPlayerAvailabilityContext } from '../../utils/playerAvailabilityStatus.js';
import { getBundledNflTeamLogoUrl } from '../../utils/companionAssetVisuals.js';
import { getHeatmapInactiveDescription, getHeatmapPlayerActivity } from '../../utils/fantasyHeatmapData.js';
import { buildStatMap } from '../../utils/playerMetrics.js';
import { createRequestCache } from '../../utils/requestCache.js';
import { selectGameSnapPercentage } from '../../utils/snapCounts.js';
import CompanionPlayerRow, { CompanionPlayerMetric } from './CompanionPlayerRow.jsx';
import PlayerStatusBadge from './PlayerStatusBadge.jsx';

const EMPTY = [];
const MISSING = '—';
const designationCache = createRequestCache();

const formatValue = (value) => value == null ? MISSING : Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 });
const formatSnap = (value) => value == null ? MISSING : formatValue(value) + '%';

function snapForGame(game, counts, position, season) {
  const meta = { week: game.week, myTeam: game.team };
  return selectGameSnapPercentage({ meta }, counts, position, season, game.entry);
}

function usePlayerSnaps(rows, season) {
  const ids = rows.map(row => row.espnId).filter(Boolean).sort().join(',');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!ids || !season) return undefined;
    let active = true;
    const queue = [...new Set(ids.split(','))];
    // A team can have many players when All positions is selected.
    const load = async () => {
      while (active && queue.length) {
        const id = queue.shift();
        const counts = await fetchPlayerSnapCounts(id, season).catch(() => EMPTY);
        if (!active) return;
        setResult(previous => ({
          season,
          counts: { ...(previous?.season === season ? previous.counts : {}), [id]: counts },
        }));
      }
    };
    for (let worker = 0; worker < Math.min(4, queue.length); worker += 1) void load();
    return () => { active = false; };
  }, [ids, season]);

  return result && result.season === season ? result.counts : null;
}

function useInactiveReasons(games, { name, position }, season) {
  const inactiveWeeks = games.filter(game => game.inactive && game.team)
    .map(game => game.week + ':' + game.team).join(',');
  const [reasons, setReasons] = useState({});
  useEffect(() => {
    if (!inactiveWeeks || !season) return undefined;
    let active = true;
    const load = async () => {
      for (const item of inactiveWeeks.split(',')) {
        if (!active) return;
        const [week, team] = item.split(':');
        try {
          const payload = await designationCache.load(season + ':' + item,
            () => getPlayerDesignations({ season, week, teams: [team] }));
          const reason = getHeatmapInactiveDescription(payload?.data, { name, position, team }, season, week);
          if (active && reason) setReasons(previous => ({ ...previous, [item]: reason }));
        } catch (error) {
          // The optional source may be unavailable for this installation.
          if ([401, 403, 503].includes(error.status)) return;
        }
      }
    };
    void load();
    return () => { active = false; };
  }, [inactiveWeeks, name, position, season]);
  return reasons;
}

function GameLog({ row, season, counts }) {
  const { espnId, team, position, isTeamDefense, logGames, activityColumns } = row;
  const [officialLog, setOfficialLog] = useState(EMPTY);

  useEffect(() => {
    if ((!espnId && position !== 'DEF') || !season) return undefined;
    let active = true;
    const request = position === 'DEF'
      ? fetchTeamDefenseGameLog(team, season)
      : fetchGameLog(espnId, team, season);
    request.then(log => {
      if (active && Array.isArray(log)) setOfficialLog(log);
    }).catch(() => {});
    return () => { active = false; };
  }, [espnId, position, season, team]);

  const gamesByWeek = new Map(logGames.map(game => [game.week, game]));
  for (const { meta, statsJson } of officialLog) {
    const week = Number(meta?.week);
    if (!(week >= row.firstWeek && week <= row.throughWeek)
      || meta.isBye || meta.isPostseason || meta.completed === false) continue;
    const game = gamesByWeek.get(week);
    if (!game && !statsJson && !meta.isInactive) continue;
    gamesByWeek.set(week, {
      ...game,
      week,
      team: meta.myTeam ?? game?.team,
      inactive: meta.isInactive === true || (!statsJson && game?.inactive),
      officialOpponent: meta.opponent,
      statsJson,
    });
  }
  const games = [...gamesByWeek.values()].sort((left, right) => right.week - left.week);
  const inactiveReasons = useInactiveReasons(games, row, season);
  if (!games.length) return <p className="companion-heatmap-game-log-empty">No completed games in this window.</p>;

  return (
    <table className="companion-heatmap-game-log" aria-label={row.name + ' game log'}>
      <thead>
        <tr>
          <th scope="col">Week</th><th scope="col">Opponent</th>
          {!isTeamDefense && <th scope="col">Snap %</th>}
          {activityColumns.map(column => <th key={column.label} scope="col" title={column.title}>{column.label}</th>)}
          <th scope="col">Pts</th>
        </tr>
      </thead>
      <tbody>
        {games.map(game => {
          const officialOpp = game.officialOpponent?.match(/^(@|vs?)\s*([a-z]+)$/i);
          const opponent = officialOpp?.[2]?.toUpperCase() ?? game.opponent;
          const site = officialOpp ? (officialOpp[1] === '@' ? '@' : 'v ') : game.isHome === true ? 'v ' : game.isHome === false ? '@' : '';
          const url = getBundledNflTeamLogoUrl(opponent);
          const officialStats = game.statsJson && buildStatMap(game.statsJson);
          const snap = game.inactive ? null : snapForGame(game, counts, position, season);
          return (
            <tr key={game.week}>
              <th scope="row">{game.week}</th>
              <td>
                <span className="companion-heatmap-game-opponent">
                  <span>{opponent ? site + opponent : MISSING}</span>
                  {url && <img src={url} width="18" height="18" alt="" loading="lazy" />}
                </span>
                {game.inactive && (
                  <div className="companion-heatmap-game-absence">
                    {inactiveReasons[game.week + ':' + game.team] ?? 'DNP'}
                  </div>
                )}
              </td>
              {!isTeamDefense && <td>{formatSnap(snap)}</td>}
              {activityColumns.map(column => (
                <td key={column.label}>{formatValue(game.inactive ? null : getHeatmapPlayerActivity(column, game.entry, officialStats))}</td>
              ))}
              <td>{formatValue(game.inactive ? null : game.points)}</td>
            </tr>
          );
        })}
      </tbody>
      {row.seasonPoints != null && (
        <tfoot className="companion-heatmap-game-season-total">
          <tr>
            <th scope="row" colSpan={(isTeamDefense ? 2 : 3) + activityColumns.length}>Season Pts</th>
            <td>{formatValue(row.seasonPoints)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

export default function HeatmapPlayerResults({
  rows, season, upcoming, valueLabel, darkMode, canOpenStats, onOpenStats, openingId, initialExpandedId = null,
}) {
  const [expandedId, setExpandedId] = useState(initialExpandedId);
  const [sort, setSort] = useState({ key: 'value', direction: 'desc' });
  const detailId = useId();
  const snapsById = usePlayerSnaps(rows, season);
  const entries = useMemo(() => rows.map(row => {
    const counts = snapsById?.[row.espnId] ?? EMPTY;
    const samples = row.games.map(game => snapForGame(game, counts, row.position, season))
      .filter(value => value != null);
    const snap = samples.length ? samples.reduce((total, value) => total + value, 0) / samples.length : null;
    return { ...row, counts, snap };
  }).sort((a, b) => {
    const left = a[sort.key];
    const right = b[sort.key];
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    const order = sort.key === 'name' ? left.localeCompare(right) : left - right;
    return sort.direction === 'desc' ? -order : order;
  }), [rows, season, snapsById, sort]);

  const activityColumns = new Set(entries.map(row => row.activityColumns[0]).filter(Boolean));
  const defenseOnly = entries.every(row => row.isTeamDefense);
  const hasActivity = activityColumns.size > 0;
  const hasTackles = entries.some(row => row.activityColumns.length > 1);
  const mixedActivity = new Set([...activityColumns].map(column => column.label)).size > 1;
  const rateSuffix = upcoming ? '/G' : '';
  const primaryActivity = [...activityColumns][0];
  const activityHeader = mixedActivity ? 'Usage' : primaryActivity?.label + rateSuffix;
  const sortable = (key, label, className, title) => {
    const active = sort.key === key;
    const requestDirection = active
      ? (sort.direction === 'desc' ? 'asc' : 'desc')
      : (key === 'name' ? 'asc' : 'desc');
    const current = active ? (sort.direction === 'desc' ? ', sorted descending' : ', sorted ascending') : '';
    return (
      <button
        type="button"
        className={'companion-heatmap-player-column-heading gs-focusable' + (className ? ' ' + className : '')}
        data-direction={active ? sort.direction : undefined}
        aria-label={label + current}
        title={title}
        onClick={() => setSort({ key, direction: requestDirection })}
      >
        <span className="companion-heatmap-player-heading-content">
          <span>{label}</span>
          {active && <span aria-hidden="true" className="companion-heatmap-player-sort-arrow">{sort.direction === 'desc' ? ' ↓' : ' ↑'}</span>}
        </span>
      </button>
    );
  };

  return (
    <section className={'companion-heatmap-player-results' + (hasActivity ? ' has-activity' : '') + (hasTackles ? ' has-tackles' : '') + (defenseOnly ? ' is-team-defense' : '')}
      aria-label={defenseOnly ? 'Team defense' : upcoming ? 'Players' : 'Game leaders'}>
      <div className="companion-heatmap-player-headings" role="group" aria-label="Sort player results">
        {sortable('name', defenseOnly ? 'D/ST' : 'Player', 'companion-heatmap-player-name-heading')}
        <div className="companion-heatmap-player-metric-headings">
          {!defenseOnly && sortable('snap', 'Snap %')}
          {hasActivity && sortable('activity', activityHeader, undefined, mixedActivity ? undefined : primaryActivity?.title)}
          {hasTackles && sortable('tackles', 'Tkl' + rateSuffix, 'companion-heatmap-extra-tackles')}
          {sortable('seasonPoints', 'Season Pts', 'companion-heatmap-extra-total', 'Total fantasy points for the season')}
          {sortable('value', valueLabel)}
        </div>
      </div>
      <div className="companion-heatmap-drilldown-player-list">
        {entries.map(row => {
          const expanded = expandedId === row.playerId;
          const status = row.isTeamDefense ? null : getPlayerAvailabilityContext(row.player).status;
          const rosterStatus = row.rostered == null
            ? (row.isTeamDefense ? 'Roster status unavailable' : null)
            : (row.rostered ? 'Rostered' : 'Unrostered');
          const meta = [
            row.isTeamDefense ? rosterStatus : null,
            row.rank,
            upcoming && !row.isTeamDefense ? rosterStatus : null,
            row.estimated ? 'Team est.' : null,
          ];
          const canNavigate = canOpenStats && (upcoming || row.isTeamDefense || Boolean(row.espnId));
          const panelId = detailId + '-' + row.playerId;
          return (
            <div key={row.playerId} className="companion-heatmap-player-entry">
              <CompanionPlayerRow
                player={row.player}
                darkMode={darkMode}
                compact
                className="companion-heatmap-player-row"
                showAccentRail={false}
                subtleTeamGradient
                showTeamLogo={false}
                useTeamLogoAsAvatar={row.isTeamDefense}
                showPosition={false}
                interactive
                selected={expanded}
                onClick={() => setExpandedId(expanded ? null : row.playerId)}
                ariaLabel={[row.name + ' details', status, ...meta].filter(Boolean).join(', ')}
                ariaExpanded={expanded}
                ariaControls={panelId}
                metaSegments={meta}
                identityAccessory={status
                  ? <PlayerStatusBadge status={status} detail={upcoming ? null : 'Current status'} compact variant="text" />
                  : null}
                gridTemplate="var(--heatmap-player-row-grid)"
                columnGridTemplate="var(--heatmap-player-metric-grid)"
                columns={[
                  !defenseOnly && <CompanionPlayerMetric key="snap" compact value={formatSnap(row.snap)}
                    className={row.snap != null ? 'companion-heatmap-snap-value' : ''}
                    title={upcoming ? 'Average of reported game snap percentages' : undefined} />,
                  hasActivity && (
                    <CompanionPlayerMetric key="activity" compact value={formatValue(row.activity)}
                      label={mixedActivity && row.activityColumns[0] ? row.activityColumns[0].label + rateSuffix : undefined} />
                  ),
                  hasTackles && <CompanionPlayerMetric key="tackles" compact className="companion-heatmap-extra-tackles"
                    value={formatValue(row.tackles)} />,
                  <CompanionPlayerMetric key="seasonPoints" compact className="companion-heatmap-extra-total"
                    value={formatValue(row.seasonPoints)} />,
                  <CompanionPlayerMetric key="value" compact value={formatValue(row.value)} />,
                ]}
                trailing={<CaretDownIcon size={16} aria-hidden="true" className="companion-heatmap-player-chevron" />}
              />
              <div id={panelId} className="companion-heatmap-player-detail" hidden={!expanded}>
                {expanded && upcoming && (
                  <GameLog key={season + ':' + row.playerId} row={row} season={season} counts={row.counts} />
                )}
                {expanded && !upcoming && (
                  row.breakdown?.length ? (
                    <dl className="companion-heatmap-score-breakdown" aria-label={row.name + ' scoring breakdown'}>
                      {row.breakdown.map(({ label, statVal, pts }, index) => (
                        <div key={index}>
                          <dt>{label}{statVal != null && ' · ' + formatValue(statVal)}</dt>
                          <dd>{pts > 0 && '+'}{pts.toFixed(1)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : <p className="companion-heatmap-score-breakdown">No scoring breakdown available.</p>
                )}
                {expanded && canNavigate && (
                  <button type="button" className="companion-heatmap-player-stats gs-focusable"
                    onClick={() => onOpenStats(row)} disabled={openingId != null}>
                    {openingId === row.playerId ? 'Opening statistics…' : row.isTeamDefense ? 'View D/ST statistics' : 'View player statistics'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
