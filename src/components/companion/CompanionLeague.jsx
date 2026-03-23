import { useEffect, useMemo, useState } from 'react';
import { useSleeper } from '../../context/SleeperContext';
import { calcPointsFromTotals } from '../../utils/scoringEngine';
import { computePositionalRanks, getAvgPPG } from '../../utils/projectionEngine';
import { getTradedPicks, getLeagueDrafts } from '../../api/sleeperApi';
import PlayerWeeklySheet from './PlayerWeeklySheet';

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB', 'DE', 'DT', 'CB', 'S'];
const POSITION_COLORS = {
  QB: '#ef4444', RB: '#22c55e', WR: '#3b82f6', TE: '#f59e0b', K: '#8b5cf6', DEF: '#6b7280',
};
const MAX_ROUNDS = 36; // generous cap — Sleeper dynasty startups can run 25+ rounds

export default function CompanionLeague({ onTradePlayer }) {
  const [subView, setSubView] = useState('roster');

  return (
    <div className="pb-6">
      {/* Sub-view toggle */}
      <div className="px-4 pb-4 flex gap-2">
        {[['roster', 'Rosters'], ['picks', 'Draft Picks']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSubView(id)}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background: subView === id ? 'var(--color-signature)' : 'var(--color-fill)',
              color: subView === id ? '#0C0F14' : 'var(--color-label-secondary)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {subView === 'roster' && <LeagueRosterView onTradePlayer={onTradePlayer} />}
      {subView === 'picks' && <LeaguePicksView />}
    </div>
  );
}

// ── Roster sub-view ───────────────────────────────────────────────────────────

function LeagueRosterView({ onTradePlayer }) {
  const {
    leagueUsers, rosters, myRoster, getUserDisplayName,
    players, loadPlayers,
    weeklyStats, seasonStats, loadSeasonStats,
    statsLoading, statsProgress,
    scoringSettings,
  } = useSleeper();

  const myRosterData = useMemo(() => myRoster(), [myRoster]);
  const [selectedRosterId, setSelectedRosterId] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  // Default to my own roster once it's available
  useEffect(() => {
    if (myRosterData && selectedRosterId === null) {
      setSelectedRosterId(myRosterData.roster_id);
    }
  }, [myRosterData, selectedRosterId]);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  useEffect(() => {
    if (!seasonStats && !statsLoading) loadSeasonStats();
  }, [seasonStats, statsLoading, loadSeasonStats]);

  const positionalRanks = useMemo(
    () => computePositionalRanks(seasonStats, players, scoringSettings),
    [seasonStats, players, scoringSettings],
  );

  const selectedRoster = useMemo(
    () => rosters.find(r => r.roster_id === selectedRosterId) ?? null,
    [rosters, selectedRosterId],
  );

  const rosterPlayers = useMemo(() => {
    if (!selectedRoster || !players) return [];
    // Sleeper includes IR players in both `players` and `reserve` — deduplicate via Set
    const playerIds = [...new Set([...(selectedRoster.players || []), ...(selectedRoster.reserve || [])])];
    return playerIds.map(id => {
      const p = players[id];
      if (!p) return null;
      const stats = seasonStats?.[id] ?? null;
      const weekly = weeklyStats?.[id] ?? [];
      const pts = stats ? calcPointsFromTotals(stats, scoringSettings) : null;
      const avgPPG = getAvgPPG(weekly, scoringSettings);
      const rank = positionalRanks[id] ?? null;
      const isReserve = selectedRoster.reserve?.includes(id);
      return {
        id,
        name: p.full_name || `${p.first_name} ${p.last_name}`,
        position: p.position,
        team: p.team || 'FA',
        pts,
        avgPPG,
        rank,
        isReserve,
        injuryStatus: p.injury_status,
      };
    }).filter(Boolean);
  }, [selectedRoster, players, seasonStats, weeklyStats, scoringSettings, positionalRanks]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const p of rosterPlayers) {
      const pos = POSITION_ORDER.includes(p.position) ? p.position : 'Other';
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(p);
    }
    for (const pos of Object.keys(groups)) {
      groups[pos].sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1));
    }
    return groups;
  }, [rosterPlayers]);

  // Sort rosters: my team first, then alphabetically by display name
  const sortedRosters = useMemo(() => {
    const myId = myRosterData?.roster_id;
    return [...rosters].sort((a, b) => {
      if (a.roster_id === myId) return -1;
      if (b.roster_id === myId) return 1;
      return getUserDisplayName(a.owner_id).localeCompare(getUserDisplayName(b.owner_id));
    });
  }, [rosters, myRosterData, getUserDisplayName]);

  return (
    <>
      {/* Owner selector */}
      <div className="px-4 pb-3 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="flex gap-2" style={{ width: 'max-content' }}>
          {sortedRosters.map(roster => {
            const isSelected = roster.roster_id === selectedRosterId;
            const isMe = roster.roster_id === myRosterData?.roster_id;
            const name = getUserDisplayName(roster.owner_id);
            const user = leagueUsers.find(u => u.user_id === roster.owner_id);
            const avatarHash = user?.avatar;
            return (
              <button
                key={roster.roster_id}
                onClick={() => setSelectedRosterId(roster.roster_id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors shrink-0"
                style={{
                  background: isSelected ? 'var(--color-signature)' : 'var(--color-fill)',
                  color: isSelected ? '#0C0F14' : 'var(--color-label-secondary)',
                  fontWeight: isSelected ? 700 : 500,
                }}
              >
                {avatarHash ? (
                  <img
                    src={`https://sleepercdn.com/avatars/thumbs/${avatarHash}`}
                    alt={name}
                    className="w-5 h-5 rounded-full shrink-0 object-cover"
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center"
                    style={{ background: 'var(--color-fill-secondary)', fontSize: '9px', fontWeight: 700, color: 'var(--color-label-secondary)' }}>
                    {name[0]?.toUpperCase()}
                  </div>
                )}
                <span className="text-xs whitespace-nowrap">{name}{isMe ? ' (Me)' : ''}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats loading banner */}
      {statsLoading && (
        <div className="mx-4 mb-4 px-4 py-2.5 rounded-xl flex items-center gap-3" style={{ background: 'var(--color-fill)' }}>
          <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--color-fill-secondary)' }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${statsProgress}%`, background: 'var(--color-signature)' }} />
          </div>
          <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--color-label-tertiary)' }}>
            Loading stats {statsProgress}%
          </span>
        </div>
      )}

      {/* Column headers */}
      <div className="flex items-center gap-3 px-4 pb-2 mb-1" style={{ borderBottom: '1px solid var(--color-separator)' }}>
        <div className="w-9 shrink-0" />
        <span className="flex-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Player</span>
        <span className="w-16 text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Season</span>
        <span className="w-14 text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Avg/G</span>
        <div className="w-3 shrink-0" />
      </div>

      {!players && <EmptyState message="Loading player database…" />}

      {players && selectedRoster && (
        POSITION_ORDER.filter(pos => grouped[pos]?.length).map(pos => (
          <div key={pos} className="mb-4">
            <div className="px-4 py-1.5 text-xs font-bold uppercase tracking-widest"
              style={{ color: POSITION_COLORS[pos] ?? 'var(--color-label-tertiary)' }}>
              {pos}
            </div>
            {grouped[pos].map(player => {
              const isOpponent = selectedRosterId !== myRosterData?.roster_id;
              return (
                <LeaguePlayerRow key={player.id} player={player} onSelect={() => setSelectedPlayerId(player.id)}
                  onTrade={onTradePlayer && isOpponent ? () => onTradePlayer(player.id, selectedRosterId) : null} />
              );
            })}
          </div>
        ))
      )}

      {players && rosterPlayers.length === 0 && !statsLoading && (
        <EmptyState message="No players on this roster." />
      )}

      {selectedPlayerId && (
        <PlayerWeeklySheet playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
      )}
    </>
  );
}

function LeaguePlayerRow({ player, onSelect, onTrade }) {
  const isInjured = player.injuryStatus && player.injuryStatus !== 'Questionable';
  const rankLabel = player.rank ? `${player.rank.posLabel}${player.rank.rank}` : null;
  return (
    <div className="flex items-center w-full" style={{ borderBottom: '1px solid var(--color-separator)' }}>
      <button
        onClick={onSelect}
        className="flex items-center flex-1 min-w-0 px-4 py-2.5 gap-3 text-left active:opacity-60 transition-opacity"
      >
        <img
          src={`https://sleepercdn.com/content/nfl/players/thumb/${player.id}.jpg`}
          alt={player.name}
          className="w-9 h-9 rounded-full shrink-0 object-cover"
          style={{ background: 'var(--color-fill)' }}
          onError={e => { e.target.src = 'https://sleepercdn.com/images/v2/icons/player_default.webp'; }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm truncate" style={{ color: 'var(--color-label)' }}>{player.name}</span>
            {player.injuryStatus && (
              <span className="text-xs font-bold px-1 py-0.5 rounded shrink-0"
                style={{
                  background: isInjured ? 'rgba(239,68,68,0.12)' : 'rgba(245,183,0,0.12)',
                  color: isInjured ? 'var(--color-accent-red)' : 'var(--color-signature)',
                  fontSize: '10px',
                }}>
                {player.injuryStatus}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
              {player.team}{player.isReserve && ' · IR'}
            </span>
            {rankLabel && (
              <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--color-label-quaternary)' }}>
                · {rankLabel}
              </span>
            )}
          </div>
        </div>
        <div className="w-16 text-right">
          <span className="font-bold tabular-nums text-sm" style={{ color: 'var(--color-label)' }}>
            {player.pts !== null ? player.pts.toFixed(1) : '—'}
          </span>
        </div>
        <div className="w-14 text-right">
          <span className="tabular-nums text-sm" style={{ color: 'var(--color-label-secondary)' }}>
            {player.avgPPG > 0 ? player.avgPPG.toFixed(1) : '—'}
          </span>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ color: 'var(--color-label-quaternary)', flexShrink: 0 }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {onTrade && (
        <button
          onClick={onTrade}
          className="shrink-0 px-3 py-1.5 mr-3 rounded-lg text-xs font-semibold transition-colors active:opacity-60"
          style={{ background: 'var(--color-fill)', color: 'var(--color-accent)' }}
        >
          Trade
        </button>
      )}
    </div>
  );
}

// ── Draft Picks sub-view ──────────────────────────────────────────────────────

function LeaguePicksView() {
  const { selectedLeagueId, rosters, leagueUsers, league, season, getUserDisplayName } = useSleeper();
  const [tradedPicks, setTradedPicks] = useState(null);
  const [draftRounds, setDraftRounds] = useState(null); // max rounds across all league drafts
  const [picksLoading, setPicksLoading] = useState(false);

  useEffect(() => {
    if (!selectedLeagueId) return;
    setPicksLoading(true);
    Promise.all([
      getTradedPicks(selectedLeagueId).catch(() => []),
      getLeagueDrafts(selectedLeagueId).catch(() => []),
    ]).then(([picks, drafts]) => {
      setTradedPicks(picks ?? []);
      // Take the highest rounds value across all drafts (startup > rookie in dynasty)
      const maxFromDrafts = (drafts ?? []).reduce((max, d) => Math.max(max, d.settings?.rounds ?? 0), 0);
      setDraftRounds(maxFromDrafts || null);
    }).finally(() => setPicksLoading(false));
  }, [selectedLeagueId]);

  // Build the picks matrix from traded_picks data
  const { slots, years, rosterPicks } = useMemo(() => {
    if (!tradedPicks || !rosters || !league) return { slots: [], years: [], rosterPicks: {} };

    // Priority for round count:
    //   1. Max rounds across all league drafts (startup draft in dynasty can be 17+)
    //   2. Highest round number seen in traded picks data
    //   3. league.settings.draft_rounds (rookie draft rounds, typically 3 — last resort)
    const maxRoundsFromData = tradedPicks.reduce((max, p) => Math.max(max, p.round), 0);
    const maxRounds = Math.min(
      Math.max(draftRounds ?? 0, maxRoundsFromData, league.settings?.draft_rounds ?? 3, 3),
      MAX_ROUNDS,
    );
    const baseYear = parseInt(season);

    // Always show up to 3 future draft years, plus any additional years found in traded picks
    const yearSet = new Set([
      String(baseYear + 1),
      String(baseYear + 2),
      String(baseYear + 3),
    ]);
    for (const p of tradedPicks) yearSet.add(p.season);
    // Include current season only if picks for it have been traded
    if (tradedPicks.some(p => p.season === season)) yearSet.add(season);
    const years = [...yearSet].sort();

    // Build slots: all (year, round) combinations
    const slots = [];
    for (const year of years) {
      for (let r = 1; r <= maxRounds; r++) {
        slots.push({ key: `${year}|${r}`, year, round: r });
      }
    }

    // Build traded pick lookup: "year|round|originating_roster_id" → current owner_id
    const tradedMap = new Map();
    for (const pick of tradedPicks) {
      if (pick.round > maxRounds) continue;
      tradedMap.set(`${pick.season}|${pick.round}|${pick.roster_id}`, pick.owner_id);
    }

    // For each roster, determine their pick holdings per slot
    const rosterPicks = {};
    for (const roster of rosters) {
      const rid = roster.roster_id;
      rosterPicks[rid] = {};

      for (const { key, year, round } of slots) {
        // Own pick status: is this team's original pick for this slot still with them?
        const ownKey = `${year}|${round}|${rid}`;
        const ownCurrentOwner = tradedMap.get(ownKey);
        // If not in tradedMap → never traded → still own it
        // If in tradedMap and current owner is still rid → traded back
        const ownStatus = (ownCurrentOwner === undefined || ownCurrentOwner === rid) ? 'own' : 'traded_away';

        // Acquired picks: picks from other teams now owned by this team in this slot
        const acquired = [];
        for (const [pickKey, currentOwner] of tradedMap) {
          if (currentOwner !== rid) continue;
          const [pYear, pRound, pRosterId] = pickKey.split('|');
          if (pYear !== year || Number(pRound) !== round || Number(pRosterId) === rid) continue;
          acquired.push(Number(pRosterId));
        }

        rosterPicks[rid][key] = { ownStatus, acquired };
      }
    }

    return { slots, years, rosterPicks };
  }, [tradedPicks, draftRounds, rosters, league, season]);

  // Sort rosters by total picks currently held (most to least), then by owner name
  const sortedRosters = useMemo(() => {
    if (!rosters.length || !Object.keys(rosterPicks).length) return rosters;
    return [...rosters].sort((a, b) => {
      const picksA = countPicksHeld(rosterPicks[a.roster_id]);
      const picksB = countPicksHeld(rosterPicks[b.roster_id]);
      if (picksB !== picksA) return picksB - picksA;
      return getUserDisplayName(a.owner_id).localeCompare(getUserDisplayName(b.owner_id));
    });
  }, [rosters, rosterPicks, getUserDisplayName]);

  if (picksLoading) {
    return <EmptyState message="Loading draft picks…" />;
  }

  if (!tradedPicks) return null;

  if (tradedPicks.length === 0 && slots.length === 0) {
    return (
      <EmptyState message="No traded picks found. This may be a redraft league, or no picks have been traded yet." />
    );
  }

  // Cell + header dimensions
  const LEFT_COL = 120;
  const CELL_W = 52;
  const totalWidth = LEFT_COL + slots.length * CELL_W;

  return (
    <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div style={{ minWidth: `${totalWidth}px` }}>

        {/* Legend */}
        <div className="flex items-center gap-4 px-4 pb-3 pt-1">
          <div className="flex items-center gap-1.5">
            <OwnDot />
            <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>Own</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex flex-col items-center" style={{ gap: '1px' }}>
              <AcquiredDot />
              <span style={{ fontSize: '7px', fontWeight: 700, color: 'var(--color-accent)', lineHeight: 1 }}>OAK</span>
            </div>
            <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>Acquired</span>
          </div>
          <div className="flex items-center gap-1.5">
            <EmptyDot />
            <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>Traded away</span>
          </div>
        </div>

        {/* Year group headers */}
        <div
          className="flex sticky top-0 z-10"
          style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-separator)' }}
        >
          <div style={{ width: LEFT_COL, flexShrink: 0 }} />
          {years.map(year => {
            const colsForYear = slots.filter(s => s.year === year).length;
            return (
              <div
                key={year}
                className="text-center py-1.5 text-xs font-bold tracking-widest uppercase"
                style={{ width: colsForYear * CELL_W, flexShrink: 0, color: 'var(--color-label)', borderLeft: '1px solid var(--color-separator)' }}
              >
                {year}
              </div>
            );
          })}
        </div>

        {/* Round sub-headers */}
        <div
          className="flex sticky z-10"
          style={{ top: '28px', background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-separator)' }}
        >
          <div
            className="px-3 py-1.5 text-xs font-semibold uppercase tracking-widest shrink-0"
            style={{ width: LEFT_COL, color: 'var(--color-label-tertiary)' }}
          >
            Team
          </div>
          {slots.map(({ key, year, round }, i) => {
            const isFirstOfYear = i === 0 || slots[i - 1].year !== year;
            return (
              <div
                key={key}
                className="text-center py-1.5 text-xs font-semibold shrink-0"
                style={{
                  width: CELL_W,
                  color: 'var(--color-label-tertiary)',
                  borderLeft: isFirstOfYear ? '1px solid var(--color-separator)' : undefined,
                }}
              >
                R{round}
              </div>
            );
          })}
        </div>

        {/* Team rows */}
        {sortedRosters.map((roster, rowIdx) => {
          const picks = rosterPicks[roster.roster_id] ?? {};
          const user = leagueUsers.find(u => u.user_id === roster.owner_id);
          const name = getUserDisplayName(roster.owner_id);
          const avatarHash = user?.avatar;
          const totalHeld = countPicksHeld(picks);

          return (
            <div
              key={roster.roster_id}
              className="flex items-center"
              style={{
                borderBottom: '1px solid var(--color-separator)',
                background: rowIdx % 2 === 0 ? 'transparent' : 'var(--color-fill-secondary)',
                minHeight: '44px',
              }}
            >
              {/* Team name column */}
              <div
                className="flex items-center gap-2 px-3 shrink-0"
                style={{ width: LEFT_COL }}
              >
                {avatarHash ? (
                  <img
                    src={`https://sleepercdn.com/avatars/thumbs/${avatarHash}`}
                    alt={name}
                    className="w-6 h-6 rounded-full shrink-0 object-cover"
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center"
                    style={{ background: 'var(--color-fill)', fontSize: '9px', fontWeight: 700, color: 'var(--color-label-secondary)' }}>
                    {name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: 'var(--color-label)', maxWidth: '76px' }}>
                    {name}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>
                    {totalHeld} picks
                  </div>
                </div>
              </div>

              {/* Pick cells */}
              {slots.map(({ key, year }, i) => {
                const cell = picks[key] ?? { ownStatus: 'own', acquired: [] };
                const isFirstOfYear = i === 0 || slots[i - 1].year !== year;
                return (
                  <PickCell
                    key={key}
                    cell={cell}
                    rosters={rosters}
                    getUserDisplayName={getUserDisplayName}
                    width={CELL_W}
                    borderLeft={isFirstOfYear}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PickCell({ cell, rosters, getUserDisplayName, width, borderLeft }) {
  const { ownStatus, acquired } = cell;
  const hasAnyPick = ownStatus === 'own' || acquired.length > 0;

  return (
    <div
      className="flex flex-col items-center justify-center gap-1 shrink-0"
      style={{
        width,
        minHeight: '44px',
        padding: '3px 0',
        borderLeft: borderLeft ? '1px solid var(--color-separator)' : undefined,
      }}
    >
      {/* Own pick: amber filled dot */}
      {ownStatus === 'own' && <OwnDot />}

      {/* Acquired picks: filled accent dot + team abbreviation label */}
      {acquired.map(fromRosterId => {
        const ownerName = getUserDisplayName(
          rosters.find(r => r.roster_id === fromRosterId)?.owner_id
        );
        const abbr = (ownerName || '?').slice(0, 3).toUpperCase();
        return (
          <div key={fromRosterId} className="flex flex-col items-center" style={{ gap: '1px' }}>
            <AcquiredDot />
            <span style={{ fontSize: '7px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.02em', lineHeight: 1 }}>
              {abbr}
            </span>
          </div>
        );
      })}

      {/* No pick at all: dim empty circle */}
      {!hasAnyPick && <EmptyDot />}
    </div>
  );
}

function OwnDot() {
  return (
    <div className="rounded-full shrink-0" style={{ width: 10, height: 10, background: 'var(--color-signature)' }} />
  );
}

function AcquiredDot() {
  return (
    <div className="rounded-full shrink-0" style={{ width: 10, height: 10, background: 'var(--color-accent)' }} />
  );
}

function EmptyDot() {
  return (
    <div className="rounded-full shrink-0" style={{ width: 10, height: 10, border: '1.5px solid var(--color-label-quaternary)', opacity: 0.35 }} />
  );
}

// ── Shared utilities ──────────────────────────────────────────────────────────

function countPicksHeld(picks) {
  if (!picks) return 0;
  let count = 0;
  for (const cell of Object.values(picks)) {
    if (cell.ownStatus === 'own') count++;
    count += cell.acquired.length;
  }
  return count;
}

function EmptyState({ message }) {
  return (
    <div className="flex items-center justify-center py-20 px-6">
      <span className="text-sm text-center" style={{ color: 'var(--color-label-secondary)' }}>{message}</span>
    </div>
  );
}
