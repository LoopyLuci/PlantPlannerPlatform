import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Journey J3 (ADR-0011). The editor opens with the server down, keeps moves made offline on this
 * device, and sends them once each when the server returns. The service worker is registered in
 * production builds, which is what this server runs.
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

/** Placements and log sequence of the first open design, read from the server. */
async function serverDesign(request: APIRequestContext, baseURL: string | undefined) {
  const listed = await (await request.post(`${baseURL}/api/v1/capabilities/design.list`, { data: {} })).json();
  const designs = (listed as { data: { designs: { designId: string; archived: boolean }[] } }).data.designs;
  const designId = designs.find((d) => !d.archived)?.designId ?? '';
  const design = await (await request.post(`${baseURL}/api/v1/capabilities/design.get`, { data: { design_id: designId } })).json();
  return (design as { data: { seq: number; placements: { id: string; x: number; y: number }[] } }).data;
}

test.describe('J3 writes offline (ADR-0011)', () => {
  // Offline adds from the plant library are not covered yet: the species profile loads from the
  // server. Moves are queued offline, so this test makes three moves while the server is down.
  test('moves made offline survive a reload and reach the server once each', async ({ page, context, request, baseURL }) => {
    await page.goto('/#/plan');
    await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();
    // Let the service worker take control and cache the shell, as a real browser does on first use.
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.ready.then(() => navigator.serviceWorker.controller !== null)), { timeout: 15_000 })
      .toBe(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();
    const status = page.getByRole('status', { name: 'Data status' });
    await expect(status).toContainText('healthy');
    const beforeDesign = await serverDesign(request, baseURL);
    const before = beforeDesign.placements;
    expect(before.length).toBeGreaterThan(0);

    const nav = page.getByRole('navigation', { name: 'Windows' });
    await nav.getByRole('button', { name: /^Placed plants\b/ }).click();
    await page.locator('.placement-row').first().click();
    await nav.getByRole('button', { name: /^Plan\b/ }).click();

    await context.setOffline(true);
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft'];
    for (let i = 0; i < keys.length; i += 1) {
      await page.keyboard.press(keys[i]);
      await expect(status).toContainText(`${i + 1} waiting to sync`);
    }
    await expect(status).toContainText('Offline');

    // Survives a reload while still offline: the cached copy and the queue are shown together.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();
    await nav.getByRole('button', { name: /^Placed plants\b/ }).click();
    await expect(page.locator('.placement-row')).toHaveCount(before.length);
    const shown = await page.locator('.placement-row').first().locator('.coords').innerText();

    // Back online: the queue drains in order, and the server ends at the same position with no duplicates.
    await context.setOffline(false);
    await expect(status).not.toContainText('waiting to sync', { timeout: 30_000 });
    const afterDesign = await serverDesign(request, baseURL);
    const after = afterDesign.placements;
    // One log event per queued move: three moves, three events, no duplicates.
    expect(afterDesign.seq).toBe(beforeDesign.seq + 3);
    expect(after.length).toBe(before.length);
    expect(new Set(after.map((p) => p.id)).size).toBe(after.length);
    const same = after.find((p) => p.id === before[0].id);
    expect(same).toBeDefined();
    expect(shown).toContain(`x ${same!.x.toFixed(2)} m · y ${same!.y.toFixed(2)} m`);
    await expect(status).toContainText('healthy');
  });
});
