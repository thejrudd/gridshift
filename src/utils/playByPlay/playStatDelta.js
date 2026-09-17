// playStatDelta.js — fantasy stat attribution for one player's involvement in
// one BALLDONTLIE play.
//
// Moved out of livePlaysFeed.js so Statistics Scores and Fantasy Live can share
// one owner of per-play stat semantics. Behavior is unchanged from the Fantasy
// Live original: every key emitted here must stay in step with
// scoringEngine.js's STAT_TO_SCORING_KEY / DEFAULT_SCORING (see
// docs/Scoring Call Sites.md).
//
// Nothing in this file filters plays. A play with no fantasy relevance returns
// an empty delta and it is the consumer's choice whether to drop it.

import { calcPoints } from '../scoringEngine.js';

function firstFinite(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

export function isFirstDownPlay(play) {
  const description = String(play?.description ?? '');
  if (/first down/i.test(description)) return true;

  // BALLDONTLIE exposes the down at the start and end of the snap. An
  // offensive play ending on a new first down is still a first down when the
  // provider's sentence omits the phrase (which is common in short_text).
  // Leave incompletions, sacks, interceptions, and no-plays to their existing
  // branches so an end_down value cannot invent a positive offensive stat.
  const raw = play?.raw ?? {};
  const endDown = firstFinite(raw.end_down, raw.endDown);
  const incomplete = play?.narrative?.playKind === 'incompletion'
    || String(play?.type ?? '').toLowerCase().includes('incompletion')
    || /\bincomplete\b/i.test(description);
  const negated = play?.narrative?.negated === true
    || /\bno play\b|wiped out by/i.test([
      description,
      raw.short_text,
      raw.text,
    ].filter(Boolean).join(' '));
  if (incomplete || negated || /\bintercept/i.test(String(play?.type ?? '')) || /\bsack\b/i.test(description)) {
    return false;
  }
  return endDown === 1;
}

/**
 * Approximate fantasy points for one player's involvement in one play,
 * scored through the league settings (position always passed — scoring rule).
 */
export function estimatePlayPoints(play, role, position, scoringSettings, roleDetail = null) {
  return Math.round(calcPoints(buildPlayStatDelta(play, role, roleDetail), scoringSettings, position) * 100) / 100;
}

export function buildPlayStatDelta(play, role, roleDetail = null) {
  const description = play.description;
  const yards = play.yards || extractYardsFromText(description) || 0;
  const type = String(play.type ?? '').toLowerCase();
  const kickContext = [
    type,
    description,
    play.raw?.short_text,
    play.raw?.text,
    roleDetail,
  ].filter(Boolean).join(' ');
  const touchdown = play.scoring && (
    /touchdown|return td/i.test(description)
    || /touchdown|return-touchdown|return_td/.test(type)
  );
  const twoPoint = /two.?point|2.?point/.test(type)
    || /two.?point conversion|2.?point conversion/i.test(description);
  const incomplete = play.narrative?.playKind === 'incompletion'
    || type.includes('incompletion')
    || /\bincomplete\b/i.test(description);
  const negated = play.narrative?.negated === true
    || /\bno play\b|wiped out by/i.test([
      description,
      play.raw?.short_text,
      play.raw?.text,
    ].filter(Boolean).join(' '));
  const delta = {};
  const firstDown = isFirstDownPlay(play);

  // Keep the provider's raw yardage on the normalized play for field geometry,
  // but a snap explicitly ruled "No Play" has no fantasy stat attribution.
  if (negated) return delta;

  if (role === 'kicker') {
    const missedExtraPoint = /(?:extra point|\bPAT\b).*?(?:fail|miss|no good)|(?:fail|miss|no good).*?(?:extra point|\bPAT\b)/i.test(kickContext);
    const madeExtraPoint = /extra point good|extra point.*?is good|\bPAT\b.*?good/i.test(kickContext)
      || /extra point good/i.test(String(roleDetail ?? ''));
    if (missedExtraPoint) delta.xpmiss = 1;
    else if (madeExtraPoint || (type.includes('extra') && play.scoring)) delta.xpm = 1;
    else if (/field goal.*?(?:miss|no good)/i.test(kickContext)) {
      delta.fgmiss = 1;
    } else if (/field goal is good|field goal.*good/i.test(kickContext) || (type.includes('field') && play.scoring)) {
      const fieldGoalYards = extractYardsFromText(kickContext);
      delta.fgm = 1;
      if (fieldGoalYards) {
        delta.fgm_yds = fieldGoalYards;
        delta.fgm_yds_over_30 = Math.max(0, fieldGoalYards - 30);
      }
    }
    else return {};
  } else if (role === 'returner') {
    const kickoff = type.includes('kickoff') || /kickoff/i.test(description);
    if (kickoff) delta.kr_yd = yards;
    else delta.pr_yd = yards;
    if (touchdown) {
      delta.ret_td = 1;
      if (kickoff) delta.kr_td = 1;
      else delta.pr_td = 1;
    }
  } else if (role === 'punter') {
    // Punt distance belongs to the kicking play, not a fantasy rushing line.
    return {};
  } else if (role === 'team_defense') {
    return buildTeamDefensePlayDelta(play);
  } else if (role === 'defense') {
    if (/sack/i.test(description)) delta.idp_sack = 1;
    if (/intercept/i.test(description)) delta.idp_int = 1;
    if (/forced fumble|fumble forced/i.test(description)) delta.idp_ff = 1;
    if (/fumble.*recover/i.test(description)) {
      delta.idp_fr = 1;
      const fumbleReturnYards = firstFinite(
        play.narrative?.returnYards,
        extractReturnYards(description),
      );
      if (fumbleReturnYards != null && fumbleReturnYards > 0) delta.idp_fr_yd = fumbleReturnYards;
    }
    if (/safety/i.test(description)) delta.idp_safety = 1;
    if (/pass (?:defensed|defended|broken up)|pass breakup|incomplete/i.test(description)) delta.idp_pd = 1;
    if (touchdown) {
      delta.idp_def_td = 1;
      if (/intercept/i.test(description)) {
        delta.idp_int_td = 1;
        delta.idp_int_ret_yd = extractReturnYards(description) || yards;
        if (delta.idp_int_ret_yd >= 50) delta.bonus_def_int_td_50p = 1;
      } else if (/fumble/i.test(description)) {
        delta.idp_fr_td = 1;
        delta.idp_fr_yd = extractReturnYards(description) || yards;
        if (delta.idp_fr_yd >= 50) delta.bonus_def_fum_td_50p = 1;
      }
    }
    if (!Object.keys(delta).length) delta.idp_tkl = 1;
  } else if (role === 'passer') {
    if (twoPoint) {
      delta.pass_2pt = 1;
    } else if (/intercept/i.test(description)) {
      delta.pass_int = 1;
    } else if (/sack/i.test(description)) {
      delta.pass_sack = 1;
    } else if (incomplete) {
      delta.pass_att = 1;
      delta.pass_inc = 1;
    } else {
      delta.pass_yd = yards;
      delta.pass_cmp = 1;
      delta.pass_att = 1;
      if (touchdown) delta.pass_td = 1;
      if (firstDown) delta.pass_fd = 1;
      if (touchdown && yards >= 40) delta.pass_td_40p = 1;
      if (touchdown && yards >= 50) delta.pass_td_50p = 1;
      if (yards >= 40) delta.pass_cmp_40p = 1;
    }
  } else if (role === 'receiver') {
    if (twoPoint) {
      delta.rec_2pt = 1;
    } else if (incomplete) {
      return delta;
    } else {
      delta.rec = 1;
      delta.rec_yd = yards;
      if (touchdown) delta.rec_td = 1;
      if (firstDown) delta.rec_fd = 1;
      if (touchdown && yards >= 40) delta.rec_td_40p = 1;
      if (touchdown && yards >= 50) delta.rec_td_50p = 1;
      if (yards >= 40) delta.rec_40p = 1;
    }
  } else {
    if (twoPoint) {
      delta.rush_2pt = 1;
    } else {
      if (/fumble/i.test(description) && /lost|recovered by/i.test(description)) delta.fum_lost = 1;
      delta.rush_att = 1;
      delta.rush_yd = yards;
      if (touchdown) delta.rush_td = 1;
      if (firstDown) delta.rush_fd = 1;
      if (touchdown && yards >= 40) delta.rush_td_40p = 1;
      if (touchdown && yards >= 50) delta.rush_td_50p = 1;
      if (yards >= 40) delta.rush_40p = 1;
    }
  }

  return delta;
}

export function buildTeamDefensePlayDelta(play) {
  const description = play.description;
  const delta = {};
  const touchdown = play.scoring && /touchdown/i.test(description);
  const interception = /intercept|picked off|pick six/i.test(description);
  const fumble = /fumble/i.test(description);
  const sack = /sack/i.test(description);

  if (sack) {
    delta.sack = 1;
    delta.sack_yd = Math.abs(play.yards || extractYardsFromText(description) || 0);
  }
  if (interception) delta.int = 1;
  if (/safety/i.test(description)) delta.safe = 1;
  if (/pass (?:defensed|defended|broken up)|pass breakup|incomplete/i.test(description)) delta.def_pass_def = 1;
  if (/forced fumble|fumble forced/i.test(description) || fumble) delta.def_ff = 1;
  if (touchdown) {
    delta.def_td = 1;
    if (interception) {
      delta.def_int_td = 1;
      delta.int_ret_yd = extractReturnYards(description) || play.yards || 0;
      if (delta.int_ret_yd >= 50) delta.bonus_def_int_td_50p = 1;
    } else if (fumble) {
      delta.def_fum_td = 1;
      delta.fum_ret_yd = extractReturnYards(description) || play.yards || 0;
      if (delta.fum_ret_yd >= 50) delta.bonus_def_fum_td_50p = 1;
    }
  }

  return delta;
}

export function isTeamDefenseScoringPlay(play) {
  return Object.keys(buildTeamDefensePlayDelta(play)).length > 0;
}

export function extractYardsFromText(description) {
  const match = /(-?\d+)\s*(?:yard|yd)/i.exec(description);
  return match ? Number(match[1]) : 0;
}

export function extractReturnYards(description) {
  const match = /(?:returned|return)\s+(?:for\s+)?(-?\d+)\s*(?:yard|yd)/i.exec(description)
    ?? /(-?\d+)\s*(?:yard|yd)\s+(?:interception|fumble)?\s*return/i.exec(description);
  return match ? Number(match[1]) : 0;
}

function getPlayMechanism(play, role) {
  if (role === 'defense' || role === 'team_defense') return 'def';
  if (role === 'returner' || /kickoff|punt|punt.*return|return(?:ed)? for/i.test(`${play.type} ${play.description}`)) return 'return';
  if (role === 'passer' || role === 'receiver') return 'pass';
  if (role === 'rusher') return 'rush';
  return null;
}

export function getPlayEventClassification(play, role, position, statDelta = null) {
  const delta = statDelta ?? buildPlayStatDelta(play, role);
  const stat = (key) => Number(delta?.[key]) || 0;
  const mechanism = getPlayMechanism(play, role);
  const touchdown = stat('pass_td') + stat('rush_td') + stat('rec_td')
    + stat('ret_td') + stat('kr_td') + stat('pr_td')
    + stat('def_td') + stat('idp_def_td') + stat('idp_int_td')
    + stat('idp_fr_td') > 0;
  let kind = null;

  if (touchdown) kind = 'td';
  else if (role === 'kicker' && (stat('xpm') + stat('xpmiss')) > 0) kind = 'xp';
  else if (role === 'kicker') kind = 'fg';
  else if ((stat('pass_int') + stat('fum_lost')) > 0) kind = 'to';
  else if (mechanism) kind = mechanism;
  else if (position === 'K' || position === 'PK') kind = 'fg';
  else kind = 'rush';

  return {
    kind,
    mechanism: mechanism && mechanism !== kind ? mechanism : null,
  };
}

// Provider-derived play stats may carry optional bonus fields that the live box
// score does not expose, while a snapshot delta may carry several plays at once.
// Compare the core per-play counting stats so a one-play fallback can be
// rehydrated without requiring every provider-specific field to line up.
export const PLAY_MATCH_STATS = new Set([
  'pass_yd', 'pass_cmp', 'pass_att', 'pass_inc', 'pass_fd', 'pass_td', 'pass_int', 'pass_2pt',
  'rush_yd', 'rush_att', 'rush_fd', 'rush_td', 'rush_2pt',
  'rec', 'rec_yd', 'rec_fd', 'rec_td', 'rec_2pt',
  'kr_yd', 'kr_td', 'pr_yd', 'pr_td', 'ret_td',
  'fgm', 'fgmiss', 'xpm', 'xpmiss', 'fum_lost', 'fum_ret_td',
  'fgm_yds', 'fgm_yds_over_30', 'idp_tkl', 'idp_tkl_solo', 'idp_tkl_ast',
]);
