import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractPlayersArray, extractPlayersVersion, fetchKtcPlayers, findKtcPlayerFromSleeper } from '../../src/utils/ktcApi.js';
import { valueDraftPick } from '../../src/utils/tradeEngine.js';
import { sumTradeValues } from '../../src/utils/tradeValue.js';

const players = [
  {
    playerName: 'Bracket [Tester]',
    position: 'WR',
    oneQBValues: { value: 4200 },
    superflexValues: { value: 4300 },
    nested: [[1, 2], [3]],
  },
];

describe('KTC HTML parsing', () => {
  it('reads the current application/json players script', () => {
    const html = `<script type="application/json" id="ktc-players">${JSON.stringify(players)}</script>
      <script>var playersArray = JSON.parse(document.getElementById('ktc-players').textContent);</script>`;

    assert.deepEqual(extractPlayersArray(html), players);
  });

  it('keeps parsing legacy inline array assignments', () => {
    const html = `<script>var playersArray = ${JSON.stringify(players)};</script>`;

    assert.deepEqual(extractPlayersArray(html), players);
  });

  it('fails clearly when neither supported payload exists', () => {
    assert.throws(
      () => extractPlayersArray('<html><body>Not KTC rankings</body></html>'),
      /Could not find playersArray in KTC response/,
    );
  });
});

describe('KTC player matching', () => {
  const ktcPlayers = [{ playerName: 'Kenneth Walker III', position: 'RB', oneQBValues: { value: 9000 } }];

  it('falls back to a name-only match when the name is unique in Sleeper', () => {
    const players = { 1: { full_name: 'Kenneth Walker', position: 'FB' } };
    assert.equal(findKtcPlayerFromSleeper('1', players, ktcPlayers), ktcPlayers[0]);
  });

  it('does not give a shared name another player\'s market value', () => {
    const players = {
      rb: { full_name: 'Kenneth Walker III', position: 'RB' },
      wr: { full_name: 'Kenneth Walker', position: 'WR' },
    };
    assert.equal(findKtcPlayerFromSleeper('rb', players, ktcPlayers), ktcPlayers[0]);
    assert.equal(findKtcPlayerFromSleeper('wr', players, ktcPlayers), null);
  });
});

// Refs #9: KTC's rankings page now ships only a small inline sample and fills
// `playersArray` after load, so the extractor sees an empty array. Dynasty pick
// values come only from KTC, so every pick is valueless and blanks its side.
describe('KTC page without an inline player list (issue 9)', () => {
  const html = `<script>var oneQBPlayers = [{"playerName":"2027 Early 3rd","position":"RDP"}];</script>
    <script>var playersArray = [];
    var ktcPoolReady = ktcFetchPlayerPool('dynasty', '1', null).then(function (pool) { playersArray = pool; });</script>`;

  it('extracts an empty list without throwing', () => {
    assert.deepEqual(extractPlayersArray(html), []);
  });

  it('leaves dynasty picks valueless, which blanks the whole side total', () => {
    const ktcPlayers = extractPlayersArray(html);
    const second = valueDraftPick({ year: '2027', round: 2 }, { ktcPlayers, leagueType: 'sf', currentSeason: '2026' });
    const third = valueDraftPick({ year: '2027', round: 3 }, { ktcPlayers, leagueType: 'sf', currentSeason: '2026' });
    assert.equal(second.val, null);
    assert.equal(third.val, null);
    assert.equal(sumTradeValues([54, second.val, third.val]), null);
  });
});

describe('KTC player pool loading (issue 9)', () => {
  const pageHtml = "<script>var playersVersion = '2611250620-abc';\nvar playersArray = [];</script>";
  const pool = [{ playerName: '2027 Mid 2nd', position: 'RDP', oneQBValues: { value: 3000 }, superflexValues: { value: 3200 } }];

  it('reads the published pool version', () => {
    assert.equal(extractPlayersVersion(pageHtml), '2611250620-abc');
    assert.equal(extractPlayersVersion('<html></html>'), null);
  });

  it('loads the pool from the versioned endpoint when the page list is empty', async () => {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return url.includes('player-pool')
        ? { ok: true, json: async () => pool }
        : { ok: true, text: async () => pageHtml };
    };
    assert.deepEqual(await fetchKtcPlayers('dynasty'), pool);
    assert.equal(calls[1].url, '/ktc-proxy/dynasty-rankings/player-pool?v=2611250620-abc&sr=2');
    assert.equal(calls[1].options.headers['X-KTC-Players-Version'], '2611250620-abc');
  });

  it('rejects instead of caching an empty list', async () => {
    globalThis.fetch = async (url) => (url.includes('player-pool')
      ? { ok: true, json: async () => [] }
      : { ok: true, text: async () => pageHtml });
    await assert.rejects(() => fetchKtcPlayers('redraft'), /no player values/);
  });
});
