import { defineConfig, devices } from '@playwright/test';

// Mobile app screens rendered in a browser (react-native-web) against the
// real API. Native-only parts (keystore, push) are covered by unit tests and
// the manual device checklist in docs/MOBILE.md.
const PORT = 8090;
const API_PORT = 4100;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Set DATABASE_URL (migrated + seeded) to run e2e tests');

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    ...devices['Pixel 7'],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
    trace: 'retain-on-failure',
  },
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
        RATE_LIMIT_DISABLED: 'true',
        DEV_PAYMENTS_ENABLED: 'true',
        ASSISTANT_PROVIDER: 'fake',
      },
    },
    {
      command: 'node scripts/preview-server.mjs',
      url: `http://localhost:${String(PORT)}/`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { PORT: String(PORT), API_TARGET: `http://localhost:${String(API_PORT)}` },
    },
  ],
});
