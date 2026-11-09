// Stat chips and the game line for the desktop Matchups starter hover card.
// Rules: docs/Fantasy Live.md.

export const STAT_KEYS = [
  'pass_yd', 'pass_td', 'pass_int', 'rush_yd', 'rush_td', 'rec', 'rec_yd', 'rec_td', 'fgm', 'xpm', 'fum_lost',
  // Volume, for the phone card's stat line.
  'pass_cmp', 'pass_att', 'rush_att', 'rec_tgt', 'fgmiss', 'xpmiss',
  // Individual defenders (IDP) and team defense.
  'idp_tkl', 'idp_tkl_solo', 'idp_tkl_ast', 'idp_tkl_loss', 'idp_sack', 'idp_int', 'idp_ff', 'idp_pd', 'idp_pass_def', 'idp_def_td',
  'sack', 'int', 'fum_rec', 'def_td', 'pts_allow',
];
const IDP_POSITIONS = new Set(['DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S', 'SS', 'FS']);

export function sumStats(rows) {
  const totals = Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));
  rows.forEach((row) => STAT_KEYS.forEach((key) => { totals[key] += Number(row?.[key]) || 0; }));
  return totals;
}

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

// Chips only name stats the position records: a defender never shows
// receiving yards and a kicker never shows tackles.
export function buildStatChips(position, line, games = 1) {
  const pos = String(position ?? '').toUpperCase();
  const chips = [];
  const round = (value) => Math.round(Number(value) || 0);
  if (IDP_POSITIONS.has(pos)) {
    const tackles = round(line.idp_tkl) || round(line.idp_tkl_solo) + round(line.idp_tkl_ast);
    const sacks = Math.round((Number(line.idp_sack) || 0) * 10) / 10;
    chips.push(plural(tackles, 'tackle'));
    if (sacks || ['DL', 'DE', 'DT'].includes(pos)) chips.push(plural(sacks, 'sack'));
    if (line.idp_tkl_loss) chips.push(`${round(line.idp_tkl_loss)} TFL`);
    if (line.idp_int) chips.push(`${round(line.idp_int)} INT`);
    // Sleeper reports passes defended as idp_pass_def; scoring settings call it idp_pd.
    const passesDefended = round(line.idp_pd) + round(line.idp_pass_def);
    if (passesDefended) chips.push(plural(passesDefended, 'pass defended', 'passes defended'));
    if (line.idp_ff) chips.push(plural(round(line.idp_ff), 'forced fumble'));
    if (line.idp_def_td) chips.push(`${round(line.idp_def_td)} TD`);
    return chips.slice(0, 4);
  }
  if (pos === 'DEF' || pos === 'DST' || pos === 'D/ST') {
    const sacks = Math.round((Number(line.sack) || 0) * 10) / 10;
    chips.push(plural(sacks, 'sack'), plural(round(line.int) + round(line.fum_rec), 'takeaway'));
    if (line.def_td) chips.push(`${round(line.def_td)} TD`);
    if (games > 0 && line.pts_allow) chips.push(games === 1 ? `${round(line.pts_allow)} pts allowed` : `${(line.pts_allow / games).toFixed(1)} pts allowed a game`);
    return chips;
  }
  if (pos === 'QB') {
    chips.push(`${round(line.pass_yd)} pass yds`, `${round(line.pass_td)} pass TD`);
    if (line.pass_int) chips.push(`${round(line.pass_int)} INT`);
    if (line.rush_yd) chips.push(`${round(line.rush_yd)} rush yds`);
  } else if (pos === 'K') {
    chips.push(`${round(line.fgm)} FG`, `${round(line.xpm)} XP`);
  } else {
    if (pos === 'RB' || line.rush_yd) chips.push(`${round(line.rush_yd)} rush yds`);
    if (pos !== 'RB' || line.rec) chips.push(`${round(line.rec)} rec · ${round(line.rec_yd)} yds`);
    const touchdowns = round(line.rush_td) + round(line.rec_td);
    if (touchdowns) chips.push(`${touchdowns} TD`);
  }
  if (line.fum_lost) chips.push(`${round(line.fum_lost)} fumble lost`);
  return chips;
}

// This game's line. Right now: the live feed's box line for the player
// (`boxLine`, every snap including carries for no gain, incompletions and
// targets). A replayed moment: the scoring plays up to that moment (the only
// per-moment record; it can miss non-scoring snaps), never the full row, which
// would run ahead of the replay. Otherwise the week's stat row (past weeks, or
// no live layer).
export function getGameStatLine({ boxLine = null, plays = [], weeklyRows = [], week, replaying = false } = {}) {
  if (!replaying && boxLine) return sumStats([boxLine]);
  if (plays.length) return sumStats(plays.map((play) => play.stats ?? {}));
  if (replaying) return null;
  const weekRow = (weeklyRows ?? []).find((row) => Number(row?.week) === Number(week));
  return weekRow ? sumStats([weekRow]) : null;
}

// The phone matchup card's stat line, Sleeper style: attempts first, caps,
// commas. Each segment is a unit that never splits across lines ("4 CAR, 13
// YDS"); the card joins them with commas. Targets and attempts the line does
// not carry are left out rather than shown as zero ("5 REC", not "5/0 REC").
export function buildCardStatLine(position, line) {
  if (!line) return [];
  const pos = String(position ?? '').toUpperCase();
  const num = (value) => Math.round(Number(value) || 0);
  const has = (value) => value != null && Number.isFinite(Number(value)) && Number(value) !== 0;
  const segments = [];
  const rushing = () => {
    if (has(line.rush_att) || has(line.rush_yd)) segments.push(`${num(line.rush_att)} CAR, ${num(line.rush_yd)} YDS`);
  };
  const receiving = () => {
    if (!has(line.rec) && !has(line.rec_tgt) && !has(line.rec_yd)) return;
    const catches = has(line.rec_tgt) ? `${num(line.rec)}/${num(line.rec_tgt)}` : `${num(line.rec)}`;
    segments.push(`${catches} REC, ${num(line.rec_yd)} YDS`);
  };
  if (IDP_POSITIONS.has(pos)) {
    const tackles = num(line.idp_tkl) || num(line.idp_tkl_solo) + num(line.idp_tkl_ast);
    segments.push(`${tackles} TKL`);
    const sacks = Math.round((Number(line.idp_sack) || 0) * 10) / 10;
    if (sacks) segments.push(`${sacks} SACK`);
    if (has(line.idp_tkl_loss)) segments.push(`${num(line.idp_tkl_loss)} TFL`);
    if (has(line.idp_int)) segments.push(`${num(line.idp_int)} INT`);
    const passesDefended = num(line.idp_pd) + num(line.idp_pass_def);
    if (passesDefended) segments.push(`${passesDefended} PD`);
    if (has(line.idp_ff)) segments.push(`${num(line.idp_ff)} FF`);
    if (has(line.idp_def_td)) segments.push(`${num(line.idp_def_td)} TD`);
    return segments;
  }
  if (pos === 'DEF' || pos === 'DST' || pos === 'D/ST') {
    const sacks = Math.round((Number(line.sack) || 0) * 10) / 10;
    segments.push(`${sacks} SACK`, `${num(line.int) + num(line.fum_rec)} TAKEAWAY${num(line.int) + num(line.fum_rec) === 1 ? '' : 'S'}`);
    if (has(line.def_td)) segments.push(`${num(line.def_td)} TD`);
    if (line.pts_allow != null && Number.isFinite(Number(line.pts_allow))) segments.push(`${num(line.pts_allow)} PTS ALLOWED`);
    return segments;
  }
  if (pos === 'QB') {
    const passing = has(line.pass_att) ? `${num(line.pass_cmp)}/${num(line.pass_att)}, ` : '';
    segments.push(`${passing}${num(line.pass_yd)} YDS`);
    if (has(line.pass_td)) segments.push(`${num(line.pass_td)} PASS TD`);
    if (has(line.pass_int)) segments.push(`${num(line.pass_int)} INT`);
    rushing();
    if (has(line.rush_td)) segments.push(`${num(line.rush_td)} RUSH TD`);
  } else if (pos === 'K') {
    const kicks = (made, missed, label) => {
      const attempts = num(made) + num(missed);
      return has(missed) || has(made) ? `${num(made)}/${attempts} ${label}` : `0 ${label}`;
    };
    segments.push(kicks(line.fgm, line.fgmiss, 'FG'), kicks(line.xpm, line.xpmiss, 'XP'));
  } else {
    if (pos === 'RB') { rushing(); receiving(); } else { receiving(); rushing(); }
    if (!segments.length) segments.push(pos === 'RB' ? '0 CAR, 0 YDS' : '0 REC, 0 YDS');
    const touchdowns = num(line.rush_td) + num(line.rec_td);
    if (touchdowns) segments.push(`${touchdowns} TD`);
  }
  if (has(line.fum_lost)) segments.push(`${num(line.fum_lost)} FUM LOST`);
  return segments;
}
