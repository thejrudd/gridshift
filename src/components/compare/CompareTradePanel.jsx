// ── CompareTradePanel ─────────────────────────────────────────────────────────
// v5.0 stub — Trade Agent coming soon.

export default function CompareTradePanel() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 gap-3">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2"
        style={{ background: 'var(--color-fill)' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-label-tertiary)' }}>
          <path d="M7 16V4m0 0L3 8m4-4l4 4" />
          <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      </div>
      <span className="text-sm font-semibold text-center" style={{ color: 'var(--color-label)' }}>
        Trade Agent — Coming in v5.0
      </span>
      <span className="text-xs text-center leading-relaxed" style={{ color: 'var(--color-label-tertiary)' }}>
        Assess trade value for any player, generate proposals in either direction,
        and get roster-aware recommendations using live KeepTradeCut data.
      </span>
    </div>
  );
}
