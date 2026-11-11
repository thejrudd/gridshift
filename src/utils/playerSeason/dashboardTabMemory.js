// The Statistics player page remembers its last-opened tab for the browser
// session. Callers that open a player for a specific purpose (the Heatmap opens
// season stats) set it before navigating; a tab the player's group lacks falls
// back to Overview in PlayerDashboard.
const TAB_STORAGE_KEY = 'gridshift.statistics.playerTab';

export function readPlayerDashboardTab() {
  try { return sessionStorage.getItem(TAB_STORAGE_KEY); } catch { return null; }
}

export function rememberPlayerDashboardTab(tab) {
  try { sessionStorage.setItem(TAB_STORAGE_KEY, tab); } catch { /* storage is optional */ }
}
