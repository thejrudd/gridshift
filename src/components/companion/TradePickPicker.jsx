// ── TradePickPicker ───────────────────────────────────────────────────────────
// Modal showing draft picks owned by a specific roster for the Trade Agent.

import { useMemo } from 'react';
import { getPicksForRoster, valueDraftPick } from '../../utils/tradeEngine';
import { fmtKtcValue } from '../../utils/ktcApi';
import { compareDraftPickAssets } from '../../utils/draftPickDisplay';
import Modal from '../Modal';

export default function TradePickPicker({
  rosterId, rosterPicks, slots, rosters, ktcPlayers, leagueType, pickValueMap, currentSeason,
  league = null, drafts = [], excludeKeys, getUserDisplayName, currentTotal, onSelect, onClose,
}) {
  const excludeSet = useMemo(() => new Set(excludeKeys ?? []), [excludeKeys]);

  const picks = useMemo(() => {
    const owned = getPicksForRoster(rosterId, rosterPicks, slots);
    return owned
      .filter(p => !excludeSet.has(p.key))
      .map(p => {
        const { val, displayInfo, quality, valueQuality } = valueDraftPick(p, {
          rosters,
          ktcPlayers,
          leagueType,
          pickValueMap,
          currentSeason,
          league,
          drafts,
        });
        const originLabel = p.isOwn ? '(Own)' : `(from ${getUserDisplayName(
          rosters.find(r => r.roster_id === p.fromRosterId)?.owner_id ?? ''
        )})`;
        return {
          ...p,
          quality,
          valueQuality,
          originLabel,
          val,
          label: displayInfo.label,
          displayMode: displayInfo.displayMode,
          lockedSlot: displayInfo.lockedSlot ?? null,
          pickNumberLabel: displayInfo.pickNumberLabel ?? null,
          pickRangeLabel: displayInfo.pickRangeLabel ?? null,
          cardHeadline: displayInfo.cardHeadline ?? null,
          cardMetaLabel: displayInfo.cardMetaLabel ?? null,
          sortSlot: displayInfo.sortSlot ?? null,
        };
      })
      .sort(compareDraftPickAssets);
  }, [rosterId, rosterPicks, slots, excludeSet, rosters, ktcPlayers, leagueType, pickValueMap, currentSeason, league, drafts, getUserDisplayName]);

  // Group by year
  const grouped = useMemo(() => {
    const groups = {};
    for (const p of picks) {
      if (!groups[p.year]) groups[p.year] = [];
      groups[p.year].push(p);
    }
    // Sort within each year by round
    for (const year of Object.keys(groups)) {
      groups[year].sort((a, b) => a.round - b.round);
    }
    return groups;
  }, [picks]);

  const years = Object.keys(grouped).sort();

  return (
    <Modal
      onClose={onClose}
      containerClassName="flex flex-col"
      containerStyle={{ background: 'var(--color-bg)', maxWidth: 420, maxHeight: 480 }}
      mobileSheet
      ariaLabel="Add draft pick"
    >

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--color-separator)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
            Add Draft Pick
          </span>
          <button onClick={onClose} className="text-xs font-semibold"
            style={{ color: 'var(--color-accent)' }}>
            Cancel
          </button>
        </div>

        {/* Pick list */}
        <div className="flex-1 overflow-y-auto">
          {years.map(year => (
            <div key={year}>
              <div className="sticky top-0 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest"
                style={{ background: 'var(--color-bg)', color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
                {year}
              </div>
              {grouped[year].map(pick => (
                <button key={pick.key} onClick={() => onSelect(pick)}
                  className="flex items-center w-full px-4 py-3 gap-3 transition-colors"
                  style={{ borderBottom: '1px solid var(--color-separator)' }}>
                  <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center"
                    style={{ background: 'var(--color-fill)', fontSize: '9px', fontWeight: 700, color: 'var(--color-label-tertiary)' }}>
                    R{pick.round}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium" style={{ color: 'var(--color-label)' }}>
                      {pick.label}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
                      {pick.originLabel}
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 gap-0.5">
                    <span className="text-sm font-bold tabular-nums"
                      style={{ color: pick.val != null ? 'var(--color-label)' : 'var(--color-label-quaternary)' }}>
                      {fmtKtcValue(pick.val)}
                    </span>
                    {pick.val != null && currentTotal != null && (
                      <span className="text-xs tabular-nums" style={{ color: 'var(--color-accent)' }}>
                        → {fmtKtcValue(currentTotal + pick.val)}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ))}
          {picks.length === 0 && (
            <div className="py-12 text-sm text-center" style={{ color: 'var(--color-label-tertiary)' }}>
              No draft picks available
            </div>
          )}
        </div>
    </Modal>
  );
}
