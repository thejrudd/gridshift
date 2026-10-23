import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractPlayersArray, findKtcPlayerFromSleeper } from '../../src/utils/ktcApi.js';

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
