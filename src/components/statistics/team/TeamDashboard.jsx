import { useCallback, useMemo, useRef, useState } from 'react';
import { getTeamAbbr } from '../../../utils/liveScoringFeed.js';
import {
  depthIndex,
  fantasyScoring,
  FANTASY_FORMATS,
  nameKey,
  roleOf,
  seasonTotals,
  unitOf,
} from '../../../utils/teamSeason/teamDashboardModel.js';
import { DashboardTipProvider } from '../player/DashboardTip.jsx';
import { Switch } from '../player/DashboardParts.jsx';
import { DepthChart, PositionLeaders } from './TeamTop.jsx';
import { PlayersTab, RanksTab, SeasonTab } from './TeamTabs.jsx';

const TABS = [['season', 'Season'], ['players', 'Players'], ['depth', 'Depth'], ['ranks', 'League']];
const TAB_KEY = 'gridshift.statistics.teamTab';
const FANTASY_KEY = 'gridshift.statistics.teamFantasy';
const FORMAT_KEY = 'gridshift.statistics.teamFantasyFormat';

const read = (storage, key) => { try { return storage.getItem(key); } catch { return null; } };
const write = (storage, key, value) => { try { storage.setItem(key, value); } catch { /* storage is optional */ } };

/**
 * Statistics team page body under the hero (TeamHero.jsx): the season and
 * fantasy toolbar, then Season, Players (position leaders and stat tables),
 * Depth (the current depth chart), and League (unit ranks) tabs.
 */
export default function TeamDashboard({
  team,
  roster,
  depthUnits,
  seasonOptions,
  season,
  onSeasonChange,
  seasonData: data,
  darkMode,
  meColor,
  meForeground,
  leagueScoring,
  leagueName,
  onSelectPlayer,
  onViewGameStats,
}) {
  const rootRef = useRef(null);
  const tabRefs = useRef({});
  const [tab, setTab] = useState(() => (TABS.some(([id]) => id === read(sessionStorage, TAB_KEY)) ? read(sessionStorage, TAB_KEY) : 'season'));
  const [fantasyOn, setFantasyOn] = useState(() => read(localStorage, FANTASY_KEY) === '1');
  const [format, setFormat] = useState(() => {
    const stored = read(localStorage, FORMAT_KEY);
    return stored === 'league' || FANTASY_FORMATS.some((entry) => entry.id === stored) ? stored : 'ppr';
  });
  const teamAbbr = getTeamAbbr(team.id);
  const games = useMemo(() => data.data?.games ?? [], [data.data]);

  // A connected league's scoring is the only option; the preset formats are for users without one.
  const activeFormat = leagueScoring ? 'league' : (format === 'league' ? 'ppr' : format);
  const fantasy = useMemo(() => {
    if (!fantasyOn) return null;
    const config = fantasyScoring(activeFormat, leagueScoring);
    const label = activeFormat === 'league' ? (leagueName || 'League') : FANTASY_FORMATS.find((entry) => entry.id === activeFormat)?.label;
    return { ...config, label };
  }, [activeFormat, fantasyOn, leagueName, leagueScoring]);
  const totals = useMemo(() => seasonTotals(games, fantasy), [fantasy, games]);

  // ESPN roster and depth chart, linked to box-score players by name.
  const rosterByName = useMemo(() => Object.fromEntries((roster ?? []).map((player) => [nameKey(player.displayName), player])), [roster]);
  const rosterById = useMemo(() => Object.fromEntries((roster ?? []).map((player) => [String(player.id), player])), [roster]);
  const depth = useMemo(() => {
    const units = depthUnits ?? [];
    const slotLists = {};
    for (const unit of units) for (const slot of unit.slots) slotLists[`${unitOf(unit.name)}:${slot.key}`] = slot.athletes;
    const byName = {};
    for (const unit of units) for (const slot of unit.slots) for (const athlete of slot.athletes) byName[nameKey(athlete.name)] ??= athlete.id;
    return { index: depthIndex(units), byName, slotAthletes: (slot) => slotLists[`${slot.unit}:${slot.k}`] ?? [] };
  }, [depthUnits]);

  const openPlayer = useCallback((player) => { if (player) onSelectPlayer?.(player); }, [onSelectPlayer]);
  const resolve = useCallback((entry) => {
    const player = rosterByName[nameKey(entry.n)] ?? null;
    const espnId = player?.id ?? depth.byName[nameKey(entry.n)] ?? null;
    const slots = espnId ? depth.index[espnId] ?? [] : [];
    return { player, slots, role: roleOf(entry.pos, slots), onOpen: openPlayer };
  }, [depth, openPlayer, rosterByName]);
  const openByEntry = useCallback((entry) => {
    const player = rosterByName[nameKey(entry.n)];
    return player ? () => openPlayer(player) : null;
  }, [openPlayer, rosterByName]);

  const openGame = useCallback((game, section = 'team', { playerGroup = null, playerId = null } = {}) => {
    onViewGameStats?.({
      id: game.id,
      season,
      phase: 'regular',
      week: game.week,
      awayTeamId: game.home ? game.opp : teamAbbr,
      homeTeamId: game.home ? teamAbbr : game.opp,
      section,
      playerGroup,
      playerId,
    });
  }, [onViewGameStats, season, teamAbbr]);

  const selectTab = (id, focus = false) => {
    setTab(id);
    write(sessionStorage, TAB_KEY, id);
    if (focus) tabRefs.current[id]?.focus();
  };
  const onTabKey = (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = TABS.findIndex(([id]) => id === tab);
    selectTab(TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0], true);
  };

  const teamName = data.data?.teams?.[teamAbbr]?.short || team.name;
  const lastWeek = games.at(-1)?.week;
  const style = { '--player-dash-me': meColor || 'var(--color-accent)', '--player-dash-me-fg': meForeground || 'var(--color-bg)' };

  const renderPanel = () => {
    if (tab === 'depth') {
      if (!(depthUnits?.length > 0)) return <div className="player-dash-state" role="status">No depth chart is available for this team right now.</div>;
      return <div className="player-dash-panel"><DepthChart units={depthUnits} rosterById={rosterById} onOpenPlayer={openPlayer} /></div>;
    }
    if (data.status === 'loading' || data.status === 'idle') return <div className="player-dash-state" role="status">Loading the {season} season…</div>;
    if (data.status === 'error') return <div className="player-dash-state" role="status">{data.error}</div>;
    if (tab === 'season') {
      if (!games.length) return <div className="player-dash-state" role="status">No finished {season} games yet.</div>;
      return <SeasonTab data={data.data} team={teamAbbr} teamName={teamName} darkMode={darkMode} onOpenGame={openGame} />;
    }
    if (tab === 'players') {
      if (!games.length) return <div className="player-dash-state" role="status">No {season} box scores yet.</div>;
      return (
        <PlayersTab
          totals={totals}
          fantasy={fantasy}
          openByEntry={openByEntry}
          leaders={<PositionLeaders totals={totals} games={games} depth={depth} resolve={resolve} fantasy={fantasy} onOpenGame={openGame} />}
        />
      );
    }
    return <RanksTab data={data.data} team={teamAbbr} teamName={teamName} />;
  };

  return (
    <DashboardTipProvider rootRef={rootRef}>
      <div ref={rootRef} className="player-dash team-dash" style={style}>
        <div className="team-dash-toolbar">
          {seasonOptions.length > 1 ? (
            <select className="player-dash-season" aria-label="Season" value={season} onChange={(event) => onSeasonChange(Number(event.target.value))}>
              {seasonOptions.map((option) => <option key={option} value={option}>{option} season</option>)}
            </select>
          ) : <span className="player-dash-meta">{season} season</span>}
          <Switch checked={fantasyOn} onChange={(value) => { setFantasyOn(value); write(localStorage, FANTASY_KEY, value ? '1' : '0'); }} label="Fantasy points" />
          {fantasyOn && (leagueScoring ? (
            <span className="player-dash-meta">{leagueName || 'League'} scoring</span>
          ) : (
            <select
              className="player-dash-season"
              aria-label="Fantasy scoring"
              value={activeFormat}
              onChange={(event) => { setFormat(event.target.value); write(localStorage, FORMAT_KEY, event.target.value); }}
            >
              {FANTASY_FORMATS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>
          ))}
        </div>

        <div className="player-dash-nav">
          <div className="player-dash-tabs" role="tablist" aria-label="Team sections" data-tour="statistics-team-dashboard-tabs" onKeyDown={onTabKey}>
            {TABS.map(([id, label]) => (
              <button
                key={id}
                ref={(el) => { tabRefs.current[id] = el; }}
                type="button"
                role="tab"
                id={`team-dash-tab-${id}`}
                aria-selected={tab === id}
                aria-controls="team-dash-panel"
                tabIndex={tab === id ? 0 : -1}
                className="player-dash-tab"
                onClick={() => selectTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {lastWeek != null && <div className="player-dash-nav__meta"><span className="player-dash-meta">{season} through Week {lastWeek} · {games.length} games</span></div>}
        </div>
        <div id="team-dash-panel" role="tabpanel" aria-labelledby={`team-dash-tab-${tab}`} className="player-dash-body">
          {renderPanel()}
        </div>
      </div>
    </DashboardTipProvider>
  );
}
