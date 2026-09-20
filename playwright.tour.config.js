import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // The tour replays lazy-loaded views under a cold dev server, and skipping an
  // unavailable anchor waits out the app's 10s anchor timeout, so the defaults
  // (30s test / 5s expect) fail on timing rather than behavior.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'VITE_WHATS_NEW_REPLAY=true VITE_UPDATE_BANNER_PREVIEW=false GRIDSHIFT_API_PORT=3011 npm run dev -- --host 127.0.0.1 --port 5174',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'tour-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 } },
    },
    {
      name: 'tour-mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
