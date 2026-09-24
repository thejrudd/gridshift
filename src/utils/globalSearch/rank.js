// ── Result ranking ─────────────────────────────────────────────────────────
// Turns parsed slots plus a token index into a grouped, ordered result list.
//
// Two things happen here that the token index deliberately does not do:
//   • slot filtering — team, position, jersey, and week constrain the candidate
//     set rather than fuzzy-matching against it
//   • slot-agreement scoring — a record satisfying several independent slots is
//     far more likely to be the intended one than a good text match alone

import { matchesFilter } from '../parseSearchQuery.js';
import { scoreTerm, scoreTerms } from './tokenIndex.js';
import { resolveCommandId } from './entities/commands.js';
import {
  KIND_APP_VIEW,
  KIND_COMMAND,
  KIND_FANTASY_TEAM,
  KIND_GAME,
  KIND_NFL_TEAM,
  KIND_PLAYER,
} from './entities/record.js';

// Slot agreement bonuses. Team plus jersey is the strongest signal in the whole
// system: "sea 11" identifies exactly one player, so it has to beat any amount
// of name-match score from an unrelated player.
const BONUS_TEAM = 4;
// A team record *is* the team the query named; a player merely belongs to it.
// Without a stronger identity bonus, a bare "seattle" surfaces the roster's
// biggest name above the Seahawks themselves.
const BONUS_TEAM_IDENTITY = 6;
const BONUS_POSITION = 3;
const BONUS_JERSEY = 8;
const BONUS_WEEK = 5;
const BONUS_INTENT = 2;
const BONUS_COMMAND = 8;

// Soft terms describe what the user wants; name terms identify what they mean.
// Scaling soft matches below identity evidence keeps "arizona schedule" on the
// Cardinals rather than on the generic NFL schedule view.
const SOFT_TERM_SCALE = 0.5;

// Order groups appear in. Entities the user named directly come before the
// places they could go.
const GROUP_ORDER = [
  KIND_PLAYER,
  KIND_FANTASY_TEAM,
  KIND_NFL_TEAM,
  KIND_GAME,
  KIND_APP_VIEW,
  KIND_COMMAND,
];

export const GROUP_LABELS = {
  [KIND_PLAYER]: 'Players',
  [KIND_FANTASY_TEAM]: 'My league',
  [KIND_NFL_TEAM]: 'NFL teams',
  [KIND_GAME]: 'Games & weeks',
  [KIND_APP_VIEW]: 'Go to',
  [KIND_COMMAND]: 'Commands',
};

const DEFAULT_GROUP_LIMIT = 6;

function hasTeamSlot(slots) {
  return slots.teams.length > 0 || slots.divisions.length > 0 || slots.conferences.length > 0;
}

// Destinations and commands are not entities: they have no team, position, or
// jersey to constrain, so the entity slot filters do not apply to them. They
// earn their place on text and intent evidence alone, which the evidence gate in
// rankResults already enforces.
const SLOT_FILTERED_KINDS = new Set([KIND_PLAYER, KIND_NFL_TEAM, KIND_GAME, KIND_FANTASY_TEAM]);

/**
 * Does a record satisfy every slot the query constrained?
 *
 * Slots are AND-ed: "seattle wr" means both, not either. Among entities, a
 * record with no value for a constrained slot is excluded — a free agent is not
 * a result for "seattle wr" just because he plays the position.
 */
function matchesSlots(record, slots) {
  if (!SLOT_FILTERED_KINDS.has(record.kind)) return true;
  const meta = record.meta ?? {};

  if (slots.teams.length) {
    const recordTeams = [meta.team, meta.teamId, meta.awayTeam, meta.homeTeam]
      .filter(Boolean)
      .map((team) => String(team).toLowerCase());
    if (!recordTeams.length) return false;
    if (!slots.teams.some((team) => recordTeams.includes(team))) return false;
  }

  if (slots.divisions.length) {
    if (!meta.division || !slots.divisions.includes(meta.division)) return false;
  }

  if (slots.conferences.length) {
    if (!meta.conference || !slots.conferences.includes(meta.conference)) return false;
  }

  if (slots.positions.length) {
    if (!meta.position) return false;
    if (!slots.positions.some((position) => matchesFilter(meta.position, position))) return false;
  }

  if (slots.jersey.length) {
    if (!meta.jersey) return false;
    if (!slots.jersey.includes(String(Number(meta.jersey)))) return false;
  }

  if (slots.week != null && typeof slots.week === 'number') {
    // Only week-bearing records are constrained. A player is still a valid
    // result for "josh allen week 4" — the week qualifies the answer, not the
    // player.
    if (meta.week != null && meta.week !== slots.week) return false;
  }

  return true;
}

/**
 * Bonus for the slots a record positively agrees with, as opposed to merely not
 * contradicting.
 */
function slotAgreementScore(record, slots) {
  const meta = record.meta ?? {};
  let score = 0;

  if (slots.teams.length && meta.team && slots.teams.includes(String(meta.team).toLowerCase())) {
    score += BONUS_TEAM;
  }
  if (slots.teams.length && meta.teamId && slots.teams.includes(String(meta.teamId).toLowerCase())) {
    score += BONUS_TEAM_IDENTITY;
  }
  // A game involving the named team agrees with the team slot as much as a
  // roster member does. Combined with the week bonus this is what puts the
  // single matching game above the team itself for "cardinals week 4".
  if (slots.teams.length) {
    const gameTeams = [meta.awayTeam, meta.homeTeam]
      .filter(Boolean)
      .map((team) => String(team).toLowerCase());
    if (gameTeams.some((team) => slots.teams.includes(team))) score += BONUS_TEAM;
  }
  if (slots.divisions.length && meta.division && slots.divisions.includes(meta.division)) {
    score += BONUS_TEAM;
  }
  if (slots.conferences.length && meta.conference && slots.conferences.includes(meta.conference)) {
    score += BONUS_TEAM;
  }
  if (slots.positions.length && meta.position
    && slots.positions.some((position) => matchesFilter(meta.position, position))) {
    score += BONUS_POSITION;
  }
  if (slots.jersey.length && meta.jersey && slots.jersey.includes(String(Number(meta.jersey)))) {
    score += BONUS_JERSEY;
  }
  if (typeof slots.week === 'number' && meta.week === slots.week) {
    score += BONUS_WEEK;
  }

  return score;
}

/**
 * Bonus for a record whose kind is what the query's intent asked for.
 *
 * Destinations are deliberately not boosted here: they surface through soft-term
 * text matching instead, so "standings" finds the standings views by name rather
 * than lifting every destination whenever a standings-ish word appears.
 */
function intentScore(record, slots) {
  if (!slots.intents.length) return 0;

  const wantsSchedule = slots.intents.includes('schedule') || slots.intents.includes('bye');
  const wantsRoster = slots.intents.includes('roster') || slots.intents.includes('matchup');

  if (wantsSchedule && record.kind === KIND_GAME) return BONUS_INTENT;
  if (wantsRoster && record.kind === KIND_FANTASY_TEAM) return BONUS_INTENT;
  return 0;
}

/**
 * Best score across the query's soft terms — words that describe what the user
 * wants rather than name an entity.
 *
 * Soft terms are OR-ed and optional, unlike name terms which are AND-ed and
 * required. "cardinals schedule" must still return Arizona's games, none of
 * which contain the word "schedule".
 */
function softTermScore(index, slots, recordIndex, cache) {
  let best = 0;
  for (const term of slots.softTerms) {
    let scores = cache.get(term);
    if (!scores) {
      // No fuzzy matching: soft terms come from the vocabulary, so they are
      // already spelled correctly and trigram overlap only invents matches.
      scores = scoreTerm(index, term, { fuzzy: false });
      cache.set(term, scores);
    }
    const score = scores.get(recordIndex);
    if (score !== undefined && score > best) best = score;
  }
  return best * SOFT_TERM_SCALE;
}

/**
 * A team named with a schedule intent should route to that team's schedule
 * rather than its overview page.
 */
function adaptRoute(record, slots) {
  if (record.kind !== KIND_NFL_TEAM) return record.route ?? null;
  if (!slots.intents.includes('schedule') && !slots.intents.includes('bye')) {
    return record.route ?? null;
  }

  return {
    activeTab: 'statistics',
    statisticsView: 'schedule',
    statisticsScheduleMode: 'team',
    statisticsScheduleTeamId: record.meta?.teamId ?? null,
  };
}

/**
 * The team a game result was found through, when the query named one of its two
 * teams. resolveRoute uses it to pick whose schedule an unplayed game opens.
 */
function focusTeamFor(record, slots) {
  if (record.kind !== KIND_GAME || record.meta?.isWeekIndex) return null;
  const { awayTeam, homeTeam } = record.meta ?? {};
  return [awayTeam, homeTeam].find((team) => (
    team && slots.teams.includes(String(team).toLowerCase())
  )) ?? null;
}

/**
 * Score every record the slots admit, best first.
 *
 * When the query has name terms, candidates come from the token index. When it
 * has only slots ("seattle wr", "week 3"), every record is a candidate and the
 * slot filter does the narrowing — a linear pass over a few thousand records,
 * which is well under a frame.
 */
function scoreRecords(index, slots) {
  const records = index?.records ?? [];
  if (!records.length) return [];

  const termScores = slots.nameTerms.length ? scoreTerms(index, slots.nameTerms) : null;
  const hasSlotConstraint = hasTeamSlot(slots)
    || slots.positions.length > 0
    || slots.jersey.length > 0
    || typeof slots.week === 'number'
    || slots.commands.length > 0
    || slots.softTerms.length > 0;

  if (!termScores?.size && !hasSlotConstraint) return [];

  const scored = [];
  const softCache = new Map();
  const candidateIndexes = termScores
    ? [...termScores.keys()]
    : records.map((_, recordIndex) => recordIndex);

  for (const recordIndex of candidateIndexes) {
    const record = records[recordIndex];
    if (!record) continue;
    if (!matchesSlots(record, slots)) continue;

    // A command the query named outright should appear even though it carries
    // no team, position, or name evidence of its own.
    const namedCommand = record.kind === KIND_COMMAND
      && slots.commands.map(resolveCommandId).includes(record.id);

    // Evidence is what the record positively matched. A record's base weight is
    // a tiebreaker between matches, never a reason to appear: without this gate
    // a slot no record opposes — "week 3", or a bare command — lets the entire
    // corpus through on weight alone.
    const evidence = (termScores?.get(recordIndex) ?? 0)
      + softTermScore(index, slots, recordIndex, softCache)
      + slotAgreementScore(record, slots)
      + intentScore(record, slots)
      + (namedCommand ? BONUS_COMMAND : 0);

    if (evidence <= 0) continue;
    scored.push({
      record,
      score: evidence + record.weight,
      route: adaptRoute(record, slots),
      focusTeamId: focusTeamFor(record, slots),
    });
  }

  scored.sort(compareScored);
  return scored;
}

function compareScored(left, right) {
  if (right.score !== left.score) return right.score - left.score;
  if (right.record.weight !== left.record.weight) return right.record.weight - left.record.weight;
  return left.record.label.localeCompare(right.record.label);
}

/**
 * The same query with its team words read as name terms instead.
 *
 * "washington" is a team, and it is also Parker Washington's surname. A query
 * that pairs a team word with other name terms is ambiguous, so ranking scores
 * both readings — the alternate has no team filter, but every word has to match a
 * record's name, so it only ever surfaces someone the user could have typed.
 */
function nameReadingOf(slots) {
  const words = slots.teamWords.flatMap((entry) => entry.words);
  const claimed = new Set(slots.teamWords.flatMap((entry) => entry.teams));
  return {
    ...slots,
    teams: slots.teams.filter((team) => !claimed.has(team)),
    nameTerms: [...new Set([...slots.nameTerms, ...words])],
    softTerms: [],
    teamWords: [],
  };
}

/**
 * Rank records against parsed slots and group the result by kind.
 */
export function rankResults(index, slots, { groupLimit = DEFAULT_GROUP_LIMIT } = {}) {
  let scored = scoreRecords(index, slots);

  if (slots.teamWords?.length && slots.nameTerms.length) {
    const byRecord = new Map(scored.map((entry) => [entry.record, entry]));
    for (const entry of scoreRecords(index, nameReadingOf(slots))) {
      if (entry.record.kind !== KIND_PLAYER) continue;
      const existing = byRecord.get(entry.record);
      if (!existing || entry.score > existing.score) byRecord.set(entry.record, entry);
    }
    scored = [...byRecord.values()].sort(compareScored);
  }

  // Schedule order, unless the query singled out one week — see
  // orderGamesChronologically.
  return groupResults(scored, groupLimit, {
    chronologicalGames: typeof slots.week !== 'number',
  });
}

/**
 * Put a group's games in schedule order.
 *
 * Score order is the right answer for people and teams, where "best match" is
 * the only ordering anyone means. It is the wrong answer for a schedule: a list
 * of a team's games reads as a season, and Week 12 above Week 3 because it
 * scored a hundredth higher is noise the user has to re-sort in their head.
 *
 * A query that names one week is the exception — there the ranking *is* the
 * answer, and the matching game has earned the top row, so the group is left as
 * scored.
 */
function orderGamesChronologically(results) {
  return [...results].sort((left, right) => {
    const leftWeek = left.record.meta?.week ?? Number.MAX_SAFE_INTEGER;
    const rightWeek = right.record.meta?.week ?? Number.MAX_SAFE_INTEGER;
    if (leftWeek !== rightWeek) return leftWeek - rightWeek;
    // Same week: kickoff separates a Thursday game from a Sunday one.
    const leftKick = Date.parse(left.record.meta?.kickoff ?? '') || 0;
    const rightKick = Date.parse(right.record.meta?.kickoff ?? '') || 0;
    if (leftKick !== rightKick) return leftKick - rightKick;
    return right.score - left.score;
  });
}

/**
 * Group the flat ranked list by entity kind, keeping groups in the order their
 * best result appeared so the strongest match is always the first row on screen.
 *
 * `chronologicalGames` reorders the games group by kickoff. The group's position
 * among the other groups still comes from its best score, so a schedule query
 * does not sink below the destinations just because its first row moved.
 */
export function groupResults(scored, groupLimit = DEFAULT_GROUP_LIMIT, {
  chronologicalGames = false,
} = {}) {
  const byKind = new Map();

  for (const entry of scored) {
    const kind = entry.record.kind;
    const bucket = byKind.get(kind);
    if (bucket) {
      bucket.results.push(entry);
      continue;
    }
    byKind.set(kind, {
      kind,
      label: GROUP_LABELS[kind] ?? kind,
      bestScore: entry.score,
      results: [entry],
    });
  }

  // Reorder before truncating, never after. A team's games all carry the same
  // slot bonus, so their score order is really the tiebreaker — alphabetical by
  // label — and trimming to six first would pick six games at random from the
  // season and only then put those six in order.
  if (chronologicalGames) {
    const games = byKind.get(KIND_GAME);
    if (games) games.results = orderGamesChronologically(games.results);
  }

  for (const bucket of byKind.values()) {
    if (bucket.results.length > groupLimit) bucket.results.length = groupLimit;
  }

  return [...byKind.values()].sort((left, right) => {
    if (right.bestScore !== left.bestScore) return right.bestScore - left.bestScore;
    return GROUP_ORDER.indexOf(left.kind) - GROUP_ORDER.indexOf(right.kind);
  });
}
