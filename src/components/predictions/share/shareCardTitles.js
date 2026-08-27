/**
 * Curated editorial copy for prediction share cards. These are intentionally
 * presets instead of user-entered text so exported cards stay recognizably
 * GridShift and the typography remains safe at the fixed export sizes.
 */
export const SHARE_CARD_TITLES = {
  board: [
    ['The Whole', 'Board'], ['All 32', 'Called'], ['My League', 'Table'],
    ['Every Team.', 'Every Call.'], ['The Season', 'Forecast'], ['Thirty-Two', 'Deep'],
    ['Record', 'Book'], ['The Full', 'Picture'], ['Sunday', 'Blueprint'],
    ['The Grid', 'Is Set'], ['Season', 'Script'], ['Every Record', 'Matters'],
    ['The Long', 'View'], ['My NFL', 'Forecast'], ['All Roads', 'Called'],
  ],
  champions: [
    ['Called It', 'Early'], ['My Champion', 'Is Set'], ['The Last', 'Team Standing'],
    ['This Is', 'The One'], ['I Picked', 'The Winner'], ['The Trophy', 'Call'],
    ['Top Of', 'The League'], ['My Final', 'Answer'], ['Chasing', 'The Lombardi'],
    ['The Title', 'Pick'], ['Crown', 'Them'], ['Sunday Ends', 'Here'],
    ['One Team', 'Left'], ['My Super Bowl', 'Call'], ['The Finish', 'Line'],
  ],
  divisions: [
    ['Eight', 'Banners'], ['Division', 'Season'], ['The Division', 'Calls'],
    ['Eight Teams', 'Up'], ['Banners', 'Raised'], ['The First', 'Eight'],
    ['Division By', 'Division'], ['Crown The', 'Winners'], ['The Banner', 'Board'],
    ['Eight Ways', 'To Win'], ['Who Owns', 'Sunday'], ['The Division', 'Map'],
    ['Flags', 'Planted'], ['The Road', 'Starts Here'], ['Eight', 'Champions'],
  ],
  seeding: [
    ['Fourteen', 'In'], ['The Playoff', 'Picture'], ['Seeds Are', 'Set'],
    ['January', 'Starts Here'], ['My Postseason', 'Field'], ['The Field', 'Of Fourteen'],
    ['Seed By', 'Seed'], ['The Road', 'To January'], ['Who Gets', 'In'],
    ['The Cut', 'Line'], ['The Bracket', 'Begins'], ['Postseason', 'Forecast'],
    ['The Teams', 'To Beat'], ['Wild Cards', 'Welcome'], ['The Playoff', 'Map'],
  ],
  bracket: [
    ['Wild Card', 'To Champion'], ['The Road', 'To The Ring'], ['My January', 'Bracket'],
    ['Win Or Go', 'Home'], ['Thirteen', 'Games'], ['The Whole', 'Run'],
    ['From Wild Card', 'To Glory'], ['My Playoff', 'Path'], ['The Tournament', 'Tree'],
    ['Every Round', 'Called'], ['The Road', 'Is Drawn'], ['One Team', 'Survives'],
    ['The Final', 'Fourteen'], ['Postseason', 'Script'], ['Chase The', 'Trophy'],
  ],
  'team-record': [
    ['Seventeen', 'Calls'], ['Every Week', 'Called'], ['The Season', 'Game By Game'],
    ['My Team', 'My Picks'], ['The Full', 'Schedule'], ['Road To', 'The Record'],
    ['Week By', 'Week'], ['The Record', 'Explained'], ['Sunday By', 'Sunday'],
    ['Every Matchup', 'Matters'], ['The Team', 'Forecast'], ['How They', 'Get There'],
    ['One Team', 'Seventeen Games'], ['The Season', 'Mapped'], ['Final Record', 'Called'],
  ],
};

export const SHARE_CARD_FORMATS = ['board', 'champions', 'divisions', 'seeding', 'bracket', 'team-record'];

export function getShareCardTitle(format, titleId = 0) {
  const titles = SHARE_CARD_TITLES[format] ?? SHARE_CARD_TITLES.board;
  const index = Number.isInteger(Number(titleId)) ? Number(titleId) : 0;
  return titles[((index % titles.length) + titles.length) % titles.length];
}
