function idOf(value) {
  return value == null ? null : String(value);
}

function playerName(player, playerId) {
  const name = player?.full_name
    || [player?.first_name, player?.last_name].filter(Boolean).join(' ')
    || player?.name;
  return String(name ?? `Player ${playerId}`).trim() || `Player ${playerId}`;
}

function starterPerformers(side, players = {}) {
  const starters = (side?.starters ?? []).map(idOf).filter((id) => id && id !== '0');
  const entries = starters.map((id) => {
    const rawPoints = (side?.recordedPlayerPoints ?? side?.playerPoints)?.[id];
    const points = rawPoints === '' || rawPoints == null ? null : Number(rawPoints);
    return { id, points, player: players?.[id] ?? null };
  });
  const available = entries.length > 0 && entries.every((entry) => Number.isFinite(entry.points));
  if (!available || !entries.length) return { highest: [], lowest: [], available };

  const highestPoints = Math.max(...entries.map((entry) => entry.points));
  const lowestPoints = Math.min(...entries.map((entry) => entry.points));
  const format = (entry) => ({
    id: entry.id,
    name: playerName(entry.player, entry.id),
    points: entry.points,
    player: entry.player,
  });
  return {
    highest: entries.filter((entry) => entry.points === highestPoints).map(format),
    lowest: entries.filter((entry) => entry.points === lowestPoints).map(format),
    available: true,
  };
}

export function buildMatchupRivalry(model, leftManagerId, rightManagerId, players = {}) {
  const leftId = idOf(leftManagerId);
  const rightId = idOf(rightManagerId);
  if (!leftId || !rightId || leftId === rightId) return null;
  const rivalry = (model?.rivalries ?? []).find((item) => item.id === [leftId, rightId].sort().join(':'));
  if (!rivalry) return null;
  const meetings = (rivalry.meetings ?? []).map((game) => {
    const leftSide = game.left.identity.id === leftId;
    const orientedLeft = leftSide ? game.left : game.right;
    const orientedRight = leftSide ? game.right : game.left;
    const leftPoints = leftSide ? game.left.points : game.right.points;
    const rightPoints = leftSide ? game.right.points : game.left.points;
    return {
      id: game.id, season: game.season, week: game.week, leftPoints, rightPoints,
      leftRosterId: orientedLeft.rosterId ?? null,
      rightRosterId: orientedRight.rosterId ?? null,
      leftPerformers: starterPerformers(orientedLeft, players),
      rightPerformers: starterPerformers(orientedRight, players),
      margin: game.margin,
      winner: game.tied ? null : (game.winnerId === leftId ? 'left' : 'right'),
    };
  }).sort((a, b) => Number(b.season) - Number(a.season) || b.week - a.week || a.id.localeCompare(b.id));
  if (!meetings.length) return null;
  const decisive = meetings.filter((meeting) => meeting.winner);
  const closestMeeting = [...meetings].sort((a, b) => a.margin - b.margin || b.id.localeCompare(a.id))[0] ?? null;
  const biggestWin = [...decisive].sort((a, b) => b.margin - a.margin || b.id.localeCompare(a.id))[0] ?? null;
  const highestScore = meetings.reduce((best, meeting) => {
    const candidates = [{ ...meeting, side: 'left', points: meeting.leftPoints }, { ...meeting, side: 'right', points: meeting.rightPoints }];
    return candidates.reduce((current, candidate) => !current || candidate.points > current.points ? candidate : current, best);
  }, null);
  return {
    games: rivalry.games, leftWins: rivalry.winsByParticipantId?.[leftId] ?? 0,
    rightWins: rivalry.winsByParticipantId?.[rightId] ?? 0, ties: rivalry.ties,
    meetings, closestMeeting, biggestWin, highestScore,
  };
}
