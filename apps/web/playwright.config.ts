import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const API_PORT = 4000;
// Cloud sessions provide a preinstalled Chromium; CI installs its own.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Set DATABASE_URL (migrated + seeded) to run e2e tests');

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
  // Runs the production builds (pnpm build first) of the API and the web app.
  // The API needs a migrated + seeded PostgreSQL (DATABASE_URL) and runs in
  // test mode with the in-memory FakeSmsProvider.
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: '../api',
      url: `http://localhost:${String(API_PORT)}/api/v1/health/ready`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        DATABASE_URL: databaseUrl,
        CORS_ORIGINS: `http://localhost:${String(PORT)}`,
        AUTH_SECRET: 'e2e-only-secret-'.padEnd(48, 'x'),
        SMS_PROVIDER: 'fake',
        TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
        OTP_IP_HOURLY_LIMIT: '10000',
        // Every e2e login comes from 127.0.0.1; allowed only with NODE_ENV=test.
        RATE_LIMIT_DISABLED: 'true',
        // Simulated online payment for e2e (refused in production by env validation).
        DEV_PAYMENTS_ENABLED: 'true',
      },
    },
    {
      // The standalone server is what the production image runs (ADR 0020).
      // Its data cache is cleared so no response cached from an earlier
      // database survives (production keeps it on tmpfs for the same reason).
      command: [
        'rm -rf .next/standalone/apps/web/.next/static .next/standalone/apps/web/.next/cache',
        'cp -r .next/static .next/standalone/apps/web/.next/static',
        'node .next/standalone/apps/web/server.js',
      ].join(' && '),
      url: `http://localhost:${String(PORT)}/uz`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { API_INTERNAL_URL: `http://localhost:${String(API_PORT)}`, PORT: String(PORT) },
    },
  ],
});
