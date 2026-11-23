import { formatFieldSpot, getOffenseTeam, getPlayTrajectory, isTurnoverOnDowns } from './fieldGeometry.js';
import { readPlayNarrative } from '../playByPlay/normalizePlay.js';
import { classifyClockStoppage } from '../providerAnchoredGameClock.js';
import { getPlayTag, isPossessionChange, withReplayReview } from './playPresentation.js';

function teamLabel(teamId, game) {
  if (!teamId) return null;
  const team = [game?.away, game?.home].find((entry) => entry?.id === teamId);
  return team?.id ?? teamId;
}

export function getLatestPlayPresentation(play, game) {
  if (!play) return null;
  const homeTeam = game?.home?.id;
  const awayTeam = game?.away?.id;
  const narrative = readPlayNarrative(play);
  const geometry = getPlayTrajectory(play, { homeTeam, awayTeam });
  const tag = getPlayTag(play, geometry);
  const possessionChanged = isPossessionChange(play, geometry) || isTurnoverOnDowns(play);
  const possessionTeam = possessionChanged ? teamLabel(play.team, game) : null;
  // The Scores adapter carries the shared resolution; other shapes resolve here.
  const offenseTeam = teamLabel(
    'offenseTeam' in play ? play.offenseTeam : getOffenseTeam(play, { homeTeam, awayTeam }),
    game,
  );
  let sentence = narrative.sentence || play.description || play.rawText || 'Play unavailable';
  if (!/out of bounds/i.test(sentence) && classifyClockStoppage(play).reason === 'Out of bounds') {
    sentence = `${sentence.replace(/[.]$/, '')}. Out of bounds.`;
  }
  const spot = (geometry.drawable && formatFieldSpot(geometry.start, { homeTeam, awayTeam })) || play.spot || null;

  return {
    sentence: withReplayReview(play, sentence),
    administrative: narrative.administrative === true,
    down: play.down || null,
    spot,
    quarter: play.quarter || 'Game',
    time: play.time || '—',
    tag,
    possessionChanged,
    possessionTeam,
    offenseTeam,
    scoring: geometry.scoring === true,
  };
}
