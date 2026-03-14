import { useSleeper } from '../../context/SleeperContext';
import {
  DEFAULT_SCORING, importLeagueScoring,
} from '../../utils/scoringEngine';

const STAT_GROUPS = [
  {
    label: 'Passing',
    stats: [
      { key: 'pass_yd',   label: 'Passing Yards', note: 'pts / yd' },
      { key: 'pass_td',   label: 'Passing TD' },
      { key: 'pass_int',  label: 'Interception (thrown)' },
      { key: 'pass_2pt',  label: '2-Pt Conversion Pass' },
      { key: 'pass_sack', label: 'Sack Taken' },
      { key: 'pass_cmp',  label: 'Completion' },
      { key: 'pass_att',  label: 'Pass Attempt' },
      { key: 'pass_inc',  label: 'Incomplete Pass' },
      { key: 'pass_fd',   label: 'First Down (pass)' },
    ],
  },
  {
    label: 'Rushing',
    stats: [
      { key: 'rush_yd',  label: 'Rushing Yards', note: 'pts / yd' },
      { key: 'rush_td',  label: 'Rushing TD' },
      { key: 'rush_2pt', label: '2-Pt Conversion Rush' },
      { key: 'rush_fd',  label: 'First Down (rush)' },
    ],
  },
  {
    label: 'Receiving',
    stats: [
      { key: 'rec',      label: 'Reception' },
      { key: 'rec_yd',   label: 'Receiving Yards', note: 'pts / yd' },
      { key: 'rec_td',   label: 'Receiving TD' },
      { key: 'rec_2pt',  label: '2-Pt Conversion Rec' },
      { key: 'rec_fd',   label: 'First Down (rec)' },
    ],
  },
  {
    label: 'Misc / Special Teams',
    stats: [
      { key: 'fum',         label: 'Fumble' },
      { key: 'fum_lost',    label: 'Fumble Lost' },
      { key: 'fum_rec',     label: 'Fumble Recovery (off)' },
      { key: 'fum_ret_td',  label: 'Fumble Recovery TD' },
      { key: 'st_td',       label: 'Special Teams TD' },
      { key: 'ret_td',      label: 'Return TD (kick / punt)' },
      { key: 'blk_kick',    label: 'Blocked Kick' },
    ],
  },
  {
    label: 'Yardage Bonuses',
    stats: [
      { key: 'bonus_pass_yd_300', label: '300+ Pass Yds (game)' },
      { key: 'bonus_pass_yd_400', label: '400+ Pass Yds (game)' },
      { key: 'bonus_rush_yd_100', label: '100+ Rush Yds (game)' },
      { key: 'bonus_rush_yd_200', label: '200+ Rush Yds (game)' },
      { key: 'bonus_rec_yd_100',  label: '100+ Rec Yds (game)' },
      { key: 'bonus_rec_yd_200',  label: '200+ Rec Yds (game)' },
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
    label: 'IDP — Turnovers, Sacks & Other',
    stats: [
      { key: 'idp_sack',       label: 'Sack' },
      { key: 'idp_sack_yd',    label: 'Sack Yards', note: 'pts / yd' },
      { key: 'idp_int',        label: 'Interception (def)' },
      { key: 'idp_int_ret_yd', label: 'INT Return Yards', note: 'pts / yd' },
      { key: 'idp_int_td',  label: 'INT Return TD' },
      { key: 'idp_ff',      label: 'Forced Fumble' },
      { key: 'idp_fr',      label: 'Fumble Recovery' },
      { key: 'idp_fr_yd',   label: 'Fumble Return Yards', note: 'pts / yd' },
      { key: 'idp_fr_td',   label: 'Fumble Return TD' },
      { key: 'idp_def_td',  label: 'Defensive TD (any)' },
      { key: 'idp_pd',         label: 'Pass Deflection' },
      { key: 'idp_safety',   label: 'Safety' },
      { key: 'idp_blk_kick', label: 'Blocked Kick (def)' },
    ],
  },
  {
    label: 'Kicker — Field Goals Made',
    stats: [
      { key: 'fgm',      label: 'FG Made (flat)' },
      { key: 'fgm_0_19',  label: 'FG Made 0–19 yds' },
      { key: 'fgm_20_29', label: 'FG Made 20–29 yds' },
      { key: 'fgm_30_39', label: 'FG Made 30–39 yds' },
      { key: 'fgm_40_49', label: 'FG Made 40–49 yds' },
      { key: 'fgm_50_59', label: 'FG Made 50–59 yds' },
      { key: 'fgm_60p',   label: 'FG Made 60+ yds' },
      { key: 'xpm',       label: 'Extra Point Made' },
    ],
  },
  {
    label: 'Kicker — Misses',
    stats: [
      { key: 'fgmiss',      label: 'FG Miss (flat)' },
      { key: 'fgmiss_0_19',  label: 'FG Miss 0–19 yds' },
      { key: 'fgmiss_20_29', label: 'FG Miss 20–29 yds' },
      { key: 'fgmiss_30_39', label: 'FG Miss 30–39 yds' },
      { key: 'fgmiss_40_49', label: 'FG Miss 40–49 yds' },
      { key: 'fgmiss_50_59', label: 'FG Miss 50–59 yds' },
      { key: 'fgmiss_60p',   label: 'FG Miss 60+ yds' },
      { key: 'xpmiss',       label: 'Extra Point Miss' },
    ],
  },
];

export default function CompanionScoring() {
  const { scoringSettings, setScoringSettings, league } = useSleeper();
  const settings = { ...DEFAULT_SCORING, ...scoringSettings };

  const handleImportLeague = () => {
    if (!league?.scoring_settings) return;
    const imported = importLeagueScoring(league.scoring_settings);
    setScoringSettings({ ...DEFAULT_SCORING, ...imported });
  };

  return (
    <div className="pb-6">
      {/* Import from league */}
      {league?.scoring_settings ? (
        <div className="px-4 pt-2 pb-4">
          <button
            onClick={handleImportLeague}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-opacity active:opacity-70"
            style={{ background: 'var(--color-fill)', color: 'var(--color-accent)' }}
          >
            Sync from {league.name}
          </button>
        </div>
      ) : (
        <div className="px-4 pt-2 pb-4">
          <p className="text-sm text-center" style={{ color: 'var(--color-label-tertiary)' }}>
            Connect a league to view its scoring settings.
          </p>
        </div>
      )}

      {/* Stat groups — read-only */}
      {STAT_GROUPS.map(group => (
        <div key={group.label} className="px-4 mb-5">
          <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-label-tertiary)' }}>
            {group.label}
          </div>
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-fill-secondary)' }}>
            {group.stats.map((stat, i) => {
              const val = settings[stat.key] ?? 0;
              return (
                <div
                  key={stat.key}
                  className="flex items-center px-4 py-3 gap-4"
                  style={{ borderTop: i > 0 ? '1px solid var(--color-separator)' : 'none' }}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm" style={{ color: val !== 0 ? 'var(--color-label)' : 'var(--color-label-tertiary)' }}>
                      {stat.label}
                    </span>
                    {stat.note && (
                      <span className="ml-1.5 text-xs" style={{ color: 'var(--color-label-quaternary)' }}>
                        {stat.note}
                      </span>
                    )}
                  </div>
                  <span
                    className="font-mono text-sm tabular-nums"
                    style={{
                      color: val < 0
                        ? 'var(--color-accent-red)'
                        : val > 0
                        ? 'var(--color-label)'
                        : 'var(--color-label-quaternary)',
                    }}
                  >
                    {val !== 0 ? val : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
