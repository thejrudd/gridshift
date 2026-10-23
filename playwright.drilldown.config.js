import { defineConfig, devices } from '@playwright/test';

// Layout and interaction checks for the player matchup drilldown. The spec
// drives a standalone harness (tests/drilldown/harness) that renders the real
// component with fixture league data, so it needs no league, account or
// live provider.
export default defineConfig({
  testDir: './tests/drilldown',
  testMatch: /.*\.spec\.js/,
  fullyParallel: true,
  timeout: 60_000,
  expect: { timeout: 7_500 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-drilldown' }]],
  outputDir: 'test-results/drilldown',
  use: {
    baseURL: 'http://127.0.0.1:5181',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx vite --config tests/drilldown/harness/vite.config.js --host 127.0.0.1 --port 5181 --strictPort',
    url: 'http://127.0.0.1:5181',
    reuseExistingServer: !globalThis.process?.env?.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
