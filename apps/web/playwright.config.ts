import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
// Cloud sessions provide a preinstalled Chromium; CI installs its own.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  // Runs the production build (pnpm build first). The API is not needed:
  // Phase 2 pages use fixture data.
  webServer: {
    command: `pnpm exec next start --port ${String(PORT)}`,
    url: `http://localhost:${String(PORT)}/uz`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { API_INTERNAL_URL: 'http://localhost:9' },
  },
});
