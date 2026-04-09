import { useSleeperLeague } from '../../context/SleeperContext';
import { detectPreset, SCORING_PRESETS } from '../../utils/scoringEngine';
import { formatScoringSettingValue } from '../../utils/scoringDisplay';

export default function LeagueScoringBadge() {
  const { league, scoringSettings } = useSleeperLeague();
  if (!league) return null;

  const preset = detectPreset(scoringSettings);
  const presetLabel = SCORING_PRESETS[preset]?.label ?? 'Custom';

  const passTd = scoringSettings.pass_td ?? 4;
  const rushTd = scoringSettings.rush_td ?? 6;
  const passYd = formatScoringSettingValue('pass_yd', scoringSettings.pass_yd ?? 0, { compact: true, zero: 'Off' });

  const hasIDP = Object.entries(scoringSettings).some(
    ([k, v]) => k.startsWith('idp_') && v > 0
  );

  return (
    <div
      className="mx-4 mb-4 px-4 py-3 rounded-xl"
      style={{ background: 'var(--color-fill)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="font-display font-bold text-xs uppercase tracking-widest"
          style={{ color: 'var(--color-label-tertiary)' }}
        >
          {league.name}
        </span>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(245,183,0,0.15)', color: 'var(--color-signature)' }}
        >
          {presetLabel}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <ScoringPill label="REC" value={`${scoringSettings.rec ?? 1} pt`} />
        <ScoringPill label="PASS TD" value={`${passTd} pts`} />
        <ScoringPill label="RUSH/REC TD" value={`${rushTd} pts`} />
        <ScoringPill label="PASS YD" value={passYd} />
        {scoringSettings.pass_int !== 0 && (
          <ScoringPill label="INT" value={`${scoringSettings.pass_int} pts`} negative />
        )}
        {scoringSettings.fum_lost !== 0 && (
          <ScoringPill label="FUM LOST" value={`${scoringSettings.fum_lost} pts`} negative />
        )}
        {hasIDP && <ScoringPill label="IDP" value="enabled" />}
      </div>
    </div>
  );
}

function ScoringPill({ label, value, negative }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-xs font-semibold" style={{ color: 'var(--color-label-tertiary)' }}>
        {label}
      </span>
      <span
        className="text-xs font-bold"
        style={{ color: negative ? 'var(--color-accent-red)' : 'var(--color-label)' }}
      >
        {value}
      </span>
    </div>
  );
}
