import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for the journeys in docs/PLAN (J1, J3, J5). Run with `npm run e2e`,
 * which builds the web app first. The server starts on its own port with a fresh
 * scratch data directory, so the tests never touch data/designs.
 *
 * Browser: the bundled Chromium by default (`npx playwright install chromium`).
 * Set PPP_E2E_CHANNEL=msedge (or chrome) to use an installed browser instead.
 */
const PORT = Number(process.env.PPP_E2E_PORT ?? 4411);
const dataDir = mkdtempSync(join(tmpdir(), 'ppp-e2e-'));

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    channel: process.env.PPP_E2E_CHANNEL,
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npx tsx apps/server/src/main.ts',
    url: `http://127.0.0.1:${PORT}/api/v1/health`,
    reuseExistingServer: false,
    env: {
      PPP_PORT: String(PORT),
      PPP_HOST: '127.0.0.1',
      PPP_DATA_DIR: dataDir,
    },
  },
});
