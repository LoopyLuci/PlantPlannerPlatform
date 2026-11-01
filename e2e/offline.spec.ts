import { expect, test } from '@playwright/test';

/**
 * Journey J3, partly: the editor still opens after the server stops. Writing while
 * offline is not built (no outbox yet, see TODO), so this test covers the app shell only.
 * The service worker is registered in production builds, which is what this server runs.
 */
test.describe('J3 offline shell', () => {
  test('the editor opens with the server unreachable, and recovers when it returns', async ({ page, context }) => {
    await page.goto('/#/plan');
    await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();

    // Wait for the service worker to take control, then reload so the page is controlled.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15_000 })
      .toBe(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();

    await context.setOffline(true);
    await page.reload();

    // The shell comes from the cache; the data calls fail, and the page says so.
    await expect(page.getByRole('navigation', { name: 'Windows' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Data status' })).not.toContainText('healthy');

    await context.setOffline(false);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Data status' })).toContainText('healthy');
  });
});
