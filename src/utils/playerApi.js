import { cachedFetch, TTL } from './playerCache';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';
const CURRENT_SEASON = 2025;

// Some app IDs differ from ESPN's roster endpoint slug
const TEAM_ESPN_ID = {
  WSH: 'wsh',
  WAS: 'wsh',  // Sleeper uses WAS, ESPN uses WSH
  LAR: 'lar',
  NE:  'ne',
  LV:  'lv',
  LAC: 'lac',
  NYG: 'nyg',
  NYJ: 'nyj',
  NO:  'no',
  TB:  'tb',
  KC:  'kc',
  SF:  'sf',
  GB:  'gb',
  JAX: 'jax',  // Sleeper uses JAX (ESPN abbreviation is JAC but API slug is jax)
};
const toEspnTeamId = id => TEAM_ESPN_ID[id] ?? id.toLowerCase();

// Headshot URL — will 404 for some players; handle with onError
export const headshot = id =>
  `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;

function normalizeEspnPosition(position) {
  const pos = String(position ?? '').toUpperCase();
  if (pos === 'PK') return 'K';
  return pos;
}

// Normalize a raw ESPN athlete entry from a roster response
function normalizePlayer(athlete, teamId) {
  return {
    id:          athlete.id,
    displayName: athlete.displayName ?? athlete.fullName ?? '',
    jersey:      athlete.jersey ?? '',
    position:    normalizeEspnPosition(athlete.position?.abbreviation),
    positionName: athlete.position?.displayName ?? '',
    experience:  athlete.experience?.years ?? 0,
    status:      athlete.status?.type?.description ?? 'Active',
    teamId,
  };
}

/**
 * Fetch the roster for a team.
 * Returns normalized player array: { id, displayName, jersey, position, experience, status, teamId }
 */
export async function fetchRoster(teamId) {
  return cachedFetch(`roster_v3_${teamId}`, async () => {
    const url = `${ESPN_BASE}/teams/${toEspnTeamId(teamId)}/roster`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Roster fetch failed: ${res.status}`);
    const json = await res.json();

    // ESPN roster response wraps athletes in groups by position category.
    // Items within each group are in ESPN's implicit depth-chart order —
    // capture that index as rosterOrder so the UI can use it as a ranking signal.
    const athletes = [];
    const groups = json.athletes ?? [];
    for (const group of groups) {
      const items = group.items ?? [];
      items.forEach((a, i) => {
        athletes.push({ ...normalizePlayer(a, teamId), rosterOrder: i });
      });
    }
    return athletes;
  }, TTL.roster);
}

/**
 * Fetch season stats for a player.
 * season: 4-digit year for a specific season, or null for the current season.
 * Correct endpoint: /seasons/{year}/types/2/athletes/{id}/statistics/0
 */
export async function fetchPlayerStats(playerId, season = null) {
  const s = season ?? CURRENT_SEASON;
  const isHistorical = s < CURRENT_SEASON;
  // v2 prefix busts old cache entries that incorrectly stored career totals
  const cacheKey = `stats_v2_${playerId}_${s}`;
  const ttl = isHistorical ? TTL.historical : TTL.stats;

  return cachedFetch(cacheKey, async () => {
    const url = `${ESPN_CORE}/seasons/${s}/types/2/athletes/${playerId}/statistics/0?lang=en&region=us`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Stats fetch failed: ${res.status}`);
    return res.json();
  }, ttl);
}

// Playoff week number → round label
function playoffRoundLabel(weekNum) {
  // Week 4 is the bye between Conference Championships and the Super Bowl
  return { 1: 'Wild Card', 2: 'Divisional', 3: 'Conf. Champ.', 5: 'Super Bowl' }[weekNum] ?? 'Playoffs';
}

// Build an eventId → meta map from a site-API schedule response
function buildMetaMap(schedData, teamAbbrev, isPostseason) {
  const map = {};
  for (const event of (schedData.events ?? [])) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const myComp  = comp.competitors?.find(c => c.team?.abbreviation === teamAbbrev);
    const oppComp = comp.competitors?.find(c => c.team?.abbreviation !== teamAbbrev);
    if (!myComp || !oppComp) continue;
    const away   = myComp.homeAway === 'away';
    const winner = myComp.winner;
    map[event.id] = {
      week:        event.week?.number ?? null,
      opponent:    `${away ? '@' : 'vs '}${oppComp.team?.abbreviation ?? '?'}`,
      result:      winner === true ? 'W' : winner === false ? 'L' : '-',
      score:       `${myComp.score?.displayValue ?? '?'}-${oppComp.score?.displayValue ?? '?'}`,
      myTeam:      myComp.team?.abbreviation ?? null,
      isPostseason,
      roundLabel:  isPostseason ? playoffRoundLabel(event.week?.number) : null,
      completed:   comp.status?.type?.completed ?? false,
    };
  }
  return map;
}

/**
 * Fetch game-by-game stats for a player for a given season, including playoffs.
 * Combines:
 *   - ESPN Core eventlog (regular season)  → per-game statistics $refs
 *   - ESPN Site team schedule (reg + post)  → opponent, date, result, score
 *   - Constructed stats URLs for postseason games (eventlog ignores seasontype param)
 * Returns [{ eventId, meta, statsJson }] sorted reg-season first, then playoffs.
 */
export async function fetchGameLog(playerId, teamId, season) {
  const isHistorical = season < CURRENT_SEASON;
  const ttl = isHistorical ? TTL.historical : TTL.stats;

  return cachedFetch(`gamelog_v8_${playerId}_${season}`, async () => {
    const abbrev = teamId.toUpperCase();

    // Step 1: Fetch the eventlog first — needed to resolve the actual team for this season.
    // The passed-in teamId is the player's *current* team, which may differ for historical seasons.
    const logRes = await fetch(`${ESPN_CORE}/seasons/${season}/athletes/${playerId}/eventlog?lang=en&region=us`);
    if (!logRes.ok) return [];

    const logData = await logRes.json();
    const rawItems = logData.events?.items ?? [];
    const items = Array.isArray(rawItems) ? rawItems : Object.values(rawItems);

    // Extract ESPN numeric competitor ID from any regular-season stats $ref
    // e.g. ".../competitors/25/roster/..." → "25"  (25 = SEA's ESPN team ID)
    let espnCompetitorId = null;
    for (const item of items) {
      const m = (item.statistics?.$ref ?? '').match(/competitors\/(\d+)\/roster/);
      if (m) { espnCompetitorId = m[1]; break; }
    }

    // Step 2: Resolve the actual team abbreviation for this season.
    // The competitor ID in the stats $ref URL is ESPN's persistent numeric team ID.
    // Fetching /teams/{id} returns the abbreviation directly (unlike the competitor endpoint,
    // which wraps team data in a $ref pointer and would silently return undefined).
    let actualAbbrev = abbrev;
    if (espnCompetitorId) {
      try {
        const teamRes = await fetch(`${ESPN_CORE}/teams/${espnCompetitorId}?lang=en&region=us`);
        if (teamRes.ok) {
          const teamData = await teamRes.json();
          actualAbbrev = teamData.abbreviation ?? abbrev;
        }
      } catch { /* use fallback */ }
    }

    // Step 3: Fetch the correct team's schedule (reg + post) in parallel
    const [schedRes, postSchedRes] = await Promise.all([
      fetch(`${ESPN_BASE}/teams/${toEspnTeamId(actualAbbrev)}/schedule?season=${season}&seasontype=2`),
      fetch(`${ESPN_BASE}/teams/${toEspnTeamId(actualAbbrev)}/schedule?season=${season}&seasontype=3`),
    ]);

    // Build metadata maps using the resolved team abbreviation
    const regMeta  = schedRes.ok      ? buildMetaMap(await schedRes.json(),      actualAbbrev, false) : {};
    const postMeta = postSchedRes.ok  ? buildMetaMap(await postSchedRes.json(),  actualAbbrev, true)  : {};

    // Regular-season per-game stats (via eventlog $refs), including inactive/DNP games
    const regGamesRaw = await Promise.all(items.map(async (item) => {
      // Get event ID from stats $ref or event $ref (inactive games may lack stats $ref)
      const statsRef = item.statistics?.$ref;
      const eventRef = item.event?.$ref ?? '';
      const eventId = statsRef?.match(/events\/(\d+)/)?.[1]
        ?? eventRef.match(/events\/(\d+)/)?.[1];
      if (!eventId) return null;

      if (!item.played) {
        // Include completed games where the player was inactive
        const meta = regMeta[eventId];
        if (!meta?.completed) return null;
        return { eventId, meta: { ...meta, isInactive: true }, statsJson: null };
      }

      if (!statsRef) return null;
      try {
        // ESPN Core $ref URLs use http:// — upgrade to https:// to avoid mixed-content
        // blocking when the app is served over HTTPS.
        const secureRef = statsRef.replace(/^http:\/\//, 'https://');
        const res = await fetch(secureRef);
        if (!res.ok) return null;
        return { eventId, meta: regMeta[eventId] ?? {}, statsJson: await res.json() };
      } catch { return null; }
    }));

    const regGames = regGamesRaw.filter(Boolean);

    // Insert synthetic BYE rows for missing week numbers between 1 and the highest week played
    const coveredWeeks = new Set(regGames.map(g => g.meta?.week).filter(w => w != null));
    const maxWeek = coveredWeeks.size > 0 ? Math.max(...coveredWeeks) : 0;
    for (let w = 1; w <= maxWeek; w++) {
      if (!coveredWeeks.has(w)) {
        regGames.push({
          eventId: `bye_${w}`,
          meta: { week: w, opponent: 'BYE', result: '-', score: '', myTeam: actualAbbrev, isBye: true },
          statsJson: null,
        });
      }
    }

    // Sort regular-season games by week number
    regGames.sort((a, b) => (a.meta?.week ?? 99) - (b.meta?.week ?? 99));

    // Postseason per-game stats (constructed URL — eventlog can't be filtered by seasontype)
    const postGames = espnCompetitorId
      ? await Promise.all(
          Object.entries(postMeta)
            .filter(([, m]) => m.completed)
            .map(async ([eventId, meta]) => {
              try {
                const url = `${ESPN_CORE}/events/${eventId}/competitions/${eventId}/competitors/${espnCompetitorId}/roster/${playerId}/statistics/0?lang=en&region=us`;
                const res = await fetch(url);
                if (!res.ok) return null;
                return { eventId, meta, statsJson: await res.json() };
              } catch { return null; }
            })
        )
      : [];

    return [...regGames, ...postGames.filter(Boolean)];
  }, ttl);
}

/**
 * Fetch career stats (all-time totals) for a player.
 * Uses the /statistics/0 endpoint on the core API.
 */
export async function fetchPlayerCareerStats(playerId) {
  return cachedFetch(`stats_${playerId}_career`, async () => {
    const url = `${ESPN_CORE}/athletes/${playerId}/statistics/0?lang=en&region=us`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Career stats fetch failed: ${res.status}`);
    return res.json();
  }, TTL.historical);
}

/**
 * Fetch player bio, which includes major league award history.
 * Returns { awards: [{ id, name, displayCount, seasons: ['2024', ...] }] }
 * Awards covered: NFL MVP, Super Bowl MVP, OPOY, DPOY, ROTY, DROTY,
 *                 Comeback POTY, Walter Payton MOTY.
 * Pro Bowl / All-Pro are NOT in this API — use honors.json for those.
 */
export async function fetchPlayerBio(playerId) {
  return cachedFetch(`bio_${playerId}`, async () => {
    const url = `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${playerId}/bio`;
    const res = await fetch(url);
    if (!res.ok) return { awards: [] };
    return res.json();
  }, TTL.bio);
}

/**
 * Fetch the depth chart for a team.
 * Returns a flat map: { [playerId]: rank } where rank is 1-based (1 = starter).
 * Players not on the depth chart are absent from the map.
 */
export async function fetchDepthChart(teamId) {
  // v2: corrected for actual ESPN response shape:
  //   data.depthchart[] → group.positions{} → posSlot.athletes[] (order = depth rank)
  return cachedFetch(`depthchart_v2_${teamId}`, async () => {
    const url = `${ESPN_BASE}/teams/${toEspnTeamId(teamId)}/depthcharts`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const data = await res.json();
    const rankMap = {};
    for (const group of (data.depthchart ?? [])) {
      for (const posSlot of Object.values(group.positions ?? {})) {
        (posSlot.athletes ?? []).forEach((athlete, idx) => {
          const id = String(athlete.id ?? '');
          const rank = idx + 1; // array order is depth order; make 1-based
          if (id && (rankMap[id] == null || rank < rankMap[id])) {
            rankMap[id] = rank; // keep best (lowest) rank if player appears in multiple slots
          }
        });
      }
    }
    return rankMap;
  }, TTL.roster);
}

// ── Season schedule lookup ────────────────────────────────────────────────────

// ESPN uses different abbreviations than Sleeper for some teams.
const ESPN_ABBR_TO_SLEEPER = { WSH: 'WAS', JAC: 'JAX' };
const normalizeEspnAbbr = a => ESPN_ABBR_TO_SLEEPER[a?.toUpperCase()] ?? a?.toUpperCase() ?? '';

/**
 * Fetch one week of the NFL schedule from ESPN's scoreboard.
 * Returns { [sleeperTeamAbbr]: { opp: sleeperTeamAbbr, home: boolean } }
 *
 * Cache strategy: permanently cached (TTL.historical) only when the week has
 * actual game data. Unplayed/future weeks are fetched fresh each session so
 * they pick up real data once games are scheduled and completed.
 * Cache key v2 busts old v1 entries that may have been permanently stored empty
 * (happened when a user first loaded stats before those weeks were played).
 */
async function fetchWeekSchedule(season, week) {
  const url = `${ESPN_BASE}/scoreboard?seasontype=2&week=${week}&dates=${season}`;
  return cachedFetch(
    `sched_v4_${season}_${week}`,
    async () => {
      const res = await fetch(url);
      if (!res.ok) return {};
      const data = await res.json();
      const map = {};
      for (const event of data?.events ?? []) {
        const comps = event?.competitions?.[0]?.competitors ?? [];
        const homeC = comps.find(c => c.homeAway === 'home');
        const awayC = comps.find(c => c.homeAway === 'away');
        if (!homeC || !awayC) continue;
        const homeAbbr = normalizeEspnAbbr(homeC.team?.abbreviation);
        const awayAbbr = normalizeEspnAbbr(awayC.team?.abbreviation);
        if (!homeAbbr || !awayAbbr) continue;
        const completed = event.competitions?.[0]?.status?.type?.completed ?? false;
        const parseScore = (c) => {
          const s = c.score;
          if (!completed || s == null || s === '') return null;
          if (typeof s === 'string' || typeof s === 'number') return Number(s);
          if (s.value != null) return Number(s.value);
          if (s.displayValue != null) return Number(s.displayValue);
          return null;
        };
        const homePts = parseScore(homeC);
        const awayPts = parseScore(awayC);
        // espnEventId and espnCompetitorId are captured here so the per-player
        // enhancement can cross-reference a player's eventlog competitor IDs
        // (extracted from stats $ref URLs) against the schedule to determine
        // which team they were actually on for each specific game.
        // competitor.team.id is the ESPN franchise ID (e.g. "12" for KC) — the
        // same ID embedded in the core API eventlog stats $ref competitor path.
        // competitor.id is a competition-specific ID and does NOT match.
        map[homeAbbr] = { opp: awayAbbr, home: true,  ptsFor: homePts, ptsAgainst: awayPts, espnEventId: event.id, espnCompetitorId: homeC.team?.id };
        map[awayAbbr] = { opp: homeAbbr, home: false, ptsFor: awayPts, ptsAgainst: homePts, espnEventId: event.id, espnCompetitorId: awayC.team?.id };
      }
      return map;
    },
    TTL.historical,
    // Only permanently cache weeks that have actual game data.
    // Unplayed weeks return an empty map and will be re-fetched next session.
    (data) => data != null && Object.keys(data).length > 0,
  );
}

/**
 * Fetch the ESPN eventlog for a player and return a map of ESPN event IDs to
 * ESPN competitor IDs extracted from the statistics $ref URL of each game entry.
 *
 * The competitor ID embedded in the stats $ref URL is set at game time and never
 * updated when a player is traded — it always reflects the team they actually
 * played for in that specific game.
 *
 * Returns { [espnEventId]: espnCompetitorId } or null on failure.
 * Cached permanently for past seasons; 1-hour TTL for the current season.
 */
export async function fetchPlayerGameTeamMap(espnPlayerId, season) {
  const isHistorical = parseInt(season) < CURRENT_SEASON;
  const ttl = isHistorical ? TTL.historical : 60 * 60 * 1000;
  return cachedFetch(`nfl_gt_v2_${espnPlayerId}_${season}`, async () => {
    const res = await fetch(
      `${ESPN_CORE}/seasons/${season}/athletes/${espnPlayerId}/eventlog?lang=en&region=us`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rawItems = data.events?.items ?? [];
    const items = Array.isArray(rawItems) ? rawItems : Object.values(rawItems);

    // Pass 1: extract eventId + competitorId from statistics.$ref where available.
    // Stats $ref format: .../events/{eventId}/competitors/{competitorId}/roster/...
    const map = {};
    const eventsWithoutComp = [];
    for (const item of items) {
      const statsRef = item.statistics?.$ref ?? '';
      const eventRef = item.event?.$ref ?? '';
      const eventId = statsRef.match(/events\/(\d+)/)?.[1]
        ?? eventRef.match(/events\/(\d+)/)?.[1];
      const competitorId = statsRef.match(/competitors\/(\d+)/)?.[1];
      if (!eventId) continue;
      if (competitorId) {
        map[eventId] = competitorId;
      } else {
        eventsWithoutComp.push(eventId);
      }
    }

    // Pass 2: for eventlog entries that had an event ID but no competitor ID
    // (common for defensive players whose statistics.$ref is absent), fall back
    // to the most common competitor ID from entries that DID resolve.
    // This is safe because mid-season team changes are rare; the competitor ID
    // represents the team the player was on for most/all of the season.
    if (eventsWithoutComp.length > 0 && Object.keys(map).length > 0) {
      const compCounts = {};
      for (const compId of Object.values(map)) {
        compCounts[compId] = (compCounts[compId] ?? 0) + 1;
      }
      const fallbackComp = Object.entries(compCounts).sort((a, b) => b[1] - a[1])[0][0];
      for (const eventId of eventsWithoutComp) {
        map[eventId] = fallbackComp;
      }
    }

    return Object.keys(map).length > 0 ? map : null;
  }, ttl, (d) => d != null);
}

/**
 * Fetch the full NFL season schedule from ESPN, all 18 regular-season weeks.
 * Returns { [week]: { [sleeperTeamAbbr]: { opp: string, home: boolean } } }
 * Individual weeks are cached indefinitely once fetched.
 */
export async function fetchSeasonSchedule(season) {
  const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
  const results = await Promise.all(weeks.map(w => fetchWeekSchedule(season, w).catch(() => ({}))));
  const map = {};
  weeks.forEach((w, i) => { map[w] = results[i]; });
  return map;
}

export { CURRENT_SEASON, toEspnTeamId };
