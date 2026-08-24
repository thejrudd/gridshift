// participants.js — resolves the people named in play-by-play text to real
// players with headshots.
//
// BALLDONTLIE play rows carry no player ids at all; the only identity in a play
// is the name inside its text. The bridge is the play id itself: BDL sources
// NFL plays from ESPN and keeps ESPN's event id as the leading 9 digits
// ("401772510141" is event 401772510, sequence 141). ESPN's game summary then
// lists every player who recorded a stat in that specific game, with a headshot.
//
// That per-game list is the right source rather than a current team roster.
// Rosters only describe today: pulling 2025 plays against 2026 rosters silently
// loses everyone who has since changed teams.

import { cachedFetch, TTL } from '../playerCache.js';
import { buildPlayerNameIndex } from './playerNameIndex.js';

const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';
const ESPN_EVENT_ID_LENGTH = 9;

/**
 * The ESPN event id implied by a game's plays, or null.
 *
 * Only ids long enough to carry a sequence suffix qualify, so a shape change at
 * the provider degrades to "no photos" rather than to a wrong game's roster.
 */
export function deriveEspnEventId(plays = []) {
  for (const play of plays) {
    const id = String(play?.id ?? '');
    if (/^\d{11,13}$/.test(id)) return id.slice(0, ESPN_EVENT_ID_LENGTH);
  }
  return null;
}

function readSummaryTeams(summary) {
  const competitors = summary?.header?.competitions?.[0]?.competitors ?? [];
  return competitors.map((competitor) => competitor?.team?.abbreviation).filter(Boolean);
}

function readSummaryAthletes(summary) {
  const byId = new Map();
  (summary?.boxscore?.players ?? []).forEach((teamBlock) => {
    const team = teamBlock?.team?.abbreviation ?? null;
    (teamBlock?.statistics ?? []).forEach((group) => {
      (group?.athletes ?? []).forEach((entry) => {
        const athlete = entry?.athlete;
        if (!athlete?.id || byId.has(athlete.id)) return;
        byId.set(athlete.id, {
          id: String(athlete.id),
          espnId: String(athlete.id),
          name: athlete.displayName ?? '',
          jersey: athlete.jersey ?? '',
          position: athlete.position?.abbreviation ?? '',
          // `imageUrl` is the field name getCompanionPlayerImageUrls already reads,
          // so a participant record drops straight into the shared avatar.
          imageUrl: athlete.headshot?.href ?? null,
          team,
        });
      });
    });
  });
  return [...byId.values()].filter((athlete) => athlete.name);
}

/**
 * Participants for one game as a name index, or null when they can't be
 * resolved. Callers treat null as "render without photos" — never as an error.
 *
 * `teams` guards against a mis-derived event id: if the summary is not the two
 * teams the drilldown is showing, no faces are better than wrong faces.
 */
export async function fetchGameParticipants(espnEventId, { teams = [], isFinal = true, fetchImpl = fetch } = {}) {
  if (!espnEventId) return null;

  const load = async () => {
    const response = await fetchImpl(`${ESPN_SUMMARY}?event=${espnEventId}`);
    if (!response.ok) throw new Error(`ESPN summary ${response.status}`);
    const summary = await response.json();
    return { teams: readSummaryTeams(summary), athletes: readSummaryAthletes(summary) };
  };

  try {
    // A finished game's participants never change again; a live one is still
    // accumulating players who have yet to record a stat.
    const payload = await cachedFetch(
      `nflplays_participants_${espnEventId}`,
      load,
      isFinal ? TTL.historical : 5 * 60 * 1000,
      (data) => Boolean(data?.athletes?.length),
    );
    return toParticipantIndex(payload, teams);
  } catch {
    return null;
  }
}

/**
 * Build the name index from an already-fetched summary payload. Split out so
 * tests can exercise the matching without any network.
 */
export function toParticipantIndex(payload, expectedTeams = []) {
  const athletes = payload?.athletes ?? [];
  if (!athletes.length) return null;

  if (expectedTeams.length === 2) {
    const summaryTeams = new Set(payload?.teams ?? []);
    const matches = expectedTeams.every((team) => summaryTeams.has(team));
    if (!matches) return null;
  }

  const nameIndex = buildPlayerNameIndex(athletes);
  return { ...nameIndex, athletes };
}
