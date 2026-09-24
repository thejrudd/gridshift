// ── Team season stats ──────────────────────────────────────────────────────
// "seahawks record", "bills point differential", "chiefs strength of schedule",
// "turf monsters points for".
//
// One card answering the season-level questions that do not belong to a weekly
// stat line: record, points for and against, differential, points per game and
// strength of schedule — for an NFL team or for a team in the connected league.
//
// Like every resolver here it is pure and never fetches. NFL numbers come from
// the standings model in standings.js; fantasy numbers come from rosters the
// app already holds.

import { buildFantasyStandingsModel, buildNflStandingsModel } from './standings.js';
import { resolveTeamScope } from './scope.js';
import { KIND_FANTASY_TEAM, KIND_PLAYER } from '../entities/record.js';

// The stat keys this card owns. Anything else belongs to the weekly stat line.
const TEAM_STAT_KEYS = new Set(['pf', 'pa', 'diff', 'sos', 'pts_per_game']);

function round1(value) {
  return value == null || !Number.isFinite(value) ? null : Math.round(value * 10) / 10;
}

function signed(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  const rounded = round1(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function recordLabel(row) {
  return row.ties ? `${row.wins}-${row.losses}-${row.ties}` : `${row.wins}-${row.losses}`;
}

/**
 * Every value this card can show for an NFL team, keyed by the stat slot that
 * asks for it.
 *
 * Strength of schedule renders as a win percentage because that is what it is —
 * the average of the opponents' win percentages. Calling it anything else would
 * invite the reader to compare it against a number on a different scale.
 */
function nflValues(row) {
  return {
    record: { key: 'record', label: 'Record', display: recordLabel(row) },
    pf: { key: 'pf', label: 'Points for', display: String(row.pointsFor) },
    pa: { key: 'pa', label: 'Points against', display: String(row.pointsAgainst) },
    diff: { key: 'diff', label: 'Differential', display: signed(row.pointDifferential) },
    pts_per_game: {
      key: 'pts_per_game',
      label: 'Points per game',
      display: row.pointsPerGame == null ? '—' : String(row.pointsPerGame),
    },
    sos: {
      key: 'sos',
      label: 'Strength of schedule',
      display: row.strengthOfSchedule == null
        ? '—'
        : row.strengthOfSchedule.toFixed(3).replace(/^0/, ''),
    },
  };
}

function fantasyValues(row) {
  return {
    record: { key: 'record', label: 'Record', display: row.recordLabel },
    pf: {
      key: 'pf',
      label: 'Points for',
      display: row.pointsFor == null ? '—' : String(row.pointsFor),
    },
    pa: {
      key: 'pa',
      label: 'Points against',
      display: row.pointsAgainst == null ? '—' : String(row.pointsAgainst),
    },
    diff: { key: 'diff', label: 'Differential', display: signed(row.pointDifferential) },
    pts_per_game: {
      key: 'pts_per_game',
      label: 'Points per game',
      display: row.pointsPerGame == null ? '—' : String(row.pointsPerGame),
    },
  };
}

// What "record" means with no stat named: the whole season line.
const DEFAULT_NFL_LINE = ['record', 'pf', 'pa', 'diff', 'pts_per_game', 'sos'];
const DEFAULT_FANTASY_LINE = ['record', 'pf', 'pa', 'diff', 'pts_per_game'];

function pickValues(available, requested, defaultLine) {
  const keys = requested.length ? requested : defaultLine;
  return keys.map((key) => available[key]).filter(Boolean);
}

/**
 * Build a team season card, or null.
 *
 * `record` is the top search result, used only to recognise a fantasy team or a
 * player. A player asking one of these questions gets their NFL team's season,
 * labelled as the team's — a player has no record of his own, and answering
 * with nothing would be less useful than answering the question behind it, as
 * long as the card never pretends the number belongs to him.
 */
export function resolveTeamStatsAnswer(slots, data = {}, { record = null } = {}) {
  const requested = (slots.stats ?? []).filter((key) => TEAM_STAT_KEYS.has(key));
  const wantsRecord = slots.intents?.includes('record');
  if (!requested.length && !wantsRecord) return null;
  // Standings owns the table; this card is about one team.
  if (slots.intents?.includes('standings')) return null;

  const scope = resolveTeamScope(slots, data.nflTeams ?? []);

  // ── A team in the connected league ────────────────────────────────────────
  // Either named outright, or "my record" / "my points for", which is the one
  // question in this family the user asks about themselves — and the example
  // the empty-state guide offers.
  const wantsMine = slots.scope === 'self' || slots.scope === 'fantasy';
  const fantasyRosterId = record?.kind === KIND_FANTASY_TEAM
    ? record.meta?.rosterId
    : (wantsMine ? data.fantasyLeague?.myRosterId : null);

  if (fantasyRosterId != null && scope.isLeagueWide) {
    const model = buildFantasyStandingsModel(data.fantasyLeague ?? {});
    const row = model?.rows.find(
      (entry) => String(entry.rosterId) === String(fantasyRosterId),
    );
    if (!row) return null;

    return {
      kind: 'teamStats',
      title: row.name,
      subtitle: [
        wantsMine && record?.kind !== KIND_FANTASY_TEAM ? 'Your team' : row.managerName,
        'Your league',
      ].filter(Boolean).join(' · '),
      values: pickValues(fantasyValues(row), requested, DEFAULT_FANTASY_LINE),
      route: {
        activeTab: 'fantasy',
        companionView: 'rosters',
        leagueSubview: 'roster',
        leagueRosterId: String(row.rosterId),
      },
      routeLabel: `Open ${row.name}`,
    };
  }

  const model = buildNflStandingsModel(data);
  if (!model?.hasResults) return null;

  // ── A named NFL team, or the team a named player plays for ────────────────
  let teamId = scope.isSingleTeam ? [...scope.teamIds][0] : null;
  let playerLabel = null;

  if (!teamId && record?.kind === KIND_PLAYER && record.meta?.team) {
    teamId = String(record.meta.team).toUpperCase();
    playerLabel = record.label;
  }
  if (!teamId) return null;

  const row = model.byId.get(teamId);
  if (!row) return null;

  return {
    kind: 'teamStats',
    title: row.name,
    // The card says whose season this is. A player has no record of his own,
    // and a title that read as his would be a quiet substitution.
    subtitle: playerLabel ? `${playerLabel}'s team · This season` : 'This season',
    values: pickValues(nflValues(row), requested, DEFAULT_NFL_LINE),
    footnote: requested.includes('sos') || !requested.length
      ? 'Strength of schedule is opponents’ average win percentage'
      : null,
    route: { activeTab: 'statistics', statisticsView: 'team', statisticsTeamId: teamId },
    routeLabel: `Open ${row.name}`,
  };
}
