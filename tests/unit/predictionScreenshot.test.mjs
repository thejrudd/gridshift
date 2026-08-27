import assert from 'node:assert/strict';
import test from 'node:test';
import { getPredictionScreenshotScale } from '../../src/utils/predictionScreenshot.js';

test('fits square and tall Share Cards inside the visible screenshot viewport', () => {
  assert.equal(getPredictionScreenshotScale({ viewportWidth: 1080, viewportHeight: 1080, cardHeight: 1080 }), 1);
  assert.equal(getPredictionScreenshotScale({ viewportWidth: 540, viewportHeight: 900, cardHeight: 1080 }), 0.5);
  assert.equal(getPredictionScreenshotScale({ viewportWidth: 1080, viewportHeight: 675, cardHeight: 1350 }), 0.5);
});

test('does not enlarge Share Cards or fail on unavailable viewport measurements', () => {
  assert.equal(getPredictionScreenshotScale({ viewportWidth: 2160, viewportHeight: 2160, cardHeight: 1080 }), 1);
  assert.equal(getPredictionScreenshotScale({ viewportWidth: 0, viewportHeight: 0, cardHeight: 1080 }), 1);
});
