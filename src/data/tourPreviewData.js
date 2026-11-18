// Placeholder data for the league-less app tour. Every name is invented so the
// tour never implies real values, rosters, or league results.
export const TOUR_PREVIEW_DATA = Object.freeze({
  fantasy: {
    sections: ['Rosters', 'Rankings', 'Matchups', 'Heatmap', 'Defense', 'Scoring'],
    matchup: {
      week: 'Week 9 matchup',
      you: { name: 'Sunday Scaries', points: '112.4' },
      opponent: { name: 'Blitz Bros', points: '104.9' },
      winProbability: 62,
    },
    roster: [
      { position: 'QB', name: 'Jordan Vale', team: 'DEN', points: '24.6' },
      { position: 'RB', name: 'Marcus Ellery', team: 'CHI', points: '18.2' },
      { position: 'RB', name: 'Tobias Crane', team: 'MIA', points: '11.4' },
      { position: 'WR', name: 'Devon Marsh', team: 'SEA', points: '21.9' },
      { position: 'WR', name: 'Caleb Okafor', team: 'KC', points: '14.1' },
      { position: 'TE', name: 'Reid Calloway', team: 'BAL', points: '9.7' },
    ],
  },
  league: {
    sections: ['Standings', 'History', 'Activity'],
    standings: [
      { name: 'Blitz Bros', record: '7-1', pointsFor: '1,038' },
      { name: 'Sunday Scaries', record: '6-2', pointsFor: '989', you: true },
      { name: 'Waiver Wire Wolves', record: '5-3', pointsFor: '941' },
      { name: 'Fourth & Long', record: '4-4', pointsFor: '902' },
      { name: 'Hail Mary Club', record: '2-6', pointsFor: '840' },
    ],
  },
  trade: {
    sections: ['Build', 'Upgrades', 'History'],
    give: [{ position: 'RB', name: 'Tobias Crane' }],
    get: [{ position: 'WR', name: 'Devon Marsh' }],
    verdict: 'Fair for both sides',
    upgrade: 'Swapping a backup running back for a starting receiver adds about 3 points a week to your lineup.',
  },
  draft: {
    sections: ['War Room', 'My Board', 'Results'],
    clock: {
      label: 'On the clock',
      pick: 'Pick 1.07',
      note: '3 picks away · 2 players you rank highly may still be available',
    },
    board: [
      { position: 'WR', name: 'Devon Marsh', tier: 'Tier 1' },
      { position: 'RB', name: 'Marcus Ellery', tier: 'Tier 1' },
      { position: 'QB', name: 'Jordan Vale', tier: 'Tier 2' },
      { position: 'TE', name: 'Reid Calloway', tier: 'Tier 3' },
    ],
  },
});
