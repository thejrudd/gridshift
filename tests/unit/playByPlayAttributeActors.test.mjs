import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBdlScorePlay } from '../../src/utils/balldontlieNflScoreboard.js';
import { buildPlayerNameIndex } from '../../src/utils/nflPlays/playerNameIndex.js';
import { PLAY_ROLES } from '../../src/utils/nflPlays/playNarrative.js';
import { attributePlayActors, getActorExpectedTeam } from '../../src/utils/playByPlay/attributePlayActors.js';
import { attributePlays, buildPlayerQuarterStats } from '../../src/utils/statisticsPlayerQuarterStats.js';

// Synthetic BALLDONTLIE rows, CLE (home) against CIN (away).
const GAME = { id: 'bdl-1', away: { id: 'CIN' }, home: { id: 'CLE' } };
const PUNT = {
  id: 1, type_slug: 'punt', team: { abbreviation: 'CIN' }, period: 2, clock_display: '8:42', stat_yardage: 23,
  short_text: 'Corey Bojorquez 55 Yd Punt Charlie Jones 23 Yd Punt Return',
  text: 'C.Bojorquez punts 55 yards to CIN 23, Center-R.Sunahara. C.Jones to CIN 46 for 23 yards (D.McMillon).',
};
const RUSH = {
  id: 2, type_slug: 'rush', team: { abbreviation: 'CIN' }, period: 1, clock_display: '14:54', stat_yardage: 7,
  short_text: 'Chase Brown 7 Yd Rush',
  text: 'C.Brown left tackle to CLV 46 for 7 yards (C.DeJean).',
};
const INTERCEPTION = {
  id: 3, type_slug: 'pass-interception-return', team: { abbreviation: 'CIN' }, period: 3, clock_display: '4:59', stat_yardage: 2,
  short_text: 'Jordan Battle 2 Yd Interception Return',
  text: 'J.Flacco pass deep middle intended for J.Jeudy INTERCEPTED by J.Battle at CLV 36. J.Battle to CLV 34 for 2 yards (J.Jeudy).',
};

const row = (team, name) => ({ key: `${team}:${name}`, name, team });

test('a punt coverage tackler is credited to the kicking team, not the returner\'s', () => {
  // Both rosters have a "D.McMillon"; only the kicking team's covered the punt.
  const roster = [row('CLE', 'Corey Bojorquez'), row('CLE', 'Dan McMillon'), row('CIN', 'Charlie Jones'), row('CIN', 'Drew McMillon')];
  const play = normalizeBdlScorePlay(PUNT, GAME);
  const { entries } = attributePlays({ plays: [play], roster, homeTeam: 'CLE', awayTeam: 'CIN' });
  const byRole = Object.fromEntries(entries[0].actors.map((actor) => [actor.role, actor.playerKey]));
  assert.equal(byRole[PLAY_ROLES.PUNTER], 'CLE:Corey Bojorquez');
  assert.equal(byRole[PLAY_ROLES.RETURNER], 'CIN:Charlie Jones');
  assert.equal(byRole[PLAY_ROLES.TACKLER], 'CLE:Dan McMillon');

  const quarter = buildPlayerQuarterStats({
    plays: [play],
    players: [
      { player: { first_name: 'Dan', last_name: 'McMillon' }, team: { abbreviation: 'CLE' } },
      { player: { first_name: 'Drew', last_name: 'McMillon' }, team: { abbreviation: 'CIN' } },
    ],
    homeTeam: 'CLE',
    awayTeam: 'CIN',
  });
  assert.deepEqual(Object.keys(quarter.byPlayer), ['CLE:danmcmillon']);
});

test('a name that does not resolve on the expected roster is not matched on the other team', () => {
  // The tackler is only on the offense's roster: a league-wide alias match
  // used to credit the ball carrier's teammate with the tackle.
  const roster = [row('CIN', 'Chase Brown'), row('CIN', 'Cam DeJean')];
  const play = normalizeBdlScorePlay(RUSH, GAME);
  const { entries, matchName } = attributePlays({ plays: [play], roster, homeTeam: 'CLE', awayTeam: 'CIN' });
  assert.deepEqual(entries[0].actors.map((actor) => [actor.role, actor.playerKey]), [[PLAY_ROLES.RUSHER, 'CIN:Chase Brown']]);
  assert.equal(matchName('C.DeJean', 'CLE'), null);
  // With no team to check, a name unique in the game still resolves.
  assert.equal(matchName('C.DeJean', null), 'CIN:Cam DeJean');
});

test('an interception return is tackled by the team that threw', () => {
  const roster = [row('CLE', 'Joe Flacco'), row('CLE', 'Jerry Jeudy'), row('CIN', 'Jordan Battle'), row('CIN', 'Jaylen Jeudy')];
  const play = normalizeBdlScorePlay(INTERCEPTION, GAME);
  const { entries } = attributePlays({ plays: [play], roster, homeTeam: 'CLE', awayTeam: 'CIN' });
  const tackler = entries[0].actors.find((actor) => actor.role === PLAY_ROLES.TACKLER);
  assert.equal(entries[0].offenseTeam, 'CLE');
  assert.equal(tackler?.playerKey, 'CLE:Jerry Jeudy');
});

test('a provider defense_team decides the sides over the possession correction', () => {
  // A rush whose provider `team` is CIN but whose row names CIN as the
  // defense: the explicit field wins, so CLE ran it and its rusher is CLE's.
  const raw = { ...RUSH, id: 4, defense_team: { abbreviation: 'CIN' } };
  const roster = [row('CLE', 'Chase Brown'), row('CIN', 'Chase Brown'), row('CIN', 'Cam DeJean')];
  const play = normalizeBdlScorePlay(raw, GAME);
  assert.equal(play.offenseTeam, 'CLE');
  assert.equal(play.defenseTeam, 'CIN');
  const { entries } = attributePlays({ plays: [play], roster, homeTeam: 'CLE', awayTeam: 'CIN' });
  assert.equal(entries[0].offenseTeam, 'CLE');
  assert.equal(entries[0].defenseTeam, 'CIN');
  const byRole = Object.fromEntries(entries[0].actors.map((actor) => [actor.role, actor.playerKey]));
  assert.equal(byRole[PLAY_ROLES.RUSHER], 'CLE:Chase Brown');
  assert.equal(byRole[PLAY_ROLES.TACKLER], 'CIN:Cam DeJean');
});

test('the shared matcher returns every actor with its expected roster', () => {
  const index = buildPlayerNameIndex([
    { id: 'p', name: 'Corey Bojorquez', team: 'CLE' },
    { id: 't', name: 'Dan McMillon', team: 'CLE' },
  ]);
  const play = normalizeBdlScorePlay(PUNT, GAME);
  const attributed = attributePlayActors(play, index, { offenseTeam: 'CLE', defenseTeam: 'CIN' });
  assert.deepEqual(
    attributed.map(({ actor, expectedTeam, playerId }) => [actor.role, expectedTeam, playerId]),
    [[PLAY_ROLES.PUNTER, 'CLE', 'p'], [PLAY_ROLES.RETURNER, 'CIN', null], [PLAY_ROLES.TACKLER, 'CLE', 't']],
  );
  assert.equal(getActorExpectedTeam(play, PLAY_ROLES.TACKLER, { offenseTeam: 'CLE', defenseTeam: 'CIN' }), 'CLE');
  assert.equal(getActorExpectedTeam(normalizeBdlScorePlay(RUSH, GAME), PLAY_ROLES.TACKLER, { offenseTeam: 'CIN', defenseTeam: 'CLE' }), 'CLE');
});

test('a description-less row keeps "Play unavailable" and an unconfident carried narrative', async () => {
  const { normalizePlay } = await import('../../src/utils/livePlaysFeed.js');
  const { readPlayNarrative } = await import('../../src/utils/playByPlay/normalizePlay.js');
  const { parsePlayNarrative } = await import('../../src/utils/nflPlays/playNarrative.js');
  const raw = { id: 9, type_slug: 'rush', team: { abbreviation: 'CIN' }, period: 1, clock_display: '10:00' };
  const play = normalizeBdlScorePlay(raw, GAME);
  assert.equal(play.description, 'Play unavailable');
  assert.equal(play.narrative.confident, false);
  assert.equal(readPlayNarrative(play), play.narrative);
  const { narrative, ...uncarried } = play;
  assert.equal(parsePlayNarrative(uncarried).confident, false);
  // Fantasy Live still drops the row: it has nothing to show for it.
  assert.equal(normalizePlay(raw, 'g'), null);
});

test('a missing stat_yardage stays unknown in the carried narrative', () => {
  const raw = {
    id: 10, type_slug: 'kickoff', team: { abbreviation: 'CLE' }, period: 1, clock_display: '15:00', stat_yardage: null,
    short_text: 'Evan McPherson 65 Yd Kickoff, Touchback', text: 'E.McPherson kicks 65 yards from CIN 35 to end zone, Touchback.',
  };
  const play = normalizeBdlScorePlay(raw, GAME);
  assert.equal(play.narrative.confident, true);
  assert.equal(play.narrative.yards, null);
});

test('a tackler named only in a lost fumble\'s return belongs to the original offense', async () => {
  const fs = await import('node:fs');
  const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/bdlNflPlays.json', import.meta.url), 'utf8'));
  const raw = fixture.games.find((entry) => entry.id === 423945).plays
    .find((play) => play.type_slug === 'fumble-recovery-opponent' && /\(D\.Prescott\)\.$/.test(play.text));
  const play = normalizeBdlScorePlay(raw, { id: 'bdl-423945', away: { id: 'DAL' }, home: { id: 'PHI' } });
  const roster = [row('DAL', 'Dak Prescott'), row('DAL', 'Miles Sanders'), row('PHI', 'Quinyon Mitchell')];
  const { entries } = attributePlays({ plays: [play], roster, homeTeam: 'PHI', awayTeam: 'DAL' });
  assert.equal(entries[0].offenseTeam, 'DAL');
  const tackler = entries[0].actors.find((actor) => actor.role === PLAY_ROLES.TACKLER);
  assert.equal(tackler?.playerKey, 'DAL:Dak Prescott');
  assert.equal(entries[0].actors.find((actor) => actor.role === PLAY_ROLES.RECOVERER)?.playerKey, 'PHI:Quinyon Mitchell');
});
