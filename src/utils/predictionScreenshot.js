const PREDICTION_SHARE_CARD_WIDTH = 1080;

export function getPredictionScreenshotScale({ viewportWidth, viewportHeight, cardHeight }) {
  const width = Number(viewportWidth);
  const height = Number(viewportHeight);
  const resolvedCardHeight = Number(cardHeight);
  if (![width, height, resolvedCardHeight].every((value) => Number.isFinite(value) && value > 0)) return 1;
  return Math.min(1, width / PREDICTION_SHARE_CARD_WIDTH, height / resolvedCardHeight);
}
