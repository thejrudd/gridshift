export const DRAFT_RANKING_PRIORITY_TITLE = 'Adjust ranking priorities';
export const DRAFT_RANKING_PRIORITY_HELP = 'Personalize how rankings balance player value, scoring fit, and team needs. A higher priority gives that factor more influence on player rankings.';
export const DRAFT_RANKING_PRIORITY_RESET_LABEL = 'Reset priorities';

export const DRAFT_RANKING_PRIORITY_CONTROLS = Object.freeze([
  Object.freeze({
    key: 'marketRank',
    label: 'Player value',
    description: 'How much to follow current draft market value. Higher values favor players valued more highly by the draft market.',
  }),
  Object.freeze({
    key: 'pastProduction',
    label: 'Points per game',
    description: 'How much recent fantasy points per game matter. Higher values favor players with stronger weekly production.',
  }),
  Object.freeze({
    key: 'scoringFit',
    label: 'Scoring fit',
    description: 'How much your league\'s scoring rules matter. Higher values favor players whose position and profile fit your scoring settings.',
  }),
  Object.freeze({
    key: 'rosterNeed',
    label: 'Team need',
    description: 'How much your roster needs matter. Higher values favor positions where you need starters or depth.',
  }),
]);
