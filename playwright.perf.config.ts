import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Timing measurements (npm run perf:3d). Kept apart from the journey suite because
 * timings depend on the machine and must not block a push.
 */
export default defineConfig({
  ...base,
  testDir: 'e2e/perf',
  testIgnore: [],
  retries: 0,
  timeout: 240_000,
});
