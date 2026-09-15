import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractPlayersArray } from '../../src/utils/ktcApi.js';

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
