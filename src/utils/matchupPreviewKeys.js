/**
 * Keys to the matchup — candidate detector engine.
 *
 * Fantasy Matchup's preview needs three short, specific observations that feel
 * different every week and for every pairing. A fixed template cannot do that,
 * so this module runs a set of independent detectors over the preview context.
 * Each detector only fires when its own signal is actually present and notable,
 * scores how unusual that signal is, and offers several phrasings. Selection
 * then takes the strongest candidates while forcing family diversity, so the
 * reader never gets three flavours of the same observation.
 *
 * Nothing here invents data. A detector whose inputs are missing returns
 * nothing, and the engine returns fewer than `limit` keys rather than padding.
 */

export const KEY_FAMILY = {
  SLOT_EDGE: 'slot-edge',
  PLAYER: 'player',
  TEAM_PATTERN: 'team-pattern',
  SHAPE: 'shape',
  RIVALRY: 'rivalry',
  SLATE: 'slate',
};

export const KEYS_TITLE_BY_PHASE = {
  pre: 'Keys to the matchup',
  live: 'What is deciding it',
  post: 'How it was won',
};

/* ── text building ─────────────────────────────────────────────────────────
   Keys render as segment arrays rather than HTML strings so the component can
   emphasise values without dangerouslySetInnerHTML. */

export function say(strings, ...values) {
  const parts = [];
  strings.forEach((chunk, index) => {
    if (chunk) parts.push({ text: chunk });
    if (index < values.length) {
      const value = values[index];
      if (value == null || value === '') return;
      parts.push({ text: String(value), emphasis: true });
    }
  });
  return parts;
}

export function keyPartsToString(parts) {
  return (parts ?? []).map((part) => part.text).join('');
}

/* ── seeded selection ─────────────────────────────────────────────────────
   The same matchup and week must always produce the same keys, but different
   pairings and weeks must not converge on the same phrasing. A string hash
   seeds a small PRNG used only for phrasing choice and tie-breaking. */

export function hashSeed(value) {
  const input = String(value ?? '');
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededSequence(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── numeric helpers ─────────────────────────────────────────────────────── */

// Number(null) is 0 and Number('') is 0, so absent values must be rejected
// before coercion or a missing projection silently counts as a zero.
const num = (value) => {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const one = (value) => (num(value) == null ? null : num(value).toFixed(1));
const pts = (value) => (num(value) == null ? null : `${num(value).toFixed(1)} pts`);
const signed = (value) => {
  const parsed = num(value);
  if (parsed == null) return null;
  return `${parsed >= 0 ? '+' : '−'}${Math.abs(parsed).toFixed(1)}`;
};
const ordinal = (value) => {
  const parsed = num(value);
  if (parsed == null) return null;
  const rest = parsed % 100;
  if (rest >= 11 && rest <= 13) return `${parsed}th`;
  return `${parsed}${['th', 'st', 'nd', 'rd'][parsed % 10] ?? 'th'}`;
};
/** Map a distance past a threshold onto 0..1 without letting outliers dominate. */
const ramp = (value, floor, ceiling) => {
  const parsed = num(value);
  if (parsed == null || ceiling <= floor) return 0;
  return Math.max(0, Math.min(1, (parsed - floor) / (ceiling - floor)));
};

const starters = (side) => (side?.starters ?? []).filter((player) => player?.id && !player.isEmpty);
/** Kicker and defence slots swing little and read as noise in a headline key. */
const SKILL_SLOTS = new Set(['QB', 'RB', 'WR', 'TE']);
const isSkillSlot = (slot) => SKILL_SLOTS.has(String(slot?.a?.position ?? '').toUpperCase())
  || SKILL_SLOTS.has(String(slot?.b?.position ?? '').toUpperCase());
const projectedStarters = (side) => starters(side).filter((player) => num(player.projected) != null);
const sumProjected = (side) => projectedStarters(side).reduce((total, player) => total + num(player.projected), 0);

function bothSides(context, build) {
  return ['a', 'b']
    .flatMap((key) => {
      const result = build(context.sides[key], context.sides[key === 'a' ? 'b' : 'a'], key);
      return Array.isArray(result) ? result : result ? [result] : [];
    })
    .filter(Boolean);
}

/* ── detectors ────────────────────────────────────────────────────────────
   Each detector declares the phases it applies to and returns zero or more
   candidates: { id, family, tag, variants, salience }. `variants` are
   equivalent phrasings; the seed picks one so an identical signal does not
   read identically two weeks running. */

const DETECTORS = [
  /* ── slot edge ─────────────────────────────────────────────────────── */
  {
    id: 'slot-edge-largest',
    family: KEY_FAMILY.SLOT_EDGE,
    phases: ['pre'],
    run: (context) => {
      const gaps = context.slots
        .filter(isSkillSlot)
        .map((slot) => {
          const mine = num(slot.a?.projected);
          const opp = num(slot.b?.projected);
          if (mine == null || opp == null) return null;
          const lead = mine >= opp ? 'a' : 'b';
          return { slot, lead, gap: Math.abs(mine - opp), player: lead === 'a' ? slot.a : slot.b };
        })
        .filter(Boolean)
        .sort((left, right) => right.gap - left.gap);
      const [top, next] = gaps;
      if (!top || top.gap < 3) return null;
      const separation = next ? top.gap / Math.max(0.1, next.gap) : 2;
      if (separation < 1.25) return null;
      const side = context.sides[top.lead];
      const defence = top.player.opponentContext;
      const softDraw = defence && defence.rank >= defence.teamCount - 6;
      return {
        salience: 0.45 + 0.35 * ramp(top.gap, 3, 12) + 0.2 * ramp(separation, 1.25, 2.5),
        tag: 'Biggest edge',
        variants: [
          () => say`${top.player.name} is the largest single-slot gap on the board — ${pts(top.gap)} clear of the ${top.slot.label} opposite him${softDraw ? `, against a defence allowing the ${ordinal(defence.rank)}-most points to ${defence.position}s` : ''}.`,
          () => say`The ${top.slot.label} slot is where this separates: ${top.player.name} projects ${pts(top.gap)} more than ${side.name}'s opponent at the same spot.`,
          () => say`No other slot is close. ${top.player.name} gives ${side.name} a ${pts(top.gap)} head start before the rest of the lineup is counted.`,
        ],
      };
    },
  },
  {
    id: 'slot-edge-swing',
    family: KEY_FAMILY.SLOT_EDGE,
    phases: ['pre'],
    run: (context) => {
      const margin = Math.abs(num(context.expectedMargin) ?? 0);
      if (margin > 12) return null;
      const close = context.slots
        .filter(isSkillSlot)
        .map((slot) => {
          const mine = num(slot.a?.projected);
          const opp = num(slot.b?.projected);
          if (mine == null || opp == null) return null;
          return { slot, gap: Math.abs(mine - opp) };
        })
        .filter(Boolean)
        .sort((left, right) => left.gap - right.gap)[0];
      if (!close || close.gap > 2.5) return null;
      return {
        salience: 0.4 + 0.3 * (1 - ramp(close.gap, 0, 2.5)) + 0.3 * (1 - ramp(margin, 0, 12)),
        tag: 'Swing slot',
        variants: [
          () => say`${close.slot.a.name} and ${close.slot.b.name} project within ${pts(close.gap)} of each other at ${close.slot.label}. Whoever hits their ceiling first probably takes the week.`,
          () => say`The ${close.slot.label} slot is a coin flip — ${pts(close.gap)} between them, against a projected margin of ${pts(margin)}.`,
          () => say`Watch ${close.slot.label}. A single touchdown there swings more than the whole forecast separates these two.`,
        ],
      };
    },
  },
  {
    id: 'slot-group-sweep',
    family: KEY_FAMILY.SLOT_EDGE,
    phases: ['pre', 'post'],
    run: (context) => {
      const decided = context.slotGroups.filter((group) => group.lead);
      if (decided.length < 4) return null;
      const counts = { a: decided.filter((group) => group.lead === 'a').length, b: decided.filter((group) => group.lead === 'b').length };
      const lead = counts.a === counts.b ? null : counts.a > counts.b ? 'a' : 'b';
      if (!lead || Math.max(counts.a, counts.b) < decided.length - 1) return null;
      const side = context.sides[lead];
      const conceded = decided.filter((group) => group.lead !== lead).map((group) => group.label);
      const verb = context.phase === 'post' ? 'won' : 'leads';
      return {
        salience: 0.4 + 0.45 * ramp(Math.max(counts.a, counts.b) / decided.length, 0.6, 1),
        tag: context.phase === 'post' ? 'Group by group' : 'Roster shape',
        variants: [
          () => say`${side.name} ${verb} ${`${Math.max(counts.a, counts.b)} of ${decided.length}`} position groups${conceded.length ? `, conceding only ${conceded.join(' and ')}` : ' — a clean sweep'}.`,
          () => say`This is a depth advantage, not a star one: ${side.name} ${verb} ${`${Math.max(counts.a, counts.b)} of ${decided.length}`} groups${conceded.length ? ` and gives back only ${conceded.join(' and ')}` : ''}.`,
        ],
      };
    },
  },
  {
    id: 'slot-group-mismatch',
    family: KEY_FAMILY.SLOT_EDGE,
    phases: ['pre', 'live', 'post'],
    run: (context) => {
      const top = context.slotGroups
        .filter((group) => group.lead && group.starters > 1)
        .map((group) => ({ group, gap: Math.abs(group.a - group.b) }))
        .sort((left, right) => right.gap - left.gap)[0];
      if (!top || top.gap < 6) return null;
      const side = context.sides[top.group.lead];
      const other = context.sides[top.group.lead === 'a' ? 'b' : 'a'];
      const names = top.group.lead === 'a' ? top.group.aNames : top.group.bNames;
      return {
        salience: 0.35 + 0.45 * ramp(top.gap, 6, 20),
        tag: 'Positional mismatch',
        variants: [
          () => say`${side.name}'s ${top.group.label} room is ${pts(top.gap)} ahead of ${other.name}'s${names ? ` — ${names}` : ''}.`,
          () => say`${top.group.label} is the widest group on the board: ${pts(top.gap)} to ${side.name}${names ? `, carried by ${names}` : ''}.`,
        ],
      };
    },
  },

  /* ── player ────────────────────────────────────────────────────────── */
  {
    id: 'player-soft-draw',
    family: KEY_FAMILY.PLAYER,
    phases: ['pre'],
    run: (context) => bothSides(context, (side) => {
      const candidate = projectedStarters(side)
        .filter((player) => player.opponentContext?.rank >= (player.opponentContext?.teamCount ?? 32) - 4)
        .sort((left, right) => num(right.projected) - num(left.projected))[0];
      if (!candidate) return null;
      const defence = candidate.opponentContext;
      const above = num(defence.differenceFromLeagueAverage);
      return {
        salience: 0.35 + 0.3 * ramp(defence.rank, defence.teamCount - 5, defence.teamCount) + 0.25 * ramp(above, 1, 6),
        tag: 'Favourable draw',
        variants: [
          () => say`${candidate.name} draws a defence allowing the ${ordinal(defence.teamCount - defence.rank + 1)}-most points to ${defence.position}s — ${pts(above)} above league average every week.`,
          () => say`${candidate.opponentTeam ?? 'His opponent'} has been the softest kind of draw for ${defence.position}s: ${ordinal(defence.rank)} of ${defence.teamCount} at holding them down. ${candidate.name} projects ${one(candidate.projected)}.`,
          () => say`${side.name} has the week's cleanest matchup on paper — ${candidate.name} against a ${defence.position} defence giving up ${pts(defence.ptsAllowedPerGame)} a game.`,
        ],
      };
    }),
  },
  {
    id: 'player-hard-draw',
    family: KEY_FAMILY.PLAYER,
    phases: ['pre'],
    run: (context) => bothSides(context, (side) => {
      const top = projectedStarters(side).sort((left, right) => num(right.projected) - num(left.projected)).slice(0, 3);
      const candidate = top
        .filter((player) => player.opponentContext && player.opponentContext.rank <= 4)
        .sort((left, right) => num(right.projected) - num(left.projected))[0];
      if (!candidate) return null;
      const defence = candidate.opponentContext;
      const below = Math.abs(num(defence.differenceFromLeagueAverage) ?? 0);
      return {
        salience: 0.35 + 0.3 * (1 - ramp(defence.rank, 1, 5)) + 0.25 * ramp(below, 1, 6),
        tag: 'Hard draw',
        variants: [
          () => say`${candidate.name} is one of ${side.name}'s three biggest projections and draws the ${ordinal(defence.rank)}-stingiest defence against ${defence.position}s — ${pts(below)} below average allowed.`,
          () => say`The risk for ${side.name} is at the top: ${candidate.name} faces a ${defence.position} defence that has held the position to ${pts(defence.ptsAllowedPerGame)} a game.`,
        ],
      };
    }),
  },
  {
    id: 'player-weather',
    family: KEY_FAMILY.PLAYER,
    phases: ['pre', 'live'],
    run: (context) => bothSides(context, (side) => {
      const candidate = projectedStarters(side)
        .filter((player) => player.weatherNote)
        .sort((left, right) => num(right.projected) - num(left.projected))[0];
      if (!candidate) return null;
      return {
        salience: 0.3 + 0.4 * ramp(num(candidate.projected), 8, 20),
        tag: 'Conditions',
        variants: [
          () => say`${candidate.name} plays through ${candidate.weatherNote} — the kind of game that widens the range on a ${one(candidate.projected)}-point projection.`,
          () => say`Weather is live in this one: ${candidate.weatherNote} where ${candidate.name} is playing, and he is ${pts(candidate.projected)} of ${side.name}'s total.`,
        ],
      };
    }),
  },
  {
    id: 'player-availability',
    family: KEY_FAMILY.PLAYER,
    phases: ['pre'],
    run: (context) => bothSides(context, (side) => {
      const total = sumProjected(side);
      if (total <= 0) return null;
      const candidate = projectedStarters(side)
        .filter((player) => player.availabilityStatus && /^(q|d|o|ir|pup|sus|doubt|quest|out)/i.test(String(player.availabilityStatus)))
        .sort((left, right) => num(right.projected) - num(left.projected))[0];
      if (!candidate) return null;
      const share = num(candidate.projected) / total;
      if (share < 0.09) return null;
      return {
        salience: 0.35 + 0.45 * ramp(share, 0.09, 0.2),
        tag: 'Availability risk',
        variants: [
          () => say`${candidate.name} carries ${`${Math.round(share * 100)}%`} of ${side.name}'s projected total and is listed ${String(candidate.availabilityStatus).toUpperCase()}.`,
          () => say`${side.name} has real downside baked in — ${candidate.name} is ${String(candidate.availabilityStatus).toUpperCase()} and worth ${pts(candidate.projected)} of the projection.`,
        ],
      };
    }),
  },
  {
    id: 'player-projection-drift',
    family: KEY_FAMILY.PLAYER,
    phases: ['pre'],
    run: (context) => bothSides(context, (side) => {
      const candidate = starters(side)
        .map((player) => {
          const now = num(player.projected);
          const then = num(player.baselineProjected);
          if (now == null || then == null) return null;
          return { player, drift: now - then };
        })
        .filter(Boolean)
        .sort((left, right) => Math.abs(right.drift) - Math.abs(left.drift))[0];
      if (!candidate || Math.abs(candidate.drift) < 2) return null;
      const rising = candidate.drift > 0;
      return {
        salience: 0.3 + 0.45 * ramp(Math.abs(candidate.drift), 2, 7),
        tag: rising ? 'Trending up' : 'Trending down',
        variants: [
          () => say`${candidate.player.name}'s projection has ${rising ? 'climbed' : 'fallen'} ${signed(candidate.drift)} since it was first recorded this week, to ${one(candidate.player.projected)}.`,
          () => say`The model has changed its mind on ${candidate.player.name} — ${signed(candidate.drift)} against the projection ${side.name} woke up to.`,
        ],
      };
    }),
  },
  {
    id: 'player-shared-game',
    family: KEY_FAMILY.PLAYER,
    phases: ['pre', 'live'],
    run: (context) => {
      const gameOf = (player) => (player.gameKey ? player.gameKey : null);
      const mine = new Map(projectedStarters(context.sides.a).map((player) => [gameOf(player), player]).filter(([key]) => key));
      const shared = projectedStarters(context.sides.b)
        .map((player) => ({ theirs: player, mine: mine.get(gameOf(player)) }))
        .filter((pair) => pair.mine)
        .sort((left, right) => (num(right.theirs.projected) + num(right.mine.projected)) - (num(left.theirs.projected) + num(left.mine.projected)))[0];
      if (!shared) return null;
      const combined = num(shared.mine.projected) + num(shared.theirs.projected);
      return {
        salience: 0.3 + 0.45 * ramp(combined, 18, 40),
        tag: 'Same field',
        variants: [
          () => say`Both sides have a starter in ${shared.mine.gameLabel ?? 'the same NFL game'} — ${shared.mine.name} for ${context.sides.a.name}, ${shared.theirs.name} for ${context.sides.b.name}. ${pts(combined)} of this matchup is decided in one stadium.`,
          () => say`${shared.mine.gameLabel ?? 'One game'} is a head-to-head inside the head-to-head: ${shared.mine.name} against ${shared.theirs.name}, ${pts(combined)} projected between them.`,
        ],
      };
    },
  },
  {
    id: 'player-ceiling',
    family: KEY_FAMILY.PLAYER,
    phases: ['pre'],
    run: (context) => {
      const trailing = (num(context.expectedMargin) ?? 0) >= 0 ? 'b' : 'a';
      const side = context.sides[trailing];
      const deficit = Math.abs(num(context.expectedMargin) ?? 0);
      if (deficit < 1 || deficit > 20) return null;
      const candidate = projectedStarters(side)
        .map((player) => ({ player, upside: num(player.bestWeek) == null ? null : num(player.bestWeek) - num(player.projected) }))
        .filter((entry) => entry.upside != null && entry.upside > 0)
        .sort((left, right) => right.upside - left.upside)[0];
      if (!candidate || candidate.upside < deficit * 0.6) return null;
      return {
        salience: 0.35 + 0.4 * ramp(candidate.upside / Math.max(1, deficit), 0.6, 2),
        tag: 'The path back',
        variants: [
          () => say`${side.name} trails by ${pts(deficit)}, and ${candidate.player.name} alone has covered that: his best week this season was ${one(candidate.player.bestWeek)} against a ${one(candidate.player.projected)} projection.`,
          () => say`One ceiling game closes it. ${candidate.player.name} has already gone for ${one(candidate.player.bestWeek)} once — ${pts(candidate.upside)} clear of what he is projected for here.`,
        ],
      };
    },
  },
  {
    id: 'player-live-swing',
    family: KEY_FAMILY.PLAYER,
    phases: ['live', 'post'],
    run: (context) => bothSides(context, (side) => {
      const candidate = starters(side)
        .map((player) => {
          const actual = num(player.actual);
          const projected = num(player.baselineProjected ?? player.projected);
          if (actual == null || projected == null || !player.gameStarted) return null;
          return { player, delta: actual - projected };
        })
        .filter(Boolean)
        .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))[0];
      if (!candidate || Math.abs(candidate.delta) < 4) return null;
      const over = candidate.delta > 0;
      const final = context.phase === 'post' || candidate.player.gameFinal;
      return {
        salience: 0.4 + 0.45 * ramp(Math.abs(candidate.delta), 4, 16),
        tag: over ? 'Overdelivered' : 'The miss',
        variants: [
          () => say`${candidate.player.name} ${final ? 'finished' : 'sits'} at ${one(candidate.player.actual)}, ${signed(candidate.delta)} against his projection — the biggest ${over ? 'beat' : 'miss'} on ${side.name}'s side.`,
          () => say`${side.name}'s week turns on ${candidate.player.name}: ${one(candidate.player.actual)} scored against ${one(candidate.player.baselineProjected ?? candidate.player.projected)} projected.`,
        ],
      };
    }),
  },

  /* ── team pattern ──────────────────────────────────────────────────── */
  {
    id: 'team-scoring-extreme',
    family: KEY_FAMILY.TEAM_PATTERN,
    phases: ['pre', 'live', 'post'],
    run: (context) => bothSides(context, (side) => {
      const rank = num(side.pointsForRank);
      const teams = num(context.league?.teamCount);
      if (rank == null || teams == null || teams < 4) return null;
      const extreme = rank === 1 || rank === teams;
      if (!extreme) return null;
      const high = rank === 1;
      return {
        salience: 0.4 + (high ? 0.3 : 0.2),
        tag: high ? 'Top of the league' : 'Bottom of the league',
        variants: [
          () => say`${side.name} is the ${high ? 'highest' : 'lowest'}-scoring team in the league — ${pts(side.pointsFor)} through ${`${side.games} week${side.games === 1 ? '' : 's'}`}.`,
          () => say`No team has scored ${high ? 'more' : 'less'} this season than ${side.name}: ${pts(side.pointsFor)}, ${high ? 'first' : 'last'} of ${teams}.`,
        ],
      };
    }),
  },
  {
    id: 'team-schedule-luck',
    family: KEY_FAMILY.TEAM_PATTERN,
    phases: ['pre', 'post'],
    run: (context) => bothSides(context, (side) => {
      const against = num(side.pointsAgainst);
      const average = num(context.league?.averagePointsAgainst);
      if (against == null || average == null || !side.games) return null;
      const gap = against - average;
      if (Math.abs(gap) < average * 0.12) return null;
      const unlucky = gap > 0;
      return {
        salience: 0.3 + 0.4 * ramp(Math.abs(gap) / Math.max(1, average), 0.12, 0.3),
        tag: unlucky ? 'Schedule luck' : 'Soft road',
        variants: [
          () => say`${side.name} has faced ${pts(Math.abs(gap))} ${unlucky ? 'more' : 'less'} than the league average opponent this season — the record reads ${side.record}, the scoring says otherwise.`,
          () => say`Opponents have put ${pts(against)} on ${side.name}, ${signed(gap)} against what an average schedule would have delivered.`,
        ],
      };
    }),
  },
  {
    id: 'team-differential',
    family: KEY_FAMILY.TEAM_PATTERN,
    phases: ['pre'],
    run: (context) => {
      const [a, b] = [context.sides.a, context.sides.b];
      const diffA = num(a.pointsFor) == null || num(a.pointsAgainst) == null ? null : num(a.pointsFor) - num(a.pointsAgainst);
      const diffB = num(b.pointsFor) == null || num(b.pointsAgainst) == null ? null : num(b.pointsFor) - num(b.pointsAgainst);
      if (diffA == null || diffB == null || !a.games || !b.games) return null;
      const spread = Math.abs(diffA - diffB);
      if (spread < 25) return null;
      const ahead = diffA > diffB ? a : b;
      const behind = diffA > diffB ? b : a;
      return {
        salience: 0.3 + 0.4 * ramp(spread, 25, 120),
        tag: 'Season shape',
        variants: [
          () => say`${ahead.name} carries a ${signed(Math.max(diffA, diffB))} points differential into this, against ${signed(Math.min(diffA, diffB))} for ${behind.name} — ${pts(spread)} of separation across the season.`,
          () => say`These teams have had different seasons: ${signed(diffA)} differential for ${a.name}, ${signed(diffB)} for ${b.name}.`,
        ],
      };
    },
  },
  {
    id: 'team-bench-gap',
    family: KEY_FAMILY.TEAM_PATTERN,
    phases: ['pre'],
    run: (context) => bothSides(context, (side) => {
      const gap = num(side.benchUpgrade);
      if (gap == null || gap < 2) return null;
      return {
        salience: 0.3 + 0.4 * ramp(gap, 2, 10),
        tag: 'Lineup left open',
        variants: [
          () => say`${side.name} has ${pts(gap)} of projection sitting on the bench — ${side.benchUpgradeLabel ?? 'a starter swap'} would raise the projected total before a snap is played.`,
          () => say`The lineup is not optimal yet: ${side.benchUpgradeLabel ?? 'a bench player'} projects ${pts(gap)} higher than the starter in front of him for ${side.name}.`,
        ],
      };
    }),
  },
  {
    id: 'team-projection-drift',
    family: KEY_FAMILY.TEAM_PATTERN,
    phases: ['pre'],
    run: (context) => bothSides(context, (side) => {
      const now = num(side.projectedTotal);
      const then = num(side.recordedProjectedTotal);
      if (now == null || then == null) return null;
      const drift = now - then;
      if (Math.abs(drift) < 4) return null;
      return {
        salience: 0.3 + 0.35 * ramp(Math.abs(drift), 4, 15),
        tag: drift > 0 ? 'Firming up' : 'Softening',
        variants: [
          () => say`${side.name}'s projected total has moved ${signed(drift)} since the week's first recorded projection, to ${one(now)}.`,
          () => say`The forecast has drifted ${signed(drift)} toward ${drift > 0 ? 'favouring' : 'fading'} ${side.name} since this week's projections were first captured.`,
        ],
      };
    }),
  },

  /* ── matchup shape ─────────────────────────────────────────────────── */
  {
    id: 'shape-tossup',
    family: KEY_FAMILY.SHAPE,
    phases: ['pre'],
    run: (context) => {
      const margin = Math.abs(num(context.expectedMargin) ?? 0);
      const swing = num(context.swing);
      if (swing == null || swing <= 0 || margin > swing * 0.6) return null;
      return {
        salience: 0.45 + 0.35 * (1 - ramp(margin / swing, 0, 0.6)),
        tag: 'Too close to call',
        variants: [
          () => say`The forecast cannot separate these two: ${pts(margin)} of projected margin against a ${pts(swing)} week-to-week swing.`,
          () => say`A ${pts(margin)} edge means nothing at this scale — typical week-to-week variance here is ${pts(swing)} in either direction.`,
          () => say`Call it even. The projected gap is ${pts(margin)}; the model's own uncertainty is ${pts(swing)}.`,
        ],
      };
    },
  },
  {
    id: 'shape-separation',
    family: KEY_FAMILY.SHAPE,
    phases: ['pre'],
    run: (context) => {
      const margin = num(context.expectedMargin) ?? 0;
      const swing = num(context.swing);
      if (swing == null || swing <= 0 || Math.abs(margin) < swing * 1.3) return null;
      const side = context.sides[margin >= 0 ? 'a' : 'b'];
      return {
        salience: 0.4 + 0.4 * ramp(Math.abs(margin) / swing, 1.3, 3),
        tag: 'Clear favourite',
        variants: [
          () => say`${side.name} projects ${pts(Math.abs(margin))} clear — wide enough to survive the ${pts(swing)} of swing a normal week produces.`,
          () => say`This is not a tossup. The ${pts(Math.abs(margin))} edge for ${side.name} is ${`${(Math.abs(margin) / swing).toFixed(1)}×`} the model's own margin of error.`,
        ],
      };
    },
  },
  {
    id: 'shape-coverage',
    family: KEY_FAMILY.SHAPE,
    phases: ['pre'],
    run: (context) => {
      const missing = num(context.fallbackCount);
      const total = num(context.starterCount);
      if (!missing || !total) return null;
      if (missing / total < 0.15) return null;
      return {
        salience: 0.25 + 0.4 * ramp(missing / total, 0.15, 0.5),
        tag: 'Read it loosely',
        variants: [
          () => say`${`${missing} of ${total}`} starters are on fallback estimates rather than direct projections, so the margin here is softer than the number suggests.`,
          () => say`Coverage is incomplete this week — ${`${missing} starters`} fall back to season averages, which widens the real range around this forecast.`,
        ],
      };
    },
  },
  {
    id: 'shape-comeback',
    family: KEY_FAMILY.SHAPE,
    phases: ['live'],
    run: (context) => {
      const deficit = num(context.liveMargin);
      if (deficit == null || Math.abs(deficit) < 1) return null;
      const trailing = deficit >= 0 ? 'b' : 'a';
      const side = context.sides[trailing];
      const other = context.sides[trailing === 'a' ? 'b' : 'a'];
      const theirs = num(side.remainingProjection);
      const opposing = num(other.remainingProjection);
      if (theirs == null || opposing == null) return null;
      const gap = Math.abs(deficit);
      const edge = theirs - opposing;
      // Where the gap lands if each side's remaining players hit their projection.
      const finalGap = gap - edge;
      const moreFewer = edge >= 0 ? 'more' : 'fewer';
      const finish = finalGap > 0.05 ? `${pts(finalGap)} behind` : finalGap < -0.05 ? `${pts(-finalGap)} ahead` : 'level';
      return {
        salience: 0.45 + 0.3 * ramp(edge, 0, 25),
        tag: 'Still to come',
        variants: [
          () => say`${side.name} trails by ${pts(gap)}. Their remaining players are projected to score ${pts(Math.abs(edge))} ${moreFewer} than ${other.name}'s, so they're projected to finish ${finish}.`,
          ...(finalGap > 0.05
            ? [() => say`On projections the gap goes from ${pts(gap)} to ${pts(finalGap)}: ${side.name}'s remaining players are projected to score ${pts(Math.abs(edge))} ${moreFewer} than ${other.name}'s.`]
            : []),
        ],
      };
    },
  },

  /* ── rivalry ───────────────────────────────────────────────────────── */
  {
    id: 'rivalry-series',
    family: KEY_FAMILY.RIVALRY,
    phases: ['pre', 'post'],
    run: (context) => {
      const rivalry = context.rivalry;
      if (!rivalry || rivalry.games < 2) return null;
      const { leftWins, rightWins } = rivalry;
      const tied = leftWins === rightWins;
      const leader = tied ? null : leftWins > rightWins ? context.sides.a : context.sides.b;
      return {
        salience: 0.3 + 0.3 * ramp(rivalry.games, 2, 8) + (tied ? 0.15 : 0),
        tag: 'The series',
        variants: [
          () => tied
            ? say`Dead even across linked seasons — ${`${leftWins}–${rightWins}`} in ${`${rivalry.games} meetings`}.`
            : say`${leader.name} leads the series ${`${Math.max(leftWins, rightWins)}–${Math.min(leftWins, rightWins)}`} across ${`${rivalry.games} meetings`} of linked league history.`,
          () => tied
            ? say`${`${rivalry.games} meetings`}, and nothing separates them: the series sits at ${`${leftWins}–${rightWins}`}.`
            : say`This pairing has history — ${`${rivalry.games} meetings`}, ${leader.name} ahead ${`${Math.max(leftWins, rightWins)}–${Math.min(leftWins, rightWins)}`}.`,
        ],
      };
    },
  },
  {
    id: 'rivalry-last-meeting',
    family: KEY_FAMILY.RIVALRY,
    phases: ['pre'],
    run: (context) => {
      const last = context.rivalry?.meetings?.[0];
      if (!last) return null;
      const margin = num(last.margin);
      if (margin == null) return null;
      const close = margin < 5;
      const blowout = margin > 35;
      if (!close && !blowout) return null;
      const winner = last.winner === 'left' ? context.sides.a : last.winner === 'right' ? context.sides.b : null;
      return {
        salience: 0.3 + (close ? 0.35 * (1 - ramp(margin, 0, 5)) : 0.3 * ramp(margin, 35, 70)),
        tag: 'Last time',
        variants: [
          () => winner
            ? say`Their last meeting went to ${winner.name} by ${pts(margin)} in ${`${last.season} Week ${last.week}`}.`
            : say`Their last meeting ended tied in ${`${last.season} Week ${last.week}`}.`,
          () => close
            ? say`${`${last.season} Week ${last.week}`} came down to ${pts(margin)}${winner ? `, ${winner.name}'s way` : ''}. These two do not play blowouts.`
            : say`The last one was not close — ${winner ? `${winner.name} by ` : ''}${pts(margin)} in ${`${last.season} Week ${last.week}`}.`,
        ],
      };
    },
  },
  {
    id: 'rivalry-first',
    family: KEY_FAMILY.RIVALRY,
    phases: ['pre'],
    run: (context) => {
      if (context.rivalry == null) {
        return {
          salience: 0.3,
          tag: 'First meeting',
          variants: [
            () => say`No completed head-to-head exists between these two across linked league seasons. Everything below is form, not history.`,
          ],
        };
      }
      if (context.rivalry.games !== 1) return null;
      const only = context.rivalry.meetings[0];
      const winner = only?.winner === 'left' ? context.sides.a : only?.winner === 'right' ? context.sides.b : null;
      return {
        salience: 0.28,
        tag: 'Thin history',
        variants: [
          () => say`One completed meeting between these two${winner ? `, and ${winner.name} took it by ${pts(only.margin)}` : ''}. Not enough to call it a rivalry yet.`,
        ],
      };
    },
  },

  /* ── slate timing ──────────────────────────────────────────────────── */
  {
    id: 'slate-late-window',
    family: KEY_FAMILY.SLATE,
    phases: ['pre', 'live'],
    run: (context) => {
      const lateA = num(context.sides.a.lateWindowProjection) ?? 0;
      const lateB = num(context.sides.b.lateWindowProjection) ?? 0;
      const gap = lateA - lateB;
      if (Math.abs(gap) < 8) return null;
      const side = context.sides[gap > 0 ? 'a' : 'b'];
      const other = context.sides[gap > 0 ? 'b' : 'a'];
      const sideLate = gap > 0 ? lateA : lateB;
      const otherLate = gap > 0 ? lateB : lateA;
      // "Late" is the model's kickoffWindow: 4 PM ET and later, plus Monday.
      return {
        salience: 0.28 + 0.35 * ramp(Math.abs(gap), 8, 30),
        tag: 'How it ends',
        variants: [
          () => say`Late games still to come (4 PM ET kickoffs and Monday): ${side.name} has ${pts(sideLate)} projected, ${other.name} has ${pts(otherLate)}.`,
          () => say`${side.name} has more of the week left to play late — ${pts(sideLate)} projected from 4 PM ET kickoffs and Monday, against ${pts(otherLate)} for ${other.name}.`,
        ],
      };
    },
  },
  {
    id: 'slate-early-load',
    family: KEY_FAMILY.SLATE,
    phases: ['pre'],
    run: (context) => bothSides(context, (side) => {
      const early = num(side.earlyWindowProjection);
      const total = num(side.projectedTotal);
      if (early == null || !total) return null;
      const share = early / total;
      if (share < 0.7) return null;
      const whole = share >= 0.995;
      return {
        salience: 0.25 + 0.35 * ramp(share, 0.7, 0.95),
        tag: 'Front loaded',
        variants: [
          () => whole
            ? say`Every one of ${side.name}'s starters kicks off in the first window. Their week is over by early Sunday afternoon.`
            : say`${`${Math.round(share * 100)}%`} of ${side.name}'s projection kicks off in the first window. This one is largely decided by early Sunday afternoon.`,
          () => whole
            ? say`${side.name} has nothing left after the early games — all ${pts(early)} of the projection plays in one window.`
            : say`${side.name} is all-in on the early slate — ${pts(early)} of a ${one(total)} projection plays before the late games start.`,
        ],
      };
    }),
  },
];

export const DETECTOR_IDS = DETECTORS.map((detector) => detector.id);

/* ── engine ───────────────────────────────────────────────────────────── */

/**
 * @param context normalized preview context (see buildMatchupPreviewModel)
 * @param options.limit       maximum keys to return (fewer is fine, never padded)
 * @param options.recentIds   detector ids used for this pairing in recent weeks,
 *                            most recent first — demoted so keys rotate
 */
export function buildMatchupKeys(context, { limit = 3, recentIds = [] } = {}) {
  if (!context?.sides?.a || !context?.sides?.b) return [];
  const phase = context.phase ?? 'pre';
  const seed = hashSeed(context.seedKey ?? `${context.leagueId}|${context.season}|${context.week}|${context.sides.a.id}|${context.sides.b.id}`);
  const random = seededSequence(seed);
  const recencyPenalty = new Map((recentIds ?? []).slice(0, 3).map((id, index) => [id, 0.35 - index * 0.1]));

  const candidates = DETECTORS
    .filter((detector) => detector.phases.includes(phase))
    .flatMap((detector) => {
      let produced;
      try {
        produced = detector.run(context);
      } catch {
        // A detector must never take the panel down. A malformed signal is
        // treated exactly like an absent one.
        return [];
      }
      const list = Array.isArray(produced) ? produced : produced ? [produced] : [];
      return list.filter(Boolean).map((candidate, index) => ({
        id: `${detector.id}${index ? `-${index}` : ''}`,
        detectorId: detector.id,
        family: detector.family,
        tag: candidate.tag,
        variants: candidate.variants,
        salience: Math.max(0, Math.min(1, candidate.salience ?? 0.3)),
      }));
    })
    .map((candidate) => ({
      ...candidate,
      // Jitter is small enough never to reorder genuinely different signals,
      // but breaks ties differently for each pairing and week.
      score: candidate.salience - (recencyPenalty.get(candidate.detectorId) ?? 0) + random() * 0.04,
    }))
    .sort((left, right) => right.score - left.score);

  const chosen = [];
  const usedFamilies = new Set();
  const usedDetectors = new Set();
  for (const candidate of candidates) {
    if (chosen.length >= limit) break;
    if (usedFamilies.has(candidate.family) || usedDetectors.has(candidate.detectorId)) continue;
    usedFamilies.add(candidate.family);
    usedDetectors.add(candidate.detectorId);
    chosen.push(candidate);
  }
  // Only once every family has had its turn may a second candidate from an
  // already-used family fill a remaining slot.
  for (const candidate of candidates) {
    if (chosen.length >= limit) break;
    if (usedDetectors.has(candidate.detectorId)) continue;
    usedDetectors.add(candidate.detectorId);
    chosen.push(candidate);
  }

  return chosen.map((candidate) => {
    const variants = candidate.variants.filter(Boolean);
    const pick = variants[Math.floor(random() * variants.length) % variants.length] ?? variants[0];
    const parts = pick();
    return {
      id: candidate.id,
      detectorId: candidate.detectorId,
      family: candidate.family,
      tag: candidate.tag,
      parts,
      text: keyPartsToString(parts),
    };
  });
}
