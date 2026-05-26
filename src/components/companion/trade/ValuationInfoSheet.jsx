import Modal from '../../Modal';
import { formatScoringSettingValue } from '../../../utils/scoringDisplay';
import { detectLeagueDefensiveType } from '../../../utils/idpEngine';

export default function ValuationInfoSheet({ format, leagueType, scoringSettings, rosterPositions, multipliers, isAdjusted, onClose }) {
  const rec           = scoringSettings?.rec ?? 0.5;
  const passTd        = scoringSettings?.pass_td ?? 4;
  const teBonus       = scoringSettings?.bonus_rec_te ?? 0;
  const rbBonus       = scoringSettings?.bonus_rec_rb ?? 0;
  const wrBonus       = scoringSettings?.bonus_rec_wr ?? 0;
  const rushAtt       = scoringSettings?.rush_att ?? 0;
  const rushAttBonus  = scoringSettings?.bonus_rush_att ?? 0;
  const passInt       = scoringSettings?.pass_int ?? -2;
  const passIntTd     = scoringSettings?.pass_int_td ?? 0;
  const fumLost       = scoringSettings?.fum_lost ?? -2;
  const bonusPassYd300 = scoringSettings?.bonus_pass_yd_300 ?? 0;
  const bonusPassYd400 = scoringSettings?.bonus_pass_yd_400 ?? 0;
  const bonusRushYd100 = scoringSettings?.bonus_rush_yd_100 ?? 0;
  const bonusRushYd200 = scoringSettings?.bonus_rush_yd_200 ?? 0;
  const bonusRecYd100  = scoringSettings?.bonus_rec_yd_100 ?? 0;
  const bonusRecYd200  = scoringSettings?.bonus_rec_yd_200 ?? 0;
  const rushFd        = scoringSettings?.rush_fd ?? 0;
  const recFd         = scoringSettings?.rec_fd ?? 0;
  const bonusPassTd40p  = scoringSettings?.bonus_pass_td_40p  ?? 0;
  const bonusPassTd50p  = scoringSettings?.bonus_pass_td_50p  ?? 0;
  const bonusPassCmp40p = scoringSettings?.bonus_pass_cmp_40p ?? 0;
  const bonusRushTd40p  = scoringSettings?.bonus_rush_td_40p  ?? 0;
  const bonusRushTd50p  = scoringSettings?.bonus_rush_td_50p  ?? 0;
  const bonusRecTd40p   = scoringSettings?.bonus_rec_td_40p   ?? 0;
  const bonusRecTd50p   = scoringSettings?.bonus_rec_td_50p   ?? 0;
  const bonusRec40p     = scoringSettings?.bonus_rec_40p      ?? 0;
  const bonusRush40p    = scoringSettings?.bonus_rush_40p     ?? 0;
  const { hasIDP, hasDST } = detectLeagueDefensiveType(rosterPositions);

  // Count TE/RB/WR starters for the scarcity note
  const posCounts = {};
  for (const p of rosterPositions ?? []) posCounts[p] = (posCounts[p] ?? 0) + 1;

  const idpRows = [
    { key: 'idp_tkl', label: 'Tackles', value: scoringSettings?.idp_tkl ?? 0, baseline: '0 pts' },
    { key: 'idp_tkl_solo', label: 'Solo tackles', value: scoringSettings?.idp_tkl_solo ?? 0, baseline: '0 pts' },
    { key: 'idp_tkl_ast', label: 'Assisted tackles', value: scoringSettings?.idp_tkl_ast ?? 0, baseline: '0 pts' },
    { key: 'idp_tkl_loss', label: 'Tackles for loss', value: scoringSettings?.idp_tkl_loss ?? 0, baseline: '0 pts' },
    { key: 'idp_sack', label: 'Sacks', value: scoringSettings?.idp_sack ?? 0, baseline: '0 pts' },
    { key: 'idp_sack_yd', label: 'Sack yards', value: scoringSettings?.idp_sack_yd ?? 0, baseline: '0 pts' },
    { key: 'idp_int', label: 'Interceptions', value: scoringSettings?.idp_int ?? 0, baseline: '0 pts' },
    { key: 'idp_int_ret_yd', label: 'INT return yards', value: scoringSettings?.idp_int_ret_yd ?? 0, baseline: '0 pts' },
    { key: 'idp_int_td', label: 'INT TDs', value: scoringSettings?.idp_int_td ?? 0, baseline: '0 pts' },
    { key: 'idp_ff', label: 'Forced fumbles', value: scoringSettings?.idp_ff ?? 0, baseline: '0 pts' },
    { key: 'idp_fr', label: 'Fumble recoveries', value: scoringSettings?.idp_fr ?? 0, baseline: '0 pts' },
    { key: 'idp_fr_yd', label: 'Fumble return yards', value: scoringSettings?.idp_fr_yd ?? 0, baseline: '0 pts' },
    { key: 'idp_fr_td', label: 'Fumble return TDs', value: scoringSettings?.idp_fr_td ?? 0, baseline: '0 pts' },
    { key: 'idp_def_td', label: 'Defensive TDs', value: scoringSettings?.idp_def_td ?? 0, baseline: '0 pts' },
    { key: 'idp_pd', label: 'Passes defended', value: scoringSettings?.idp_pd ?? 0, baseline: '0 pts' },
    { key: 'idp_qbhit', label: 'QB hits', value: scoringSettings?.idp_qbhit ?? 0, baseline: '0 pts' },
    { key: 'idp_safety', label: 'Safeties', value: scoringSettings?.idp_safety ?? 0, baseline: '0 pts' },
    { key: 'idp_blk_kick', label: 'Blocked kicks', value: scoringSettings?.idp_blk_kick ?? 0, baseline: '0 pts' },
    { key: 'bonus_sack_2p', label: '2+ sack bonus', value: scoringSettings?.bonus_sack_2p ?? 0, baseline: 'None' },
    { key: 'bonus_tkl_10p', label: '10+ tackle bonus', value: scoringSettings?.bonus_tkl_10p ?? 0, baseline: 'None' },
    { key: 'idp_pass_def_3p', label: '3+ pass defense bonus', value: scoringSettings?.idp_pass_def_3p ?? 0, baseline: 'None' },
  ].filter((row) => row.value !== 0);

  const dstRows = [
    { key: 'def_td', label: 'Team D/ST TDs', value: scoringSettings?.def_td ?? 0, baseline: '0 pts' },
    { key: 'sack', label: 'Team sacks', value: scoringSettings?.sack ?? 0, baseline: '0 pts' },
    { key: 'int', label: 'Team INTs', value: scoringSettings?.int ?? 0, baseline: '0 pts' },
    { key: 'safe', label: 'Team safeties', value: scoringSettings?.safe ?? 0, baseline: '0 pts' },
    { key: 'def_3_and_out', label: '3-and-outs', value: scoringSettings?.def_3_and_out ?? 0, baseline: '0 pts' },
    { key: 'def_4_and_stop', label: '4th-down stops', value: scoringSettings?.def_4_and_stop ?? 0, baseline: '0 pts' },
    { key: 'def_forced_punts', label: 'Forced punts', value: scoringSettings?.def_forced_punts ?? 0, baseline: '0 pts' },
    { key: 'def_pass_def', label: 'Team pass defenses', value: scoringSettings?.def_pass_def ?? 0, baseline: '0 pts' },
    { key: 'pts_allow', label: 'Points allowed', value: scoringSettings?.pts_allow ?? 0, baseline: '0 pts' },
    { key: 'pts_allow_0', label: 'Points allowed: 0', value: scoringSettings?.pts_allow_0 ?? 0, baseline: '0 pts' },
    { key: 'pts_allow_1_6', label: 'Points allowed: 1-6', value: scoringSettings?.pts_allow_1_6 ?? 0, baseline: '0 pts' },
    { key: 'pts_allow_7_13', label: 'Points allowed: 7-13', value: scoringSettings?.pts_allow_7_13 ?? 0, baseline: '0 pts' },
    { key: 'pts_allow_14_20', label: 'Points allowed: 14-20', value: scoringSettings?.pts_allow_14_20 ?? 0, baseline: '0 pts' },
    { key: 'pts_allow_21_27', label: 'Points allowed: 21-27', value: scoringSettings?.pts_allow_21_27 ?? 0, baseline: '0 pts' },
    { key: 'pts_allow_28_34', label: 'Points allowed: 28-34', value: scoringSettings?.pts_allow_28_34 ?? 0, baseline: '0 pts' },
    { key: 'pts_allow_35p', label: 'Points allowed: 35+', value: scoringSettings?.pts_allow_35p ?? 0, baseline: '0 pts' },
  ].filter((row) => row.value !== 0);

  const showIDPDetails = hasIDP && idpRows.length > 0;
  const showDSTDetails = hasDST && dstRows.length > 0;
  const showDefenseSection = showIDPDetails || showDSTDetails || hasIDP || hasDST;

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
    <Modal
      onClose={onClose}
      containerClassName="flex flex-col"
      containerStyle={{ background: 'var(--color-bg)', maxHeight: '80vh', maxWidth: 560 }}
      mobileSheet
      ariaLabel="How values are calculated"
    >

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
                ['Position reception bonuses', 'None'],
                ['Rushing-attempt scoring', 'None'],
                ['Big-play TD/completion bonuses', 'None'],
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
              {rbBonus > 0 && (
                <AdjustmentRow
                  label="RB reception bonus"
                  leagueValue={`+${rbBonus} pts/catch`}
                  baseline="None"
                  note={`RB values ${pct(multipliers.RB) ?? 'unchanged'} vs baseline (includes all RB adjustments)`}
                />
              )}
              {wrBonus > 0 && (
                <AdjustmentRow
                  label="WR reception bonus"
                  leagueValue={`+${wrBonus} pts/catch`}
                  baseline="None"
                  note={`WR values ${pct(multipliers.WR) ?? 'unchanged'} vs baseline (includes all WR adjustments)`}
                />
              )}
              {rushAtt > 0 && (
                <AdjustmentRow
                  label="Rushing-attempt scoring"
                  leagueValue={`+${rushAtt} pts/attempt`}
                  baseline="None"
                  note={`RB values ${pct(multipliers.RB) ?? 'unchanged'}, QB values ${pct(multipliers.QB) ?? 'unchanged'} vs baseline`}
                />
              )}
              {rushAttBonus > 0 && (
                <AdjustmentRow
                  label="RB carry bonus"
                  leagueValue={`+${rushAttBonus} pts/carry`}
                  baseline="None"
                  note={`RB values ${pct(multipliers.RB) ?? 'unchanged'} vs baseline (includes all RB adjustments)`}
                />
              )}
              {passInt < -2 && (
                <AdjustmentRow
                  label="Interception penalty"
                  leagueValue={`${passInt} pts/INT`}
                  baseline="-2 pts/INT"
                  note={`QB values reduced vs baseline`}
                />
              )}
              {passIntTd < 0 && (
                <AdjustmentRow
                  label="Pick 6 thrown"
                  leagueValue={`${passIntTd} pts`}
                  baseline="None"
                  note={`QB values reduced for turnover risk`}
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
              {(bonusPassTd40p > 0 || bonusPassTd50p > 0 || bonusPassCmp40p > 0) && (
                <AdjustmentRow
                  label="Big passing play bonus"
                  leagueValue={[
                    bonusPassTd40p  > 0 && `+${bonusPassTd40p} per 40+ yd TD`,
                    bonusPassTd50p  > 0 && `+${bonusPassTd50p} per 50+ yd TD`,
                    bonusPassCmp40p > 0 && `+${bonusPassCmp40p} per 40+ yd cmp`,
                  ].filter(Boolean).join(', ')}
                  baseline="None"
                  note="QB values boosted for explosive play upside"
                />
              )}
              {(bonusRushTd40p > 0 || bonusRushTd50p > 0 || bonusRush40p > 0) && (
                <AdjustmentRow
                  label="Big rushing play bonus"
                  leagueValue={[
                    bonusRushTd40p > 0 && `+${bonusRushTd40p} per 40+ yd TD`,
                    bonusRushTd50p > 0 && `+${bonusRushTd50p} per 50+ yd TD`,
                    bonusRush40p   > 0 && `+${bonusRush40p} per 40+ yd run`,
                  ].filter(Boolean).join(', ')}
                  baseline="None"
                  note="RB values boosted for breakaway speed"
                />
              )}
              {(bonusRecTd40p > 0 || bonusRecTd50p > 0 || bonusRec40p > 0) && (
                <AdjustmentRow
                  label="Big receiving play bonus"
                  leagueValue={[
                    bonusRecTd40p > 0 && `+${bonusRecTd40p} per 40+ yd TD`,
                    bonusRecTd50p > 0 && `+${bonusRecTd50p} per 50+ yd TD`,
                    bonusRec40p   > 0 && `+${bonusRec40p} per 40+ yd rec`,
                  ].filter(Boolean).join(', ')}
                  baseline="None"
                  note="WR and TE values boosted for big-play ability"
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

          {showDefenseSection && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-bold uppercase tracking-widest"
                style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
                Defensive Scoring
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
                Defensive values are based on <span className="font-semibold">live season production in your Sleeper scoring</span>,
                then translated onto the same value-per-PPG scale as offensive players.
              </p>
              <div className="rounded-xl px-3 py-2.5 flex gap-4"
                style={{ background: 'var(--color-fill)' }}>
                <InfoPill label="IDP" value={hasIDP ? 'Enabled' : 'Off'} />
                <InfoPill label="D/ST" value={hasDST ? 'Enabled' : 'Off'} />
              </div>

              {showIDPDetails && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-label-tertiary)' }}>
                    IDP scoring used in valuations
                  </span>
                  {idpRows.map((row) => (
                    <AdjustmentRow
                      key={`idp-${row.label}`}
                      label={row.label}
                      leagueValue={formatScoringSettingValue(row.key, row.value, { zero: row.baseline, defaultSuffix: 'pts' })}
                      baseline={row.baseline}
                      note={null}
                    />
                  ))}
                </div>
              )}

              {showDSTDetails && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-label-tertiary)' }}>
                    D/ST scoring used in valuations
                  </span>
                  {dstRows.map((row) => (
                    <AdjustmentRow
                      key={`dst-${row.label}`}
                      label={row.label}
                      leagueValue={formatScoringSettingValue(row.key, row.value, { zero: row.baseline, defaultSuffix: 'pts' })}
                      baseline={row.baseline}
                      note={null}
                    />
                  ))}
                </div>
              )}

              {!showIDPDetails && !showDSTDetails && (
                <div className="rounded-lg px-3 py-2.5"
                  style={{ background: 'var(--color-fill)' }}>
                  <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>
                    Defensive roster slots are enabled, but all tracked defensive scoring weights are currently zero.
                  </span>
                </div>
              )}
            </section>
          )}

          {/* Season performance adjustments section */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
              Season Performance Adjustments
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
              After scoring multipliers are applied, two additional layers adjust each player's
              value based on <span className="font-semibold">how they're actually performing in your league</span> this season.
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-label-tertiary)' }}>PPG Adjustment</span>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
                  Each player's season average PPG is compared to the positional average in your league.
                  Players scoring above average gain value; below-average players lose value.
                  Range: <span className="font-semibold">×0.80 floor → ×1.40 ceiling</span>, with a 50% blend weight
                  so KTC consensus still anchors the result. Applies to players with direct KTC rankings only —
                  dynasty-fallback players are already 100% PPG-driven.
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-label-tertiary)' }}>Total Points Rank Adjustment</span>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
                  After the PPG adjustment, a ±12% nudge is applied based on each player's
                  positional rank by <span className="font-semibold">total season points</span> (PPG × games played) in your league.
                  Rank #1 at the position receives +12%; the median rank is unchanged; last rank receives −12%.
                  Players with no recorded stats are unaffected.
                </p>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-label-tertiary)' }}>
                These two adjustments compound. A top-ranked, high-PPG player can be ~20–30% above
                their raw KTC value; a low-ranked, low-PPG player can be ~20–25% below.
              </p>
            </div>
          </section>

          {/* Draft picks section */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
              Draft Pick Values
            </h3>
            {format === 'dynasty' ? (
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
                Dynasty picks use <span className="font-semibold">KTC's published RDP values</span> directly.
                Quality (Early / Mid / Late) is determined by current standings — the worst-record
                teams produce Early picks. Pick values are <span className="font-semibold">not adjusted</span> by
                league scoring settings, as KTC community consensus already prices future asset value
                on a scoring-agnostic basis.
              </p>
            ) : (
              <>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
                  Redraft pick values are <span className="font-semibold">computed from KTC's player rankings</span> rather
                  than dynasty RDP entries, since redraft picks represent access to players in a
                  specific draft slot — not long-term dynasty asset value.
                </p>
                <div className="flex flex-col gap-1 mt-0.5">
                  {[
                    ['Early / Mid / Late', 'Each round is split into thirds by draft position. Early picks cover the top third of the round, Late picks the bottom third.'],
                    ['Round depth discount', 'Later rounds carry more uncertainty. Round 1 ≈ 10% off the median player value in that tier. Round 5 ≈ 38% off. Round 10+ ≈ 70–80% off.'],
                    ['Year discount', 'Picks usable sooner are worth more. Each additional year in the future reduces value by ~10%, floored at 40% off for picks 4+ years out.'],
                  ].map(([label, desc]) => (
                    <div key={label} className="rounded-lg px-3 py-2.5 flex flex-col gap-0.5"
                      style={{ background: 'var(--color-fill)' }}>
                      <span className="text-xs font-semibold" style={{ color: 'var(--color-label)' }}>{label}</span>
                      <span className="text-xs leading-relaxed" style={{ color: 'var(--color-label-tertiary)' }}>{desc}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <div className="pb-2 text-xs text-center" style={{ color: 'var(--color-label-quaternary)' }}>
            Adjustments recalculate automatically whenever your league settings change in Sleeper.
          </div>

        </div>
    </Modal>
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
