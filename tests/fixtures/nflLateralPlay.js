// The reported compound play from the Scores replay investigation. Field
// inputs below reconstruct the screenshot's CAR 16 -> CAR 22 endpoints.
export const lateralPlayText = '(Shotgun) B.Young pass short middle to T.McMillan to CAR 24 for 8 yards. Lateral to J.Coker to CAR 26 for 2 yards (J.Bullard). FUMBLES (J.Bullard), RECOVERED by GB-B.Cox at CAR 25. B.Cox to CAR 22 for 3 yards (B.Young).';

export const lateralPlayRaw = {
  id: 'car-gb-lateral', type_slug: 'pass-reception',
  team: { abbreviation: 'GB' }, text: lateralPlayText,
  short_text: 'Bryce Young Pass Complete for 8 Yds to Tetairoa McMillan Jalen Coker Fumble Brenton Cox Jr. 3 Yd Fumble Recovery',
  stat_yardage: 3, start_down: 3, start_distance: 14, end_down: 1,
  start_possession_text: 'CAR 16', end_possession_text: 'CAR 22',
  start_yard_line: 84, end_yard_line: 78,
  period: 4, clock_display: '0:04', scoring_play: false,
};

export const lateralGame = { id: 'car-gb', away: { id: 'CAR' }, home: { id: 'GB' } };
export const lateralContext = { homeTeam: 'GB', awayTeam: 'CAR' };
