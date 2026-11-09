// Pure ESPN player-data fetching shared by the browser (playerApi.js) and the
// server-side player data cache (server/playerDataHandlers.js).
//
// Nothing here touches localStorage, IndexedDB, or build-time globals. Every
// network call goes through the injected `fetchImpl`, so the server can route
// ESPN traffic through its throttled upstream client while the browser passes
// window.fetch.

export const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
export const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';

// GridShift's league year runs from March through February, matching the
// season range used by SleeperContext.
export function getCurrentSeason(now = new Date()) {
  return now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
}

const CAREER_STAT_REPAIR_START_SEASON = 2006;

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
export const toEspnTeamId = id => TEAM_ESPN_ID[id] ?? id.toLowerCase();

export function extractTeamIdFromRef(ref) {
  if (typeof ref !== 'string') return null;
  return ref.match(/teams\/(\d+)/)?.[1] ?? null;
}

/**
 * Resolve an ESPN numeric team ID to its abbreviation.
 * `failed` distinguishes a transient lookup failure from a team that simply has
 * no abbreviation, so callers can avoid persisting data built on a wrong team.
 */
async function lookupEspnTeamAbbrev(fetchImpl, teamId) {
  if (!teamId) return { abbrev: null, failed: false };
  try {
    const res = await fetchImpl(`${ESPN_CORE}/teams/${teamId}?lang=en&region=us`);
    if (!res.ok) return { abbrev: null, failed: res.status !== 404 };
    const teamData = await res.json();
    return { abbrev: teamData.abbreviation ?? null, failed: false };
  } catch {
    return { abbrev: null, failed: true };
  }
}

export async function fetchEspnTeamAbbrev(fetchImpl, teamId) {
  return (await lookupEspnTeamAbbrev(fetchImpl, teamId)).abbrev;
}

// ── Career-stat repair ────────────────────────────────────────────────────────

function getCareerStatEntry(statsJson, statName) {
  const categories = statsJson?.splits?.categories ?? [];
  for (const category of categories) {
    const entry = (category.stats ?? []).find(stat => stat.name === statName);
    if (entry) return entry;
  }
  return null;
}

function getStatValue(statsJson, statName) {
  const value = getCareerStatEntry(statsJson, statName)?.value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function setCareerStatValue(statsJson, statName, value) {
  const entry = getCareerStatEntry(statsJson, statName);
  if (!entry) return;
  entry.value = value;
  entry.displayValue = Number(value).toLocaleString('en-US', {
    maximumFractionDigits: 1,
  });
}

async function fetchSeasonStatValue(getSeasonStats, playerId, season, statName) {
  try {
    const stats = await getSeasonStats(playerId, season);
    return getStatValue(stats, statName) ?? 0;
  } catch {
    return 0;
  }
}

// ESPN's career endpoint reports 0 tackles for loss, so the total is rebuilt
// from per-season stats. That only matters for defenders, who are the only
// players whose profile shows the stat.
const DEFENSIVE_POSITIONS = new Set([
  'DE', 'DT', 'DL', 'NT', 'EDGE', 'LB', 'ILB', 'OLB', 'MLB', 'CB', 'DB', 'S', 'FS', 'SS',
]);

// One athlete lookup decides whether the repair runs and how far back it needs
// to look. If the lookup fails the repair runs in full, which is slower but
// never leaves a defender's total wrong.
async function lookupRepairScope(fetchImpl, playerId) {
  const unknown = { defensive: true, startSeason: CAREER_STAT_REPAIR_START_SEASON };
  try {
    const res = await fetchImpl(`${ESPN_CORE}/athletes/${playerId}?lang=en&region=us`);
    if (!res.ok) return unknown;
    const athlete = await res.json();
    const position = String(athlete.position?.abbreviation ?? '').toUpperCase();
    if (!position) return unknown;
    const debutYear = Number(athlete.debutYear);
    return {
      defensive: DEFENSIVE_POSITIONS.has(position),
      startSeason: Number.isFinite(debutYear)
        ? Math.max(CAREER_STAT_REPAIR_START_SEASON, debutYear)
        : CAREER_STAT_REPAIR_START_SEASON,
    };
  } catch {
    return unknown;
  }
}

async function repairCareerDefensiveStats(fetchImpl, playerId, careerStats, { currentSeason, getSeasonStats }) {
  const tfl = getStatValue(careerStats, 'tacklesForLoss');
  const sacks = getStatValue(careerStats, 'sacks');
  const tackles = getStatValue(careerStats, 'totalTackles');
  const shouldRepairTfl = tfl === 0 && ((sacks ?? 0) > 0 || (tackles ?? 0) > 0);

  if (!shouldRepairTfl) return careerStats;

  const scope = await lookupRepairScope(fetchImpl, playerId);
  if (!scope.defensive) return careerStats;

  const seasons = Array.from(
    { length: Math.max(0, currentSeason - scope.startSeason + 1) },
    (_, i) => scope.startSeason + i
  );
  const values = await Promise.all(
    seasons.map(season => fetchSeasonStatValue(getSeasonStats, playerId, season, 'tacklesForLoss'))
  );
  const total = values.reduce((sum, value) => sum + value, 0);

  if (total > 0) setCareerStatValue(careerStats, 'tacklesForLoss', total);
  return careerStats;
}

// ── Season and career stats ───────────────────────────────────────────────────

/**
 * Season stats: /seasons/{year}/types/2/athletes/{id}/statistics/0
 * Resolves to { ok, status, data } so callers choose how to treat a non-2xx.
 */
export async function fetchPlayerSeasonStatsRaw(fetchImpl, playerId, season) {
  const url = `${ESPN_CORE}/seasons/${season}/types/2/athletes/${playerId}/statistics/0?lang=en&region=us`;
  const res = await fetchImpl(url);
  if (!res.ok) return { ok: false, status: res.status, data: null };
  return { ok: true, status: res.status, data: await res.json() };
}

/**
 * Career stats (all-time totals) with the defensive tackles-for-loss repair.
 * `getSeasonStats(playerId, season)` supplies the per-season JSON used by the
 * repair, so each caller can back it with its own cache.
 */
export async function fetchPlayerCareerStatsRaw(fetchImpl, playerId, { currentSeason, getSeasonStats }) {
  const url = `${ESPN_CORE}/athletes/${playerId}/statistics/0?lang=en&region=us`;
  const res = await fetchImpl(url);
  if (!res.ok) return { ok: false, status: res.status, data: null };
  const careerStats = await res.json();
  const data = await repairCareerDefensiveStats(fetchImpl, playerId, careerStats, { currentSeason, getSeasonStats });
  return { ok: true, status: res.status, data };
}

// ── Schedule metadata ─────────────────────────────────────────────────────────

// Playoff week number → round label
function playoffRoundLabel(weekNum) {
  // Week 4 is the bye between Conference Championships and the Super Bowl
  return { 1: 'Wild Card', 2: 'Divisional', 3: 'Conf. Champ.', 5: 'Super Bowl' }[weekNum] ?? 'Playoffs';
}

// Build an eventId → meta map from a site-API schedule response
export function parseCompetitorScore(competitor, completed) {
  if (!completed) return null;
  const score = competitor?.score;
  if (score === null || score === undefined || score === '') return null;
  const raw = typeof score === 'object'
    ? (score.value ?? score.displayValue)
    : score;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function displayCompetitorScore(competitor) {
  const score = competitor?.score;
  if (score === null || score === undefined || score === '') return '?';
  if (typeof score === 'object') return score.displayValue ?? score.value ?? '?';
  return score;
}

function getCompetitorResult(myComp, oppComp, completed) {
  if (!completed) return '-';
  const myScore = parseCompetitorScore(myComp, completed);
  const oppScore = parseCompetitorScore(oppComp, completed);
  if (Number.isFinite(myScore) && Number.isFinite(oppScore)) {
    if (myScore > oppScore) return 'W';
    if (myScore < oppScore) return 'L';
    return 'T';
  }

  const winner = myComp?.winner;
  return winner === true ? 'W' : winner === false ? 'L' : '-';
}

export function buildMetaMap(schedData, teamAbbrev, isPostseason) {
  const map = {};
  for (const event of (schedData.events ?? [])) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const myComp  = comp.competitors?.find(c => c.team?.abbreviation === teamAbbrev);
    const oppComp = comp.competitors?.find(c => c.team?.abbreviation !== teamAbbrev);
    if (!myComp || !oppComp) continue;
    const away   = myComp.homeAway === 'away';
    const completed = comp.status?.type?.completed ?? false;
    map[event.id] = {
      week:        event.week?.number ?? null,
      opponent:    `${away ? '@' : 'vs '}${oppComp.team?.abbreviation ?? '?'}`,
      result:      getCompetitorResult(myComp, oppComp, completed),
      score:       `${displayCompetitorScore(myComp)}-${displayCompetitorScore(oppComp)}`,
      myTeam:      myComp.team?.abbreviation ?? null,
      isPostseason,
      roundLabel:  isPostseason ? playoffRoundLabel(event.week?.number) : null,
      completed,
    };
  }
  return map;
}

// ── Game log ──────────────────────────────────────────────────────────────────

// A non-2xx other than 404 means ESPN failed to answer, not that the data does
// not exist. Anything built on such a response must not be persisted as final.
const isTransientFailure = res => !res.ok && res.status !== 404;

/**
 * Per-game stats for one player-season, using:
 *   - ESPN Core eventlog                     → which games the player appeared in
 *   - ESPN Site team schedule (reg + post)   → opponent, date, result, score
 *   - Constructed stats URLs for postseason games (eventlog ignores seasontype)
 *
 * Resolves to { games, incomplete }. `games` is [{ eventId, meta, statsJson }]
 * sorted reg-season first, then playoffs. `incomplete` is true when any ESPN
 * call failed transiently, meaning `games` may be missing rows or metadata and
 * should not be stored permanently.
 *
 * `existingGames` (a previously stored log for the same player-season) lets a
 * refresh reuse the per-game stats of already-completed games instead of
 * refetching them; only new games cost a request.
 */
export async function fetchPlayerGameLogRaw(fetchImpl, { playerId, teamId, season, existingGames = null }) {
  let incomplete = false;
  try {
    const abbrev = teamId?.toUpperCase?.() ?? null;

    // Reusable per-game rows: finished games only, so a game captured mid-play
    // is always refetched once it completes.
    const known = new Map();
    for (const game of existingGames ?? []) {
      if (game?.meta?.completed && !game.meta.isBye && game.eventId != null) {
        known.set(String(game.eventId), game);
      }
    }

    // Step 1: Fetch the eventlog first — needed to resolve the actual team for this season.
    // The passed-in teamId is the player's *current* team, which may differ for historical seasons.
    const logRes = await fetchImpl(`${ESPN_CORE}/seasons/${season}/athletes/${playerId}/eventlog?lang=en&region=us`);
    if (!logRes.ok) return { games: [], incomplete: isTransientFailure(logRes) };

    const logData = await logRes.json();
    const rawItems = logData.events?.items ?? [];
    const items = Array.isArray(rawItems) ? rawItems : Object.values(rawItems);

    // Each game's ESPN team ID comes from its stats $ref
    // (".../competitors/25/roster/..." → "25", SEA) or, for a game without
    // stats, the item's own team reference. It is set at game time, so a
    // player traded mid-season carries a different ID after the trade.
    const parsedItems = items.map((item) => {
      const statsRef = item.statistics?.$ref;
      const eventRef = item.event?.$ref ?? '';
      const eventId = statsRef?.match(/events\/(\d+)/)?.[1]
        ?? eventRef.match(/events\/(\d+)/)?.[1]
        ?? null;
      const competitorId = statsRef?.match(/competitors\/(\d+)\/roster/)?.[1]
        ?? (item.teamId != null ? String(item.teamId) : null)
        ?? extractTeamIdFromRef(item.team?.$ref);
      return { item, statsRef, eventId, competitorId };
    });

    // Step 2: Resolve every team the player appeared for this season.
    // Fetching /teams/{id} returns the abbreviation directly (unlike the competitor endpoint,
    // which wraps team data in a $ref pointer and would silently return undefined).
    const competitorIds = [...new Set(parsedItems.map(p => p.competitorId).filter(Boolean))];
    const abbrevByCompetitor = new Map();
    await Promise.all(competitorIds.map(async (competitorId) => {
      const lookup = await lookupEspnTeamAbbrev(fetchImpl, competitorId);
      if (lookup.failed) incomplete = true;
      const resolved = lookup.abbrev ?? abbrev;
      if (resolved) abbrevByCompetitor.set(competitorId, resolved);
    }));
    const teamAbbrevs = [...new Set(competitorIds.map(id => abbrevByCompetitor.get(id)).filter(Boolean))];
    if (teamAbbrevs.length === 0 && abbrev) teamAbbrevs.push(abbrev);
    if (teamAbbrevs.length === 0) return { games: [], incomplete };

    // Step 3: Fetch each team's schedule (reg + post) in parallel
    const schedules = await Promise.all(teamAbbrevs.map(async (teamAbbrev) => {
      const [schedRes, postSchedRes] = await Promise.all([
        fetchImpl(`${ESPN_BASE}/teams/${toEspnTeamId(teamAbbrev)}/schedule?season=${season}&seasontype=2`),
        fetchImpl(`${ESPN_BASE}/teams/${toEspnTeamId(teamAbbrev)}/schedule?season=${season}&seasontype=3`),
      ]);
      if (isTransientFailure(schedRes) || isTransientFailure(postSchedRes)) incomplete = true;
      return [teamAbbrev, {
        reg:  schedRes.ok     ? buildMetaMap(await schedRes.json(),     teamAbbrev, false) : {},
        post: postSchedRes.ok ? buildMetaMap(await postSchedRes.json(), teamAbbrev, true)  : {},
      }];
    }));
    const metaByTeam = new Map(schedules);

    // Played games use their own team's schedule. Week numbers from those
    // games then place a game without a team ID (inactive, or a matchup
    // between his two teams) with the team he was on at the time.
    const findRegMeta = (eventId, teamAbbrev) => {
      const own = teamAbbrev ? metaByTeam.get(teamAbbrev)?.reg?.[eventId] : null;
      if (own) return { teamAbbrev, meta: own };
      for (const [candidate, { reg }] of metaByTeam) {
        if (reg[eventId]) return { teamAbbrev: candidate, meta: reg[eventId] };
      }
      return { teamAbbrev, meta: null };
    };
    const teamWeeks = [];
    for (const { eventId, competitorId } of parsedItems) {
      const teamAbbrev = abbrevByCompetitor.get(competitorId);
      if (!eventId || !teamAbbrev) continue;
      const week = metaByTeam.get(teamAbbrev)?.reg?.[eventId]?.week;
      if (week != null) teamWeeks.push({ week, teamAbbrev, competitorId });
    }
    teamWeeks.sort((a, b) => a.week - b.week);
    const teamStintForWeek = (week) => {
      if (teamWeeks.length === 0) return null;
      if (week == null) return teamWeeks[teamWeeks.length - 1];
      let stint = teamWeeks[0];
      for (const entry of teamWeeks) {
        if (entry.week > week) break;
        stint = entry;
      }
      return stint;
    };
    const teamForEvent = (eventId, competitorId) => {
      const known = abbrevByCompetitor.get(competitorId);
      if (known) return known;
      const candidates = teamAbbrevs.filter(team => metaByTeam.get(team)?.reg?.[eventId]);
      if (candidates.length <= 1) return candidates[0] ?? teamAbbrevs[0];
      const stint = teamStintForWeek(metaByTeam.get(candidates[0]).reg[eventId].week);
      return candidates.includes(stint?.teamAbbrev) ? stint.teamAbbrev : candidates[0];
    };

    // Regular-season per-game stats (via eventlog $refs), including inactive/DNP games
    const regGamesRaw = await Promise.all(parsedItems.map(async ({ item, statsRef, eventId, competitorId }) => {
      // Inactive games may lack a stats $ref, so the event ID can come from the event $ref
      if (!eventId) return null;
      const { meta } = findRegMeta(eventId, teamForEvent(eventId, competitorId));

      if (!item.played) {
        // Include completed games where the player was inactive
        if (!meta?.completed) return null;
        return { eventId, meta: { ...meta, isInactive: true }, statsJson: null };
      }

      if (!statsRef) return null;

      const prior = known.get(eventId);
      if (prior?.statsJson && meta?.completed) {
        return { eventId, meta, statsJson: prior.statsJson };
      }

      try {
        // ESPN Core $ref URLs use http:// — upgrade to https:// to avoid mixed-content
        // blocking when the app is served over HTTPS.
        const secureRef = statsRef.replace(/^http:\/\//, 'https://');
        const res = await fetchImpl(secureRef);
        if (!res.ok) {
          if (isTransientFailure(res)) incomplete = true;
          return null;
        }
        return { eventId, meta: meta ?? {}, statsJson: await res.json() };
      } catch {
        incomplete = true;
        return null;
      }
    }));

    const regGames = regGamesRaw.filter(Boolean);

    // Insert synthetic BYE rows for weeks up to the highest week played that his
    // team for that week had no game. A week his team did play that ESPN does not
    // list for him (before he joined, or off the roster) gets no row at all.
    const coveredWeeks = new Set(regGames.map(g => g.meta?.week).filter(w => w != null));
    const maxWeek = coveredWeeks.size > 0 ? Math.max(...coveredWeeks) : 0;
    const teamPlayedWeek = (teamAbbrev, week) => Object.values(metaByTeam.get(teamAbbrev)?.reg ?? {})
      .some(meta => meta.week === week);
    for (let w = 1; w <= maxWeek; w++) {
      if (coveredWeeks.has(w)) continue;
      // A gap right after a trade can be the new team's bye (traded, then the
      // old team plays without him while the new team rests).
      const previousTeam = teamStintForWeek(w)?.teamAbbrev ?? teamAbbrevs[0];
      const nextTeam = teamWeeks.find(entry => entry.week > w)?.teamAbbrev ?? previousTeam;
      const weekTeam = [previousTeam, nextTeam].find(team => !teamPlayedWeek(team, w));
      if (!weekTeam) continue;
      regGames.push({
        eventId: `bye_${w}`,
        meta: { week: w, opponent: 'BYE', result: '-', score: '', myTeam: weekTeam, isBye: true },
        statsJson: null,
      });
    }

    // Sort regular-season games by week number
    regGames.sort((a, b) => (a.meta?.week ?? 99) - (b.meta?.week ?? 99));

    // Postseason games belong to the team he finished the regular season with.
    const finalStint = teamStintForWeek(null)
      ?? (competitorIds.length > 0
        ? { competitorId: competitorIds[competitorIds.length - 1], teamAbbrev: abbrevByCompetitor.get(competitorIds[competitorIds.length - 1]) }
        : null);
    const espnCompetitorId = finalStint?.competitorId ?? null;
    const postMeta = metaByTeam.get(finalStint?.teamAbbrev)?.post ?? {};

    // Postseason per-game stats (constructed URL — eventlog can't be filtered by seasontype)
    const postGames = espnCompetitorId
      ? await Promise.all(
          Object.entries(postMeta)
            .filter(([, m]) => m.completed)
            .map(async ([eventId, meta]) => {
              const prior = known.get(String(eventId));
              if (prior?.statsJson) return { eventId, meta, statsJson: prior.statsJson };
              try {
                const url = `${ESPN_CORE}/events/${eventId}/competitions/${eventId}/competitors/${espnCompetitorId}/roster/${playerId}/statistics/0?lang=en&region=us`;
                const res = await fetchImpl(url);
                if (!res.ok) {
                  if (isTransientFailure(res)) incomplete = true;
                  return null;
                }
                return { eventId, meta, statsJson: await res.json() };
              } catch {
                incomplete = true;
                return null;
              }
            })
        )
      : [];

    return { games: [...regGames, ...postGames.filter(Boolean)], incomplete };
  } catch {
    return { games: [], incomplete: true };
  }
}
