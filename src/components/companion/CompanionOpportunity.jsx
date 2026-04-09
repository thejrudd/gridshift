import { useEffect, useMemo, useState } from 'react';
import { useSleeperLeague, useSleeperStats, useSleeperStatsProgress } from '../../context/SleeperContext';
import {
  analyzeAreasOfOpportunity,
  getOpportunityPositionLabel,
} from '../../utils/opportunityEngine';

export default function CompanionOpportunity({ onOpenTrade, onOpenWaiver }) {
  const {
    league,
    leagueUsers,
    rosters,
    scoringSettings,
    statsLoading,
    myRoster,
    getUserDisplayName,
  } = useSleeperLeague();
  const {
    players,
    loadPlayers,
    weeklyStats,
    seasonStats,
    loadSeasonStats,
    scheduleMap,
  } = useSleeperStats();
  const statsProgress = useSleeperStatsProgress();

  const [viewMode, setViewMode] = useState('mine');
  const [selectedOpponentId, setSelectedOpponentId] = useState(null);

  const myRosterData = useMemo(() => myRoster(), [myRoster]);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);

  useEffect(() => {
    if (!seasonStats && !statsLoading) loadSeasonStats();
  }, [seasonStats, statsLoading, loadSeasonStats]);

  const sortedOpponents = useMemo(() => {
    const myRosterId = myRosterData?.roster_id;
    return [...rosters]
      .filter((roster) => roster.roster_id !== myRosterId)
      .sort((a, b) => getUserDisplayName(a.owner_id).localeCompare(getUserDisplayName(b.owner_id)));
  }, [rosters, myRosterData, getUserDisplayName]);

  const resolvedOpponentId = useMemo(() => {
    if (!sortedOpponents.length) return null;
    if (sortedOpponents.some((roster) => roster.roster_id === selectedOpponentId)) return selectedOpponentId;
    return sortedOpponents[0].roster_id;
  }, [sortedOpponents, selectedOpponentId]);

  const activeRosterId = viewMode === 'mine'
    ? (myRosterData?.roster_id ?? null)
    : resolvedOpponentId;

  const activeRoster = useMemo(
    () => rosters.find((roster) => roster.roster_id === activeRosterId) ?? null,
    [rosters, activeRosterId],
  );

  const opportunityData = useMemo(() => analyzeAreasOfOpportunity({
    league,
    rosters,
    players,
    seasonStats,
    weeklyStats,
    scoringSettings,
    scheduleMap,
    myRosterId: myRosterData?.roster_id ?? null,
  }), [league, rosters, players, seasonStats, weeklyStats, scoringSettings, scheduleMap, myRosterData]);

  const activeAnalysis = activeRosterId != null
    ? (opportunityData.analysesByRosterId?.[activeRosterId] ?? null)
    : null;

  const rosterLabel = activeRoster
    ? getUserDisplayName(activeRoster.owner_id)
    : 'Selected roster';

  if (!myRosterData) {
    return <EmptyState message="Could not find your roster in this league." />;
  }

  if (!players) {
    return <LoadingState label="Loading player database…" />;
  }

  return (
    <div className="pb-6">
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

      <div className="px-4 pb-4 flex flex-col gap-3">
        <div className="flex gap-2">
          <ModeButton active={viewMode === 'mine'} onClick={() => setViewMode('mine')}>
            My Roster
          </ModeButton>
          <ModeButton active={viewMode === 'opponent'} onClick={() => setViewMode('opponent')}>
            Opponent
          </ModeButton>
        </div>

        {viewMode === 'opponent' && (
          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex gap-2" style={{ width: 'max-content' }}>
              {sortedOpponents.map((roster) => {
                const name = getUserDisplayName(roster.owner_id);
                const user = leagueUsers.find((entry) => entry.user_id === roster.owner_id);
                const avatarHash = user?.avatar;
                const isSelected = roster.roster_id === activeRosterId;

                return (
                  <button
                    key={roster.roster_id}
                    onClick={() => setSelectedOpponentId(roster.roster_id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors shrink-0"
                    style={{
                      background: isSelected ? 'var(--color-signature)' : 'var(--color-fill)',
                      color: isSelected ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
                      fontWeight: isSelected ? 700 : 500,
                    }}
                  >
                    {avatarHash ? (
                      <img
                        src={`https://sleepercdn.com/avatars/thumbs/${avatarHash}`}
                        alt={name}
                        className="w-5 h-5 rounded-full shrink-0 object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div
                        className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center"
                        style={{ background: 'var(--color-fill-secondary)', fontSize: '9px', fontWeight: 700, color: 'var(--color-label-secondary)' }}
                      >
                        {name[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs whitespace-nowrap">{name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {!seasonStats && !statsLoading && (
        <EmptyState message="Load season stats to generate opportunity analysis." />
      )}

      {seasonStats && !activeAnalysis && (
        <EmptyState message={viewMode === 'opponent' ? 'No opponent roster is available to analyze.' : 'No roster analysis is available yet.'} />
      )}

      {seasonStats && activeAnalysis && (
        <>
          <div className="mx-4 mb-4 rounded-2xl p-4" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-separator)' }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-label-tertiary)' }}>
                  Areas of Opportunity
                </div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--color-label)' }}>
                  {rosterLabel}
                </h2>
                <p className="text-sm mt-1" style={{ color: 'var(--color-label-secondary)' }}>
                  Production-first roster audit using starter floor, season scoring, recent PPG, and secondary schedule pressure.
                </p>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-label-tertiary)' }}>
                  Top Needs
                </div>
                <div className="flex gap-1.5 flex-wrap justify-end">
                  {activeAnalysis.topNeeds.length ? activeAnalysis.topNeeds.map((need) => (
                    <span
                      key={need}
                      className="px-2.5 py-1 rounded-full text-xs font-semibold"
                      style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}
                    >
                      {need}
                    </span>
                  )) : (
                    <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
                      No major weak spots detected
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 flex flex-col gap-4">
            <div className="rounded-2xl p-4" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-separator)' }}>
              <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-label-tertiary)' }}>
                Surplus / Stable Rooms
              </div>
              <div className="flex flex-wrap gap-2">
                {activeAnalysis.strengths.length ? activeAnalysis.strengths.map((strength) => (
                  <span
                    key={strength}
                    className="px-2.5 py-1 rounded-full text-xs font-semibold"
                    style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}
                  >
                    {strength}
                  </span>
                )) : (
                  <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>
                    No obvious surplus positions yet.
                  </span>
                )}
              </div>
            </div>

            {activeAnalysis.cards.length ? activeAnalysis.cards.map((card) => (
              <OpportunityCard
                key={card.key}
                card={card}
                isMyRoster={viewMode === 'mine'}
                activeRosterId={activeRosterId}
                onOpenTrade={onOpenTrade}
                onOpenWaiver={onOpenWaiver}
              />
            )) : (
              <EmptyState message="No clear position-level weaknesses were found for this roster yet." />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function OpportunityCard({ card, isMyRoster, activeRosterId, onOpenTrade, onOpenWaiver }) {
  const urgency = card.severity >= 60 ? 'High' : card.severity >= 35 ? 'Moderate' : 'Watch';
  const urgencyBg = card.severity >= 60
    ? 'rgba(224,39,15,0.12)'
    : card.severity >= 35
      ? 'rgba(224,120,0,0.12)'
      : 'var(--color-fill)';
  const urgencyColor = card.severity >= 60
    ? 'var(--color-accent-red)'
    : card.severity >= 35
      ? 'var(--color-accent-orange)'
      : 'var(--color-label-secondary)';

  const weakestLabel = card.weakestStarter
    ? `${card.weakestStarter.name} · ${card.weakestStarter.ppg > 0 ? `${card.weakestStarter.ppg.toFixed(1)} PPG` : 'limited scoring'}`
    : `No starter-quality ${card.label} on hand`;

  const scheduleLabel = card.schedulePressure
    ? card.schedulePressure.toughCount >= 2
      ? `${card.schedulePressure.toughCount} tough matchups in the next 3 weeks`
      : card.schedulePressure.easyCount >= 2
        ? `${card.schedulePressure.easyCount} softer matchups in the next 3 weeks`
        : 'Neutral short-term schedule'
    : 'Schedule pressure unavailable';

  const offerTargets = card.offerTargets ?? [];
  const handleTrade = () => {
    if (isMyRoster && card.tradeTarget) {
      onOpenTrade?.({
        sleeperId: card.tradeTarget.id,
        side: 'get',
        partnerRosterId: card.tradeTarget.rosterId,
      });
    } else if (!isMyRoster && offerTargets[0]) {
      onOpenTrade?.({
        sleeperId: offerTargets[0].id,
        side: 'give',
        partnerRosterId: activeRosterId,
      });
    }
  };

  return (
    <section className="rounded-2xl p-4" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-separator)' }}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-label-tertiary)' }}>
            {card.label}
          </div>
          <h3 className="text-lg font-semibold" style={{ color: 'var(--color-label)' }}>
            {weakestLabel}
          </h3>
        </div>
        <div
          className="px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ background: urgencyBg, color: urgencyColor }}
        >
          {urgency} priority
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <MetricBox label="Starter Room" value={`${card.starterAvgPPG.toFixed(1)} PPG`} note={`League: ${card.leagueStarterAvgPPG.toFixed(1)} PPG`} />
        <MetricBox label="Starter Load" value={`${card.assignedStarterCount}`} note={`League avg: ${card.expectedStarterCount.toFixed(1)}`} />
        <MetricBox label="Playable Depth" value={`${card.playableBenchCount}`} note={scheduleLabel} />
      </div>

      <div className="flex flex-col gap-1.5 mb-4">
        <InsightRow>
          {card.assignedStarterCount < Math.max(1, Math.round(card.expectedStarterCount))
            ? `This room is light on starter-quality ${card.label} depth relative to the rest of the league.`
            : `${card.label} scoring trails the league starter baseline, even with a full lineup count.`}
        </InsightRow>
        {card.byePressure && (
          <InsightRow>
            Bye pressure: {card.byePressure.count} of this roster&apos;s key {card.label} options sit in Week {card.byePressure.week}.
          </InsightRow>
        )}
        {card.waiverTarget && (
          <InsightRow>
            Best free-agent patch: {card.waiverTarget.name} ({getOpportunityPositionLabel(card.waiverTarget.position)} · {card.waiverTarget.ppg > 0 ? `${card.waiverTarget.ppg.toFixed(1)} PPG` : 'production-only profile'}).
          </InsightRow>
        )}
        {!isMyRoster && offerTargets.length > 0 && (
          <InsightRow>
            Possible trade chips from your roster: {offerTargets.map((player) => player.name).join(', ')}.
          </InsightRow>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {card.waiverSupported && card.waiverTarget && (
          <ActionButton onClick={() => onOpenWaiver?.(card.position)}>
            Open Waiver at {card.label}
          </ActionButton>
        )}

        {isMyRoster && card.tradeTarget && (
          <ActionButton onClick={handleTrade}>
            Trade for {card.tradeTarget.name}
          </ActionButton>
        )}

        {!isMyRoster && offerTargets[0] && (
          <ActionButton onClick={handleTrade}>
            Offer {offerTargets[0].name}
          </ActionButton>
        )}
      </div>
    </section>
  );
}

function ModeButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors"
      style={{
        background: active ? 'var(--color-signature)' : 'var(--color-fill)',
        color: active ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
      }}
    >
      {children}
    </button>
  );
}

function MetricBox({ label, value, note }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--color-fill)' }}>
      <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-label-tertiary)' }}>
        {label}
      </div>
      <div className="text-base font-semibold" style={{ color: 'var(--color-label)' }}>
        {value}
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--color-label-secondary)' }}>
        {note}
      </div>
    </div>
  );
}

function InsightRow({ children }) {
  return (
    <div className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>
      {children}
    </div>
  );
}

function ActionButton({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-2 rounded-xl text-sm font-semibold transition-colors"
      style={{ background: 'var(--color-fill)', color: 'var(--color-accent)' }}
    >
      {children}
    </button>
  );
}

function LoadingState({ label }) {
  return (
    <div className="flex items-center justify-center py-20">
      <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>{label}</span>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex items-center justify-center py-16 px-4">
      <span className="text-sm text-center" style={{ color: 'var(--color-label-secondary)' }}>{message}</span>
    </div>
  );
}
