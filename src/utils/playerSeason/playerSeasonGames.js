// playerSeasonGames.js — one player's involvement in one finished game, compacted
// for the Statistics player dashboard.
//
// Input is a Statistics Scores game detail (BALLDONTLIE game, player and team
// stat lines, and play rows). Plays are attributed to the player through the
// same path Fantasy Live uses — `normalizePlay` → `matchPlayToStarters` →
// `buildPlayStatDelta` — so a play credits the same player, role, and stat
// delta on both surfaces. The browser scores each delta with the connected
// league's settings.
//
// Pure: no fetching. Shared by the server route and unit tests.

import {
  buildStarterNameIndex,
  matchPlayToStarters,
  normalizePlay,
} from '../livePlaysFeed.js';
import { buildPlayStatDelta } from '../playByPlay/playStatDelta.js';
import { resolveOffenseDefenseTeams } from '../playByPlay/normalizePlay.js';
import { PLAY_ROLES } from '../nflPlays/playNarrative.js';
import { getTeamAbbr, normalizeName } from '../liveScoringFeed.js';
import { positionGroup } from '../playerMetrics.js';

const MARKERS = new Set([
  'official-timeout', 'timeout', 'two-minute-warning', 'end-period', 'end-of-half',
  'end-of-game', 'end-of-regulation',
]);
const PASS_ATTEMPT = /^(pass-reception|pass-incompletion|passing-touchdown|pass-interception-return|interception-return-touchdown)$/;
const GAPS = /(left end|left tackle|left guard|up the middle|right guard|right tackle|right end)/;
const GAP_KEY = {
  'left end': 'le', 'left tackle': 'lt', 'left guard': 'lt', 'up the middle': 'mid',
  'right guard': 'rt', 'right tackle': 'rt', 'right end': 're',
};
const LINE_SKIP = new Set(['id', 'player', 'team', 'game', 'season', 'week']);

const clockSecs = (clock) => {
  const [minutes, seconds] = String(clock || '0:00').split(':').map(Number);
  return (minutes || 0) * 60 + (seconds || 0);
};

/** Seconds elapsed since kickoff; overtime continues past 3600. */
export function gameSecond(period, clock) {
  return period <= 4 ? (period - 1) * 900 + (900 - clockSecs(clock)) : 3600 + (period - 5) * 600 + (600 - clockSecs(clock));
}

const round = (value, digits = 3) => (value == null ? null : Number(Number(value).toFixed(digits)));

function bdlName(player = {}) {
  return [player.first_name, player.last_name].filter(Boolean).join(' ') || player.full_name || '';
}

function numericFields(row = {}) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (LINE_SKIP.has(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

/**
 * The player's BALLDONTLIE stat row in a game, matched by name and team.
 * Falls back to first initial + last name within the same team and position
 * group, which covers "Josh" vs "Joshua" style differences.
 */
// Providers disagree on generational suffixes ("James Cook" vs "James Cook III").
// Play text abbreviates without suffixes ("J.Cook"), so the name index must too.
const withoutSuffix = (value) => String(value ?? '').replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '').trim();

export const identityName = (value) => normalizeName(value).replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();

export function findSubjectRow(playerStats = [], { name, team, position } = {}) {
  const want = identityName(name);
  const teamAbbr = getTeamAbbr(team);
  const onTeam = playerStats.filter((row) => getTeamAbbr(row?.team?.abbreviation) === teamAbbr);
  const exact = onTeam.find((row) => identityName(bdlName(row.player)) === want);
  if (exact) return exact;
  const parts = want.split(' ');
  const last = parts.slice(1).join(' ');
  const group = positionGroup(position);
  return onTeam.find((row) => {
    const candidate = identityName(bdlName(row.player)).split(' ');
    return candidate[0]?.[0] === parts[0]?.[0]
      && candidate.slice(1).join(' ') === last
      && positionGroup(row.player?.position_abbreviation ?? row.player?.position) === group;
  }) ?? null;
}

// Gamebook QB-hit notation: "... incomplete short left to K.Coleman [G.Rousseau]."
// parseDefensiveActors reads explicit "QB hit by" clauses; the bracket form is
// display-only here and never feeds a fantasy delta.
function bracketHitters(text) {
  const names = [];
  for (const match of String(text ?? '').matchAll(/\[([^\]]+)\]/g)) {
    match[1].split(/[;,]/).map((part) => part.trim()).filter(Boolean).forEach((part) => names.push(part));
  }
  return names;
}

function nameTags(name) {
  const parts = String(name ?? '').trim().split(/\s+/);
  if (parts.length < 2) return [normalizeName(name)];
  const last = parts.slice(1).join(' ');
  return [normalizeName(name), normalizeName(`${parts[0][0]}.${last}`), normalizeName(`${parts[0][0]} ${last}`)];
}

function defensiveCredit(play, attributionRoles = [], subjectName) {
  const roles = new Set(attributionRoles);
  const credit = {};
  if (roles.has(PLAY_ROLES.TACKLER)) credit.tkl = 1;
  if (roles.has(PLAY_ROLES.SACKER)) {
    const sackers = (play.defensiveActors ?? []).filter((actor) => actor.role === PLAY_ROLES.SACKER).length;
    credit.sk = sackers > 1 ? 0.5 : 1;
    credit.hit = 1;
  }
  if (roles.has(PLAY_ROLES.INTERCEPTER)) credit.int = 1;
  if (roles.has(PLAY_ROLES.FORCER)) credit.ff = 1;
  if (roles.has(PLAY_ROLES.RECOVERER)) credit.fr = 1;
  if (roles.has(PLAY_ROLES.PASS_DEFENDER)) credit.pd = 1;
  if (roles.has(PLAY_ROLES.QB_HITTER)) credit.hit = 1;
  if (roles.has(PLAY_ROLES.SAFETY)) credit.sf = 1;
  const tags = new Set(nameTags(subjectName));
  if (bracketHitters(play.raw?.text).some((hitter) => tags.has(normalizeName(hitter)))) credit.hit = 1;
  return Object.keys(credit).length ? credit : null;
}

function participantId(raw, type) {
  return (raw?.participants ?? []).find((participant) => participant.type === type)?.player_id ?? null;
}

/**
 * @param {object} detail Statistics Scores game detail payload.
 * @param {{ name: string, team: string, position: string }} subject
 * @returns {{ game: object, people: object }|null}
 */
export function buildPlayerGame(detail, subject) {
  const game = detail?.game;
  if (!game) return null;
  const team = getTeamAbbr(subject.team);
  const home = getTeamAbbr(game.home_team?.abbreviation);
  const away = getTeamAbbr(game.visitor_team?.abbreviation);
  if (team !== home && team !== away) return null;
  const isHome = team === home;
  const opp = isHome ? away : home;
  const group = positionGroup(subject.position);
  const defender = ['DL', 'LB', 'DB'].includes(group);

  const playerStats = detail.playerStats ?? [];
  const row = findSubjectRow(playerStats, subject);
  const people = {};
  for (const stat of playerStats) {
    const id = stat?.player?.id;
    if (id == null) continue;
    people[id] = {
      n: bdlName(stat.player),
      pos: stat.player.position_abbreviation ?? stat.player.position ?? '',
      t: getTeamAbbr(stat.team?.abbreviation),
    };
  }

  const teamStats = {};
  for (const stat of detail.teamStats ?? []) {
    teamStats[getTeamAbbr(stat.team?.abbreviation) === team ? 'me' : 'opp'] = numericFields(stat);
  }

  const nameIndex = buildStarterNameIndex([{
    id: 'subject',
    player: { full_name: withoutSuffix(row ? bdlName(row.player) : subject.name), team, position: subject.position },
  }]);

  const ordered = (detail.plays ?? [])
    .map((raw, index) => [raw, index])
    .sort((left, right) => {
      const a = left[0];
      const b = right[0];
      if (a?.period && b?.period) {
        const delta = gameSecond(a.period, a.clock_display) - gameSecond(b.period, b.clock_display);
        if (delta) return delta;
      }
      return left[1] - right[1];
    })
    .map(([raw]) => raw);

  const wp = [];
  const plays = [];
  const oppDropbacks = [];
  let teamPassAtt = 0;
  let scoreMe = 0;
  let scoreOpp = 0;
  let lastWinProb = null;

  ordered.forEach((raw, index) => {
    const type = raw?.type_slug ?? '';
    const text = raw?.text ?? '';
    const marker = MARKERS.has(type);
    const me = isHome ? raw?.home_score : raw?.away_score;
    const them = isHome ? raw?.away_score : raw?.home_score;
    const winProb = raw?.home_win_probability == null ? null : round(isHome ? raw.home_win_probability : 1 - raw.home_win_probability);
    const before = { me: scoreMe, opp: scoreOpp };
    if (me != null) scoreMe = Math.max(scoreMe, me);
    if (them != null) scoreOpp = Math.max(scoreOpp, them);
    if (marker || !raw?.period) return;
    const winProbBefore = lastWinProb;
    if (winProb != null) {
      wp.push([gameSecond(raw.period, raw.clock_display), winProb]);
      lastWinProb = winProb;
    }

    const play = normalizePlay(raw, game.id);
    if (!play) return;
    const { offenseTeam, defenseTeam } = resolveOffenseDefenseTeams(play, {
      homeTeam: home,
      awayTeam: away,
      normalizeTeam: getTeamAbbr,
    });
    play.offenseTeamAbbr = offenseTeam;
    play.defenseTeamAbbr = defenseTeam;
    const noPlay = /No Play/i.test(text);

    if (!noPlay && offenseTeam === team && PASS_ATTEMPT.test(type)) teamPassAtt += 1;
    if (!noPlay && offenseTeam === opp && /^pass-|passing-touchdown|sack|interception/.test(type)) {
      oppDropbacks.push([raw.start_down ?? 0, raw.period, /Shotgun/.test(text) ? 1 : 0]);
    }

    const matched = noPlay ? null : matchPlayToStarters(play, nameIndex).find((entry) => entry.playerId === 'subject');
    // On an incomplete pass the gamebook's parenthetical names the defender who
    // broke it up ("... incomplete short left to A.St. Brown (C.Benford)."), but
    // parseDefensiveActors reads it as a tackle. Credit a pass defensed here.
    const match = matched?.role === 'defense' && type === 'pass-incompletion' && matched.attributionRoles?.includes(PLAY_ROLES.TACKLER)
      ? {
          ...matched,
          attributionRoles: [...new Set(matched.attributionRoles.map((role) => (role === PLAY_ROLES.TACKLER ? PLAY_ROLES.PASS_DEFENDER : role)))],
        }
      : matched;
    const credit = defender && !noPlay && offenseTeam === opp
      ? defensiveCredit(play, match?.role === 'defense' ? match.attributionRoles : [], subject.name)
      : null;
    if (!match && !credit) return;

    const yardLine = (value) => (value == null ? null : isHome ? value : 100 - value);
    const fromEndzone = (value, side) => (value == null ? null : side === team ? 100 - value : value);
    const xs = yardLine(play.raw?.start_yard_line) ?? fromEndzone(raw.start_yards_to_endzone, offenseTeam);
    const xe = yardLine(play.raw?.end_yard_line) ?? fromEndzone(raw.end_yards_to_endzone, getTeamAbbr(raw.team?.abbreviation) || offenseTeam) ?? xs;
    const depth = /pass (?:incomplete )?(short|deep) (left|middle|right)/.exec(text);
    const gap = GAPS.exec(text)?.[1] ?? null;
    const role = match?.role ?? 'defense';

    const compact = {
      i: index,
      q: raw.period,
      c: raw.clock_display ?? '',
      t: type,
      o: offenseTeam,
      dn: raw.start_down ?? null,
      ds: raw.start_distance ?? null,
      ytez: raw.start_yards_to_endzone ?? null,
      xs: round(xs, 1),
      xe: round(xe, 1),
      y: raw.stat_yardage ?? null,
      sc: raw.scoring_play ? 1 : 0,
      ms: me ?? before.me,
      os: them ?? before.opp,
      bm: before.me,
      bo: before.opp,
      wp: winProb,
      wb: winProbBefore,
      s: play.description || text,
      raw: text,
      r: role,
      fs: match ? buildPlayStatDelta(play, match.role, match.detail, match.attributionRoles) : {},
      sg: /Shotgun/.test(text) ? 1 : 0,
      nh: /No Huddle/i.test(text) ? 1 : 0,
    };
    if (depth) { compact.pd = depth[1]; compact.pdir = depth[2]; }
    if (gap) compact.gap = GAP_KEY[gap];
    if (/scrambles/.test(text)) compact.scr = 1;
    if (/kneels/.test(text)) compact.kn = 1;
    if (/pass|sack|interception/.test(type)) compact.pass = 1;
    const passer = participantId(raw, 'passer');
    const receiver = participantId(raw, 'receiver');
    const rusher = participantId(raw, 'rusher');
    if (passer != null) compact.qb = passer;
    if (receiver != null) compact.tgt = receiver;
    if (rusher != null || receiver != null) compact.bc = rusher ?? receiver;
    if (credit) compact.cr = credit;
    if (role === 'kicker' && /field-goal/.test(type)) {
      compact.fg = Number(/(\d+) yard field goal/i.exec(text)?.[1] ?? 0) || null;
    }
    plays.push(compact);
  });

  const pf = isHome ? game.home_team_score : game.visitor_team_score;
  const pa = isHome ? game.visitor_team_score : game.home_team_score;
  return {
    game: {
      id: game.id,
      week: game.week,
      date: game.date,
      status: game.status ?? '',
      postseason: Boolean(game.postseason),
      home: isHome,
      opp,
      pf,
      pa,
      ot: /OT/.test(game.status ?? ''),
      active: Boolean(row),
      line: row ? numericFields(row) : {},
      ts: teamStats,
      wp,
      plays,
      teamPassAtt,
      oppDropbacks,
    },
    subjectId: row?.player?.id ?? null,
    subjectBio: row ? {
      name: bdlName(row.player),
      position: row.player.position_abbreviation ?? row.player.position ?? '',
      jersey: row.player.jersey_number ?? '',
    } : null,
    people,
  };
}

/** Keep only the people a season's plays point at (targets, passers, ball carriers). */
export function pickReferencedPeople(games = [], people = {}) {
  const ids = new Set();
  for (const game of games) {
    for (const play of game.plays) {
      for (const key of ['qb', 'tgt', 'bc']) if (play[key] != null) ids.add(String(play[key]));
    }
  }
  return Object.fromEntries([...ids].filter((id) => people[id]).map((id) => [id, people[id]]));
}
