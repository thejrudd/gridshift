import test from 'node:test';
import assert from 'node:assert/strict';
import { getTeamVisualTheme } from '../../src/utils/teamVisualTheme.js';

test('NYG reverses only when its logo is on the left side', () => {
  const leftLogoTheme = getTeamVisualTheme('nyg', false, { logoSide: 'start' });
  const rightLogoTheme = getTeamVisualTheme('nyg', false, { logoSide: 'end' });

  assert.equal(leftLogoTheme.reverseGradient, true);
  assert.equal(rightLogoTheme.reverseGradient, false);
  assert.equal(leftLogoTheme.gradientStart, rightLogoTheme.gradientEnd);
  assert.equal(leftLogoTheme.gradientEnd, rightLogoTheme.gradientStart);
});
