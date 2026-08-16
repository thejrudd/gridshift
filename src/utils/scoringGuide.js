import { DEFAULT_SCORING, calcPointsFromTotals, getFlatScoringSettings, getPositionScoringSettings } from './scoringEngine.js';
import { buildFantasyScoringBreakdown } from './fantasyBreakdownRows.js';
import { getLeaguePositionFilters, getPositionFilterLabel, normalizeLeaguePlayerPosition } from './leaguePositions.js';

export const SCORING_PLAY_TYPES = [
  { id: 'ALL', label: 'All phases' },
  { id: 'OFFENSE', label: 'Offense' },
  { id: 'KICKING', label: 'Kicking' },
  { id: 'DEFENSE', label: 'Defense' },
  { id: 'SPECIAL_TEAMS', label: 'Special teams' },
];

const PLAYER_ROLES = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB', 'STP']);
const IDP_ROLES = new Set(['DL', 'LB', 'DB']);
const TEAM_DEFENSE_ROLES = new Set(['DEF']);
const TEAM_SPECIAL_TEAMS_ROLES = new Set(['DEF', 'TST']);
const KICKER_KEYS = new Set(['fgm', 'fgm_0_19', 'fgm_20_29', 'fgm_30_39', 'fgm_0_39', 'fgm_40_49', 'fgm_50_59', 'fgm_60p', 'fgmiss', 'fgmiss_0_19', 'fgmiss_20_29', 'fgmiss_30_39', 'fgmiss_0_39', 'fgmiss_40_49', 'fgmiss_50_59', 'fgmiss_60p', 'xpm', 'xpmiss', 'fgm_yds', 'fgm_yds_over_30']);
const POSITION_ONLY = {
  bonus_rec_te: ['TE'], bonus_rec_rb: ['RB'], bonus_rec_wr: ['WR'], bonus_rush_att: ['RB'],
  bonus_fd_qb: ['QB'], bonus_fd_rb: ['RB'], bonus_fd_wr: ['WR'], bonus_fd_te: ['TE'],
};
const TEAM_DEFENSE_KEY = /^(def_|pts_allow|yds_allow|sack$|sack_half|sack_yd|int$|int_ret_yd|safe$|tkl(?:_|$)|qb_hit$)/;
const IDP_KEY = /^(idp_|bonus_sack_2p$|bonus_tkl_10p$)/;
const DEFENSIVE_BONUS_KEY = /^bonus_def_/;
const SPECIAL_TEAMS_KEY = /^(kr_|pr_|st_|ret_td$|blk_kick(?:_|$)|fg_ret_yd$|fum_ret_yd$|def_st_|def_kr_|def_pr_)/;

function isActiveValue(value) {
  return Number.isFinite(Number(value)) && Number(value) !== 0;
}

function formatRuleNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
}

function formatPoints(value) {
  const formatted = formatRuleNumber(value);
  return `${formatted} ${Number(value) === 1 ? 'pt' : 'pts'}`;
}

function joinRuleLabels(labels) {
  if (labels.length < 2) return labels[0] ?? '';
  if (labels.length === 2) return labels.join(' and ');
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}

function getRuleKeys(settings, predicate) {
  return Object.entries(settings)
    .filter(([key, value]) => predicate(key) && isActiveValue(value))
    .map(([key]) => key);
}

function getUnitState({ rostered, active }) {
  if (rostered && active) return { state: 'active', status: 'Active' };
  if (rostered) return { state: 'inactive', status: 'No active scoring' };
  return { state: 'inactive', status: 'Not rostered' };
}

function describeTeamDefense(keys) {
  const traits = [
    keys.some((key) => ['sack', 'sack_half', 'sack_yd'].includes(key)) && 'sacks',
    keys.some((key) => /^(?:int|def_(?:int|fum|ff|td))/.test(key)) && 'takeaways and scores',
    keys.some((key) => key.startsWith('pts_allow')) && 'points allowed',
    keys.some((key) => key.startsWith('yds_allow')) && 'yards allowed',
    keys.some((key) => /^(?:tkl|qb_hit|def_(?:pass_def|3_and_out|4_and_stop|forced_punts))/.test(key)) && 'stops and tackles',
  ].filter(Boolean);
  return traits.length ? joinRuleLabels(traits) : 'Defensive scoring is configured.';
}

function describeKicking(keys) {
  const traits = [
    keys.some((key) => key.startsWith('fgm')) && 'field goals',
    keys.some((key) => key === 'xpm' || key === 'xpmiss') && 'extra points',
    keys.some((key) => key.startsWith('fgmiss') || key === 'xpmiss') && 'miss penalties',
  ].filter(Boolean);
  return traits.length ? joinRuleLabels(traits) : 'Kicker scoring is configured.';
}

function describeSpecialTeams(keys) {
  const traits = [
    keys.some((key) => /^(?:kr_|pr_|def_kr_|def_pr_|fg_ret_yd|fum_ret_yd)/.test(key)) && 'return yards',
    keys.some((key) => /(?:^|_)td(?:_|$)/.test(key)) && 'return touchdowns',
    keys.some((key) => /(?:^|_)tkl/.test(key)) && 'coverage tackles',
    keys.some((key) => key.startsWith('blk_kick')) && 'blocked kicks',
  ].filter(Boolean);
  return traits.length ? joinRuleLabels(traits) : 'Return and coverage scoring is configured.';
}

function describeYardageRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate === 0) return 'No yardage points';
  const yards = 1 / Math.abs(rate);
  const yardLabel = Number.isInteger(yards) ? String(yards) : formatRuleNumber(yards);
  return `${rate < 0 ? '−' : ''}1 pt / ${yardLabel} yds`;
}

export function isNonStandardScoringSetting(key, value) {
  const current = Number(value ?? 0);
  const baseline = Number(DEFAULT_SCORING[key] ?? 0);
  return Number.isFinite(current) && Math.abs(current - baseline) > 0.000001;
}

export function getPreviousLeagueHistoryOptions(linkedLeagueHistory, currentSeason) {
  const currentSeasonNumber = Number(currentSeason);
  if (!Number.isFinite(currentSeasonNumber)) return [];
  return (linkedLeagueHistory ?? [])
    .filter((entry) => entry?.league && Number(entry.season) < currentSeasonNumber)
    .sort((a, b) => Number(b.season) - Number(a.season));
}

// Compatibility alias for callers that used the original cross-league
// scoring-preview name. These entries now identify historical production,
// while the connected league remains the scoring source.
export const getPreviousLeagueScoringOptions = getPreviousLeagueHistoryOptions;

export function getScoringRuleMeta(key) {
  if (POSITION_ONLY[key]) return { roles: new Set(POSITION_ONLY[key]), playTypes: new Set(['OFFENSE']) };
  if (KICKER_KEYS.has(key)) return { roles: new Set(['K']), playTypes: new Set(['KICKING']) };
  if (IDP_KEY.test(key)) return { roles: IDP_ROLES, playTypes: new Set(['DEFENSE']) };
  if (DEFENSIVE_BONUS_KEY.test(key)) return { roles: new Set([...IDP_ROLES, ...TEAM_DEFENSE_ROLES]), playTypes: new Set(['DEFENSE']) };
  if (SPECIAL_TEAMS_KEY.test(key)) {
    const roles = key.startsWith('def_') ? TEAM_SPECIAL_TEAMS_ROLES : PLAYER_ROLES;
    return { roles, playTypes: new Set(['SPECIAL_TEAMS']) };
  }
  if (TEAM_DEFENSE_KEY.test(key)) return { roles: TEAM_DEFENSE_ROLES, playTypes: new Set(['DEFENSE']) };
  return { roles: PLAYER_ROLES, playTypes: new Set(['OFFENSE']) };
}

export function getScoringPositionOptions(rosterPositions) {
  return getLeaguePositionFilters(rosterPositions).map((id) => ({ id, label: id === 'ALL' ? 'All positions' : getPositionFilterLabel(id) }));
}

export function isScoringRuleRosterEligible(key, rosterPositions) {
  if (rosterPositions == null) return true;
  const eligiblePositions = new Set(getLeaguePositionFilters(rosterPositions, { includeAll: false }));
  return [...getScoringRuleMeta(key).roles].some((role) => eligiblePositions.has(role));
}

/**
 * Compares each position's depth bands using the supplied season's production
 * and scoring. PPG keeps partial-season players comparable.
 */
export function getPositionStrengthRanking({ seasonStats, players, scoring, rosterPositions } = {}) {
  if (!seasonStats || !players) return [];

  const enabledPositions = new Set(getLeaguePositionFilters(rosterPositions, { includeAll: false }));
  const pointsByPosition = new Map();

  for (const [playerId, stats] of Object.entries(seasonStats)) {
    const player = players[playerId];
    const position = normalizeLeaguePlayerPosition(player?.position);
    const gamesPlayed = Number(stats?.gp ?? 0);
    if (!position || !enabledPositions.has(position) || !Number.isFinite(gamesPlayed) || gamesPlayed <= 0) continue;

    const points = calcPointsFromTotals(stats, scoring, player.position);
    const ppg = points / gamesPlayed;
    if (!Number.isFinite(ppg) || ppg <= 0) continue;
    const values = pointsByPosition.get(position) ?? [];
    values.push(ppg);
    pointsByPosition.set(position, values);
  }

  const averageRange = (values, start, end) => {
    const sample = values.slice(start, end);
    return sample.length
      ? sample.reduce((total, value) => total + value, 0) / sample.length
      : null;
  };

  return [...pointsByPosition.entries()]
    .map(([position, values]) => {
      values.sort((a, b) => b - a);
      return {
        position,
        top8: averageRange(values, 0, 8),
        nineTo16: averageRange(values, 8, 16),
        seventeenTo32: averageRange(values, 16, 32),
        playerCount: values.length,
      };
    })
    .sort((a, b) => b.top8 - a.top8)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function filterScoringGroups(groups, {
  position = 'ALL',
  playType = 'ALL',
  showActiveOnly = true,
  includeIDP = true,
  rosterPositions = null,
  scoring,
} = {}) {
  const effective = position === 'ALL' ? getFlatScoringSettings(scoring) : getPositionScoringSettings(scoring, position);
  return groups.map((group) => ({
    ...group,
    stats: group.stats.filter((stat) => {
      const meta = getScoringRuleMeta(stat.key);
      if (!includeIDP && IDP_KEY.test(stat.key) && showActiveOnly) return false;
      if (stat.espnOnly && scoring?.provider !== 'espn') return false;
      if (showActiveOnly && !isScoringRuleRosterEligible(stat.key, rosterPositions)) return false;
      if (position !== 'ALL' && !meta.roles.has(position)) return false;
      if (playType !== 'ALL' && !meta.playTypes.has(playType)) return false;
      return !showActiveOnly || Number(effective[stat.key] ?? 0) !== 0;
    }),
  })).filter((group) => group.stats.length > 0);
}

export function getScoringProfile(scoring, rosterPositions) {
  const settings = getFlatScoringSettings(scoring);
  const rosterSlots = new Set((rosterPositions ?? []).map((slot) => String(slot ?? '').trim().toUpperCase()));
  const positions = new Set(getLeaguePositionFilters(rosterPositions, { includeAll: false }));
  const reception = settings.rec === 1 ? 'Full PPR' : settings.rec === 0.5 ? 'Half PPR' : settings.rec ? `${settings.rec}-point PPR` : 'No PPR';
  const receptionBaseline = Number(settings.rec ?? 0);
  const premiumRules = [
    { id: 'TE', label: 'Tight end', settings: getPositionScoringSettings(scoring, 'TE'), bonusKey: 'bonus_rec_te' },
    { id: 'RB', label: 'Running back', settings: getPositionScoringSettings(scoring, 'RB'), bonusKey: 'bonus_rec_rb' },
    { id: 'WR', label: 'Wide receiver', settings: getPositionScoringSettings(scoring, 'WR'), bonusKey: 'bonus_rec_wr' },
  ].map((rule) => {
    const base = Number(rule.settings.rec ?? receptionBaseline);
    const bonus = Number(rule.settings[rule.bonusKey] ?? 0);
    const total = base + bonus;
    return { ...rule, bonus: total - receptionBaseline, total };
  }).filter((rule) => rule.bonus !== 0 && positions.has(rule.id));
  const tightEndPremium = premiumRules.find((rule) => rule.id === 'TE' && rule.bonus > 0);
  const passing = isActiveValue(settings.pass_td) ? `${formatRuleNumber(settings.pass_td)}-point passing TDs` : null;
  const profiles = [reception, tightEndPremium ? 'TE premium' : null, passing].filter(Boolean);
  const activeBonusCount = Object.entries(settings)
    .filter(([key, value]) => (
      key.startsWith('bonus_')
      && isActiveValue(value)
      && isScoringRuleRosterEligible(key, rosterPositions)
    ))
    .length;

  const hasTeamDefenseRoster = positions.has('DEF');
  const hasIDPRoster = ['DL', 'LB', 'DB'].some((position) => positions.has(position));
  const idpKeys = getRuleKeys(settings, (key) => IDP_KEY.test(key) || DEFENSIVE_BONUS_KEY.test(key));
  const hasIDPScoring = hasIDPRoster && idpKeys.length > 0;
  const hasSuperflex = rosterSlots.has('SUPER_FLEX') || rosterSlots.has('OP');

  const leagueType = hasIDPRoster
    ? 'IDP'
    : hasSuperflex
      ? 'Superflex'
      : tightEndPremium
        ? 'TE premium'
        : 'Offense';

  const coreRules = [
    {
      id: 'reception',
      label: 'Reception',
      value: formatPoints(receptionBaseline),
      detail: tightEndPremium ? 'RB / WR baseline' : 'All eligible receivers',
    },
    ...premiumRules.map((rule) => ({
      id: `${rule.id.toLowerCase()}-reception`,
      label: `${rule.label} reception`,
      value: formatPoints(rule.total),
      detail: `${rule.bonus > 0 ? '+' : ''}${formatRuleNumber(rule.bonus)} vs. baseline`,
      emphasis: rule.id === 'TE',
    })),
    {
      id: 'pass-td',
      label: 'Passing TD',
      value: formatPoints(settings.pass_td),
      detail: describeYardageRate(settings.pass_yd),
    },
    {
      id: 'skill-td',
      label: 'Rush / receive TD',
      value: `${formatRuleNumber(settings.rush_td)} / ${formatRuleNumber(settings.rec_td)}`,
      detail: 'Rushing / receiving',
    },
    {
      id: 'scrimmage-yards',
      label: 'Rush / receive yards',
      value: settings.rush_yd === settings.rec_yd
        ? describeYardageRate(settings.rush_yd)
        : `${formatRuleNumber(settings.rush_yd)} / ${formatRuleNumber(settings.rec_yd)} pts`,
      detail: settings.rush_yd === settings.rec_yd ? 'Both phases' : 'Per rushing / receiving yard',
    },
    {
      id: 'turnovers',
      label: 'Turnovers',
      value: `${formatRuleNumber(settings.pass_int)} / ${formatRuleNumber(settings.fum_lost)}`,
      detail: 'Interception / fumble lost',
    },
    ...(hasIDPScoring ? [
      {
        id: 'idp-tackle',
        label: 'Solo tackle',
        value: formatPoints(settings.idp_tkl_solo),
        detail: 'Individual defense',
      },
      {
        id: 'idp-impact-play',
        label: 'Sack / interception',
        value: `${formatRuleNumber(settings.idp_sack)} / ${formatRuleNumber(settings.idp_int)}`,
        detail: 'Individual defense',
      },
    ] : []),
  ];

  const kickerKeys = getRuleKeys(settings, (key) => KICKER_KEYS.has(key));
  const specialTeamsKeys = getRuleKeys(settings, (key) => SPECIAL_TEAMS_KEY.test(key));
  const eligibleSpecialTeamsKeys = specialTeamsKeys.filter((key) => (
    [...getScoringRuleMeta(key).roles].some((role) => positions.has(role))
  ));
  const hasTeamSpecialTeamsRoster = hasTeamDefenseRoster || positions.has('TST');
  const hasIndividualSpecialTeamsScoring = eligibleSpecialTeamsKeys.some((key) => (
    [...getScoringRuleMeta(key).roles].some((role) => PLAYER_ROLES.has(role) && positions.has(role))
  ));
  const teamDefenseKeys = getRuleKeys(settings, (key) => (
    (TEAM_DEFENSE_KEY.test(key) && !SPECIAL_TEAMS_KEY.test(key)) || DEFENSIVE_BONUS_KEY.test(key)
  ));
  const offenseKeys = getRuleKeys(settings, (key) => {
    const meta = getScoringRuleMeta(key);
    return meta.playTypes.has('OFFENSE');
  });
  const offenseState = getUnitState({ rostered: true, active: offenseKeys.length > 0 });
  const kickerState = getUnitState({ rostered: positions.has('K'), active: kickerKeys.length > 0 });
  const defenseState = teamDefenseKeys.length === 0 && hasTeamDefenseRoster && specialTeamsKeys.length > 0
    ? { state: 'partial', status: 'Special teams only' }
    : getUnitState({ rostered: hasTeamDefenseRoster, active: teamDefenseKeys.length > 0 });
  const specialTeamsRostered = hasTeamSpecialTeamsRoster || [...positions].some((position) => PLAYER_ROLES.has(position));
  const specialTeamsState = getUnitState({ rostered: specialTeamsRostered, active: eligibleSpecialTeamsKeys.length > 0 });
  const idpState = getUnitState({ rostered: hasIDPRoster, active: idpKeys.length > 0 });

  const units = [
    {
      id: 'OFFENSE', label: 'Offense', ...offenseState,
      detail: `${formatRuleNumber(settings.pass_td)}-pt pass TDs · ${formatRuleNumber(settings.rush_td)}-pt rush TDs · ${formatRuleNumber(settings.rec)} PPR`,
    },
    {
      id: 'KICKING', label: 'Kicking', ...kickerState,
      detail: positions.has('K')
        ? kickerKeys.length ? describeKicking(kickerKeys) : 'No field-goal or extra-point scoring.'
        : kickerKeys.length ? 'Kicker scoring exists, but this league has no K roster slot.' : 'This league has no K roster slot.',
    },
    {
      id: 'DEFENSE', label: 'Team defense', ...defenseState,
      detail: !hasTeamDefenseRoster
        ? teamDefenseKeys.length ? 'D/ST scoring exists, but this league has no D/ST roster slot.' : 'This league has no D/ST roster slot.'
        : teamDefenseKeys.length
        ? describeTeamDefense(teamDefenseKeys)
        : hasTeamDefenseRoster && specialTeamsKeys.length
          ? 'The D/ST slot scores through returns and coverage, not defensive plays.'
          : 'No sacks, takeaways, points-allowed, or yards-allowed scoring.',
    },
    {
      id: 'SPECIAL_TEAMS',
      label: 'Special teams',
      ...specialTeamsState,
      detail: eligibleSpecialTeamsKeys.length
        ? `${hasIndividualSpecialTeamsScoring && !hasTeamSpecialTeamsRoster ? 'Rostered individual players · ' : ''}${describeSpecialTeams(eligibleSpecialTeamsKeys)}`
        : specialTeamsKeys.length
          ? 'Special-teams scoring exists, but this league has no eligible roster slot.'
          : 'No return or coverage scoring.',
    },
    ...(hasIDPScoring ? [{
      id: 'IDP', label: 'Individual defense', ...idpState,
      detail: idpKeys.length
        ? `${formatRuleNumber(settings.idp_tkl_solo)} solo tackle · ${formatRuleNumber(settings.idp_sack)} sack · ${formatRuleNumber(settings.idp_int)} interception`
        : 'No individual defensive scoring.',
    }] : []),
  ];

  const title = `${reception} · ${leagueType}`;
  const summary = tightEndPremium
    ? `Tight ends earn ${formatRuleNumber(tightEndPremium.total)} points per catch—${formatRuleNumber(tightEndPremium.bonus)} more than the league baseline.`
    : `${receptionBaseline ? `${formatRuleNumber(receptionBaseline)} points are awarded per reception.` : 'Receptions do not score on their own.'}`;

  const facts = [
    tightEndPremium && leagueType !== 'TE premium' ? 'TE premium' : null,
    hasSuperflex && leagueType !== 'Superflex' ? 'Superflex' : null,
    passing,
  ].filter(Boolean);

  const availableExampleIds = [
    offenseKeys.length > 0 && 'OFFENSE',
    hasIDPScoring && 'DEFENSE',
    eligibleSpecialTeamsKeys.length > 0 && 'SPECIAL_TEAMS',
    (positions.has('K') && kickerKeys.length > 0) && 'KICKING',
  ].filter(Boolean);
  const availablePlayTypeIds = [
    offenseKeys.length > 0 && 'OFFENSE',
    ((hasTeamDefenseRoster && teamDefenseKeys.length > 0) || hasIDPScoring) && 'DEFENSE',
    eligibleSpecialTeamsKeys.length > 0 && 'SPECIAL_TEAMS',
    (positions.has('K') && kickerKeys.length > 0) && 'KICKING',
  ].filter(Boolean);

  return {
    title,
    summary,
    profiles,
    facts,
    premiumRules,
    activeBonusCount,
    coreRules,
    units,
    hasIDPScoring,
    hasTeamDefenseRoster,
    hasTeamSpecialTeamsRoster,
    availableExampleIds,
    availablePlayTypeIds,
  };
}

export const SCORING_GAME_EXAMPLE_OPTIONS = [
  { id: 'OFFENSE', label: 'Offense' },
  { id: 'DEFENSE', label: 'Defense' },
  { id: 'SPECIAL_TEAMS', label: 'Special teams' },
  { id: 'KICKING', label: 'Kicking' },
];

export const SCORING_GAME_EXAMPLES = {
  OFFENSE: [{
    id: 'jonathan-taylor-week-2',
    name: 'Jonathan Taylor', team: 'IND', position: 'RB', espnId: '4242335', opponent: 'vs. DEN', date: 'September 14, 2025', result: 'Colts won 29–28', week: 2,
    sourceLabel: 'NFL Week 2 players of the week', sourceUrl: 'https://www.nfl.com/news/players-of-the-week-2025-week-2-jared-goff-jonathan-taylor',
    statLines: ['25 carries · 165 rushing yards', '2 catches · 50 receiving yards', '1 receiving touchdown'],
    stats: { rush_att: 25, rush_yd: 165, rec: 2, rec_yd: 50, rec_td: 1 },
  }, {
    id: 'jared-goff-week-2',
    name: 'Jared Goff', team: 'DET', position: 'QB', espnId: '3046779', opponent: 'vs. CHI', date: 'September 14, 2025', result: 'Lions won 52–21', week: 2,
    sourceLabel: 'NFL Week 2 players of the week', sourceUrl: 'https://www.nfl.com/news/players-of-the-week-2025-week-2-jared-goff-jonathan-taylor',
    statLines: ['23-of-28 passing · 334 yards', '5 passing touchdowns · 0 interceptions'],
    stats: { pass_cmp: 23, pass_att: 28, pass_inc: 5, pass_yd: 334, pass_td: 5 },
  }],
  DEFENSE: [{
    id: 'fred-warner-week-2',
    name: 'Fred Warner', team: 'SF', position: 'LB', espnId: '3138826', opponent: '@ NO', date: 'September 14, 2025', result: '49ers won 26–21', week: 2,
    sourceLabel: '49ers Week 2 recap', sourceUrl: 'https://www.49ers.com/news/fred-warner-named-nfc-defensive-player-of-the-week-vs-saints',
    statLines: ['11 tackles · 7 solo', '1 tackle for loss · 1 pass defended', '1 forced fumble · 1 recovery'],
    stats: { idp_tkl: 11, idp_tkl_solo: 7, idp_tkl_ast: 4, idp_tkl_loss: 1, idp_pd: 1, idp_ff: 1, idp_fr: 1 },
  }, {
    id: 'roquan-smith-week-2',
    name: 'Roquan Smith', team: 'BAL', position: 'LB', espnId: '3915189', opponent: 'vs. CLE', date: 'September 14, 2025', result: 'Ravens won 41–17', week: 2,
    sourceLabel: 'NFL Week 2 players of the week', sourceUrl: 'https://www.nfl.com/news/players-of-the-week-2025-week-2-jared-goff-jonathan-taylor',
    statLines: ['15 tackles · 3 tackles for loss', '1 fumble recovery · 63-yard touchdown'],
    stats: { idp_tkl: 15, idp_tkl_loss: 3, idp_fr: 1, idp_fr_yd: 63, idp_fr_td: 1 },
  }],
  SPECIAL_TEAMS: [{
    id: 'antonio-gibson-week-2',
    name: 'Antonio Gibson', team: 'NE', position: 'RB', espnId: '4360294', opponent: '@ MIA', date: 'September 14, 2025', result: 'Patriots won 33–27', week: 2,
    sourceLabel: 'NFL Week 2 players of the week', sourceUrl: 'https://www.nfl.com/news/players-of-the-week-2025-week-2-jared-goff-jonathan-taylor',
    statLines: ['6 kick returns · 171 yards', '90-yard kick-return touchdown'],
    stats: { kr_yd: 171 },
    returnTouchdownType: 'kick',
    teamStats: { def_kr_yd: 171, def_kr_yd_10: 17, def_kr_yd_25: 6, def_td: 1 },
    teamExample: { name: 'New England Patriots', position: 'DEF', logoKey: 'ne', isTeam: true },
  }, {
    id: 'malik-washington-week-2',
    name: 'Malik Washington', team: 'MIA', position: 'WR', espnId: '4569603', opponent: 'vs. NE', date: 'September 14, 2025', result: 'Dolphins lost 27–33', week: 2,
    sourceLabel: 'NFL Week 2 players of the week', sourceUrl: 'https://www.nfl.com/news/players-of-the-week-2025-week-2-jared-goff-jonathan-taylor',
    statLines: ['74-yard punt-return touchdown'],
    stats: { pr_yd: 74 },
    returnTouchdownType: 'punt',
    teamStats: { def_pr_yd: 74, def_pr_yd_10: 7, def_pr_yd_25: 2, def_td: 1 },
    teamExample: { name: 'Miami Dolphins', position: 'DEF', logoKey: 'mia', isTeam: true },
  }],
  KICKING: [{
    id: 'brandon-aubrey-week-2',
    name: 'Brandon Aubrey', team: 'DAL', position: 'K', espnId: '3953687', opponent: 'vs. NYG', date: 'September 14, 2025', result: 'Cowboys won 40–37 (OT)', week: 2,
    sourceLabel: 'Cowboys Week 2 recap', sourceUrl: 'https://www.dallascowboys.com/news/brandon-aubrey-named-nfc-special-teams-player-of-the-week-x3277',
    statLines: ['4-for-4 field goals · 51, 44, 64 and 46 yards', '4-for-4 extra points'],
    stats: { fgm: 4, fgm_40_49: 2, fgm_50_59: 1, fgm_60p: 1, xpm: 4 },
  }, {
    id: 'spencer-shrader-week-2',
    name: 'Spencer Shrader', team: 'IND', position: 'K', espnId: '4571557', opponent: 'vs. DEN', date: 'September 14, 2025', result: 'Colts won 29–28', week: 2,
    sourceLabel: 'Colts Week 2 scoring summary', sourceUrl: 'https://www.colts.com/game-day/2025/reg-week2/broncos-at-colts/scoring-summary',
    statLines: ['5-for-5 field goals · 29, 33, 36, 28 and 45 yards', '2-for-2 extra points'],
    stats: { fgm: 5, fgm_20_29: 2, fgm_30_39: 2, fgm_0_39: 4, fgm_40_49: 1, fgm_yds: 171, fgm_yds_over_30: 24, xpm: 2 },
  }],
};

function getIndividualExampleStats(example, scoring) {
  if (!example.returnTouchdownType) return example.stats;

  const stats = { ...example.stats };
  const specificKey = example.returnTouchdownType === 'punt' ? 'pr_td' : 'kr_td';
  const touchdownKey = [specificKey, 'ret_td', 'st_td']
    .find((key) => Number(scoring?.[key] ?? 0) !== 0);
  if (touchdownKey) stats[touchdownKey] = 1;
  return stats;
}

function scoreScoringGameExample(example, scoring, { allowTeamExample = true } = {}) {
  const playerResult = buildFantasyScoringBreakdown(
    getIndividualExampleStats(example, scoring),
    scoring,
    example.position,
  );
  if (example.teamStats && allowTeamExample) {
    const teamResult = buildFantasyScoringBreakdown(example.teamStats, scoring, 'DEF');
    if (Math.abs(teamResult.total) > 0) {
      return {
        ...example,
        ...example.teamExample,
        points: teamResult.total,
        pointsLabel: 'D/ST pts',
        breakdown: teamResult.rows,
      };
    }
  }

  return { ...example, points: playerResult.total, pointsLabel: 'Fantasy pts', breakdown: playerResult.rows };
}

export function getScoringGameExampleCandidates(exampleId, scoring, options = {}) {
  const examples = SCORING_GAME_EXAMPLES[exampleId] ?? [];
  const rosterPositions = options.rosterPositions;
  const eligiblePositions = rosterPositions == null
    ? null
    : new Set(getLeaguePositionFilters(rosterPositions, { includeAll: false }));
  return examples
    .map((example) => scoreScoringGameExample(example, scoring, options))
    .filter((example) => {
      if (!eligiblePositions) return true;
      if (example.isTeam) {
        return eligiblePositions.has('DEF') || (
          exampleId === 'SPECIAL_TEAMS' && eligiblePositions.has('TST')
        );
      }
      const position = normalizeLeaguePlayerPosition(example.position);
      return position ? eligiblePositions.has(position) : false;
    })
    .filter((example) => Number.isFinite(Number(example.points)) && Math.abs(Number(example.points)) > 0);
}

export function getScoringGameExample(exampleId, scoring, { candidateId = null, ...options } = {}) {
  const candidates = getScoringGameExampleCandidates(exampleId, scoring, options);
  if (!candidateId) return candidates[0] ?? null;
  return candidates.find((candidate) => candidate.id === candidateId) ?? null;
}

export function pickRandomScoringGameExample(
  exampleId,
  scoring,
  { previousCandidateId = null, random = Math.random, ...options } = {},
) {
  const eligible = getScoringGameExampleCandidates(exampleId, scoring, options);
  if (eligible.length === 0) return null;

  const candidates = eligible.length > 1
    ? eligible.filter((candidate) => candidate.id !== previousCandidateId)
    : eligible;
  const randomValue = Number(random());
  const normalizedRandom = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 0.9999999999999999)
    : 0;

  return candidates[Math.floor(normalizedRandom * candidates.length)];
}

/** Chooses a phase from the set that has at least one eligible player sample. */
export function pickRandomScoringGameExampleId(
  eligibleExampleIds,
  { previousId = null, random = Math.random } = {},
) {
  const eligibleIds = [...new Set(eligibleExampleIds ?? [])]
    .filter((id) => Object.hasOwn(SCORING_GAME_EXAMPLES, id));
  if (eligibleIds.length === 0) return null;

  const candidates = eligibleIds.length > 1
    ? eligibleIds.filter((id) => id !== previousId)
    : eligibleIds;
  const randomValue = Number(random());
  const normalizedRandom = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 0.9999999999999999)
    : 0;

  return candidates[Math.floor(normalizedRandom * candidates.length)];
}
