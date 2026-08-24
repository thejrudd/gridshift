import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTeamLinePoints,
  findClosestMark,
  sampleLineValue,
} from '../../src/utils/livePaceChartGeometry.js';

describe('Fantasy Live pace chart geometry', () => {
  const points = [
    { x: 0, a: 0, b: 0 },
    { x: 0.2, a: 6, b: 0, side: 'a', eventId: 'a-td' },
    { x: 0.4, a: 6, b: 3, side: 'b', eventId: 'b-fg' },
    { x: 0.6, a: 8, b: 3, side: 'a', eventId: 'a-catch' },
    { x: 0.6, a: 7, b: 3, side: 'a', eventId: 'a-fumble' },
    { x: 0.8, a: 10, b: 9 },
  ];

  it('keeps every same-X scoring total on its team path without opponent kinks', () => {
    const lineA = buildTeamLinePoints(points, 'a');
    const lineB = buildTeamLinePoints(points, 'b');

    assert.deepEqual(lineA.map((point) => [point.x, point.a]), [
      [0, 0], [0.2, 6], [0.6, 8], [0.6, 7], [0.8, 10],
    ]);
    assert.deepEqual(lineB.map((point) => [point.x, point.b]), [
      [0, 0], [0.4, 3], [0.8, 9],
    ]);
  });

  it('samples the visible line continuously between scoring dots', () => {
    const lineA = buildTeamLinePoints(points, 'a');
    assert.equal(sampleLineValue(lineA, 'a', 0.1), 3);
    assert.equal(sampleLineValue(lineA, 'a', 0.6), 7);
    assert.equal(sampleLineValue(lineA, 'a', 0.7), 8.5);
  });

  it('snaps only when the pointer is close to a dot in both dimensions', () => {
    const marks = [{ x: 0.5, y: 10, event: { id: 'score' } }];
    const geometry = {
      xAt: (value) => value * 100,
      yAt: (value) => 100 - value * 5,
      radius: 12,
    };

    assert.equal(findClosestMark(marks, {
      ...geometry, pointerX: 55, pointerY: 54,
    })?.event.id, 'score');
    assert.equal(findClosestMark(marks, {
      ...geometry, pointerX: 50, pointerY: 75,
    }), null);
  });
});
