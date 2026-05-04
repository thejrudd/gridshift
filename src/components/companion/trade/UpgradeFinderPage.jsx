import { memo, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import TradeRosterPicker from '../TradeRosterPicker';
import UpgradeBargainingTable from '../UpgradeBargainingTable';
import { buildUpgradeMoverSuggestions } from '../upgradeMoverSuggestions';
import Spinner from './Spinner';
import {
  TradeProposalItem,
  UpgradeResultGroup,
  useStagedRender,
  StagedRenderStatus,
  UPGRADE_RESULT_SORT_OPTIONS,
  buildRosterStandingMap,
  buildManagerMetaLine,
  sortUpgradeResultGroups,
  getManagerInitials,
} from './TradeProposalPanel';
import { normalizeRosterId, teamPalette } from './tradeUiHelpers';

const TRADE_LOGO_SIDE_THEME_OPTIONS = { logoSide: 'end' };

const UpgradeFinderPage = memo(function UpgradeFinderPage({
  players,
  searchSubmitted,
  searchDirty = false,
  searchPending,
  selectedPlayerId,
  selectedOutgoingPlayerIds,
  tradePostureLevel,
  allowPackages,
  allowOutgoingPicks,
  allowIncomingPicks,
  results,
  postureOptions,
  darkMode,
  seasonStats,
  sleeperPlayers,
  ktcPlayers,
  dynastyKtcPlayers,
  leagueType,
  scoringSettings,
  myRosterId,
  mergedIDPMap,
  playerValueMap,
  rankMap,
  positionalAvgPPG,
  positionalValuePerPPG,
  playerTradeValueDetailsMap,
  getUserDisplayName,
  rosters,
  ownerNameByRosterId,
  onSelectPlayer,
  onToggleOutgoingPlayer,
  onAllowOutgoingPicksChange,
  onAllowIncomingPicksChange,
  onAllowPackagesChange,
  onTradePostureChange,
  onRunSearch,
  onApplyProposal,
  onOpenPlayer,
}) {
  const resultsRef = useRef(null);
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [offerPickerOpen, setOfferPickerOpen] = useState(false);
  const [upgradeResultSort, setUpgradeResultSort] = useState('manager');

  const playersById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );

  const buildSelectableCard = useCallback((playerId) => {
    if (!playerId) return null;
    const player = playersById.get(playerId);
    if (!player) return null;
    const sleeperPlayer = sleeperPlayers?.[player.id] ?? {};
    const team = sleeperPlayer.team ?? player.team ?? '';
    const position = sleeperPlayer.position ?? player.position ?? '';
    return {
      id: player.id,
      name: sleeperPlayer.full_name ?? player.name,
      displayName: sleeperPlayer.full_name ?? player.name,
      team,
      teamId: team,
      position,
      espnId: sleeperPlayer.espn_id ?? null,
      jersey: sleeperPlayer.number ?? '',
      experience: sleeperPlayer.years_exp != null ? sleeperPlayer.years_exp + 1 : undefined,
      ppg: player.ppg ?? null,
      value: playerValueMap?.get(player.id) ?? null,
      rank: rankMap?.get?.(player.id) ?? rankMap?.[player.id] ?? null,
      palette: team ? teamPalette(team, darkMode, TRADE_LOGO_SIDE_THEME_OPTIONS) : null,
    };
  }, [darkMode, playerValueMap, playersById, rankMap, sleeperPlayers]);

  const selectedPlayer = useMemo(
    () => buildSelectableCard(selectedPlayerId),
    [buildSelectableCard, selectedPlayerId],
  );

  const hasSelectedOutgoingPlayers = selectedOutgoingPlayerIds.length > 0;
  const outgoingReady = hasSelectedOutgoingPlayers || allowOutgoingPicks;
  const canSearch = Boolean(selectedPlayerId) && outgoingReady;
  const moverRows = useMemo(() => buildUpgradeMoverSuggestions({
    players,
    selectedTargetId: selectedPlayerId,
    selectedOutgoingIds: selectedOutgoingPlayerIds,
    sleeperPlayers,
    playerValueMap,
    rankMap,
    limit: players.length,
  }), [
    players,
    playerValueMap,
    rankMap,
    selectedOutgoingPlayerIds,
    selectedPlayerId,
    sleeperPlayers,
  ]);

  useEffect(() => {
    if (!searchSubmitted || !resultsRef.current) return;
    resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [searchSubmitted, results]);

  const rosterById = useMemo(() => new Map(
    (rosters ?? []).map((roster) => [normalizeRosterId(roster?.roster_id), roster]),
  ), [rosters]);
  const standingMap = useMemo(() => buildRosterStandingMap(rosters), [rosters]);
  const resultGroups = useMemo(() => {
    const mappedGroups = (results?.groups ?? []).map((group) => {
      const rosterId = group.rosterId ?? group.managerRosterId;
      const normalizedRosterId = normalizeRosterId(rosterId);
      const managerName = ownerNameByRosterId?.get(rosterId) ?? 'Unknown Manager';
      return {
        group,
        rosterId,
        managerName,
        initial: getManagerInitials(managerName),
        metaLine: buildManagerMetaLine({
          roster: rosterById.get(normalizedRosterId),
          standingMap,
          rosterId,
          proposals: group.proposals ?? [],
        }),
      };
    });
    return sortUpgradeResultGroups(mappedGroups, upgradeResultSort);
  }, [ownerNameByRosterId, results?.groups, rosterById, standingMap, upgradeResultSort]);
  const stagedResultGroups = useStagedRender(resultGroups, 4, 3);
  const totalUpgradePaths = useMemo(
    () => (results?.groups ?? []).reduce((sum, group) => sum + (group.proposals?.length ?? 0), 0),
    [results?.groups],
  );
  const targetPickerAllowedIds = useMemo(
    () => (targetPickerOpen ? players.map((player) => player.id) : []),
    [players, targetPickerOpen],
  );
  const offerPickerAllowedIds = useMemo(
    () => (offerPickerOpen ? players.filter((player) => player.id !== selectedPlayerId).map((player) => player.id) : []),
    [offerPickerOpen, players, selectedPlayerId],
  );

  return (
    <section className="flex flex-col gap-6">
      <UpgradeBargainingTable
        selectedPlayer={selectedPlayer}
        moverRows={moverRows}
        selectedOutgoingPlayerIds={selectedOutgoingPlayerIds}
        allowOutgoingPicks={allowOutgoingPicks}
        allowIncomingPicks={allowIncomingPicks}
        allowPackages={allowPackages}
        darkMode={darkMode}
        postureOptions={postureOptions}
        tradePostureLevel={tradePostureLevel}
        canSearch={canSearch}
        searchPending={searchPending}
        onChooseTarget={() => setTargetPickerOpen(true)}
        onChangeTarget={() => setTargetPickerOpen(true)}
        onToggleMover={(id) => onToggleOutgoingPlayer(id)}
        onAddPlayers={() => setOfferPickerOpen(true)}
        onClearPlayers={() => selectedOutgoingPlayerIds.forEach((id) => onToggleOutgoingPlayer(id))}
        onAllowOutgoingPicksChange={onAllowOutgoingPicksChange}
        onAllowIncomingPicksChange={onAllowIncomingPicksChange}
        onAllowPackagesChange={onAllowPackagesChange}
        onPostureChange={onTradePostureChange}
        onRunSearch={onRunSearch}
        onOpenPlayer={onOpenPlayer}
      />

      {searchSubmitted && (
        <section ref={resultsRef}>
          {searchPending && (
            <div
              className="mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
              style={{
                background: 'var(--color-fill)',
                color: 'var(--color-label-secondary)',
                border: '1px solid var(--color-separator)',
              }}
            >
              <Spinner size="w-3.5 h-3.5" />
              Refreshing matches...
            </div>
          )}
          {searchDirty && !searchPending && (
            <div
              className="mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
              style={{
                background: 'var(--color-fill)',
                color: 'var(--color-label-secondary)',
                border: '1px solid var(--color-separator)',
              }}
            >
              Current filters changed. Run search again to refresh these results.
            </div>
          )}
          {!resultGroups.length ? (
            <div className="rounded-2xl px-5 py-8 text-center" style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)', border: '1px solid var(--color-separator)' }}>
              <div className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>No feasible upgrade paths found.</div>
              <div className="text-xs mt-2">
                Try widening your outgoing player pool, opening up pick intent, or moving the posture closer to fair.
              </div>
            </div>
          ) : (
            <div
              className="rounded-2xl p-4 lg:p-5"
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-separator)',
                opacity: searchPending ? 0.72 : 1,
                transition: 'opacity 160ms cubic-bezier(0.32, 0.72, 0, 1)',
              }}
            >
              <div className="mb-5 flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: 'var(--color-separator)' }}>
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-3 text-3xl font-bold uppercase leading-none" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}>
                    Upgrade Paths Found
                    <span
                      className="inline-flex min-w-9 items-center justify-center rounded-md px-2 py-1 text-base font-semibold tabular-nums"
                      style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)', fontFamily: "'Figtree', sans-serif", letterSpacing: 0 }}
                    >
                      {totalUpgradePaths}
                    </span>
                  </h3>
                  <div className="mt-2 text-sm" style={{ color: 'var(--color-label-secondary)' }}>
                    {results?.targetPlayer
                      ? `Showing matches for ${results.targetPlayer.label ?? results.targetPlayer.name}.`
                      : selectedPlayer
                        ? `Showing the latest search around ${selectedPlayer.name}.`
                        : 'Showing the latest upgrade search results.'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {UPGRADE_RESULT_SORT_OPTIONS.map((option) => {
                    const active = upgradeResultSort === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setUpgradeResultSort(option.id)}
                        className="rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors"
                        style={{
                          background: active ? 'var(--color-signature)' : 'var(--color-bg-secondary)',
                          color: active ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
                          border: '1px solid var(--color-separator)',
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-5">
                {stagedResultGroups.visibleItems.map(({ group, rosterId, managerName, initial, metaLine }) => {
                  return (
                    <UpgradeResultGroup
                      key={rosterId}
                      group={group}
                      rosterId={rosterId}
                      managerName={managerName}
                      initial={initial}
                      metaLine={metaLine}
                      darkMode={darkMode}
                      seasonStats={seasonStats}
                      onApplyProposal={onApplyProposal}
                      onOpenPlayer={onOpenPlayer}
                    />
                  );
                })}
              </div>
              <StagedRenderStatus
                visibleCount={stagedResultGroups.visibleCount}
                totalCount={stagedResultGroups.totalCount}
                hasMore={stagedResultGroups.hasMore}
                onShowAll={stagedResultGroups.showAll}
                label="manager groups"
              />
            </div>
          )}
        </section>
      )}

      {targetPickerOpen && (
        <TradeRosterPicker
          rosterId={myRosterId}
          rosters={rosters}
          sleeperPlayers={sleeperPlayers}
          ktcPlayers={ktcPlayers}
          dynastyKtcPlayers={dynastyKtcPlayers}
          leagueType={leagueType}
          excludeIds={[]}
          allowedIds={targetPickerAllowedIds}
          seasonStats={seasonStats}
          scoringSettings={scoringSettings}
          getUserDisplayName={getUserDisplayName}
          myRosterId={myRosterId}
          includeOwnRoster={false}
          currentTotal={0}
          activeRosterId={myRosterId}
          mergedIDPMap={mergedIDPMap}
          sharedRankMap={rankMap}
          sharedPositionalAvgPPG={positionalAvgPPG}
          sharedPositionalValuePerPPG={positionalValuePerPPG}
          sharedPlayerTradeValueDetailsMap={playerTradeValueDetailsMap}
          onSelect={(result) => {
            const nextId = typeof result === 'object' ? result.id : result;
            onSelectPlayer(nextId);
            setTargetPickerOpen(false);
          }}
          onClose={() => setTargetPickerOpen(false)}
        />
      )}

      {offerPickerOpen && (
        <TradeRosterPicker
          rosterId={myRosterId}
          rosters={rosters}
          sleeperPlayers={sleeperPlayers}
          ktcPlayers={ktcPlayers}
          dynastyKtcPlayers={dynastyKtcPlayers}
          leagueType={leagueType}
          excludeIds={selectedOutgoingPlayerIds}
          allowedIds={offerPickerAllowedIds}
          seasonStats={seasonStats}
          scoringSettings={scoringSettings}
          getUserDisplayName={getUserDisplayName}
          myRosterId={myRosterId}
          includeOwnRoster={false}
          currentTotal={0}
          activeRosterId={myRosterId}
          mergedIDPMap={mergedIDPMap}
          sharedRankMap={rankMap}
          sharedPositionalAvgPPG={positionalAvgPPG}
          sharedPositionalValuePerPPG={positionalValuePerPPG}
          sharedPlayerTradeValueDetailsMap={playerTradeValueDetailsMap}
          onSelect={(result) => {
            const nextId = typeof result === 'object' ? result.id : result;
            onToggleOutgoingPlayer(nextId);
          }}
          onClose={() => setOfferPickerOpen(false)}
        />
      )}
    </section>
  );
});

UpgradeFinderPage.displayName = 'UpgradeFinderPage';


export default UpgradeFinderPage;
