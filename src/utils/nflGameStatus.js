// nflGameStatus.js — the one classifier for an NFL game's lifecycle status.
//
// Fantasy Live (liveScoringFeed.isLiveGame / isFinalGame, also used by the
// server's caching and finished-game archive), Statistics Scores
// (balldontlieNflScoreboard's scorecard status), and the server's live-game
// polling each read BALLDONTLIE's `status` / `status_state` themselves and
// disagreed on halftime, delays, and an overtime final. This module is the
// rule; those functions are wrappers over it.
//
// Precedence, first match wins:
//   postponed → final → delayed → halftime → scheduled (explicit state) →
//   live → scheduled.
// A final game is never live, whatever else its status text says ("Final -
// Overtime", "Final/OT").

export const NFL_GAME_STATUS = Object.freeze({
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  HALFTIME: 'halftime',
  DELAYED: 'delayed',
  POSTPONED: 'postponed',
  FINAL: 'final',
});

/** "11:27 - 3rd", "4:12 · 1st Quarter": BALLDONTLIE's clock-first live status. */
export const CLOCK_QUARTER_STATUS = /^(\d{1,2}:\d{2})\s*(?:-|·)\s*(\d+)(?:st|nd|rd|th)(?:\s+(?:q|quarter))?$/i;

const FINAL_STATES = new Set(['completed', 'complete', 'final', 'post', 'closed']);
const SCHEDULED_STATES = new Set(['scheduled', 'pre', 'not started', 'upcoming']);
const LIVE_STATES = new Set(['in progress', 'live', 'in']);

function readStatus(game) {
  return String(game?.status ?? '').trim();
}

/** `status_state` lower-cased with `_`/`-` as spaces ("in_progress" → "in progress"). */
export function readStatusState(game) {
  return String(game?.status_state ?? game?.statusState ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
}

/** The provider's own state says the game is being played. */
export function hasLiveStatusState(game) {
  return LIVE_STATES.has(readStatusState(game));
}

/** The live period a game reports, from `period` or a clock-first status; null when none. */
export function readLivePeriod(game) {
  const explicit = game?.period == null || game.period === '' ? Number.NaN : Number(game.period);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const parsed = Number(CLOCK_QUARTER_STATUS.exec(readStatus(game))?.[2]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * scheduled | live | halftime | delayed | postponed | final
 *
 * `finalFromState: false` makes a game final only when its status text says
 * so ("Final", "Completed"); a final `status_state` alone then classifies by
 * the rest of the rules. The server's caching and finished-game archive use
 * that stricter reading (`isFinalGame`): a stored final is kept for good, so it
 * waits for the provider's own final text.
 */
export function classifyNflGameStatus(game, { finalFromState = true } = {}) {
  const raw = readStatus(game);
  const status = raw.toLowerCase();
  const state = readStatusState(game);

  if (state.includes('postpon') || status.includes('postpon')) return NFL_GAME_STATUS.POSTPONED;
  if ((finalFromState && FINAL_STATES.has(state)) || status.includes('final') || status.includes('complete')) return NFL_GAME_STATUS.FINAL;
  if (state.includes('delay') || status.includes('delay')) return NFL_GAME_STATUS.DELAYED;
  if (state.includes('half') || status.includes('half')) return NFL_GAME_STATUS.HALFTIME;
  if (SCHEDULED_STATES.has(state)) return NFL_GAME_STATUS.SCHEDULED;
  if (LIVE_STATES.has(state)
    || CLOCK_QUARTER_STATUS.test(raw)
    || status.includes('progress')
    || status.includes('live')
    || status.includes('quarter')
    || status.includes('qtr')
    || status.includes('overtime')
    || status === 'ot'
    || /\bq[1-4]\b/.test(status)
    || readLivePeriod(game) != null) return NFL_GAME_STATUS.LIVE;
  return NFL_GAME_STATUS.SCHEDULED;
}

/** Being played right now: live or at halftime. */
export function isNflGameInProgress(game) {
  const status = classifyNflGameStatus(game);
  return status === NFL_GAME_STATUS.LIVE || status === NFL_GAME_STATUS.HALFTIME;
}

/** Started and not over: in progress or delayed mid-game (what a poller still watches). */
export function isNflGameActive(game) {
  return isNflGameInProgress(game) || classifyNflGameStatus(game) === NFL_GAME_STATUS.DELAYED;
}

export function isNflGameFinal(game, options) {
  return classifyNflGameStatus(game, options) === NFL_GAME_STATUS.FINAL;
}
