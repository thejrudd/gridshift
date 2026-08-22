import { formatFieldSpot, getOffenseTeam, getPlayTrajectory, isTurnoverOnDowns } from './fieldGeometry.js';
import { parsePlayNarrative } from './playNarrative.js';
import { getPlayTag, isPossessionChange } from './playPresentation.js';

function teamLabel(teamId, game) {
  if (!teamId) return null;
  const team = [game?.away, game?.home].find((entry) => entry?.id === teamId);
  return team?.id ?? teamId;
}

export function getLatestPlayPresentation(play, game) {
  if (!play) return null;
  const homeTeam = game?.home?.id;
  const awayTeam = game?.away?.id;
  const narrative = parsePlayNarrative(play);
  const geometry = getPlayTrajectory(play, { homeTeam, awayTeam });
  const tag = getPlayTag(play, geometry);
  const possessionChanged = isPossessionChange(play, geometry) || isTurnoverOnDowns(play);
  const possessionTeam = possessionChanged ? teamLabel(play.team, game) : null;
  const offenseTeam = teamLabel(getOffenseTeam(play, { homeTeam, awayTeam }), game);
  const sentence = narrative.sentence || play.description || play.rawText || 'Play unavailable';
  const spot = (geometry.drawable && formatFieldSpot(geometry.start, { homeTeam, awayTeam })) || play.spot || null;

  return {
    sentence,
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
