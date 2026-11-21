import { useEffect, useId, useMemo, useState } from 'react';
import { CaretDownIcon } from '@phosphor-icons/react/CaretDown';
import { fetchGameLog, fetchPlayerSnapCounts, fetchTeamDefenseGameLog } from '../../utils/playerApi.js';
import { getPlayerAvailabilityContext } from '../../utils/playerAvailabilityStatus.js';
import { getBundledNflTeamLogoUrl } from '../../utils/companionAssetVisuals.js';
import { selectGameSnapPercentage } from '../../utils/snapCounts.js';
import { CompanionSelectorButton } from './CompanionSelectorControls.jsx';
import CompanionPlayerRow, { CompanionPlayerMetric, CompanionPlayerStatus } from './CompanionPlayerRow.jsx';
import PlayerStatusBadge from './PlayerStatusBadge.jsx';

const EMPTY = [];
const MISSING = '—';

const formatValue = (value) => value == null ? MISSING : Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 });
const formatSnap = (value) => value == null ? MISSING : formatValue(value) + '%';

function snapForGame(game, counts, position, season) {
  return selectGameSnapPercentage({ meta: { week: game.week, myTeam: game.team } }, counts, position, season);
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

  return result?.season === season ? result.counts : null;
}

function GameLog({ row, season, counts }) {
  const { playerId, espnId, team, position, games, weeks } = row;
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

  const officialWeeks = new Map(officialLog
    .filter(({ meta }) => meta?.completed !== false && !meta?.isBye && !meta?.isInactive && !meta?.isPostseason)
    .map(game => [Number(game.meta?.week), game]));
  const played = new Map(games.map(game => [game.week, game]));
  for (const [week, game] of officialWeeks) {
    if (!played.has(week) && weeks.includes(week) && game.statsJson) {
      played.set(week, { week, team: game.meta.myTeam });
    }
  }
  const showTargets = ['RB', 'WR', 'TE'].includes(position);
  if (!played.size) return <p className="companion-heatmap-game-log-empty">No completed games in this window.</p>;

  return (
    <table className="companion-heatmap-game-log" aria-label={row.name + ' game log'}>
      <thead>
        <tr><th scope="col">Week</th><th scope="col">Opponent</th><th scope="col">Snap %</th>{showTargets && <th scope="col">Tgt</th>}<th scope="col">Pts</th></tr>
      </thead>
      <tbody>
        {[...played.values()].sort((left, right) => right.week - left.week).map(game => {
          const official = officialWeeks.get(game.week);
          const officialOpp = official?.meta?.opponent?.match(/^(@|vs?)\s*([a-z]+)$/i);
          const opponent = officialOpp?.[2]?.toUpperCase() ?? game.opponent;
          const site = officialOpp ? (officialOpp[1] === '@' ? '@' : 'v ') : game.isHome === true ? 'v ' : game.isHome === false ? '@' : '';
          const url = getBundledNflTeamLogoUrl(opponent);
          const snap = official
            ? selectGameSnapPercentage(official, counts, position, season)
            : snapForGame(game, counts, position, season);
          return (
            <tr key={playerId + ':' + game.week}>
              <th scope="row">{game.week}</th>
              <td><span className="companion-heatmap-game-opponent">
                {url && <img src={url} width="18" height="18" alt="" loading="lazy" />}
                {opponent ? site + opponent : MISSING}
              </span></td>
              <td>{formatSnap(snap)}</td>
              {showTargets && <td>{formatValue(game.targets)}</td>}
              <td>{formatValue(game.points)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function HeatmapPlayerResults({
  rows, season, upcoming, valueLabel, darkMode, rosterReady, canOpenStats, onOpenStats, openingId,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [sort, setSort] = useState({ key: 'value', direction: 'desc' });
  const detailId = useId();
  const snapsById = usePlayerSnaps(rows, season);
  const entries = useMemo(() => rows.map(row => {
    const counts = snapsById?.[row.espnId] ?? EMPTY;
    const samples = (upcoming ? row.games : [row.game]).filter(Boolean).map(game =>
      snapForGame(game, counts, row.position, season)).filter(value => value != null);
    const snap = samples.length ? samples.reduce((total, value) => total + value, 0) / samples.length : null;
    const latestSnap = row.latestGame ? snapForGame(row.latestGame, counts, row.position, season) : null;
    return { ...row, counts, snap, latestSnap };
  }).sort((a, b) => {
    const left = a[sort.key];
    const right = b[sort.key];
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    return sort.direction === 'desc' ? right - left : left - right;
  }), [rows, season, snapsById, sort, upcoming]);

  const changeSort = (key) => setSort(current => ({
    key,
    direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
  }));
  const sortable = (key, label) => (
    <CompanionSelectorButton size="xs" active={sort.key === key} onClick={() => changeSort(key)}>
      {label}{sort.key === key ? (sort.direction === 'desc' ? ' ↓' : ' ↑') : ''}
    </CompanionSelectorButton>
  );

  return (
    <section className={'companion-heatmap-player-results' + (upcoming ? ' is-upcoming' : '')}>
      <div className="companion-heatmap-player-sort" role="group" aria-label="Sort player results">
        <span>{upcoming ? 'Players' : 'Game leaders'}</span>
        {sortable('snap', 'Snap %')}
        {sortable('value', valueLabel)}
      </div>
      <div className="companion-heatmap-drilldown-player-list">
        {entries.map(row => {
          const expanded = expandedId === row.playerId;
          const status = getPlayerAvailabilityContext(row.player);
          const meta = [row.rank, upcoming && rosterReady ? (row.rostered ? 'Rostered' : 'Unrostered') : null];
          const extraMetrics = upcoming ? [
            <CompanionPlayerMetric key="targets" className="heatmap-wide-metric" compact value={formatValue(row.targets)} label="Tgt/G" />,
            <CompanionPlayerMetric key="latest" className="heatmap-wide-metric" compact value={formatSnap(row.latestSnap)} label="Latest snap %" />,
            <CompanionPlayerMetric key="total" className="heatmap-wide-metric" compact value={formatValue(row.total)} label={row.totalLabel} />,
          ] : (row.boxMetrics ?? []).map(({ key, value, label }) => (
            <CompanionPlayerMetric key={key} className="heatmap-wide-metric" compact value={formatValue(value)} label={label} />
          ));
          const canNavigate = canOpenStats && (upcoming || Boolean(row.espnId));
          const panelId = detailId + '-' + row.playerId;
          return (
            <div key={row.playerId} className="companion-heatmap-player-entry">
              <CompanionPlayerRow
                player={row.player}
                darkMode={darkMode}
                compact
                className="companion-heatmap-player-row"
                showAccentRail={false}
                showTeamLogo={false}
                showPosition={false}
                interactive
                selected={expanded}
                onClick={() => setExpandedId(expanded ? null : row.playerId)}
                ariaLabel={[row.name + ' details', status.status, ...meta].filter(Boolean).join(', ')}
                ariaExpanded={expanded}
                ariaControls={panelId}
                metaSegments={meta}
                identityAccessory={status.status
                  ? <PlayerStatusBadge status={status.status} detail={upcoming ? null : 'Current status'} compact />
                  : null}
                gridTemplate="var(--heatmap-player-row-grid)"
                columnGridTemplate="var(--heatmap-player-metric-grid)"
                columns={[
                  <CompanionPlayerMetric key="snap" compact value={formatSnap(row.snap)} label="Snap %" title={upcoming ? 'Average of reported game snap percentages' : undefined} />,
                  ...extraMetrics,
                  <CompanionPlayerMetric key="value" compact value={formatValue(row.value)} label={valueLabel} />,
                ]}
                trailing={<CaretDownIcon size={16} aria-hidden="true" className="companion-heatmap-player-chevron" />}
                status={row.estimated ? <CompanionPlayerStatus label="est." title="Team attribution estimated" /> : null}
              />
              <div id={panelId} className="companion-heatmap-player-detail" hidden={!expanded}>
                {expanded && <GameLog key={season + ':' + row.playerId} row={row} season={season} counts={row.counts} />}
                {expanded && !upcoming && row.breakdown?.length > 0 && (
                  <dl className="companion-heatmap-score-breakdown" aria-label={row.name + ' scoring breakdown'}>
                    {row.breakdown.map(({ label, statVal, pts }, index) => (
                      <div key={index}>
                        <dt>{label}{statVal != null && ' · ' + formatValue(statVal)}</dt>
                        <dd>{pts > 0 && '+'}{pts.toFixed(1)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {expanded && canNavigate && (
                  <button type="button" className="companion-heatmap-player-stats gs-focusable"
                    onClick={() => onOpenStats(row)} disabled={openingId != null}>
                    {openingId === row.playerId ? 'Opening statistics…' : 'View player statistics'}
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
