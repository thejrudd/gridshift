/**
 * playerMetrics.js
 *
 * Derives 2-3 headline metric badges from ESPN stats categories.
 * Each badge: { label, value, unit, color }
 *
 * ESPN stats responses nest data inside splits.categories[].stats[].
 * We build a flat { statName -> value } map first, then derive metrics.
 *
 * Confirmed ESPN Core API stat names (verified against live API):
 *   QB passing: completions, passingAttempts, passingYards, passingTouchdowns,
 *               interceptions, QBRating (NFL passer rating), completionPct,
 *               yardsPerPassAttempt, sacks, interceptionPct, yardsPerCompletion,
 *               sackYardsLost, passingBigPlays, passingFirstDowns,
 *               passingYardsAfterCatch, passingYardsAtCatch, longPassing,
 *               passingYardsPerGame, totalQBR (ESPN 0-100 QBR)
 *   QB rushing: rushingYards, rushingTouchdowns, rushingFirstDowns, longRushing,
 *               rushingYardsPerGame
 *   General: fumblesLost (total, all types)
 *   RB: rushingAttempts, yardsPerRushAttempt, rushingFirstDowns, rushing20PlusYds,
 *       longRushing, receivingYardsAfterCatch, receivingFirstDowns,
 *       yardsFromScrimmagePerGame, totalYardsFromScrimmage
 *   WR/TE: receivingYardsAfterCatch (NOT yardsAfterCatch), receiving20PlusYds,
 *          receivingFirstDowns, receivingYardsAtCatch, receivingYardsPerGame
 *   Defense: totalTackles, soloTackles, sacks, tacklesForLoss, QBHits (NOT QBHurries),
 *            hurries, passesDefended, sackYards, fumblesForced (in General, NOT forcedFumbles)
 *   Defensive Interceptions: interceptions, interceptionTouchdowns, interceptionYards,
 *                            longInterception
 *   K: fieldGoalsMade, fieldGoalAttempts, fieldGoalPct, longFieldGoalMade (NOT longFieldGoal),
 *      extraPointsMade, extraPointAttempts, extraPointPct, totalKickingPoints,
 *      fieldGoalsMade50, fieldGoalAttempts50, fieldGoalsMade50_59, longFieldGoalAttempt
 *   P: punts, puntYards, grossAvgPuntYards (NOT puntAverage), netAvgPuntYards (NOT netPuntAverage),
 *      puntsInside20, touchbacks, longPunt, puntsInside10, puntsBlocked, touchbackPct
 */

// Build a flat map of stat name -> value from ESPN splits response.
// ESPN returns the same stat name in multiple categories (e.g. "sacks" appears in
// both the Passing category for a QB [correct value] and the Defense category [0]).
// We keep the first non-zero value we encounter so later zero-valued entries
// from irrelevant categories don't clobber meaningful stats.
export function buildStatMap(statsJson) {
  const map = {};
  const categories = statsJson?.splits?.categories ?? [];
  for (const cat of categories) {
    for (const stat of (cat.stats ?? [])) {
      const val = stat.value ?? stat.displayValue ?? null;
      const existing = map[stat.name];
      // If we already have a non-zero value for this stat, don't overwrite it
      // with null or zero from a later (irrelevant) category.
      if (existing !== undefined && existing !== null && parseFloat(existing) !== 0) {
        if (val === null || val === undefined || parseFloat(val) === 0) continue;
      }
      map[stat.name] = val;
    }
  }
  return map;
}

// Build a flat map of stat name -> formatted rank string from ESPN splits response.
// ESPN includes rank and rankDisplayValue on stats where a ranking is available.
// Only stores the first rank seen for each stat name (same "prefer non-zero" principle).
export function buildRankMap(statsJson) {
  const map = {};
  const categories = statsJson?.splits?.categories ?? [];
  for (const cat of categories) {
    for (const stat of (cat.stats ?? [])) {
      if (stat.rank == null || map[stat.name] != null) continue;
      // Shorten "Tied-5th" → "T-5th" for compact display
      const label = stat.rankDisplayValue
        ? stat.rankDisplayValue.replace('Tied-', 'T-')
        : `${stat.rank}`;
      map[stat.name] = label;
    }
  }
  return map;
}

// Parse a numeric value, returning null if absent or non-numeric
function n(val) {
  if (val === null || val === undefined || val === '--') return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

function fmt(val, decimals = 1) {
  if (val === null) return '--';
  return Number(val).toFixed(decimals);
}

function pct(val) {
  if (val === null) return '--';
  return `${fmt(val, 1)}%`;
}

// Standard NFL passer rating formula (scale 0-158.3)
// Used as fallback when API does not return QBRating
function passerRating(stats) {
  const att  = n(stats.passingAttempts);
  const cmp  = n(stats.completions ?? stats.passingCompletions);
  const yds  = n(stats.passingYards);
  const td   = n(stats.passingTouchdowns);
  const int  = n(stats.interceptions);
  if (!att || att === 0) return null;

  const a = Math.max(0, Math.min(((cmp / att) - 0.3) * 5, 2.375));
  const b = Math.max(0, Math.min(((yds / att) - 3) * 0.25, 2.375));
  const c = Math.max(0, Math.min((td / att) * 20, 2.375));
  const d = Math.max(0, Math.min(2.375 - ((int / att) * 25), 2.375));
  return ((a + b + c + d) / 6) * 100;
}

// Map ESPN position abbreviation to a broad group
export function positionGroup(position) {
  const p = (position ?? '').toUpperCase();
  if (['QB'].includes(p))                         return 'QB';
  if (['RB', 'FB', 'HB'].includes(p))             return 'RB';
  if (['WR'].includes(p))                         return 'WR';
  if (['TE'].includes(p))                         return 'TE';
  if (['OT', 'OG', 'C', 'OL', 'G', 'T'].includes(p)) return 'OL';
  if (['DE', 'DT', 'NT', 'DL', 'ED'].includes(p)) return 'DL';
  if (['LB', 'ILB', 'OLB', 'MLB'].includes(p))   return 'LB';
  if (['CB', 'S', 'SS', 'FS', 'DB'].includes(p)) return 'DB';
  if (['K'].includes(p))                          return 'K';
  if (['P'].includes(p))                          return 'P';
  if (['LS'].includes(p))                         return 'LS';
  return 'OTHER';
}

/**
 * Derive headline metrics for a player given their stats map and position.
 * Returns [{ label, value, color }] with 2-3 entries.
 */
export function getMetrics(statsMap, position) {
  const group = positionGroup(position);
  const badges = [];

  const add = (label, value, color = 'text-blue-400') => {
    if (value !== '--' && value !== null) badges.push({ label, value, color });
  };

  switch (group) {
    case 'QB': {
      // QBRating in ESPN API = NFL passer rating (0–158.3 scale)
      const pr = n(statsMap.QBRating) ?? passerRating(statsMap);
      if (pr !== null) add('RTG', fmt(pr, 1), 'text-blue-400');

      const att = n(statsMap.passingAttempts);
      const cmp = n(statsMap.completions ?? statsMap.passingCompletions);
      if (att && cmp) add('CMP%', pct((cmp / att) * 100), 'text-green-400');

      const yds = n(statsMap.passingYards);
      if (yds !== null) add('PASS YDS', yds.toFixed(0), 'text-cyan-400');
      break;
    }

    case 'RB': {
      const car = n(statsMap.rushingAttempts);
      const ryds = n(statsMap.rushingYards);
      if (car && ryds && car > 0) add('YPC', fmt(ryds / car, 1), 'text-green-400');

      const scrimmage = (n(statsMap.rushingYards) ?? 0) + (n(statsMap.receivingYards) ?? 0);
      if (scrimmage > 0) add('SCR YDS', scrimmage.toFixed(0), 'text-blue-400');

      const td = n(statsMap.rushingTouchdowns ?? statsMap.totalTouchdowns);
      if (td !== null) add('TDs', td.toFixed(0), 'text-amber-400');
      break;
    }

    case 'WR':
    case 'TE': {
      const rec  = n(statsMap.receptions);
      const ryds = n(statsMap.receivingYards);
      if (rec && rec > 0 && ryds !== null) add('YPR', fmt(ryds / rec, 1), 'text-green-400');

      const tgt = n(statsMap.receivingTargets);
      if (tgt && rec) add('CTH%', pct((rec / tgt) * 100), 'text-blue-400');

      if (ryds !== null) add('REC YDS', ryds.toFixed(0), 'text-cyan-400');
      break;
    }

    case 'DL': {
      const sacks = n(statsMap.sacks);
      if (sacks !== null) add('SACKS', fmt(sacks, 1), 'text-red-400');

      const tfl = n(statsMap.tacklesForLoss);
      if (tfl !== null) add('TFL', fmt(tfl, 1), 'text-orange-400');

      // QBHits is the correct ESPN API stat name (not QBHurries)
      const qbh = n(statsMap.QBHits);
      if (qbh !== null) add('QB HITS', qbh.toFixed(0), 'text-amber-400');
      break;
    }

    case 'LB': {
      const tkl = n(statsMap.totalTackles ?? statsMap.tackles);
      if (tkl !== null) add('TCKLS', tkl.toFixed(0), 'text-blue-400');

      const sacks = n(statsMap.sacks);
      if (sacks !== null) add('SACKS', fmt(sacks, 1), 'text-red-400');

      const tfl = n(statsMap.tacklesForLoss);
      if (tfl !== null) add('TFL', fmt(tfl, 1), 'text-orange-400');
      break;
    }

    case 'DB': {
      const int = n(statsMap.interceptions);
      if (int !== null) add('INTs', int.toFixed(0), 'text-blue-400');

      const pd = n(statsMap.passesDefended);
      if (pd !== null) add('PD', pd.toFixed(0), 'text-cyan-400');

      const tkl = n(statsMap.totalTackles ?? statsMap.tackles);
      if (tkl !== null) add('TCKLS', tkl.toFixed(0), 'text-green-400');
      break;
    }

    case 'K': {
      const fgPct = n(statsMap.fieldGoalPct);
      if (fgPct !== null) add('FG%', pct(fgPct), 'text-blue-400');

      // longFieldGoalMade is the correct ESPN API stat name (not longFieldGoal)
      const long = n(statsMap.longFieldGoalMade);
      if (long !== null) add('LONG', `${long.toFixed(0)} yd`, 'text-cyan-400');

      const xpPct = n(statsMap.extraPointPct);
      if (xpPct !== null) add('XP%', pct(xpPct), 'text-green-400');
      break;
    }

    case 'P': {
      // grossAvgPuntYards is the correct ESPN API stat name (not puntAverage)
      const avg = n(statsMap.grossAvgPuntYards);
      if (avg !== null) add('AVG', `${fmt(avg, 1)} yd`, 'text-blue-400');

      // netAvgPuntYards is the correct ESPN API stat name (not netPuntAverage)
      const net = n(statsMap.netAvgPuntYards);
      if (net !== null) add('NET', `${fmt(net, 1)} yd`, 'text-cyan-400');

      const inside20 = n(statsMap.puntsInside20);
      if (inside20 !== null) add('IN 20', inside20.toFixed(0), 'text-green-400');
      break;
    }

    default:
      break;
  }

  return badges.slice(0, 3);
}

/**
 * Build display-ready stat sections for a given position group and stat map.
 * Returns { standard: [{heading, rows}], advanced: [{heading, rows}] }
 * Each row: { label, value, rank? }
 * rankMap is optional: { statName -> formatted rank string } from buildRankMap().
 */
export function getStatRows(statsMap, position, rankMap = {}) {
  const group = positionGroup(position);
  const standard = [];
  const advanced = [];

  // Creates a named section collector. Call push() to add rows, done() to finalize.
  // showRank=false suppresses rank badges for stats where ranking isn't meaningful.
  // pushVal() is for computed/derived values not directly in statsMap.
  function makeSection(heading) {
    const rows = [];
    const push = (label, key, decimals = 0, suffix = '', showRank = true) => {
      const val = n(statsMap[key]);
      if (val !== null) {
        const rank = showRank ? (rankMap[key] ?? null) : null;
        rows.push({ label, key, value: `${fmt(val, decimals)}${suffix}`, rank, decimals, suffix });
      }
    };
    const pushVal = (label, val, decimals = 0, suffix = '') => {
      if (val !== null && val !== undefined) {
        rows.push({ label, key: null, value: `${fmt(val, decimals)}${suffix}`, decimals, suffix });
      }
    };
    return { push, pushVal, done: () => rows.length > 0 ? { heading, rows } : null };
  }

  switch (group) {
    case 'QB': {
      const passing = makeSection('Passing');
      passing.push('Comp',     'completions');
      passing.push('Att',      'passingAttempts');
      passing.push('Cmp%',     'completionPct',          1, '%');
      passing.push('Pass Yds', 'passingYards');
      passing.push('Y/A',      'yardsPerPassAttempt',    1);
      passing.push('TDs',      'passingTouchdowns');
      passing.push('Rating',   'QBRating',               1);
      passing.push('Yds/Cmp',  'yardsPerCompletion',     1);

      const rushing = makeSection('Rushing');
      rushing.push('Rush Yds', 'rushingYards');
      rushing.push('Rush TDs', 'rushingTouchdowns');

      const negPlays = makeSection('Negative Plays');
      negPlays.push('INTs',         'interceptions');
      negPlays.push('INT%',         'interceptionPct',    2, '%');
      negPlays.push('Sacks Taken',  'sacks');
      negPlays.push('Fum Lost',     'fumblesLost');

      standard.push(...[passing.done(), rushing.done(), negPlays.done()].filter(Boolean));

      const advPassing = makeSection('Advanced Passing');
      advPassing.push('QBR',            'totalQBR',              1);
      advPassing.push('Net Y/A',        'netYardsPerPassAttempt', 1);
      advPassing.push('Sack Yds Taken', 'sackYardsLost');
      advPassing.push('Big Plays',      'passingBigPlays');
      advPassing.push('Pass 1D',        'passingFirstDowns');
      advPassing.push('Pass YAC',       'passingYardsAfterCatch');
      advPassing.push('Pass YAT',       'passingYardsAtCatch');
      advPassing.push('Long',           'longPassing',           0, ' yd');
      advPassing.push('Pass Y/G',       'passingYardsPerGame',   1);
      const tdIntRatio = (() => {
        const tds  = n(statsMap.passingTouchdowns);
        const ints = n(statsMap.interceptions);
        return tds !== null && ints !== null && ints > 0 ? tds / ints : null;
      })();
      advPassing.pushVal('TD/INT', tdIntRatio, 2);

      const advRushing = makeSection('Advanced Rushing');
      advRushing.push('Rush 1D',  'rushingFirstDowns');
      advRushing.push('Long',     'longRushing',             0, ' yd');
      advRushing.push('Rush Y/G', 'rushingYardsPerGame',     1);

      advanced.push(...[advPassing.done(), advRushing.done()].filter(Boolean));
      break;
    }

    case 'RB': {
      const rushing = makeSection('Rushing');
      rushing.push('Carries',  'rushingAttempts');
      rushing.push('Rush Yds', 'rushingYards');
      rushing.push('Yds/Car',  'yardsPerRushAttempt',    1);
      rushing.push('Rush TDs', 'rushingTouchdowns');

      const receiving = makeSection('Receiving');
      receiving.push('Rec',      'receptions');
      receiving.push('Rec Yds',  'receivingYards');
      receiving.push('Rec TDs',  'receivingTouchdowns');
      receiving.push('Fum',      'fumbles');

      standard.push(...[rushing.done(), receiving.done()].filter(Boolean));

      const advRush = makeSection('Advanced Rushing');
      advRush.push('Rush 1D',  'rushingFirstDowns');
      advRush.push('20+ Runs', 'rushing20PlusYds');
      advRush.push('Long',     'longRushing',             0, ' yd');

      const advRec = makeSection('Advanced Receiving');
      advRec.push('Rec 1D',    'receivingFirstDowns');
      advRec.push('YAC',       'receivingYardsAfterCatch');
      advRec.push('YFS/G',     'yardsFromScrimmagePerGame', 1);
      advRec.push('Scrim Yds', 'totalYardsFromScrimmage');

      advanced.push(...[advRush.done(), advRec.done()].filter(Boolean));
      break;
    }

    case 'WR':
    case 'TE': {
      const receiving = makeSection('Receiving');
      receiving.push('Targets', 'receivingTargets');
      receiving.push('Rec',     'receptions');
      receiving.push('Rec Yds', 'receivingYards');
      receiving.push('Yds/Rec', 'yardsPerReception',      1);
      receiving.push('TDs',     'receivingTouchdowns');
      receiving.push('Long',    'longReception',           0, ' yd');
      receiving.push('YAC',     'receivingYardsAfterCatch', 1); // confirmed API name
      receiving.push('Fum',     'fumbles');

      standard.push(...[receiving.done()].filter(Boolean));

      const adv = makeSection('Advanced');
      adv.push('20+ Rec',  'receiving20PlusYds');
      adv.push('Rec 1D',   'receivingFirstDowns');
      adv.push('YAT',      'receivingYardsAtCatch');
      adv.push('Rec Y/G',  'receivingYardsPerGame',       1);

      advanced.push(...[adv.done()].filter(Boolean));
      break;
    }

    case 'DL': {
      const tackling = makeSection('Tackling');
      tackling.push('Tackles', 'totalTackles');
      tackling.push('Solo',    'soloTackles');
      tackling.push('TFL',     'tacklesForLoss',           1);

      const passRush = makeSection('Pass Rush');
      passRush.push('Sacks',   'sacks',                    1);
      passRush.push('QB Hits', 'QBHits');                   // confirmed: not QBHurries
      passRush.push('FF',      'fumblesForced');             // confirmed: in General category
      passRush.push('PD',      'passesDefended');

      standard.push(...[tackling.done(), passRush.done()].filter(Boolean));

      const adv = makeSection('Advanced');
      adv.push('Hurries',  'hurries');
      adv.push('Sack Yds', 'sackYards',                    1);
      adv.push('INTs',     'interceptions');
      adv.push('INT Yds',  'interceptionYards');

      advanced.push(...[adv.done()].filter(Boolean));
      break;
    }

    case 'LB': {
      const tackling = makeSection('Tackling');
      tackling.push('Tackles', 'totalTackles');
      tackling.push('Solo',    'soloTackles');
      tackling.push('TFL',     'tacklesForLoss',           1);

      const passRush = makeSection('Pass Rush');
      passRush.push('Sacks',   'sacks',                    1);
      passRush.push('FF',      'fumblesForced');

      const coverage = makeSection('Coverage');
      coverage.push('INTs',    'interceptions');
      coverage.push('PD',      'passesDefended');

      standard.push(...[tackling.done(), passRush.done(), coverage.done()].filter(Boolean));

      const adv = makeSection('Advanced');
      adv.push('QB Hits',  'QBHits');
      adv.push('Hurries',  'hurries');
      adv.push('Sack Yds', 'sackYards',                    1);
      adv.push('INT TDs',  'interceptionTouchdowns');
      adv.push('INT Yds',  'interceptionYards');

      advanced.push(...[adv.done()].filter(Boolean));
      break;
    }

    case 'DB': {
      const tackling = makeSection('Tackling');
      tackling.push('Tackles', 'totalTackles');
      tackling.push('Solo',    'soloTackles');
      tackling.push('TFL',     'tacklesForLoss',           1);

      const coverage = makeSection('Coverage');
      coverage.push('INTs',    'interceptions');
      coverage.push('PD',      'passesDefended');
      coverage.push('FF',      'fumblesForced');
      coverage.push('Sacks',   'sacks',                    1);

      standard.push(...[tackling.done(), coverage.done()].filter(Boolean));

      const adv = makeSection('Advanced');
      adv.push('INT TDs',  'interceptionTouchdowns');
      adv.push('INT Yds',  'interceptionYards');
      adv.push('Long INT', 'longInterception',             0, ' yd');

      advanced.push(...[adv.done()].filter(Boolean));
      break;
    }

    case 'K': {
      const fg = makeSection('Field Goals');
      fg.push('FGM',   'fieldGoalsMade');
      fg.push('FGA',   'fieldGoalAttempts');
      fg.push('FG%',   'fieldGoalPct',                    1, '%');
      fg.push('Long',  'longFieldGoalMade',               0, ' yd'); // confirmed: not longFieldGoal

      const xp = makeSection('Extra Points');
      xp.push('XPM',   'extraPointsMade');
      xp.push('XPA',   'extraPointAttempts');
      xp.push('XP%',   'extraPointPct',                   1, '%');

      standard.push(...[fg.done(), xp.done()].filter(Boolean));

      const adv = makeSection('Advanced');
      adv.push('Total Pts', 'totalKickingPoints');
      adv.push('FG 50+',    'fieldGoalsMade50');
      adv.push('50+ Att',   'fieldGoalAttempts50');
      adv.push('FG 50-59',  'fieldGoalsMade50_59');
      adv.push('Long Att',  'longFieldGoalAttempt',       0, ' yd');

      advanced.push(...[adv.done()].filter(Boolean));
      break;
    }

    case 'P': {
      const punting = makeSection('Punting');
      punting.push('Punts',    'punts');
      punting.push('Punt Yds', 'puntYards');
      punting.push('Punt Avg', 'grossAvgPuntYards',       1, ' yd'); // confirmed: not puntAverage
      punting.push('Net Avg',  'netAvgPuntYards',         1, ' yd'); // confirmed: not netPuntAverage
      punting.push('In 20',    'puntsInside20');
      punting.push('TB',       'touchbacks');
      punting.push('Long',     'longPunt',                0, ' yd');

      standard.push(...[punting.done()].filter(Boolean));

      const adv = makeSection('Advanced');
      adv.push('In 10',    'puntsInside10');
      adv.push('Blocked',  'puntsBlocked');
      adv.push('TB%',      'touchbackPct',               1, '%');
      adv.push('In 10%',   'puntsInside10Pct',           1, '%');
      adv.push('In 20%',   'puntsInside20Pct',           1, '%');

      advanced.push(...[adv.done()].filter(Boolean));
      break;
    }

    default: {
      const general = makeSection('General');
      general.push('Games', 'gamesPlayed',               0, '',    false);
      standard.push(...[general.done()].filter(Boolean));
      break;
    }
  }

  return { standard, advanced };
}

/**
 * Get the columns to show in the game-by-game log table for a position.
 * Returns { standard: [...], advanced: [...] } — advanced columns shown when toggle is on.
 * Each entry: { label, key, decimals?, suffix? }
 */
export function getGameLogColumns(position) {
  const group = positionGroup(position);
  switch (group) {
    case 'QB':
      return {
        standard: [
          { label: 'Att',  key: 'passingAttempts' },
          { label: 'Cmp',  key: 'completions' },
          { label: 'PASS', key: 'passingYards' },
          { label: 'RUSH', key: 'rushingYards' },
          { label: 'TD',   key: 'passingTouchdowns' },
          { label: 'INT',  key: 'interceptions' },
          { label: 'RTG',  key: 'QBRating', decimals: 1 },
        ],
        advanced: [
          { label: 'CMP%', key: 'completionPct', decimals: 1, suffix: '%' },
          { label: 'Sck',  key: 'sacks' },
          { label: 'FUM',  key: 'fumbles' },
        ],
      };
    case 'RB':
      return {
        standard: [
          { label: 'Car',  key: 'rushingAttempts' },
          { label: 'Rec',  key: 'receptions' },
          { label: 'RUSH', key: 'rushingYards' },
          { label: 'REC',  key: 'receivingYards' },
          { label: 'TD',   key: 'rushingTouchdowns' },
          { label: 'FUM',  key: 'fumbles' },
        ],
        advanced: [
          { label: 'YPC',  key: 'yardsPerRushAttempt', decimals: 1 },
          { label: 'YAC',  key: 'receivingYardsAfterCatch', decimals: 1 },
        ],
      };
    case 'WR':
    case 'TE':
      return {
        standard: [
          { label: 'Tgt',  key: 'receivingTargets' },
          { label: 'Rec',  key: 'receptions' },
          { label: 'REC',  key: 'receivingYards' },
          { label: 'TD',   key: 'receivingTouchdowns' },
          { label: 'FUM',  key: 'fumbles' },
        ],
        advanced: [
          { label: 'YPR',  key: 'yardsPerReception', decimals: 1 },
          { label: 'YAC',  key: 'receivingYardsAfterCatch', decimals: 1 },
        ],
      };
    case 'DL':
    case 'LB':
      return {
        standard: [
          { label: 'Tkl',   key: 'totalTackles' },
          { label: 'Sacks', key: 'sacks', decimals: 1 },
          { label: 'TFL',   key: 'tacklesForLoss', decimals: 1 },
        ],
        advanced: [
          { label: 'Solo',    key: 'soloTackles' },
          { label: 'QB Hits', key: 'QBHits' },
          { label: 'FF',      key: 'fumblesForced' },
        ],
      };
    case 'DB':
      return {
        standard: [
          { label: 'Tkl',  key: 'totalTackles' },
          { label: 'INT',  key: 'interceptions' },
          { label: 'PD',   key: 'passesDefended' },
        ],
        advanced: [
          { label: 'Solo', key: 'soloTackles' },
          { label: 'TFL',  key: 'tacklesForLoss', decimals: 1 },
          { label: 'FF',   key: 'fumblesForced' },
        ],
      };
    case 'K':
      return {
        standard: [
          { label: 'FGM', key: 'fieldGoalsMade' },
          { label: 'FGA', key: 'fieldGoalAttempts' },
          { label: 'Lng', key: 'longFieldGoalMade', suffix: ' yd' }, // confirmed API name
          { label: 'XPM', key: 'extraPointsMade' },
          { label: 'XPA', key: 'extraPointAttempts' },
        ],
        advanced: [],
      };
    case 'P':
      return {
        standard: [
          { label: 'Punts', key: 'punts' },
          { label: 'Avg',   key: 'grossAvgPuntYards', decimals: 1 }, // confirmed API name
          { label: 'Net',   key: 'netAvgPuntYards', decimals: 1 },   // confirmed API name
          { label: 'In20',  key: 'puntsInside20' },
        ],
        advanced: [
          { label: 'PntYds', key: 'puntYards' },
          { label: 'Lng',    key: 'longPunt', suffix: ' yd' },
        ],
      };
    default:
      return { standard: [{ label: 'Games', key: 'gamesPlayed' }], advanced: [] };
  }
}

/**
 * Get career highlight stats for the player profile hero card.
 * Returns [{ label, value }] — key career totals formatted for display.
 */
export function getCareerHighlights(statsMap, position) {
  const group = positionGroup(position);
  const items = [];

  const add = (label, key, decimals = 0, suffix = '', color = 'text-blue-400') => {
    const val = n(statsMap[key]);
    if (val === null) return;
    // Auto-format large integers with commas (e.g. 64,213 passing yards)
    const formatted = (decimals === 0 && Math.abs(val) >= 1000)
      ? Math.round(val).toLocaleString('en-US')
      : Number(val).toFixed(decimals);
    items.push({ label, value: `${formatted}${suffix}`, color });
  };

  switch (group) {
    case 'QB':
      add('Pass Yds',  'passingYards',         0, '',      'text-cyan-400');
      add('TDs',       'passingTouchdowns',     0, '',      'text-amber-400');
      add('INTs',      'interceptions',         0, '',      'text-red-400');
      add('Rating',    'QBRating',              1, '',      'text-blue-400');
      add('Rush Yds',  'rushingYards',          0, '',      'text-green-400');
      add('Rush TDs',  'rushingTouchdowns',     0, '',      'text-orange-400');
      break;
    case 'RB':
      add('Rush Yds',  'rushingYards',          0, '',      'text-blue-400');
      add('Rush TDs',  'rushingTouchdowns',     0, '',      'text-amber-400');
      add('Yds/Car',   'yardsPerRushAttempt',   1, '',      'text-green-400');
      add('Rec',       'receptions',            0, '',      'text-cyan-400');
      add('Rec Yds',   'receivingYards',        0, '',      'text-violet-400');
      add('Rec TDs',   'receivingTouchdowns',   0, '',      'text-orange-400');
      break;
    case 'WR':
    case 'TE':
      add('Rec',       'receptions',            0, '',      'text-blue-400');
      add('Rec Yds',   'receivingYards',        0, '',      'text-cyan-400');
      add('Rec TDs',   'receivingTouchdowns',   0, '',      'text-amber-400');
      add('Yds/Rec',   'yardsPerReception',     1, '',      'text-green-400');
      break;
    case 'DL':
      add('Sacks',     'sacks',                 1, '',      'text-red-400');
      add('Tackles',   'totalTackles',          0, '',      'text-blue-400');
      add('TFL',       'tacklesForLoss',        1, '',      'text-orange-400');
      add('FF',        'fumblesForced',         0, '',      'text-amber-400');
      break;
    case 'LB':
      add('Tackles',   'totalTackles',          0, '',      'text-blue-400');
      add('Sacks',     'sacks',                 1, '',      'text-red-400');
      add('INTs',      'interceptions',         0, '',      'text-cyan-400');
      add('TFL',       'tacklesForLoss',        1, '',      'text-orange-400');
      break;
    case 'DB':
      add('INTs',      'interceptions',         0, '',      'text-blue-400');
      add('PD',        'passesDefended',        0, '',      'text-cyan-400');
      add('Tackles',   'totalTackles',          0, '',      'text-green-400');
      break;
    case 'K':
      add('FGM',       'fieldGoalsMade',        0, '',      'text-green-400');
      add('FGA',       'fieldGoalAttempts',     0, '',      'text-blue-400');
      add('FG%',       'fieldGoalPct',          1, '%',     'text-cyan-400');
      add('Long',      'longFieldGoalMade',     0, ' yd',   'text-amber-400');
      break;
    case 'P':
      add('Punts',     'punts',                 0, '',      'text-blue-400');
      add('Avg',       'grossAvgPuntYards',     1, ' yd',   'text-cyan-400');
      add('Net Avg',   'netAvgPuntYards',       1, ' yd',   'text-green-400');
      add('In 20',     'puntsInside20',         0, '',      'text-amber-400');
      break;
    default:
      break;
  }

  return items;
}
