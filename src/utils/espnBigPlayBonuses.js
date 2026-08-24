const SCORING_PLAY_DERIVED_KEYS = [
  'bonus_pass_td_40p',
  'bonus_pass_td_50p',
  'bonus_rush_td_40p',
  'bonus_rush_td_50p',
  'bonus_rec_td_40p',
  'bonus_rec_td_50p',
  'pass_2pt',
  'rush_2pt',
  'rec_2pt',
];

function normalizeName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getPlayerName(player) {
  return player?.full_name
    ?? player?.fullName
    ?? player?.displayName
    ?? [player?.first_name, player?.last_name].filter(Boolean).join(' ');
}

function buildPlayerNameMap(players = {}) {
  const byName = new Map();
  for (const [playerId, player] of Object.entries(players ?? {})) {
    const normalized = normalizeName(getPlayerName(player));
    if (!normalized || byName.has(normalized)) continue;
    byName.set(normalized, playerId);
  }
  return byName;
}

function addBonus(target, playerId, key) {
  if (!playerId || !key) return;
  target[playerId] ??= {};
  target[playerId][key] = (target[playerId][key] ?? 0) + 1;
}

function hasAppliedFantasyFields(row) {
  return row?._fantasyPoints != null
    || row?.fantasy_points != null
    || row?.appliedTotal != null
    || row?._fantasyContributions != null
    || row?._espnAppliedStats != null;
}

function clearAppliedFantasyFields(row) {
  delete row._fantasyPoints;
  delete row.fantasy_points;
  delete row.appliedTotal;
  delete row._fantasyContributions;
  delete row._espnAppliedStats;
}

function getPlayText(play) {
  return String(play?.text ?? play?.displayText ?? '');
}

function isTouchdownPlay(play, text) {
  const type = String(play?.type?.text ?? play?.type?.name ?? '').toLowerCase();
  return type.includes('touchdown') || /\btd\b/i.test(text) || /touchdown/i.test(text) || /two-point conversion/i.test(text);
}

function extractPassTouchdown(text) {
  const match = text.match(/^(.+?)\s+(\d+)\s+Yd\s+pass from\s+(.+?)(?:\s+\(|$)/i);
  if (!match) return null;
  return {
    receiverName: match[1],
    yards: Number(match[2]),
    passerName: match[3],
  };
}

function extractRushTouchdown(text) {
  const match = text.match(/^(.+?)\s+(\d+)\s+Yd\s+(?:run|rush)(?:\s+\(|$)/i);
  if (!match) return null;
  return {
    rusherName: match[1],
    yards: Number(match[2]),
  };
}

function extractTwoPointConversion(text) {
  if (!/two-point conversion/i.test(text) || /failed/i.test(text)) return null;

  const passMatch = text.match(/\(([^()]+?)\s+Pass to\s+([^()]+?)\s+for Two-Point Conversion\)/i)
    ?? text.match(/^(.+?)\s+Pass to\s+(.+?)\s+for Two-Point Conversion$/i);
  if (passMatch) {
    return {
      type: 'pass',
      passerName: passMatch[1],
      receiverName: passMatch[2],
    };
  }

  const rushMatch = text.match(/\(([^()]+?)\s+(?:Run|Rush)\s+for Two-Point Conversion\)/i)
    ?? text.match(/^(.+?)\s+(?:Run|Rush)\s+for Two-Point Conversion$/i);
  if (rushMatch) {
    return {
      type: 'rush',
      rusherName: rushMatch[1],
    };
  }

  return null;
}

export function hasEspnBigPlayTouchdownScoring(scoringSettings) {
  const settingsGroups = [
    scoringSettings?.settings ?? scoringSettings ?? {},
    ...Object.values(scoringSettings?.positionOverrides ?? {}),
  ];
  return settingsGroups.some((settings) => (
    SCORING_PLAY_DERIVED_KEYS.some((key) => Math.abs(Number(settings?.[key] ?? 0)) > 0)
  ));
}

export function getEspnScoringPlayBigPlayBonuses(scoringPlays = [], players = {}) {
  const byName = buildPlayerNameMap(players);
  const bonuses = {};

  for (const play of scoringPlays ?? []) {
    const text = getPlayText(play);
    if (!text || !isTouchdownPlay(play, text)) continue;

    const passing = extractPassTouchdown(text);
    if (passing && Number.isFinite(passing.yards)) {
      const passerId = byName.get(normalizeName(passing.passerName));
      const receiverId = byName.get(normalizeName(passing.receiverName));
      if (passing.yards >= 40) {
        addBonus(bonuses, passerId, 'pass_td_40p');
        addBonus(bonuses, receiverId, 'rec_td_40p');
      }
      if (passing.yards >= 50) {
        addBonus(bonuses, passerId, 'pass_td_50p');
        addBonus(bonuses, receiverId, 'rec_td_50p');
      }
    } else {
      const rushing = extractRushTouchdown(text);
      if (rushing && Number.isFinite(rushing.yards)) {
        const rusherId = byName.get(normalizeName(rushing.rusherName));
        if (rushing.yards >= 40) addBonus(bonuses, rusherId, 'rush_td_40p');
        if (rushing.yards >= 50) addBonus(bonuses, rusherId, 'rush_td_50p');
      }
    }

    const conversion = extractTwoPointConversion(text);
    if (conversion?.type === 'pass') {
      addBonus(bonuses, byName.get(normalizeName(conversion.passerName)), 'pass_2pt');
      addBonus(bonuses, byName.get(normalizeName(conversion.receiverName)), 'rec_2pt');
    } else if (conversion?.type === 'rush') {
      addBonus(bonuses, byName.get(normalizeName(conversion.rusherName)), 'rush_2pt');
    }
  }

  return bonuses;
}

export function applyEspnBigPlayBonusesToWeeklyStats(weeklyStats = {}, week, bonusesByPlayerId = {}) {
  if (!week || !Object.keys(bonusesByPlayerId ?? {}).length) return weeklyStats;
  let changed = false;
  const next = { ...weeklyStats };

  for (const [playerId, bonuses] of Object.entries(bonusesByPlayerId ?? {})) {
    const rows = weeklyStats?.[playerId];
    if (!Array.isArray(rows)) continue;
    const rowIndex = rows.findIndex((row) => Number(row?.week) === Number(week));
    if (rowIndex === -1) continue;

    const row = rows[rowIndex];
    const updatedRow = { ...row };
    let rowChanged = false;
    let hasRelevantBonus = false;
    for (const [key, value] of Object.entries(bonuses)) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) continue;
      if (Number(updatedRow[key] ?? 0) >= numeric) {
        hasRelevantBonus = true;
        continue;
      }
      updatedRow[key] = numeric;
      hasRelevantBonus = true;
      rowChanged = true;
    }

    if (!rowChanged && !(hasRelevantBonus && hasAppliedFantasyFields(updatedRow))) continue;
    clearAppliedFantasyFields(updatedRow);
    updatedRow._espnScoringPlayEnriched = true;
    const updatedRows = [...rows];
    updatedRows[rowIndex] = updatedRow;
    next[playerId] = updatedRows;
    changed = true;
  }

  return changed ? next : weeklyStats;
}
