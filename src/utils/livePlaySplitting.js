// Split an accumulated fantasy stat delta into the individual football plays
// that produced it. Snapshot polling can cover more than one snap, so treating
// the whole delta as one feed event produces impossible rows such as "2 TDs".

const n = (value) => Number(value ?? 0) || 0;

// Stats that describe a discrete play, and the count field that says how many
// of those plays there were.
const PLAY_CATEGORIES = [
  { count: 'pass_cmp', yards: 'pass_yd', tds: 'pass_td' },
  { count: 'rush_att', yards: 'rush_yd', tds: 'rush_td' },
  { count: 'rec', yards: 'rec_yd', tds: 'rec_td' },
];

// One play each, with no yardage to distribute.
const SINGLETON_STATS = ['fgm', 'xpm', 'pass_int', 'fum_lost'];
const CATEGORY_KEYS = new Set([
  ...PLAY_CATEGORIES.flatMap(({ count, yards, tds }) => [count, yards, tds]),
  ...SINGLETON_STATS,
]);

// Spreads a yardage total over a number of plays, keeping the sum exact.
function shareYards(total, plays) {
  if (!plays) return [];
  const base = Math.trunc(total / plays);
  const shares = new Array(plays).fill(base);
  shares[plays - 1] += total - base * plays;
  return shares;
}

/**
 * Converts aggregate stat movement into one stat object per plausible play.
 * It deliberately does not invent order or timestamps; callers own the
 * timeline because only they know when the snapshot was taken.
 */
export function splitDeltaIntoPlays(delta) {
  if (!delta) return [];
  const plays = [];

  PLAY_CATEGORIES.forEach(({ count, yards, tds }) => {
    const scores = n(delta[tds]);
    const yardage = n(delta[yards]);
    // A recorded count is the truth; fall back to touchdowns, or to one play
    // when only yardage moved.
    const total = Math.max(n(delta[count]), scores, yardage !== 0 ? 1 : 0);
    if (!total) return;
    const shares = shareYards(yardage, total);
    for (let index = 0; index < total; index += 1) {
      const play = { [count]: 1, [yards]: shares[index] };
      // Touchdowns go on the closing plays, one apiece — never two together.
      if (index >= total - scores) play[tds] = 1;
      plays.push(play);
    }
  });

  SINGLETON_STATS.forEach((key) => {
    const total = Math.abs(n(delta[key]));
    for (let index = 0; index < total; index += 1) {
      plays.push({ [key]: Math.sign(n(delta[key])) });
    }
  });

  // Anything with no play structure of its own — defensive tallies, fumbles
  // recovered, and provider-specific fields — rides along rather than being
  // dropped. It is still one snapshot event when no structured play exists.
  const leftovers = Object.entries(delta)
    .filter(([key, value]) => !CATEGORY_KEYS.has(key) && n(value) !== 0);
  if (leftovers.length) {
    const carrier = plays.length ? plays[0] : {};
    leftovers.forEach(([key, value]) => { carrier[key] = value; });
    if (!plays.length) plays.push(carrier);
  }

  return plays;
}
