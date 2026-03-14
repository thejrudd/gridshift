import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSleeper } from '../../context/SleeperContext';
import { calcPoints, DEFAULT_SCORING } from '../../utils/scoringEngine';
import { computePositionalRanks, getAvgPPG, projectPlayer } from '../../utils/projectionEngine';
import { STADIUMS, WEEK_DATES_2025 } from '../../data/stadiums';
import { fetchGameWeather, formatWeather } from '../../api/weatherApi';
import { getMatchups } from '../../api/sleeperApi';
import PlayerMatchupBreakdown, { STAT_LABELS } from './PlayerMatchupBreakdown';

const TOTAL_WEEKS = 18;
const POSITION_COLORS = {
  QB: '#ef4444', RB: '#22c55e', WR: '#3b82f6', TE: '#f59e0b', K: '#8b5cf6',
};

export default function CompanionMatchup() {
  const {
    sleeperUser, selectedLeagueId, league,
    rosters, leagueUsers, players, loadPlayers,
    weeklyStats, seasonStats, loadSeasonStats,
    statsLoading, statsProgress, scoringSettings,
    myRoster, getUserDisplayName,
  } = useSleeper();

  // Playoff start week from league settings; default to 15 if unknown
  const playoffStart = league?.settings?.playoff_week_start ?? 18;
  const totalWeeks = TOTAL_WEEKS;

  const [matchups, setMatchups] = useState(null);
  // Default to last regular-season week
  const [week, setWeek] = useState(() => Math.max(1, playoffStart - 1));
  const [matchupLoading, setMatchupLoading] = useState(false);
  const [showBench, setShowBench] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null); // { id, projection }
  const [selectedTeam, setSelectedTeam] = useState(null); // 'mine' | 'opp'
  const [weatherMap, setWeatherMap] = useState({}); // { 'TEAM-DATE': weather }

  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  useEffect(() => {
    if (!seasonStats && !statsLoading) loadSeasonStats();
  }, [seasonStats, statsLoading, loadSeasonStats]);

  useEffect(() => {
    if (!selectedLeagueId) return;
    setMatchupLoading(true);
    getMatchups(selectedLeagueId, week)
      .then(data => setMatchups(data ?? []))
      .catch(() => setMatchups([]))
      .finally(() => setMatchupLoading(false));
  }, [selectedLeagueId, week]);

  const myRosterData = myRoster();

  const myMatchup = useMemo(() => {
    if (!matchups || !myRosterData) return null;
    return matchups.find(m => m.roster_id === myRosterData.roster_id) ?? null;
  }, [matchups, myRosterData]);

  const opponentMatchup = useMemo(() => {
    if (!matchups || !myMatchup) return null;
    return matchups.find(m => m.matchup_id === myMatchup.matchup_id && m.roster_id !== myMatchup.roster_id) ?? null;
  }, [matchups, myMatchup]);

  const opponentRoster = useMemo(() => {
    if (!opponentMatchup) return null;
    return rosters.find(r => r.roster_id === opponentMatchup.roster_id) ?? null;
  }, [opponentMatchup, rosters]);

  const opponentName = useMemo(() => {
    if (!opponentRoster) return 'Opponent';
    return getUserDisplayName(opponentRoster.owner_id);
  }, [opponentRoster, getUserDisplayName]);

  const myName = useMemo(() => {
    if (!sleeperUser) return 'You';
    return getUserDisplayName(sleeperUser.user_id);
  }, [sleeperUser, getUserDisplayName]);

  const positionalRanks = useMemo(
    () => computePositionalRanks(seasonStats, players, scoringSettings),
    [seasonStats, players, scoringSettings],
  );

  // Per-week positional ranks for the selected week
  const weeklyRanks = useMemo(() => {
    if (!weeklyStats || !players) return {};
    const SKILL = ['QB', 'RB', 'WR', 'TE', 'K'];
    const IDP_MAP = { DL: ['DL', 'DE', 'DT'], LB: ['LB', 'ILB', 'OLB'], DB: ['DB', 'CB', 'S', 'SS', 'FS'] };
    function normalizePos(pos) {
      if (SKILL.includes(pos)) return pos;
      for (const [norm, variants] of Object.entries(IDP_MAP)) {
        if (variants.includes(pos)) return norm;
      }
      return null;
    }
    const byPos = {};
    for (const [playerId, weeks] of Object.entries(weeklyStats)) {
      const weekEntry = weeks.find(w => w.week === week);
      if (!weekEntry) continue;
      const p = players[playerId];
      if (!p) continue;
      const pos = normalizePos(p.position);
      if (!pos) continue;
      const pts = calcPoints(weekEntry, scoringSettings);
      if (pts <= 0) continue;
      if (!byPos[pos]) byPos[pos] = [];
      byPos[pos].push({ id: playerId, pts });
    }
    const ranks = {};
    for (const [pos, list] of Object.entries(byPos)) {
      list.sort((a, b) => b.pts - a.pts);
      list.forEach(({ id }, i) => { ranks[id] = { rank: i + 1, posLabel: pos }; });
    }
    return ranks;
  }, [weeklyStats, players, scoringSettings, week]);

  const enrichPlayer = useCallback((id) => {
    if (!id || !players) return null;
    const p = players[id];
    if (!p) return { id, name: 'Empty', position: '?', team: '', pts: null, avgPPG: 0, rank: null, oppTeam: null, isHome: null, isIndoor: null, homeTeam: null, injuryStatus: null, weekly: [] };

    const stats = seasonStats?.[id] ?? null;
    const weekly = weeklyStats?.[id] ?? [];
    const weekEntry = weekly.find(w => w.week === week) ?? null;
    const oppTeam = weekEntry?.opp ?? null;
    const isHome = weekEntry != null ? (weekEntry.home === 1) : null;
    const myTeam = p.team || 'FA';
    // Home team hosts → determines whose stadium we use
    const homeTeam = isHome === true ? myTeam : isHome === false ? oppTeam : null;
    const stadium = homeTeam ? (STADIUMS[homeTeam] ?? null) : null;

    return {
      id,
      name: p.full_name || `${p.first_name} ${p.last_name}`,
      position: p.position,
      team: myTeam,
      weekPts: weekEntry ? calcPoints(weekEntry, scoringSettings) : null,
      avgPPG: getAvgPPG(weekly, scoringSettings),
      rank: positionalRanks[id] ?? null,
      weekRank: weeklyRanks[id] ?? null,
      oppTeam,
      isHome,
      homeTeam,
      stadium,
      isIndoor: stadium?.indoor ?? null,
      weekly,
      injuryStatus: p.injury_status,
    };
  }, [players, seasonStats, weeklyStats, scoringSettings, positionalRanks, weeklyRanks, week]);

  // Zip starters by slot index for side-by-side display
  const starterSlots = useMemo(() => {
    const myIds = myMatchup?.starters ?? [];
    const oppIds = opponentMatchup?.starters ?? [];
    const len = Math.max(myIds.length, oppIds.length);
    return Array.from({ length: len }, (_, i) => ({
      mine: enrichPlayer(myIds[i]),
      opp: enrichPlayer(oppIds[i]),
    }));
  }, [myMatchup, opponentMatchup, enrichPlayer]);

  // Bench players
  const myBench = useMemo(() => {
    if (!myRosterData || !myMatchup) return [];
    const starterSet = new Set(myMatchup.starters ?? []);
    return (myRosterData.players ?? []).filter(id => !starterSet.has(id)).map(enrichPlayer).filter(Boolean);
  }, [myRosterData, myMatchup, enrichPlayer]);

  const oppBench = useMemo(() => {
    if (!opponentRoster || !opponentMatchup) return [];
    const starterSet = new Set(opponentMatchup.starters ?? []);
    return (opponentRoster.players ?? []).filter(id => !starterSet.has(id)).map(enrichPlayer).filter(Boolean);
  }, [opponentRoster, opponentMatchup, enrichPlayer]);

  // Fetch weather for all outdoor home stadiums referenced by starters
  useEffect(() => {
    const date = WEEK_DATES_2025[week];
    if (!date) return;

    const toFetch = new Map(); // homeTeam → { lat, lng }
    const allPlayers = [
      ...starterSlots.flatMap(s => [s.mine, s.opp]),
    ].filter(Boolean);

    for (const player of allPlayers) {
      if (!player.homeTeam || player.isIndoor) continue;
      const s = STADIUMS[player.homeTeam];
      if (s && !s.indoor) {
        const key = `${player.homeTeam}-${date}`;
        if (!weatherMap[key]) toFetch.set(player.homeTeam, { lat: s.lat, lng: s.lng, key });
      }
    }

    for (const [, { lat, lng, key }] of toFetch) {
      fetchGameWeather(lat, lng, date).then(w => {
        if (w) setWeatherMap(prev => ({ ...prev, [key]: w }));
      });
    }
  }, [starterSlots, week]); // eslint-disable-line react-hooks/exhaustive-deps

  // Add projections once weather is available
  const enrichedSlots = useMemo(() => {
    const date = WEEK_DATES_2025[week];

    function addProjection(player) {
      if (!player || !player.weekly?.length || player.name === 'Empty') return player;
      const key = player.homeTeam && date ? `${player.homeTeam}-${date}` : null;
      const weather = player.isIndoor ? null : (key ? (weatherMap[key] ?? null) : null);
      const proj = projectPlayer({
        weeklyArr: player.weekly,
        pos: player.position,
        oppTeam: player.oppTeam,
        isHome: player.isHome,
        isIndoor: player.isIndoor ?? false,
        weather,
        allWeeklyStats: weeklyStats,
        players,
        scoringSettings,
      });
      return { ...player, projection: proj, weather };
    }

    return starterSlots.map(slot => ({
      mine: addProjection(slot.mine),
      opp: addProjection(slot.opp),
    }));
  }, [starterSlots, weatherMap, week, weeklyStats, players, scoringSettings]);

  if (!matchups && !matchupLoading) {
    return <EmptyState message="No matchup data available." />;
  }

  return (
    <div className="pb-6">
      {/* Week selector */}
      <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto">
        {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(w => {
          const isPlayoff = w >= playoffStart;
          const isSelected = week === w;
          // Inject a "PLAYOFFS" divider label before the first playoff week
          return (
            <div key={w} className="flex items-center gap-2 shrink-0">
              {w === playoffStart && (
                <span
                  className="text-xs font-bold uppercase tracking-widest shrink-0 select-none"
                  style={{ color: 'var(--color-label-quaternary)' }}
                >
                  Playoffs
                </span>
              )}
              <button
                onClick={() => setWeek(w)}
                className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: isSelected
                    ? (isPlayoff ? 'var(--color-accent)' : 'var(--color-signature)')
                    : 'var(--color-fill)',
                  color: isSelected
                    ? '#fff'
                    : isPlayoff
                    ? 'var(--color-label-tertiary)'
                    : 'var(--color-label-secondary)',
                  opacity: isPlayoff && !isSelected ? 0.7 : 1,
                }}
              >
                Wk {w}
              </button>
            </div>
          );
        })}
      </div>

      {statsLoading && (
        <div className="mx-4 mb-3 px-4 py-2.5 rounded-xl flex items-center gap-3" style={{ background: 'var(--color-fill)' }}>
          <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--color-fill-secondary)' }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${statsProgress}%`, background: 'var(--color-signature)' }} />
          </div>
          <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--color-label-tertiary)' }}>{statsProgress}%</span>
        </div>
      )}

      {matchupLoading ? (
        <div className="flex items-center justify-center py-16">
          <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>Loading matchup…</span>
        </div>
      ) : !myMatchup ? (
        <EmptyState message="No matchup found for this week." />
      ) : (
        <>
          {/* Scoreboard header */}
          <div className="mx-4 mb-3 px-4 py-3 rounded-xl flex items-center gap-4" style={{ background: 'var(--color-fill-secondary)' }}>
            <button
              className="flex-1 text-center active:opacity-60 transition-opacity"
              onClick={() => setSelectedTeam('mine')}
            >
              <div className="font-semibold text-sm truncate" style={{ color: 'var(--color-label)' }}>{myName}</div>
              <div className="font-bold tabular-nums text-2xl mt-0.5" style={{ color: 'var(--color-signature)' }}>
                {myMatchup.points?.toFixed(2) ?? '—'}
              </div>
            </button>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>vs</div>
            <button
              className="flex-1 text-center active:opacity-60 transition-opacity"
              onClick={() => setSelectedTeam('opp')}
            >
              <div className="font-semibold text-sm truncate" style={{ color: 'var(--color-label)' }}>{opponentName}</div>
              <div className="font-bold tabular-nums text-2xl mt-0.5" style={{ color: 'var(--color-label)' }}>
                {opponentMatchup?.points?.toFixed(2) ?? '—'}
              </div>
            </button>
          </div>

          {/* Column headers */}
          <div className="flex items-center px-4 pb-1 mb-1" style={{ borderBottom: '1px solid var(--color-separator)' }}>
            <span className="flex-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>{myName}</span>
            <span className="w-10 text-center text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Slot</span>
            <span className="flex-1 text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>{opponentName}</span>
          </div>

          {/* Head-to-head starter rows */}
          {enrichedSlots.map((slot, i) => (
            <HeadToHeadRow
              key={i}
              mine={slot.mine}
              opp={slot.opp}
              onSelectMine={() => slot.mine?.id && setSelectedPlayer({ id: slot.mine.id, projection: slot.mine.projection ?? null })}
              onSelectOpp={() => slot.opp?.id && setSelectedPlayer({ id: slot.opp.id, projection: slot.opp.projection ?? null })}
            />
          ))}

          {/* Bench section */}
          {(myBench.length > 0 || oppBench.length > 0) && (
            <>
              <div className="flex items-center justify-between px-4 mt-4 mb-1" style={{ borderBottom: '1px solid var(--color-separator)', paddingBottom: '6px' }}>
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Bench</span>
                <button
                  onClick={() => setShowBench(v => !v)}
                  className="text-xs font-semibold"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {showBench ? 'Hide' : 'Show'}
                </button>
              </div>
              {showBench && (() => {
                const len = Math.max(myBench.length, oppBench.length);
                return Array.from({ length: len }, (_, i) => (
                  <HeadToHeadRow
                    key={i}
                    mine={myBench[i] ?? null}
                    opp={oppBench[i] ?? null}
                    bench
                    onSelectMine={() => myBench[i]?.id && setSelectedPlayer({ id: myBench[i].id, projection: null })}
                    onSelectOpp={() => oppBench[i]?.id && setSelectedPlayer({ id: oppBench[i].id, projection: null })}
                  />
                ));
              })()}
            </>
          )}
        </>
      )}

      {selectedPlayer && (
        <PlayerMatchupBreakdown
          playerId={selectedPlayer.id}
          week={week}
          projection={selectedPlayer.projection}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      {selectedTeam && (
        <TeamScoreBreakdown
          teamName={selectedTeam === 'mine' ? myName : opponentName}
          playerIds={enrichedSlots.map(s => selectedTeam === 'mine' ? s.mine?.id : s.opp?.id).filter(Boolean)}
          week={week}
          onClose={() => setSelectedTeam(null)}
        />
      )}
    </div>
  );
}

function HeadToHeadRow({ mine, opp, bench, onSelectMine, onSelectOpp }) {
  const position = mine?.position ?? opp?.position ?? '?';
  const posColor = POSITION_COLORS[position] ?? 'var(--color-label-tertiary)';

  return (
    <div style={{ borderBottom: '1px solid var(--color-separator)', opacity: bench ? 0.6 : 1 }}>
      {/* Player row — default flex stretch keeps center column same height as buttons */}
      <div className="flex">
        {/* My player — left */}
        <button
          onClick={onSelectMine}
          disabled={!mine}
          className="flex-1 flex items-start gap-2 px-3 py-2.5 text-left active:opacity-60 transition-opacity"
        >
          <PlayerThumb player={mine} />
          <PlayerInfo player={mine} />
        </button>

        {/* Position badge — center, vertically centered within stretched column */}
        <div className="w-10 flex-shrink-0 flex items-center justify-center">
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded"
            style={{ background: `${posColor}20`, color: posColor, fontSize: '10px' }}
          >
            {position}
          </span>
        </div>

        {/* Opponent — right (mirrored) */}
        <button
          onClick={onSelectOpp}
          disabled={!opp}
          className="flex-1 flex items-start gap-2 px-3 py-2.5 text-right active:opacity-60 transition-opacity flex-row-reverse"
        >
          <PlayerThumb player={opp} />
          <PlayerInfo player={opp} align="right" />
        </button>
      </div>

      {/* Game context strip — only for starters with data */}
      {!bench && (mine?.oppTeam || opp?.oppTeam) && (
        <div className="flex px-3 pb-2 gap-2">
          <GameContext player={mine} />
          <div className="w-10 shrink-0" />
          <GameContext player={opp} align="right" />
        </div>
      )}
    </div>
  );
}

function PlayerInfo({ player, align = 'left' }) {
  const isRight = align === 'right';
  if (!player || player.name === 'Empty') {
    return <div className="flex-1" />;
  }
  const ssnRank = player.rank ? `${player.rank.posLabel}${player.rank.rank}` : null;
  const wkRank = player.weekRank ? `${player.weekRank.posLabel}${player.weekRank.rank}` : null;

  // Week pts vs projection diff
  const proj = player.projection?.projected ?? null;
  const weekPts = player.weekPts ?? null;
  const diff = weekPts != null && proj != null
    ? Math.round((weekPts - proj) * 10) / 10
    : null;
  const metProj = diff != null ? diff >= 0 : null;

  return (
    <div className={`flex-1 min-w-0 ${isRight ? 'text-right' : ''}`}>
      {/* Name */}
      <div className="font-semibold text-xs truncate" style={{ color: 'var(--color-label)' }}>
        {player.name}
      </div>
      {/* Week pts + proj diff */}
      <div className={`flex items-center gap-1 mt-0.5 ${isRight ? 'justify-end' : ''}`}>
        <span className="text-xs tabular-nums font-bold" style={{ color: 'var(--color-label)' }}>
          {weekPts != null ? weekPts.toFixed(1) : '—'}
        </span>
        {proj != null && (
          <span className="text-xs tabular-nums" style={{ color: 'var(--color-label-quaternary)' }}>
            · proj {proj.toFixed(1)}
          </span>
        )}
        {diff != null && (
          <span
            className="text-xs tabular-nums font-semibold"
            style={{ color: metProj ? '#22c55e' : 'var(--color-accent-red)' }}
          >
            ({diff >= 0 ? '+' : ''}{diff.toFixed(1)})
          </span>
        )}
      </div>
      {/* Team · wk rank · ssn rank · PPG */}
      <div className={`flex items-center gap-1 mt-0.5 ${isRight ? 'justify-end' : ''}`}>
        <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
          {player.team}
        </span>
        {wkRank && (
          <span className="text-xs font-bold" style={{ color: 'var(--color-signature)' }}>
            · {wkRank} week
          </span>
        )}
        {ssnRank && (
          <span className="text-xs font-bold" style={{ color: 'var(--color-label-quaternary)' }}>
            · {ssnRank} season
          </span>
        )}
        {player.avgPPG > 0 && (
          <span className="text-xs tabular-nums" style={{ color: 'var(--color-label-quaternary)' }}>
            · {player.avgPPG.toFixed(1)} PPG
          </span>
        )}
      </div>
    </div>
  );
}

function GameContext({ player, align = 'left' }) {
  const isRight = align === 'right';
  if (!player || player.name === 'Empty' || !player.oppTeam) return <div className="flex-1" />;

  const locationStr = player.isHome === true ? 'Home' : player.isHome === false ? 'Away' : null;
  const weatherStr = formatWeather(player.weather, player.isIndoor ?? false);
  const proj = player.projection;

  return (
    <div className={`flex-1 min-w-0 ${isRight ? 'text-right' : ''}`}>
      {/* vs OPP · Home/Away */}
      <div className={`flex items-center gap-1 flex-wrap ${isRight ? 'justify-end' : ''}`}>
        <span className="text-xs font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
          vs {player.oppTeam}
        </span>
        {locationStr && (
          <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
            · {locationStr}
          </span>
        )}
      </div>
      {/* Weather */}
      <div className="mt-0.5">
        <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
          {weatherStr}
        </span>
      </div>
      {/* Projection range */}
      {proj && (
        <div className="mt-0.5">
          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--color-signature)' }}>
            {proj.min}–{proj.max} pts
          </span>
          <span className="text-xs tabular-nums" style={{ color: 'var(--color-label-quaternary)' }}>
            {' '}({proj.projected} proj)
          </span>
        </div>
      )}
    </div>
  );
}

function PlayerThumb({ player }) {
  if (!player || player.name === 'Empty') {
    return <div className="w-8 h-8 rounded-full shrink-0" style={{ background: 'var(--color-fill)' }} />;
  }
  return (
    <img
      src={`https://sleepercdn.com/content/nfl/players/thumb/${player.id}.jpg`}
      alt={player.name}
      className="w-8 h-8 rounded-full shrink-0 object-cover"
      style={{ background: 'var(--color-fill)' }}
      onError={e => { e.target.src = 'https://sleepercdn.com/images/v2/icons/player_default.webp'; }}
    />
  );
}

function TeamScoreBreakdown({ teamName, playerIds, week, onClose }) {
  const { weeklyStats, scoringSettings } = useSleeper();

  const rows = useMemo(() => {
    if (!weeklyStats) return [];
    const settings = { ...DEFAULT_SCORING, ...scoringSettings };

    // Aggregate each stat key across all starters
    const totals = {};
    for (const id of playerIds) {
      const weekly = weeklyStats[id] ?? [];
      const entry = weekly.find(w => w.week === week);
      if (!entry) continue;
      for (const statKey of Object.keys(STAT_LABELS)) {
        const val = entry[statKey];
        if (val) totals[statKey] = (totals[statKey] ?? 0) + val;
      }
    }

    return Object.entries(STAT_LABELS)
      .map(([statKey, label]) => {
        const statVal = totals[statKey];
        if (!statVal) return null;
        const multiplier = settings[statKey] ?? 0;
        if (multiplier === 0) return null;
        const pts = Math.round(statVal * multiplier * 100) / 100;
        return { label, statKey, statVal, pts };
      })
      .filter(Boolean)
      .sort((a, b) => b.pts - a.pts);
  }, [weeklyStats, scoringSettings, playerIds, week]);

  const total = Math.round(rows.reduce((s, r) => s + r.pts, 0) * 100) / 100;

  // Lock background scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full rounded-2xl overflow-hidden pointer-events-auto"
          style={{
            background: 'var(--color-bg-secondary)',
            maxWidth: '480px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
          }}
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-4 pb-3 shrink-0" style={{ borderBottom: '1px solid var(--color-separator)' }}>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base truncate" style={{ color: 'var(--color-label)' }}>
                {teamName}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--color-label-tertiary)' }}>
                Week {week} · Scoring Breakdown
              </div>
            </div>
            <button onClick={onClose} className="shrink-0 p-1" style={{ color: 'var(--color-label-secondary)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Column headers */}
          <div
            className="flex items-center px-5 py-2 sticky top-0"
            style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-separator)' }}
          >
            <span className="flex-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Category</span>
            <span className="w-14 text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Value</span>
            <span className="w-16 text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Pts</span>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1">
            {rows.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>No stat data for Week {week}.</span>
              </div>
            ) : (
              <>
                {rows.map(row => (
                  <div
                    key={row.statKey}
                    className="flex items-center px-5 py-2.5"
                    style={{ borderBottom: '1px solid var(--color-separator)' }}
                  >
                    <span className="flex-1 text-sm" style={{ color: 'var(--color-label)' }}>
                      {row.label}
                    </span>
                    <span className="w-14 text-right text-sm tabular-nums" style={{ color: 'var(--color-label-secondary)' }}>
                      {Number.isInteger(row.statVal) ? row.statVal : row.statVal.toFixed(1)}
                    </span>
                    <span
                      className="w-16 text-right text-sm font-semibold tabular-nums"
                      style={{ color: row.pts < 0 ? 'var(--color-accent-red)' : 'var(--color-label)' }}
                    >
                      {row.pts > 0 ? `+${row.pts.toFixed(2)}` : row.pts.toFixed(2)}
                    </span>
                  </div>
                ))}

                {/* Total row */}
                <div
                  className="flex items-center px-5 py-4"
                  style={{ background: 'var(--color-fill-secondary)', borderTop: '1px solid var(--color-separator)' }}
                >
                  <span className="flex-1 text-sm font-bold" style={{ color: 'var(--color-label)' }}>Total</span>
                  <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--color-signature)' }}>
                    {total.toFixed(2)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex items-center justify-center py-20 px-6">
      <span className="text-sm text-center" style={{ color: 'var(--color-label-secondary)' }}>{message}</span>
    </div>
  );
}
