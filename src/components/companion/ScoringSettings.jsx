import { useState } from 'react';
import { useSleeperLeague } from '../../context/SleeperContext';
import {
  DEFAULT_SCORING, SCORING_PRESETS, applyPreset, detectPreset, importLeagueScoring,
} from '../../utils/scoringEngine';

const STAT_GROUPS = [
  {
    label: 'Passing',
    stats: [
      { key: 'pass_yd',  label: 'Passing Yards', note: 'pts/yd' },
      { key: 'pass_td',  label: 'Passing TD' },
      { key: 'pass_int', label: 'Interception' },
      { key: 'pass_2pt', label: '2-Pt Conversion (Pass)' },
    ],
  },
  {
    label: 'Rushing',
    stats: [
      { key: 'rush_yd',  label: 'Rushing Yards', note: 'pts/yd' },
      { key: 'rush_td',  label: 'Rushing TD' },
      { key: 'rush_2pt', label: '2-Pt Conversion (Rush)' },
    ],
  },
  {
    label: 'Receiving',
    stats: [
      { key: 'rec',      label: 'Reception' },
      { key: 'rec_yd',   label: 'Receiving Yards', note: 'pts/yd' },
      { key: 'rec_td',   label: 'Receiving TD' },
      { key: 'rec_2pt',  label: '2-Pt Conversion (Rec)' },
    ],
  },
  {
    label: 'Misc',
    stats: [
      { key: 'fum_lost', label: 'Fumble Lost' },
      { key: 'st_td',    label: 'Special Teams TD' },
      { key: 'ret_td',   label: 'Return TD' },
      { key: 'blk_kick', label: 'Blocked Kick' },
    ],
  },
  {
    label: 'Bonuses',
    stats: [
      { key: 'bonus_pass_yd_300', label: '300+ Pass Yds Bonus' },
      { key: 'bonus_pass_yd_400', label: '400+ Pass Yds Bonus' },
      { key: 'bonus_rush_yd_100', label: '100+ Rush Yds Bonus' },
      { key: 'bonus_rush_yd_200', label: '200+ Rush Yds Bonus' },
      { key: 'bonus_rec_yd_100',  label: '100+ Rec Yds Bonus' },
      { key: 'bonus_rec_yd_200',  label: '200+ Rec Yds Bonus' },
    ],
  },
  {
    label: 'IDP — Tackles',
    stats: [
      { key: 'idp_tkl',      label: 'Tackle (combined)' },
      { key: 'idp_tkl_solo', label: 'Solo Tackle' },
      { key: 'idp_tkl_ast',  label: 'Assisted Tackle' },
      { key: 'idp_tkl_loss', label: 'Tackle for Loss' },
      { key: 'idp_qbhit',    label: 'QB Hit' },
    ],
  },
  {
    label: 'IDP — Turnovers & Sacks',
    stats: [
      { key: 'idp_sack',       label: 'Sack' },
      { key: 'idp_sack_yd',    label: 'Sack Yards', note: 'pts/yd' },
      { key: 'idp_int',        label: 'Interception' },
      { key: 'idp_int_ret_yd', label: 'INT Return Yards', note: 'pts/yd' },
      { key: 'idp_int_td',     label: 'INT Return TD' },
      { key: 'idp_ff',         label: 'Forced Fumble' },
      { key: 'idp_fr',         label: 'Fumble Recovery' },
      { key: 'idp_fr_yd',      label: 'Fumble Return Yards', note: 'pts/yd' },
      { key: 'idp_fr_td',      label: 'Fumble Return TD' },
      { key: 'idp_pd',         label: 'Pass Deflection' },
      { key: 'idp_safety',     label: 'Safety' },
      { key: 'idp_blk_kick',   label: 'Blocked Kick' },
    ],
  },
];

export default function ScoringSettings({ onClose }) {
  const { scoringSettings, setScoringSettings, league } = useSleeperLeague();
  const [local, setLocal] = useState({ ...DEFAULT_SCORING, ...scoringSettings });

  const preset = detectPreset(local);

  const handlePreset = (p) => {
    setLocal(prev => applyPreset(p, prev));
  };

  const handleChange = (key, value) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    setLocal(prev => ({ ...prev, [key]: num }));
  };

  const handleImportLeague = () => {
    if (!league?.scoring_settings) return;
    const imported = importLeagueScoring(league.scoring_settings);
    setLocal({ ...DEFAULT_SCORING, ...imported });
  };

  const handleSave = () => {
    setScoringSettings(local);
    onClose();
  };

  const handleReset = () => {
    setLocal({ ...DEFAULT_SCORING });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl overflow-hidden"
        style={{
          background: 'var(--color-bg-secondary)',
          maxWidth: '640px',
          marginLeft: 'auto',
          marginRight: 'auto',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Scoring Settings"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: 'var(--color-fill)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--color-separator)' }}>
          <h2 className="font-display font-bold flex-1" style={{ fontSize: '16px', letterSpacing: '0.06em', color: 'var(--color-label)' }}>
            SCORING SETTINGS
          </h2>
          <button onClick={onClose} style={{ color: 'var(--color-label-secondary)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {/* Presets */}
          <div className="mb-5">
            <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-label-tertiary)' }}>
              Preset
            </div>
            <div className="flex gap-2">
              {Object.entries(SCORING_PRESETS).map(([key, { label }]) => (
                <button
                  key={key}
                  onClick={() => handlePreset(key)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
                  style={{
                    background: preset === key ? 'var(--color-signature)' : 'var(--color-fill)',
                    color: preset === key ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
                  }}
                >
                  {label}
                </button>
              ))}
              {preset === 'custom' && (
                <span
                  className="px-4 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}
                >
                  Custom
                </span>
              )}
            </div>
          </div>

          {/* Import from league */}
          {league?.scoring_settings && (
            <div className="mb-5">
              <button
                onClick={handleImportLeague}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-opacity active:opacity-70"
                style={{ background: 'var(--color-fill)', color: 'var(--color-accent)' }}
              >
                Import from {league.name}
              </button>
            </div>
          )}

          {/* Per-stat settings */}
          {STAT_GROUPS.map(group => (
            <div key={group.label} className="mb-5">
              <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-label-tertiary)' }}>
                {group.label}
              </div>
              <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-fill-secondary)' }}>
                {group.stats.map((stat, i) => (
                  <div
                    key={stat.key}
                    className="flex items-center px-4 py-3 gap-4"
                    style={{ borderTop: i > 0 ? '1px solid var(--color-separator)' : 'none' }}
                  >
                    <span className="flex-1 text-sm" style={{ color: 'var(--color-label)' }}>
                      {stat.label}
                      {stat.note && (
                        <span className="ml-1 text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
                          ({stat.note})
                        </span>
                      )}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={local[stat.key] ?? 0}
                      onChange={e => handleChange(stat.key, e.target.value)}
                      className="w-20 text-right px-2 py-1 rounded-lg font-mono text-sm focus:outline-none"
                      style={{
                        fontSize: '14px',
                        background: 'var(--color-fill)',
                        color: 'var(--color-label)',
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex gap-2 shrink-0" style={{ borderTop: '1px solid var(--color-separator)' }}>
          <button
            onClick={handleReset}
            className="px-4 py-3 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 rounded-xl text-sm font-semibold transition-opacity active:opacity-70"
            style={{ background: 'var(--color-accent)', color: '#fff' }}
          >
            Save Scoring Settings
          </button>
        </div>
      </div>
    </>
  );
}
