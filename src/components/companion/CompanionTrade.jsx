// ── CompanionTrade ────────────────────────────────────────────────────────────
// Trade Agent: build and evaluate trade proposals using KTC values.
// Lives as a Companion sub-tab; uses Sleeper rosters and draft pick data.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSleeper } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { fetchKtcPlayers, getKtcValue, fmtKtcValue, findKtcPlayerFromSleeper, computeKtcMultipliers, applyKtcMultipliers } from '../../utils/ktcApi';
import { getTradedPicks, getLeagueDrafts } from '../../api/sleeperApi';
import {
  buildRosterPicks, getPicksForRoster, getPickQuality,
  valueSide, evaluateTrade, suggestPackage, buildCandidatePool,
} from '../../utils/tradeEngine';
import { TEAM_COLORS } from '../../data/teamColors';
import { computePositionalRanks } from '../../utils/projectionEngine';
import { calcPointsFromTotals } from '../../utils/scoringEngine';
import TradeRosterPicker from './TradeRosterPicker';
import TradePickPicker from './TradePickPicker';

// ── Team color helpers ────────────────────────────────────────────────────────

const SLEEPER_TEAM_MAP = {
  lar: 'la',
  was: 'wsh',
  jac: 'jax',
  lvr: 'lv',
};

function toTeamKey(sleeperTeam) {
  if (!sleeperTeam) return '';
  const lower = sleeperTeam.toLowerCase();
  return SLEEPER_TEAM_MAP[lower] ?? lower;
}

function hexLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function teamPalette(sleeperTeam, darkMode) {
  const key = toTeamKey(sleeperTeam);
  const palette = TEAM_COLORS[key] ?? null;
  if (!palette) return { color: null, tint: null, isLight: false, logoKey: key };
  const color = darkMode ? palette.darkPrimary : palette.primary;
  const isLight = hexLuminance(color) > 0.35;
  const alpha = isLight ? '18' : '22';
  return { color, tint: `${color}${alpha}`, isLight, logoKey: key };
}

// Derive league format and type from Sleeper league settings
function detectLeagueFormat(league) {
  // Sleeper settings.type: 0 = redraft, 2 = dynasty/keeper
  const isDynasty = league?.settings?.type === 2;
  return isDynasty ? 'dynasty' : 'redraft';
}

function detectLeagueType(league) {
  // If roster_positions includes SUPER_FLEX, it's a superflex league
  const hasSF = (league?.roster_positions ?? []).includes('SUPER_FLEX');
  return hasSF ? 'sf' : '1qb';
}

// ── Main component ───────────────────────────────────────────────────────────

export default function CompanionTrade({ initialPlayer, onConsumeInitialPlayer }) {
  const {
    rosters, leagueUsers, players: sleeperPlayers, myRoster,
    selectedLeagueId, league, season, getUserDisplayName,
    scoringSettings, seasonStats, weeklyStats,
    loadPlayers, loadSeasonStats, statsLoading,
  } = useSleeper();

  const myRosterData = myRoster();

  // Derive format and league type from league settings
  const format = detectLeagueFormat(league);
  const leagueType = detectLeagueType(league);

  // Trade partner
  const [partnerRosterId, setPartnerRosterId] = useState(null);

  // Trade contents
  const [yourPlayers, setYourPlayers]   = useState([]);   // sleeper IDs
  const [yourPicks, setYourPicks]       = useState([]);   // { year, round, fromRosterId, key }
  const [theirPlayers, setTheirPlayers] = useState([]);
  const [theirPicks, setTheirPicks]     = useState([]);

  // KTC data
  const [ktcPlayers, setKtcPlayers] = useState(null);
  const [ktcLoading, setKtcLoading] = useState(false);
  const [ktcError, setKtcError]     = useState(null);

  // Draft picks data
  const [tradedPicks, setTradedPicks] = useState(null);
  const [draftRounds, setDraftRounds] = useState(null);

  // Picker state
  const [pickerOpen, setPickerOpen] = useState(null); // { side: 'yours'|'theirs', type: 'player'|'pick' }

  // Suggestion state
  const [suggestions, setSuggestions]   = useState(null);
  const [showTrends, setShowTrends]     = useState(false);
  const [showValInfo, setShowValInfo]   = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    setKtcLoading(true);
    setKtcError(null);

    // Always fetch dynasty data alongside the format-specific data.
    // The dynasty page is the only one that includes RDP (draft pick) entries,
    // so we need it regardless of whether the league is detected as dynasty or
    // redraft (keeper leagues with settings.type !== 2 would otherwise get no
    // pick values). We merge the RDP entries in so player values still come
    // from the correct format page.
    const fetches = [fetchKtcPlayers(format)];
    if (format !== 'dynasty') fetches.push(fetchKtcPlayers('dynasty').catch(() => []));

    Promise.all(fetches)
      .then(([formatPlayers, dynastyPlayers]) => {
        if (dynastyPlayers?.length) {
          const rdpEntries = dynastyPlayers.filter(k => k.position === 'RDP');
          setKtcPlayers([...formatPlayers, ...rdpEntries]);
        } else {
          setKtcPlayers(formatPlayers);
        }
        setKtcLoading(false);
      })
      .catch(e => { setKtcError(e.message); setKtcLoading(false); });
  }, [format]);

  useEffect(() => {
    if (!selectedLeagueId) return;
    Promise.all([
      getTradedPicks(selectedLeagueId).catch(() => []),
      getLeagueDrafts(selectedLeagueId).catch(() => []),
    ]).then(([picks, drafts]) => {
      setTradedPicks(picks ?? []);
      const maxFromDrafts = (drafts ?? []).reduce((max, d) => Math.max(max, d.settings?.rounds ?? 0), 0);
      setDraftRounds(maxFromDrafts || null);
    });
  }, [selectedLeagueId]);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  useEffect(() => {
    if (!seasonStats && !statsLoading) loadSeasonStats();
  }, [seasonStats, statsLoading, loadSeasonStats]);

  // ── Pre-populate from entry points ──────────────────────────────────────────

  useEffect(() => {
    if (!initialPlayer) return;
    onConsumeInitialPlayer?.();

    const { sleeperId, side, partnerRosterId: initPartner, otherSleeperId } = initialPlayer;

    // Reset trade state
    setYourPicks([]);
    setTheirPicks([]);
    setSuggestions(null);

    if (side === 'give') {
      // Trading away one of your own players
      setYourPlayers([sleeperId]);
      setTheirPlayers([]);

      // If there's a second player from Compare, put them on "their" side
      if (otherSleeperId) {
        setTheirPlayers([otherSleeperId]);
        // Find which roster owns the other player
        const ownerRoster = rosters.find(r =>
          [...(r.players ?? []), ...(r.reserve ?? [])].includes(otherSleeperId)
        );
        if (ownerRoster && ownerRoster.roster_id !== myRosterData?.roster_id) {
          setPartnerRosterId(ownerRoster.roster_id);
        }
      } else {
        setTheirPlayers([]);
      }
    } else if (side === 'get') {
      // Targeting a player on another roster
      if (initPartner) setPartnerRosterId(initPartner);
      setTheirPlayers([sleeperId]);
      setYourPlayers([]);
    }
  }, [initialPlayer]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived data ────────────────────────────────────────────────────────────

  const { slots, rosterPicks } = useMemo(
    () => buildRosterPicks(tradedPicks, rosters, league, season, draftRounds),
    [tradedPicks, rosters, league, season, draftRounds],
  );

  // League-specific KTC adjustments — applied once to the raw array so all
  // downstream code (pickers, value bars, trade math) sees tuned numbers.
  const ktcMultipliers = useMemo(
    () => computeKtcMultipliers(scoringSettings, league?.roster_positions),
    [scoringSettings, league],
  );

  const adjustedKtcPlayers = useMemo(
    () => applyKtcMultipliers(ktcPlayers, ktcMultipliers),
    [ktcPlayers, ktcMultipliers],
  );

  // Whether any meaningful adjustment was applied (for UI attribution label)
  const isAdjusted = useMemo(
    () => Object.values(ktcMultipliers).some(v => Math.abs(v - 1) > 0.01),
    [ktcMultipliers],
  );

  // Sort rosters: my team first, then alphabetically (excluding self for partner list)
  const partnerRosters = useMemo(() => {
    if (!rosters.length || !myRosterData) return [];
    return [...rosters]
      .filter(r => r.roster_id !== myRosterData.roster_id)
      .sort((a, b) => getUserDisplayName(a.owner_id).localeCompare(getUserDisplayName(b.owner_id)));
  }, [rosters, myRosterData, getUserDisplayName]);

  // Positional ranks across all rostered players (for trade card display)
  const rankMap = useMemo(
    () => computePositionalRanks(seasonStats, sleeperPlayers, scoringSettings),
    [seasonStats, sleeperPlayers, scoringSettings],
  );

  // Enrich a valueSide result with avgPPG + rankInfo per player item
  function enrichItems(side) {
    if (!side.items.length) return side;
    const enriched = side.items.map(it => {
      if (it.type !== 'player') return it;
      const stats = seasonStats?.[it.id];
      const pts = stats ? calcPointsFromTotals(stats, scoringSettings, it.position) : null;
      const gp = stats?.gp ?? null;
      return {
        ...it,
        avgPPG: pts != null && gp ? Math.round((pts / gp) * 10) / 10 : null,
        rankInfo: rankMap[it.id] ?? null,
      };
    });
    return { ...side, items: enriched };
  }

  // Value calculations
  const yourSide = useMemo(() => {
    const side = adjustedKtcPlayers
      ? valueSide(yourPlayers, yourPicks, sleeperPlayers, adjustedKtcPlayers, leagueType, rosters)
      : { total: 0, items: [] };
    return enrichItems(side);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yourPlayers, yourPicks, sleeperPlayers, adjustedKtcPlayers, leagueType, rosters, seasonStats, scoringSettings, rankMap]);

  const theirSide = useMemo(() => {
    const side = adjustedKtcPlayers
      ? valueSide(theirPlayers, theirPicks, sleeperPlayers, adjustedKtcPlayers, leagueType, rosters)
      : { total: 0, items: [] };
    return enrichItems(side);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theirPlayers, theirPicks, sleeperPlayers, adjustedKtcPlayers, leagueType, rosters, seasonStats, scoringSettings, rankMap]);

  const verdict = useMemo(
    () => evaluateTrade(yourSide.total, theirSide.total),
    [yourSide.total, theirSide.total],
  );

  const hasItems = yourSide.items.length > 0 || theirSide.items.length > 0;

  // Partner roster preview — top players + owned picks
  const partnerPreview = useMemo(() => {
    if (!partnerRosterId || !sleeperPlayers || !adjustedKtcPlayers) return null;
    const roster = rosters.find(r => r.roster_id === partnerRosterId);
    if (!roster) return null;

    const ids = [...new Set([...(roster.players ?? []), ...(roster.reserve ?? [])])];
    const players = ids.map(id => {
      const sp = sleeperPlayers[id];
      if (!sp) return null;
      const ktc = findKtcPlayerFromSleeper(id, sleeperPlayers, adjustedKtcPlayers);
      const val = getKtcValue(ktc, leagueType);
      return {
        id,
        name: sp.full_name ?? `${sp.first_name ?? ''} ${sp.last_name ?? ''}`.trim(),
        position: sp.position ?? '',
        team: sp.team ?? '',
        val,
      };
    }).filter(Boolean).sort((a, b) => (b.val ?? -1) - (a.val ?? -1));

    const ownedPicks = getPicksForRoster(partnerRosterId, rosterPicks, slots);

    return { players, picks: ownedPicks };
  }, [partnerRosterId, sleeperPlayers, adjustedKtcPlayers, leagueType, rosters, rosterPicks, slots]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const addPlayer = useCallback((side, playerIdOrObj) => {
    if (side === 'yours') {
      // Your side: always a plain ID (locked to your roster)
      setYourPlayers(prev => [...prev, playerIdOrObj]);
    } else if (typeof playerIdOrObj === 'object') {
      // Their side from all-rosters search: { id, rosterId }
      const { id, rosterId: playerRosterId } = playerIdOrObj;
      if (playerRosterId && playerRosterId !== partnerRosterId) {
        // Auto-set partner and clear existing trade items from old partner
        setPartnerRosterId(playerRosterId);
        setTheirPlayers([id]);
        setTheirPicks([]);
        setYourPlayers([]);
        setYourPicks([]);
      } else {
        setTheirPlayers(prev => [...prev, id]);
      }
    } else {
      setTheirPlayers(prev => [...prev, playerIdOrObj]);
    }
    setPickerOpen(null);
    setSuggestions(null);
  }, [partnerRosterId]);

  const removePlayer = useCallback((side, playerId) => {
    if (side === 'yours') setYourPlayers(prev => prev.filter(id => id !== playerId));
    else setTheirPlayers(prev => prev.filter(id => id !== playerId));
    setSuggestions(null);
  }, []);

  const addPick = useCallback((side, pick) => {
    if (side === 'yours') setYourPicks(prev => [...prev, pick]);
    else setTheirPicks(prev => [...prev, pick]);
    setPickerOpen(null);
    setSuggestions(null);
  }, []);

  const removePick = useCallback((side, pickKey) => {
    if (side === 'yours') setYourPicks(prev => prev.filter(p => p.key !== pickKey));
    else setTheirPicks(prev => prev.filter(p => p.key !== pickKey));
    setSuggestions(null);
  }, []);

  const handleSuggest = useCallback(() => {
    if (!adjustedKtcPlayers || !partnerRosterId) return;
    const gap = Math.abs(yourSide.total - theirSide.total);
    if (gap <= 0) return;

    // Build candidates from the deficit side
    const deficitSide = yourSide.total < theirSide.total ? 'yours' : 'theirs';
    const deficitRosterId = deficitSide === 'yours' ? myRosterData?.roster_id : partnerRosterId;
    const excludeIds = deficitSide === 'yours' ? yourPlayers : theirPlayers;
    const excludePickKeys = (deficitSide === 'yours' ? yourPicks : theirPicks).map(p => p.key);

    const candidates = buildCandidatePool(
      deficitRosterId, rosters, excludeIds, excludePickKeys,
      sleeperPlayers, adjustedKtcPlayers, leagueType, rosterPicks, slots,
    );

    const options = suggestPackage(gap, candidates);
    setSuggestions({ side: deficitSide, options });
  }, [adjustedKtcPlayers, partnerRosterId, yourSide, theirSide, myRosterData, rosters,
      yourPlayers, theirPlayers, yourPicks, theirPicks, sleeperPlayers, leagueType, rosterPicks, slots]);

  const applySuggestion = useCallback((option) => {
    if (!suggestions) return;
    const { side } = suggestions;
    for (const item of option.items) {
      if (item.type === 'player') {
        if (side === 'yours') setYourPlayers(prev => [...prev, item.id]);
        else setTheirPlayers(prev => [...prev, item.id]);
      } else if (item.pickData) {
        if (side === 'yours') setYourPicks(prev => [...prev, item.pickData]);
        else setTheirPicks(prev => [...prev, item.pickData]);
      }
    }
    setSuggestions(null);
  }, [suggestions]);

  const clearTrade = useCallback(() => {
    setYourPlayers([]);
    setYourPicks([]);
    setTheirPlayers([]);
    setTheirPicks([]);
    setSuggestions(null);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="pb-8">

      {/* ── Owner carousel + search ──────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
            Trade Agent
          </span>
        </div>
        <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex gap-2" style={{ width: 'max-content' }}>
            {partnerRosters.map(roster => {
              const isSelected = roster.roster_id === partnerRosterId;
              const name = getUserDisplayName(roster.owner_id);
              const user = leagueUsers.find(u => u.user_id === roster.owner_id);
              const avatarHash = user?.avatar;
              return (
                <button
                  key={roster.roster_id}
                  onClick={() => { setPartnerRosterId(roster.roster_id); clearTrade(); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors shrink-0"
                  style={{
                    background: isSelected ? 'var(--color-signature)' : 'var(--color-fill)',
                    color: isSelected ? '#0C0F14' : 'var(--color-label-secondary)',
                    fontWeight: isSelected ? 700 : 500,
                  }}
                >
                  {avatarHash ? (
                    <img src={`https://sleepercdn.com/avatars/thumbs/${avatarHash}`}
                      alt={name} className="w-5 h-5 rounded-full shrink-0 object-cover"
                      onError={e => { e.target.style.display = 'none'; }} />
                  ) : (
                    <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center"
                      style={{ background: 'var(--color-fill-secondary)', fontSize: '9px', fontWeight: 700, color: 'var(--color-label-secondary)' }}>
                      {name[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs whitespace-nowrap">{name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search All Players — always visible when KTC is ready */}
        {!ktcLoading && !ktcError && (
          <button
            onClick={() => setPickerOpen({ side: 'theirs', type: 'player', allRosters: true })}
            className="w-full flex items-center justify-center gap-2 mt-2.5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            Search All Players
          </button>
        )}
      </div>

      {/* ── Empty state: no partner selected ─────────────────────────────── */}
      {!partnerRosterId && (
        <div className="flex flex-col items-center justify-center py-10 px-8 gap-2">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--color-fill)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: 'var(--color-label-tertiary)' }}>
              <path d="M7 16V4m0 0L3 8m4-4l4 4" />
              <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </div>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
            Select a trade partner or search for a player
          </span>
          <span className="text-xs text-center" style={{ color: 'var(--color-label-tertiary)' }}>
            Choose a league member above, or tap Search All Players to find any player.
          </span>
        </div>
      )}

      {/* ── Partner roster preview ───────────────────────────────────────── */}
      {partnerRosterId && partnerPreview && !hasItems && !ktcLoading && !ktcError && (
        <PartnerPreview
          preview={partnerPreview}
          partnerName={getUserDisplayName(rosters.find(r => r.roster_id === partnerRosterId)?.owner_id ?? '')}
          rosters={rosters}
          getUserDisplayName={getUserDisplayName}
          leagueType={leagueType}
          ktcPlayers={adjustedKtcPlayers}
          onSelectPlayer={id => addPlayer('theirs', id)}
        />
      )}

      {/* ── KTC loading / error ─────────────────────────────────────────── */}
      {partnerRosterId && ktcLoading && (
        <div className="flex items-center justify-center py-8 gap-3"
          style={{ color: 'var(--color-label-tertiary)' }}>
          <Spinner />
          <span className="text-sm">Loading KTC data…</span>
        </div>
      )}

      {partnerRosterId && !ktcLoading && ktcError && (
        <div className="mx-4 rounded-xl px-4 py-4 flex flex-col gap-1.5" style={{ background: 'var(--color-fill)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
            KTC data unavailable
          </span>
          <span className="text-xs leading-relaxed" style={{ color: 'var(--color-label-tertiary)' }}>
            The KeepTradeCut proxy could not be reached. Trade values require the nginx proxy in production.
          </span>
          <span className="text-xs font-mono mt-1" style={{ color: 'var(--color-label-quaternary)' }}>{ktcError}</span>
        </div>
      )}

      {/* ── Trade builder ───────────────────────────────────────────────── */}
      {partnerRosterId && !ktcLoading && !ktcError && (
        <>
          <div className="flex gap-3 px-4 pt-2">
            {/* YOUR SIDE */}
            <TradeSide
              label="Your Side"
              items={yourSide.items}
              total={yourSide.total}
              onRemovePlayer={id => removePlayer('yours', id)}
              onRemovePick={key => removePick('yours', key)}
              onAddPlayer={() => setPickerOpen({ side: 'yours', type: 'player' })}
              onAddPick={() => setPickerOpen({ side: 'yours', type: 'pick' })}
              isLeader={verdict.verdict === 'favors_them'}
              showTeamColors
            />

            <div className="flex items-center justify-center shrink-0 text-xs font-bold pt-6"
              style={{ color: 'var(--color-label-quaternary)', width: 24 }}>
              vs
            </div>

            {/* THEIR SIDE */}
            <TradeSide
              label="Their Side"
              items={theirSide.items}
              total={theirSide.total}
              onRemovePlayer={id => removePlayer('theirs', id)}
              onRemovePick={key => removePick('theirs', key)}
              onAddPlayer={() => setPickerOpen({ side: 'theirs', type: 'player' })}
              onAddPick={() => setPickerOpen({ side: 'theirs', type: 'pick' })}
              isLeader={verdict.verdict === 'favors_you'}
            />
          </div>

          {/* ── Value comparison bar ────────────────────────────────────── */}
          {hasItems && (
            <div className="px-4 pt-4 flex flex-col gap-2">
              <ValueBar yourTotal={yourSide.total} theirTotal={theirSide.total} />
              <VerdictLabel verdict={verdict} />
            </div>
          )}

          {/* ── Refine Trade ─────────────────────────────────────────────── */}
          {hasItems && verdict.verdict !== 'fair' && verdict.gap > 0 && (
            <div className="px-4 pt-3">
              <button onClick={handleSuggest}
                className="w-full py-2.5 rounded-xl text-xs font-semibold transition-colors"
                style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}>
                Refine Trade
              </button>
            </div>
          )}

          {/* ── Suggestion results ──────────────────────────────────────── */}
          {suggestions && suggestions.options.length > 0 && (
            <div className="px-4 pt-3 flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
                Suggested Additions ({suggestions.side === 'yours' ? 'Your Side' : 'Their Side'})
              </span>
              {suggestions.options.map((opt, i) => (
                <div key={i} className="rounded-xl px-3 py-3 flex items-center justify-between gap-2"
                  style={{ background: 'var(--color-fill)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" style={{ color: 'var(--color-label)' }}>
                      {opt.items.map(it => it.label).join(' + ')}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--color-label-tertiary)' }}>
                      {fmtKtcValue(opt.total)} total · {opt.delta >= 0 ? '+' : ''}{fmtKtcValue(opt.delta)} vs gap
                    </div>
                  </div>
                  <button onClick={() => applySuggestion(opt)}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}>
                    Apply
                  </button>
                </div>
              ))}
            </div>
          )}

          {suggestions && suggestions.options.length === 0 && (
            <div className="px-4 pt-3 text-xs text-center" style={{ color: 'var(--color-label-tertiary)' }}>
              No combinations found to close the gap.
            </div>
          )}

          {/* ── KTC trends ──────────────────────────────────────────────── */}
          {hasItems && (
            <div className="px-4 pt-4">
              <button onClick={() => setShowTrends(!showTrends)}
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
                <span style={{ transform: showTrends ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}>▸</span>
                KTC Trends
              </button>
              {showTrends && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {[...yourSide.items, ...theirSide.items]
                    .filter(it => it.ktcEntry)
                    .map(it => <TrendRow key={it.id} item={it} leagueType={leagueType} />)}
                </div>
              )}
            </div>
          )}

          {/* ── Clear trade ─────────────────────────────────────────────── */}
          {hasItems && (
            <div className="px-4 pt-4">
              <button onClick={clearTrade}
                className="w-full py-2 rounded-xl text-xs font-semibold transition-colors"
                style={{ background: 'var(--color-fill)', color: 'var(--color-destructive, #ef4444)' }}>
                Clear Trade
              </button>
            </div>
          )}

          {/* ── Attribution ─────────────────────────────────────────────── */}
          <div className="px-4 pt-4 flex items-center justify-center gap-1.5">
            <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>
              Values from{' '}
              <span className="font-medium" style={{ color: 'var(--color-label-tertiary)' }}>KeepTradeCut</span>
              {' · '}{format === 'dynasty' ? 'Dynasty' : 'Redraft'}
              {' · '}{leagueType === 'sf' ? 'Superflex' : '1QB'}
              {isAdjusted && (
                <span style={{ color: 'var(--color-accent)' }}>{' · '}League-adjusted</span>
              )}
            </span>
            <button
              onClick={() => setShowValInfo(true)}
              className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: 'var(--color-fill)', color: 'var(--color-label-tertiary)' }}
              aria-label="How values are calculated"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
              </svg>
            </button>
          </div>
        </>
      )}

      {/* ── Picker modals ───────────────────────────────────────────────── */}
      {showValInfo && (
        <ValuationInfoSheet
          format={format}
          leagueType={leagueType}
          scoringSettings={scoringSettings}
          rosterPositions={league?.roster_positions}
          multipliers={ktcMultipliers}
          isAdjusted={isAdjusted}
          onClose={() => setShowValInfo(false)}
        />
      )}

      {pickerOpen?.type === 'player' && (
        <TradeRosterPicker
          rosterId={pickerOpen.side === 'yours'
            ? myRosterData?.roster_id
            : (pickerOpen.allRosters ? null : (partnerRosterId ?? null))}
          rosters={rosters}
          sleeperPlayers={sleeperPlayers}
          ktcPlayers={adjustedKtcPlayers}
          leagueType={leagueType}
          excludeIds={pickerOpen.side === 'yours' ? yourPlayers : theirPlayers}
          seasonStats={seasonStats}
          scoringSettings={scoringSettings}
          getUserDisplayName={getUserDisplayName}
          myRosterId={myRosterData?.roster_id}
          currentTotal={pickerOpen.side === 'yours' ? yourSide.total : theirSide.total}
          onSelect={result => addPlayer(pickerOpen.side, result)}
          onClose={() => setPickerOpen(null)}
        />
      )}

      {pickerOpen?.type === 'pick' && (
        <TradePickPicker
          rosterId={pickerOpen.side === 'yours' ? myRosterData?.roster_id : partnerRosterId}
          rosterPicks={rosterPicks}
          slots={slots}
          rosters={rosters}
          ktcPlayers={adjustedKtcPlayers}
          leagueType={leagueType}
          excludeKeys={(pickerOpen.side === 'yours' ? yourPicks : theirPicks).map(p => p.key)}
          getUserDisplayName={getUserDisplayName}
          currentTotal={pickerOpen.side === 'yours' ? yourSide.total : theirSide.total}
          onSelect={pick => addPick(pickerOpen.side, pick)}
          onClose={() => setPickerOpen(null)}
        />
      )}
    </div>
  );
}

// ── TradeSide ─────────────────────────────────────────────────────────────────

// ── PartnerPreview ────────────────────────────────────────────────────────────
// Shows the opponent's top players and draft picks when a partner is selected
// but no trade items have been added yet. Tap a player to add them to the trade.

function PartnerPreview({ preview, partnerName, rosters, getUserDisplayName, leagueType, ktcPlayers, onSelectPlayer }) {
  const [showPicks, setShowPicks] = useState(false);
  const { darkMode } = useTheme();
  const topPlayers = preview.players.slice(0, 10);
  const ORDINALS = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };

  return (
    <div className="px-4 pt-2 pb-4 flex flex-col gap-3">
      {/* Players section */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest mb-2"
          style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
          {partnerName}'s Roster
        </div>
        <div className="flex flex-col gap-1">
          {topPlayers.map(p => {
            const tp = teamPalette(p.team, darkMode);
            return (
              <button key={p.id} onClick={() => onSelectPlayer(p.id)}
                className="rounded-lg px-2.5 py-2 flex items-center gap-2 relative overflow-hidden transition-colors"
                style={{
                  background: tp.tint ?? 'var(--color-fill)',
                  borderLeft: tp.color ? `3px solid ${tp.color}` : '3px solid transparent',
                }}>
                <img src={`https://sleepercdn.com/content/nfl/players/thumb/${p.id}.jpg`}
                  alt="" className="w-7 h-7 rounded-full shrink-0 object-cover"
                  style={{ background: 'var(--color-fill-secondary)' }}
                  onError={e => { e.target.style.display = 'none'; }} />
                <div className="flex-1 min-w-0 text-left relative">
                  {/* Team logo watermark — scoped to text area */}
                  {tp.logoKey && (
                    <img
                      src={`https://a.espncdn.com/i/teamlogos/nfl/500/${tp.logoKey}.png`}
                      aria-hidden="true"
                      className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none select-none"
                      style={{ width: 28, height: 28, objectFit: 'contain', opacity: 0.12 }}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  )}
                  <div className="text-xs font-semibold truncate" style={{ color: 'var(--color-label)' }}>
                    {p.name}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
                    {p.position} · {p.team}
                  </div>
                </div>
                <div className="text-xs font-semibold tabular-nums shrink-0"
                  style={{ color: p.val != null ? 'var(--color-label-secondary)' : 'var(--color-label-quaternary)' }}>
                  {fmtKtcValue(p.val)}
                </div>
              </button>
            );
          })}
          {preview.players.length > 10 && (
            <div className="text-xs text-center py-1" style={{ color: 'var(--color-label-quaternary)' }}>
              +{preview.players.length - 10} more
            </div>
          )}
        </div>
      </div>

      {/* Picks section */}
      {preview.picks.length > 0 && (
        <div>
          <button onClick={() => setShowPicks(!showPicks)}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
            <span style={{ transform: showPicks ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}>▸</span>
            Draft Capital ({preview.picks.length} picks)
          </button>
          {showPicks && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {preview.picks.map(pick => {
                const ord = ORDINALS[pick.round] ?? `${pick.round}th`;
                const fromLabel = pick.isOwn ? '' : ` (from ${getUserDisplayName(
                  rosters.find(r => r.roster_id === pick.fromRosterId)?.owner_id ?? ''
                )})`;
                return (
                  <span key={pick.key}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium"
                    style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}>
                    {pick.year} {ord}{fromLabel}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-center" style={{ color: 'var(--color-label-quaternary)' }}>
        Tap a player to add them to the trade
      </div>
    </div>
  );
}

function TradeSide({ label, items, total, onRemovePlayer, onRemovePick, onAddPlayer, onAddPick, isLeader, showTeamColors }) {
  const { darkMode } = useTheme();

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-1.5">

      {/* Header: label + running total */}
      <div className="rounded-lg px-2.5 py-2 flex items-center justify-between mb-0.5"
        style={{
          background: isLeader ? 'var(--color-signature)' : 'var(--color-fill)',
          color: isLeader ? '#0C0F14' : 'var(--color-label)',
        }}>
        <span className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: isLeader ? '#0C0F14' : 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
          {label}
        </span>
        <span className="text-sm font-bold tabular-nums">{fmtKtcValue(total)}</span>
      </div>

      {items.map(it => {
        const tp = (showTeamColors && it.type === 'player')
          ? teamPalette(it.team, darkMode)
          : { color: null, tint: null, logoKey: '' };
        return (
          <div key={it.id}
            className="rounded-lg px-2.5 py-2 flex items-center gap-2 relative overflow-hidden"
            style={{
              background: tp.tint ?? 'var(--color-fill)',
              borderLeft: tp.color ? `3px solid ${tp.color}` : '3px solid transparent',
            }}>

            {it.type === 'player' && (
              <img src={`https://sleepercdn.com/content/nfl/players/thumb/${it.id}.jpg`}
                alt="" className="w-7 h-7 rounded-full shrink-0 object-cover"
                style={{ background: 'var(--color-fill-secondary)' }}
                onError={e => { e.target.style.display = 'none'; }} />
            )}
            {it.type === 'pick' && (
              <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center"
                style={{ background: 'var(--color-fill-secondary)', fontSize: '8px', fontWeight: 700, color: 'var(--color-label-tertiary)' }}>
                PICK
              </div>
            )}
            <div className="flex-1 min-w-0 relative">
              {/* Team logo watermark — scoped to text area so it never overlaps values */}
              {it.type === 'player' && tp.logoKey && (
                <img
                  src={`https://a.espncdn.com/i/teamlogos/nfl/500/${tp.logoKey}.png`}
                  aria-hidden="true"
                  className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none select-none"
                  style={{ width: 32, height: 32, objectFit: 'contain', opacity: 0.12 }}
                  onError={e => { e.target.style.display = 'none'; }}
                />
              )}
              <div className="text-xs font-semibold truncate" style={{ color: 'var(--color-label)' }}>
                {it.label}
              </div>
              {it.position && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
                    {it.position}{it.team ? ` · ${it.team}` : ''}
                  </span>
                  {it.rankInfo && (
                    <span className="text-xs font-bold tabular-nums"
                      style={{ color: tp.color ?? 'var(--color-label-quaternary)' }}>
                      #{it.rankInfo.rank} {it.rankInfo.posLabel}
                    </span>
                  )}
                  {it.avgPPG != null && (
                    <span className="text-xs tabular-nums" style={{ color: 'var(--color-label-quaternary)' }}>
                      {it.avgPPG.toFixed(1)} avg
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="text-sm font-bold tabular-nums shrink-0"
              style={{ color: it.val != null ? 'var(--color-label)' : 'var(--color-label-quaternary)' }}>
              {fmtKtcValue(it.val)}
            </div>
            <button onClick={() => it.type === 'player' ? onRemovePlayer(it.id) : onRemovePick(it.id)}
              className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: 'var(--color-fill-secondary)', color: 'var(--color-label-tertiary)', fontSize: '10px' }}>
              ×
            </button>
          </div>
        );
      })}

      {/* Add buttons */}
      <div className="flex gap-1.5">
        <button onClick={onAddPlayer}
          className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors"
          style={{ border: '1px dashed var(--color-separator)', color: 'var(--color-label-tertiary)' }}>
          + Player
        </button>
        <button onClick={onAddPick}
          className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors"
          style={{ border: '1px dashed var(--color-separator)', color: 'var(--color-label-tertiary)' }}>
          + Pick
        </button>
      </div>
    </div>
  );
}

// ── ValueBar ──────────────────────────────────────────────────────────────────

function ValueBar({ yourTotal, theirTotal }) {
  const max = Math.max(yourTotal, theirTotal, 1);
  const yourPct = Math.round((yourTotal / max) * 100);
  const theirPct = Math.round((theirTotal / max) * 100);

  return (
    <div className="flex gap-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-fill)' }}>
      <div className="h-full rounded-full transition-all duration-500"
        style={{ width: `${yourPct}%`, background: 'var(--color-accent)' }} />
      <div className="h-full rounded-full transition-all duration-500"
        style={{ width: `${theirPct}%`, background: 'var(--color-label-quaternary)' }} />
    </div>
  );
}

// ── VerdictLabel ──────────────────────────────────────────────────────────────

function VerdictLabel({ verdict: { verdict, gap, pct } }) {
  const labels = {
    fair: { text: 'Fair Trade', color: 'var(--color-accent-green, #22c55e)' },
    favors_you: { text: 'Favors You', color: 'var(--color-signature)' },
    favors_them: { text: 'Favors Them', color: 'var(--color-destructive, #ef4444)' },
  };
  const { text, color } = labels[verdict] ?? labels.fair;

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-bold" style={{ color }}>{text}</span>
      {gap > 0 && verdict !== 'fair' && (
        <span className="text-xs tabular-nums" style={{ color: 'var(--color-label-secondary)' }}>
          {fmtKtcValue(gap)} gap ({pct}%)
        </span>
      )}
    </div>
  );
}

// ── TrendRow ──────────────────────────────────────────────────────────────────

function TrendRow({ item, leagueType }) {
  const vals = leagueType === 'sf' ? item.ktcEntry?.superflexValues : item.ktcEntry?.oneQBValues;
  if (!vals) return null;

  const trend7 = vals.overall7DayTrend ?? 0;
  const trendAll = vals.overallTrend ?? 0;

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg"
      style={{ background: 'var(--color-fill)' }}>
      <span className="text-xs font-medium truncate" style={{ color: 'var(--color-label)' }}>
        {item.label}
      </span>
      <div className="flex gap-3 shrink-0">
        <TrendValue label="7d" value={trend7} />
        <TrendValue label="30d" value={trendAll} />
      </div>
    </div>
  );
}

function TrendValue({ label, value }) {
  const color = value > 0 ? 'var(--color-accent-green, #22c55e)'
    : value < 0 ? 'var(--color-destructive, #ef4444)'
    : 'var(--color-label-quaternary)';
  return (
    <span className="text-xs tabular-nums" style={{ color }}>
      {label}: {value > 0 ? '+' : ''}{value}
    </span>
  );
}

// ── ValuationInfoSheet ────────────────────────────────────────────────────────

function ValuationInfoSheet({ format, leagueType, scoringSettings, rosterPositions, multipliers, isAdjusted, onClose }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const rec           = scoringSettings?.rec ?? 0.5;
  const passTd        = scoringSettings?.pass_td ?? 4;
  const teBonus       = scoringSettings?.bonus_rec_te ?? 0;
  const passInt       = scoringSettings?.pass_int ?? -2;
  const fumLost       = scoringSettings?.fum_lost ?? -2;
  const bonusPassYd300 = scoringSettings?.bonus_pass_yd_300 ?? 0;
  const bonusPassYd400 = scoringSettings?.bonus_pass_yd_400 ?? 0;
  const bonusRushYd100 = scoringSettings?.bonus_rush_yd_100 ?? 0;
  const bonusRushYd200 = scoringSettings?.bonus_rush_yd_200 ?? 0;
  const bonusRecYd100  = scoringSettings?.bonus_rec_yd_100 ?? 0;
  const bonusRecYd200  = scoringSettings?.bonus_rec_yd_200 ?? 0;
  const rushFd        = scoringSettings?.rush_fd ?? 0;
  const recFd         = scoringSettings?.rec_fd ?? 0;

  // Count TE/RB/WR starters for the scarcity note
  const posCounts = {};
  for (const p of rosterPositions ?? []) posCounts[p] = (posCounts[p] ?? 0) + 1;

  function pct(mult) {
    const delta = Math.round((mult - 1) * 100);
    if (delta === 0) return null;
    return delta > 0 ? `+${delta}%` : `${delta}%`;
  }

  const positions = [
    { pos: 'QB', label: 'Quarterback' },
    { pos: 'RB', label: 'Running Back' },
    { pos: 'WR', label: 'Wide Receiver' },
    { pos: 'TE', label: 'Tight End' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="flex flex-col rounded-2xl overflow-hidden w-full mx-4"
        style={{ background: 'var(--color-bg)', maxHeight: '80vh', maxWidth: 560 }}
        onClick={e => e.stopPropagation()}>

        {/* Handle + header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3"
          style={{ borderBottom: '1px solid var(--color-separator)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
            How Values Are Calculated
          </span>
          <button onClick={onClose} className="text-xs font-semibold"
            style={{ color: 'var(--color-accent)' }}>Done</button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-5 overflow-y-auto">

          {/* KTC section */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
              KeepTradeCut (KTC)
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label)' }}>
              Trade values are sourced from{' '}
              <span className="font-semibold">KeepTradeCut</span>, a community-driven
              platform where dynasty managers submit real trade offers to establish
              consensus market values. Values are on a <span className="font-semibold">0–10,000</span> scale.
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
              KTC publishes separate value sets for{' '}
              <span className="font-semibold">Dynasty vs Redraft</span> leagues and{' '}
              <span className="font-semibold">1QB vs Superflex</span> formats. This app
              automatically selects the correct set based on your league's Sleeper settings.
            </p>
            <div className="rounded-xl px-3 py-2.5 flex gap-4"
              style={{ background: 'var(--color-fill)' }}>
              <InfoPill label="Format" value={format === 'dynasty' ? 'Dynasty' : 'Redraft'} />
              <InfoPill label="League type" value={leagueType === 'sf' ? 'Superflex' : '1QB'} />
            </div>
          </section>

          {/* Baseline section */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
              KTC Baseline Assumptions
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
              KTC's community values are built from a broad mix of leagues. Their implicit baseline is:
            </p>
            <div className="flex flex-col gap-1">
              {[
                ['Reception scoring', '½ PPR (0.5 pts/catch)'],
                ['Passing touchdowns', '4 pts per TD'],
                ['TE premium', 'None'],
                ['Roster construction', '1 TE, standard flex'],
              ].map(([label, val]) => (
                <div key={label} className="flex items-center justify-between py-1.5 px-3 rounded-lg"
                  style={{ background: 'var(--color-fill)' }}>
                  <span className="text-xs" style={{ color: 'var(--color-label-secondary)' }}>{label}</span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--color-label-tertiary)' }}>{val}</span>
                </div>
              ))}
            </div>
          </section>

          {/* League adjustments section */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
              Your League's Adjustments
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
              {isAdjusted
                ? 'Your league\'s scoring settings differ from KTC\'s baseline. Positional multipliers are applied automatically based on the live settings fetched from Sleeper:'
                : 'Your league\'s settings match KTC\'s baseline closely — no adjustments are applied.'}
            </p>

            {/* Scoring settings */}
            <div className="flex flex-col gap-1">
              <AdjustmentRow
                label="Reception scoring"
                leagueValue={`${rec} pts/catch`}
                baseline="0.5 pts/catch"
                note={rec !== 0.5 ? `WR values ${pct(multipliers.WR) ?? 'unchanged'}, RB values ${pct(multipliers.RB) ?? 'unchanged'} vs baseline` : null}
              />
              <AdjustmentRow
                label="Passing touchdowns"
                leagueValue={`${passTd} pts/TD`}
                baseline="4 pts/TD"
                note={passTd !== 4 ? `QB values ${pct(multipliers.QB) ?? 'unchanged'} vs baseline` : null}
              />
              <AdjustmentRow
                label="TE premium"
                leagueValue={teBonus > 0 ? `+${teBonus} pts/catch` : 'None'}
                baseline="None"
                note={teBonus > 0 ? `TE values ${pct(multipliers.TE) ?? 'unchanged'} vs baseline` : null}
              />
              {passInt < -2 && (
                <AdjustmentRow
                  label="Interception penalty"
                  leagueValue={`${passInt} pts/INT`}
                  baseline="-2 pts/INT"
                  note={`QB values reduced vs baseline`}
                />
              )}
              {fumLost < -2 && (
                <AdjustmentRow
                  label="Fumble lost penalty"
                  leagueValue={`${fumLost} pts/fumble`}
                  baseline="-2 pts/fumble"
                  note={`RB values reduced vs baseline`}
                />
              )}
              {(bonusPassYd300 > 0 || bonusPassYd400 > 0) && (
                <AdjustmentRow
                  label="Big passing game bonus"
                  leagueValue={[
                    bonusPassYd300 > 0 && `+${bonusPassYd300} at 300 yds`,
                    bonusPassYd400 > 0 && `+${bonusPassYd400} at 400 yds`,
                  ].filter(Boolean).join(', ')}
                  baseline="None"
                  note={`QB values boosted for volume/big-game upside`}
                />
              )}
              {(bonusRushYd100 > 0 || bonusRushYd200 > 0) && (
                <AdjustmentRow
                  label="Big rushing game bonus"
                  leagueValue={[
                    bonusRushYd100 > 0 && `+${bonusRushYd100} at 100 yds`,
                    bonusRushYd200 > 0 && `+${bonusRushYd200} at 200 yds`,
                  ].filter(Boolean).join(', ')}
                  baseline="None"
                  note={`Workhorse RB values boosted`}
                />
              )}
              {(bonusRecYd100 > 0 || bonusRecYd200 > 0) && (
                <AdjustmentRow
                  label="Big receiving game bonus"
                  leagueValue={[
                    bonusRecYd100 > 0 && `+${bonusRecYd100} at 100 yds`,
                    bonusRecYd200 > 0 && `+${bonusRecYd200} at 200 yds`,
                  ].filter(Boolean).join(', ')}
                  baseline="None"
                  note={`WR and TE values boosted for target volume`}
                />
              )}
              {rushFd > 0 && (
                <AdjustmentRow
                  label="Rush first down bonus"
                  leagueValue={`+${rushFd} pts/FD`}
                  baseline="None"
                  note={`RB values boosted for efficiency`}
                />
              )}
              {recFd > 0 && (
                <AdjustmentRow
                  label="Receiving first down bonus"
                  leagueValue={`+${recFd} pts/FD`}
                  baseline="None"
                  note={`WR and TE values boosted for route-running volume`}
                />
              )}
              {(posCounts.TE ?? 0) >= 2 && (
                <AdjustmentRow
                  label="TE starter spots"
                  leagueValue={`${posCounts.TE} starters`}
                  baseline="1 starter"
                  note={`Additional TE scarcity premium applied`}
                />
              )}
              {(posCounts.RB ?? 0) >= 3 && (
                <AdjustmentRow
                  label="RB starter spots"
                  leagueValue={`${posCounts.RB} starters`}
                  baseline="2 starters"
                  note={`Additional RB scarcity premium applied`}
                />
              )}
              {(posCounts.WR ?? 0) >= 4 && (
                <AdjustmentRow
                  label="WR starter spots"
                  leagueValue={`${posCounts.WR} starters`}
                  baseline="3 starters"
                  note={`Additional WR scarcity premium applied`}
                />
              )}
            </div>

            {/* Position multiplier summary */}
            {isAdjusted && (
              <div className="rounded-xl overflow-hidden mt-1"
                style={{ border: '1px solid var(--color-separator)' }}>
                <div className="px-3 py-2 flex items-center"
                  style={{ background: 'var(--color-fill)', borderBottom: '1px solid var(--color-separator)' }}>
                  <span className="flex-1 text-xs font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>Position</span>
                  <span className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>Adjustment</span>
                </div>
                {positions.map(({ pos, label }) => {
                  const delta = pct(multipliers[pos] ?? 1);
                  return (
                    <div key={pos} className="px-3 py-2.5 flex items-center"
                      style={{ borderBottom: '1px solid var(--color-separator)' }}>
                      <span className="flex-1 text-sm" style={{ color: 'var(--color-label)' }}>{label}</span>
                      <span className="text-sm font-semibold tabular-nums"
                        style={{ color: delta ? (delta.startsWith('+') ? 'var(--color-accent-green, #22c55e)' : 'var(--color-destructive, #ef4444)') : 'var(--color-label-quaternary)' }}>
                        {delta ?? 'No change'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Draft picks section */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
              Draft Pick Values
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
              Draft picks use KTC's dynasty pick values directly (labeled Early/Mid/Late
              based on current standings) and are <span className="font-semibold">not adjusted</span> by
              league scoring settings. Pick values reflect community consensus on future
              asset value, which is largely scoring-agnostic.
            </p>
          </section>

          <div className="pb-2 text-xs text-center" style={{ color: 'var(--color-label-quaternary)' }}>
            Adjustments recalculate automatically whenever your league settings change in Sleeper.
          </div>

        </div>
      </div>
    </div>
  );
}

function InfoPill({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>{value}</span>
    </div>
  );
}

function AdjustmentRow({ label, leagueValue, baseline, note }) {
  const isDifferent = leagueValue !== baseline && note;
  return (
    <div className="rounded-lg px-3 py-2.5 flex flex-col gap-1"
      style={{ background: 'var(--color-fill)', outline: isDifferent ? '1px solid var(--color-accent)' : 'none', outlineOffset: '-1px' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium" style={{ color: 'var(--color-label)' }}>{label}</span>
        <span className="text-xs font-semibold" style={{ color: isDifferent ? 'var(--color-accent)' : 'var(--color-label-tertiary)' }}>
          {leagueValue}
        </span>
      </div>
      {isDifferent && note && (
        <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>{note}</span>
      )}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: 'spin 0.8s linear infinite' }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
