import { useCallback, useMemo, useRef, useState } from 'react';
import { usePlayerSeasonDashboard } from '../../../hooks/usePlayerSeasonDashboard.js';
import {
  buildRanks,
  dashboardGroup,
  isDefensiveGroup,
  opponentRanks,
  seasonBox,
  seasonPlays,
} from '../../../utils/playerSeason/dashboardModel.js';
import { getTeamAbbr } from '../../../utils/liveScoringFeed.js';
import { DashboardTipProvider } from './DashboardTip.jsx';
import { OverviewTab, StatRail } from './OverviewTab.jsx';
import { KickingTab, PassingTab, ReceivingTab, RushingTab } from './OffenseTabs.jsx';
import { CoverageTab, PassRushTab, TacklingTab } from './DefenseTabs.jsx';
import { EveryPlayTab } from './PlayList.jsx';

const TAB_LABELS = {
  overview: 'Overview', passing: 'Passing', rushing: 'Rushing', receiving: 'Receiving', kicking: 'Kicking',
  passrush: 'Pass rush', tackling: 'Tackling', coverage: 'Coverage', plays: 'Every play', seasons: 'Seasons',
};
const GROUP_TABS = {
  QB: ['overview', 'passing', 'rushing', 'plays', 'seasons'],
  RB: ['overview', 'rushing', 'receiving', 'plays', 'seasons'],
  WR: ['overview', 'receiving', 'plays', 'seasons'],
  TE: ['overview', 'receiving', 'plays', 'seasons'],
  K: ['overview', 'kicking', 'plays', 'seasons'],
  DL: ['overview', 'passrush', 'tackling', 'plays', 'seasons'],
  LB: ['overview', 'tackling', 'passrush', 'plays', 'seasons'],
  DB: ['overview', 'coverage', 'tackling', 'plays', 'seasons'],
};
const TAB_STORAGE_KEY = 'gridshift.statistics.playerTab';

function readStoredTab() {
  try { return sessionStorage.getItem(TAB_STORAGE_KEY); } catch { return null; }
}
function storeTab(tab) {
  try { sessionStorage.setItem(TAB_STORAGE_KEY, tab); } catch { /* storage is optional */ }
}

/**
 * Statistics player page tabs. Overview, the position tabs, and Every play
 * come from the player's season of play-by-play; Seasons is the existing
 * season-by-season page, passed in as `seasonsContent`.
 */
export default function PlayerDashboard({
  playerMeta,
  sleeperId,
  teamAbbr,
  season,
  seasonOptions,
  onSeasonChange,
  darkMode,
  meColor,
  meForeground,
  fantasy,
  onViewGameStats,
  onOpenPlayerBySleeperId,
  seasonsContent,
}) {
  const group = dashboardGroup(playerMeta.position);
  const tabs = group ? GROUP_TABS[group] : ['seasons'];
  const [tab, setTab] = useState(() => {
    const stored = readStoredTab();
    return stored && tabs.includes(stored) ? stored : tabs[0];
  });
  const [zoneJump, setZoneJump] = useState(null);
  const activeTab = tabs.includes(tab) ? tab : tabs[0];
  const rootRef = useRef(null);
  const tabRefs = useRef({});

  const data = usePlayerSeasonDashboard({
    season,
    team: teamAbbr,
    name: playerMeta.displayName,
    position: playerMeta.position,
    group,
    sleeperId,
    enabled: Boolean(group),
  });
  const seasonData = data.season;
  const team = seasonData?.team ?? getTeamAbbr(teamAbbr);
  const plays = useMemo(() => seasonPlays(seasonData), [seasonData]);
  const box = useMemo(() => seasonBox(seasonData), [seasonData]);
  // Sleeper's ID and position group, as the server resolved them, drive the ranks.
  const playerId = seasonData?.sleeperId ?? sleeperId ?? null;
  const rankGroup = data.pools?.group && dashboardGroup(data.pools.group) ? data.pools.group : group;
  const ranks = useMemo(() => (data.pools && rankGroup ? buildRanks(data.pools, rankGroup, playerId) : null), [data.pools, playerId, rankGroup]);
  const oppRanks = useMemo(() => (data.pools && group ? opponentRanks(data.pools, group) : {}), [data.pools, group]);
  const jersey = seasonData?.subject?.jersey || playerMeta.jersey || '';

  const selectTab = useCallback((next, focus = false) => {
    setTab(next);
    storeTab(next);
    if (focus) tabRefs.current[next]?.focus();
  }, []);

  const openGame = useCallback((game, section = 'team') => {
    if (!game || !onViewGameStats) return;
    const gameTeam = game.team ?? team;
    onViewGameStats({
      id: game.id,
      season,
      phase: 'regular',
      week: game.week,
      awayTeamId: game.home ? game.opp : gameTeam,
      homeTeamId: game.home ? gameTeam : game.opp,
      section,
    });
  }, [onViewGameStats, season, team]);

  const openPlayer = useMemo(() => (onOpenPlayerBySleeperId
    ? (entry) => onOpenPlayerBySleeperId(entry.id, playerMeta.displayName)
    : null), [onOpenPlayerBySleeperId, playerMeta.displayName]);

  const listProps = {
    team,
    group,
    darkMode,
    fantasy,
    onOpenGame: openGame,
    people: seasonData?.people,
  };

  const onTabKey = (event) => {
    const index = tabs.indexOf(activeTab);
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(next, true);
    }
  };

  const style = {
    '--player-dash-me': meColor || 'var(--color-accent)',
    '--player-dash-me-fg': meForeground || 'var(--color-bg)',
  };

  const renderDataTab = () => {
    if (data.status === 'loading' || data.status === 'idle') {
      return <div className="player-dash-state" role="status">Loading {season} play-by-play…</div>;
    }
    if (data.status === 'error') {
      return <div className="player-dash-state" role="status">{data.error}</div>;
    }
    if (!seasonData?.games?.length) {
      return (
        <div className="player-dash-state" role="status">
          No finished {season} games for {playerMeta.displayName} yet.
          {seasonData?.remaining ? ` ${seasonData.remaining} games remain.` : ''}
        </div>
      );
    }
    switch (activeTab) {
      case 'overview':
        return (
          <OverviewTab
            group={group}
            rankGroup={rankGroup}
            season={seasonData}
            plays={plays}
            pools={data.pools}
            ranks={ranks}
            oppRanks={oppRanks}
            team={team}
            playerId={playerId}
            playerName={playerMeta.displayName}
            darkMode={darkMode}
            onOpenGame={openGame}
            onOpenPlayer={openPlayer}
            onZone={(zone) => { setZoneJump(zone); selectTab('passing'); }}
          />
        );
      case 'passing':
        return <PassingTab key={zoneJump ?? 'all'} plays={plays} box={box} team={team} people={seasonData.people} initialZone={zoneJump} listProps={listProps} />;
      case 'rushing':
        return <RushingTab plays={plays} box={box} group={group} team={team} jersey={jersey} listProps={listProps} />;
      case 'receiving':
        return <ReceivingTab plays={plays} season={seasonData} box={box} team={team} people={seasonData.people} listProps={listProps} />;
      case 'kicking':
        return <KickingTab plays={plays} box={box} listProps={listProps} />;
      case 'passrush':
        return <PassRushTab plays={plays} season={seasonData} box={box} team={team} people={seasonData.people} listProps={listProps} />;
      case 'tackling':
        return <TacklingTab plays={plays} box={box} team={team} listProps={listProps} />;
      case 'coverage':
        return <CoverageTab plays={plays} season={seasonData} box={box} team={team} people={seasonData.people} listProps={listProps} />;
      case 'plays':
        return <EveryPlayTab plays={plays} games={seasonData.games} group={group} team={team} darkMode={darkMode} fantasy={fantasy} onOpenGame={openGame} people={seasonData.people} />;
      default:
        return null;
    }
  };

  // Positions without a group show Seasons alone; the wrapper still supplies the dashboard tokens it uses.
  if (!group) return <div className="player-dash" style={style}>{seasonsContent}</div>;

  const lastWeek = seasonData?.games?.at(-1)?.week;
  return (
    <DashboardTipProvider rootRef={rootRef}>
      <div ref={rootRef} className="player-dash" style={style}>
        {activeTab !== 'seasons' && data.status === 'ready' && seasonData?.games?.length > 0 && (
          <StatRail group={rankGroup} box={box} plays={plays} ranks={ranks} playerId={playerId} />
        )}
        <div className="player-dash-nav">
          <div className="player-dash-tabs" role="tablist" aria-label="Player sections" data-tour="statistics-player-dashboard-tabs" onKeyDown={onTabKey}>
            {tabs.map((id) => (
              <button
                key={id}
                ref={(el) => { tabRefs.current[id] = el; }}
                type="button"
                role="tab"
                id={`player-dash-tab-${id}`}
                aria-selected={activeTab === id}
                aria-controls="player-dash-panel"
                tabIndex={activeTab === id ? 0 : -1}
                className="player-dash-tab"
                onClick={() => selectTab(id)}
              >
                {TAB_LABELS[id]}
              </button>
            ))}
          </div>
          {activeTab !== 'seasons' && (
            <div className="player-dash-nav__meta">
              {seasonOptions?.length > 1 && onSeasonChange ? (
                <select
                  className="player-dash-season"
                  aria-label="Season"
                  value={season}
                  onChange={(event) => { setZoneJump(null); onSeasonChange(Number(event.target.value)); }}
                >
                  {seasonOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : <span className="player-dash-meta">{season}</span>}
              {lastWeek != null && <span className="player-dash-meta">through Week {lastWeek} · {seasonData.games.length} games</span>}
              {data.poolsError && <span className="player-dash-meta">League ranks unavailable</span>}
            </div>
          )}
        </div>
        <div id="player-dash-panel" role="tabpanel" aria-labelledby={`player-dash-tab-${activeTab}`} className="player-dash-body">
          {activeTab === 'seasons' ? seasonsContent : renderDataTab()}
        </div>
        {activeTab !== 'seasons' && isDefensiveGroup(group) && (
          <p className="player-dash-coverage">Defensive credits come from the official play text. Box score totals come from the game&apos;s stat line.</p>
        )}
      </div>
    </DashboardTipProvider>
  );
}
