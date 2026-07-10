// liveScoringFeed.js — GridShift Live data helpers.
// Maps BALLDONTLIE live rows onto GridShift scoring keys, tracks per-player
// snapshot deltas as feed events, and formats stat lines / game glances for
// the Companion Live tab.

const TEAM_ALIASES = {
  ARI: 'ARI',
  ATL: 'ATL',
  BAL: 'BAL',
  BUF: 'BUF',
  CAR: 'CAR',
  CHI: 'CHI',
  CIN: 'CIN',
  CLE: 'CLE',
  DAL: 'DAL',
  DEN: 'DEN',
  DET: 'DET',
  GB: 'GB',
  GNB: 'GB',
  HOU: 'HOU',
  IND: 'IND',
  JAC: 'JAX',
  JAX: 'JAX',
  KC: 'KC',
  KAN: 'KC',
  LV: 'LV',
  LVR: 'LV',
  LAC: 'LAC',
  LA: 'LAR',
  LAR: 'LAR',
  MIA: 'MIA',
  MIN: 'MIN',
  NE: 'NE',
  NEP: 'NE',
  NO: 'NO',
  NOR: 'NO',
  NYG: 'NYG',
  NYJ: 'NYJ',
  PHI: 'PHI',
  PIT: 'PIT',
  SEA: 'SEA',
  SF: 'SF',
  SFO: 'SF',
  TB: 'TB',
  TAM: 'TB',
  TEN: 'TEN',
  WAS: 'WAS',
  WSH: 'WAS',
};

export function getTeamAbbr(team) {
  const raw = String(team?.abbreviation ?? team ?? '').trim().toUpperCase();
  return TEAM_ALIASES[raw] ?? raw;
}

export function normalizeName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function getSleeperPlayerName(player) {
  return player?.full_name || [player?.first_name, player?.last_name].filter(Boolean).join(' ') || 'Unknown Player';
}

function getBdlPlayerName(row) {
  const player = row?.player ?? {};
  return [player.first_name, player.last_name].filter(Boolean).join(' ') || player.full_name || '';
}

export function getStatKeyForSleeperPlayer(player) {
  return `${normalizeName(getSleeperPlayerName(player))}|${getTeamAbbr(player?.team)}`;
}

function getStatKeyForBdlRow(row) {
  return `${normalizeName(getBdlPlayerName(row))}|${getTeamAbbr(row?.team ?? row?.player?.team)}`;
}

export function buildStatIndex(statsByGame) {
  const index = new Map();
  Object.entries(statsByGame ?? {}).forEach(([gameId, rows]) => {
    (rows ?? []).forEach((row) => {
      const key = getStatKeyForBdlRow(row);
      if (key !== '|') index.set(key, { ...row, gameId });
    });
  });
  return index;
}

export function mapBdlStatsToGridShift(row) {
  return {
    pass_yd: row?.passing_yards ?? 0,
    pass_td: row?.passing_touchdowns ?? 0,
    pass_int: row?.passing_interceptions ?? 0,
    pass_cmp: row?.passing_completions ?? 0,
    pass_att: row?.passing_attempts ?? 0,
    pass_sack: row?.sacks ?? 0,
    rush_att: row?.rushing_attempts ?? 0,
    rush_yd: row?.rushing_yards ?? 0,
    rush_td: row?.rushing_touchdowns ?? 0,
    rec: row?.receptions ?? 0,
    rec_yd: row?.receiving_yards ?? 0,
    rec_td: row?.receiving_touchdowns ?? 0,
    fum: row?.fumbles ?? 0,
    fum_lost: row?.fumbles_lost ?? 0,
    fum_rec: row?.fumbles_recovered ?? 0,
    fum_ret_td: row?.fumbles_touchdowns ?? 0,
    kr_yd: row?.kick_return_yards ?? 0,
    pr_yd: row?.punt_return_yards ?? 0,
    kr_td: row?.kick_return_touchdowns ?? 0,
    pr_td: row?.punt_return_touchdowns ?? 0,
    ret_td: (row?.kick_return_touchdowns ?? 0) + (row?.punt_return_touchdowns ?? 0),
    fgm: row?.field_goals_made ?? 0,
    xpm: row?.extra_points_made ?? 0,
    idp_tkl: row?.total_tackles ?? 0,
    idp_tkl_solo: row?.solo_tackles ?? 0,
    idp_tkl_loss: row?.tackles_for_loss ?? 0,
    idp_pd: row?.passes_defended ?? 0,
    idp_qbhit: row?.qb_hits ?? 0,
    idp_sack: row?.defensive_sacks ?? 0,
    idp_int: row?.defensive_interceptions ?? 0,
    idp_int_ret_yd: row?.interception_yards ?? 0,
    idp_int_td: row?.interception_touchdowns ?? 0,
    idp_fr: row?.fumbles_recovered ?? 0,
    idp_fr_td: row?.fumbles_touchdowns ?? 0,
    idp_def_td: (row?.interception_touchdowns ?? 0) + (row?.fumbles_touchdowns ?? 0),
  };
}

// ── Game glance ──────────────────────────────────────────────────────────

export function getGameStatusText(game) {
  const raw = String(game?.status ?? '').trim();
  return raw || 'Scheduled';
}

export function isLiveGame(game) {
  const status = getGameStatusText(game).toLowerCase();
  return status.includes('progress') || status.includes('quarter') || status.includes('half') || status.includes('live');
}

export function isFinalGame(game) {
  const status = getGameStatusText(game).toLowerCase();
  return status.includes('final') || status.includes('complete');
}

export function findGameForTeam(games, teamAbbr) {
  if (!teamAbbr) return null;
  return (games ?? []).find((game) => (
    getTeamAbbr(game?.visitor_team) === teamAbbr || getTeamAbbr(game?.home_team) === teamAbbr
  )) ?? null;
}

export function getGameGlance(game) {
  if (!game) return null;
  const away = getTeamAbbr(game.visitor_team);
  const home = getTeamAbbr(game.home_team);
  const live = isLiveGame(game);
  const period = Number(game.period);
  const timeLeft = String(game.time ?? '').trim();
  let clock = getGameStatusText(game);
  if (live && Number.isFinite(period) && period > 0) {
    clock = `Q${period}${timeLeft ? ` ${timeLeft}` : ''}`;
  } else if (isFinalGame(game)) {
    clock = 'Final';
  }
  return {
    score: `${away} ${game.visitor_team_score ?? 0} · ${home} ${game.home_team_score ?? 0}`,
    clock,
    live,
  };
}

// ── Stat lines and box scores ────────────────────────────────────────────

function n(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function summarizeStatLine(stats, position) {
  if (!stats) return null;
  const pos = String(position ?? '').toUpperCase();
  const parts = [];
  if (pos === 'QB') {
    parts.push(`${n(stats.pass_cmp)}/${n(stats.pass_att)}, ${n(stats.pass_yd)} pass yds`);
    if (n(stats.pass_td)) parts.push(`${n(stats.pass_td)} TD`);
    if (n(stats.pass_int)) parts.push(`${n(stats.pass_int)} INT`);
    if (n(stats.rush_yd)) parts.push(`${n(stats.rush_yd)} rush yds`);
  } else if (pos === 'K') {
    parts.push(`${n(stats.fgm)} FG, ${n(stats.xpm)} XP`);
  } else if (pos === 'RB') {
    parts.push(`${n(stats.rush_att)} att, ${n(stats.rush_yd)} rush yds`);
    if (n(stats.rec)) parts.push(`${n(stats.rec)} rec, ${n(stats.rec_yd)} yds`);
    const tds = n(stats.rush_td) + n(stats.rec_td);
    if (tds) parts.push(`${tds} TD`);
  } else if (['WR', 'TE'].includes(pos)) {
    parts.push(`${n(stats.rec)} rec, ${n(stats.rec_yd)} yds`);
    if (n(stats.rec_td)) parts.push(`${n(stats.rec_td)} TD`);
    if (n(stats.rush_yd)) parts.push(`${n(stats.rush_yd)} rush yds`);
  } else {
    if (n(stats.idp_tkl)) parts.push(`${n(stats.idp_tkl)} tkl`);
    if (n(stats.idp_sack)) parts.push(`${n(stats.idp_sack)} sack`);
    if (n(stats.idp_int)) parts.push(`${n(stats.idp_int)} INT`);
    if (n(stats.idp_pd)) parts.push(`${n(stats.idp_pd)} PD`);
    if (!parts.length && n(stats.rec)) parts.push(`${n(stats.rec)} rec, ${n(stats.rec_yd)} yds`);
  }
  return parts.length ? parts.join(' · ') : null;
}

export function buildPositionBoxScore(stats, position) {
  if (!stats) return [];
  const pos = String(position ?? '').toUpperCase();
  if (pos === 'QB') {
    return [
      ['CMP/ATT', `${n(stats.pass_cmp)}/${n(stats.pass_att)}`],
      ['PASS YDS', n(stats.pass_yd)],
      ['PASS TD', n(stats.pass_td)],
      ['INT', n(stats.pass_int)],
      ['SACKED', n(stats.pass_sack)],
      ['RUSH YDS', n(stats.rush_yd)],
      ['RUSH TD', n(stats.rush_td)],
      ['FUM LOST', n(stats.fum_lost)],
    ];
  }
  if (pos === 'K') {
    return [
      ['FG MADE', n(stats.fgm)],
      ['XP MADE', n(stats.xpm)],
    ];
  }
  if (pos === 'RB') {
    return [
      ['CARRIES', n(stats.rush_att)],
      ['RUSH YDS', n(stats.rush_yd)],
      ['RUSH TD', n(stats.rush_td)],
      ['REC', n(stats.rec)],
      ['REC YDS', n(stats.rec_yd)],
      ['REC TD', n(stats.rec_td)],
      ['FUM LOST', n(stats.fum_lost)],
      ['RET YDS', n(stats.kr_yd) + n(stats.pr_yd)],
    ];
  }
  if (['WR', 'TE'].includes(pos)) {
    return [
      ['REC', n(stats.rec)],
      ['REC YDS', n(stats.rec_yd)],
      ['REC TD', n(stats.rec_td)],
      ['RUSH YDS', n(stats.rush_yd)],
      ['FUM LOST', n(stats.fum_lost)],
      ['RET YDS', n(stats.kr_yd) + n(stats.pr_yd)],
    ];
  }
  return [
    ['TACKLES', n(stats.idp_tkl)],
    ['SOLO', n(stats.idp_tkl_solo)],
    ['SACKS', n(stats.idp_sack)],
    ['TFL', n(stats.idp_tkl_loss)],
    ['INT', n(stats.idp_int)],
    ['PD', n(stats.idp_pd)],
    ['QB HITS', n(stats.idp_qbhit)],
    ['FUM REC', n(stats.idp_fr)],
  ];
}

// ── Feed events from snapshot deltas ─────────────────────────────────────

const DELTA_DESCRIPTIONS = [
  { key: 'pass_td', label: (v) => `${v > 1 ? `${v} passing TDs` : 'Passing TD'}` },
  { key: 'rush_td', label: (v) => `${v > 1 ? `${v} rushing TDs` : 'Rushing TD'}` },
  { key: 'rec_td', label: (v) => `${v > 1 ? `${v} receiving TDs` : 'Receiving TD'}` },
  { key: 'ret_td', label: () => 'Return TD' },
  { key: 'fum_ret_td', label: () => 'Fumble return TD' },
  { key: 'fgm', label: (v) => `${v > 1 ? `${v} FGs made` : 'FG made'}` },
  { key: 'xpm', label: (v) => `${v > 1 ? `${v} XPs` : 'XP made'}` },
  { key: 'pass_int', label: (v) => `${v > 1 ? `${v} INTs thrown` : 'INT thrown'}` },
  { key: 'fum_lost', label: () => 'Fumble lost' },
  { key: 'idp_sack', label: (v) => `${v > 1 ? `${v} sacks` : 'Sack'}` },
  { key: 'idp_int', label: () => 'Interception' },
  { key: 'idp_fr', label: () => 'Fumble recovery' },
  { key: 'pass_yd', label: (v) => `${v > 0 ? '+' : ''}${v} pass yds` },
  { key: 'rush_yd', label: (v) => `${v > 0 ? '+' : ''}${v} rush yds` },
  { key: 'rec', label: (v) => `${v} rec` },
  { key: 'rec_yd', label: (v) => `${v > 0 ? '+' : ''}${v} rec yds` },
  { key: 'idp_tkl', label: (v) => `${v} tkl` },
];

export function getEventKind(delta, position) {
  const pos = String(position ?? '').toUpperCase();
  if (n(delta.pass_td) + n(delta.rush_td) + n(delta.rec_td) + n(delta.ret_td) + n(delta.fum_ret_td) + n(delta.idp_def_td) > 0) return 'td';
  if (n(delta.fgm) + n(delta.xpm) > 0) return 'fg';
  if (n(delta.pass_int) + n(delta.fum_lost) > 0) return 'to';
  if (n(delta.idp_sack) + n(delta.idp_int) + n(delta.idp_fr) + n(delta.idp_tkl) + n(delta.idp_pd) > 0) return 'def';
  if (pos === 'DEF') return 'def';
  if (pos === 'K') return 'fg';
  if (n(delta.rush_yd) || n(delta.rush_att)) return 'rush';
  return 'pass';
}

export function describeDelta(delta) {
  const parts = [];
  for (const { key, label } of DELTA_DESCRIPTIONS) {
    const value = n(delta[key]);
    if (!value) continue;
    parts.push(label(value));
    if (parts.length >= 3) break;
  }
  return parts.join(', ');
}

function diffStats(prev, next) {
  const delta = {};
  let changed = false;
  Object.keys(next ?? {}).forEach((key) => {
    const diff = n(next[key]) - n(prev?.[key]);
    if (diff !== 0) {
      delta[key] = diff;
      changed = true;
    }
  });
  return changed ? delta : null;
}

/**
 * Compares the previous snapshot of mapped stats/points against the next one
 * and returns new feed events (most recent first). `snapshots` are Maps of
 * playerId -> { stats, points }.
 */
export function buildDeltaEvents(prevSnapshot, nextSnapshot, playerMeta, { now = Date.now() } = {}) {
  const events = [];
  nextSnapshot.forEach(({ stats, points }, playerId) => {
    const prev = prevSnapshot.get(playerId);
    if (!prev || !stats) return;
    const delta = diffStats(prev.stats, stats);
    if (!delta) return;
    const meta = playerMeta.get(playerId) ?? {};
    const desc = describeDelta(delta);
    if (!desc) return;
    events.push({
      id: `${playerId}-${now}`,
      playerId,
      kind: getEventKind(delta, meta.position),
      desc,
      pts: Math.round((points - n(prev.points)) * 10) / 10,
      at: now,
    });
  });
  return events;
}

export const EVENT_KIND_LABELS = { td: 'TD', fg: 'FG', to: 'TO', def: 'D', pass: 'P', rush: 'R' };
