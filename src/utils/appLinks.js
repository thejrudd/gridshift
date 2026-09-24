// External GridShift links.
//
// Shared because three surfaces need the release URL — the sidebar version
// chip, the mobile action sheet, and the global search "what's new" command —
// and a version-derived URL duplicated per component drifts silently.

export const GITHUB_REPOSITORY_URL = 'https://github.com/thejrudd/nfl-predictor';

export const CURRENT_RELEASE_URL = `${GITHUB_REPOSITORY_URL}/releases/tag/v${__APP_VERSION__}`;
