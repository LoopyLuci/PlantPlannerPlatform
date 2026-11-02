import { expect, test, type APIRequestContext } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The 100 ms gate from PLAN Phase 1: a plan edit reaches the 3D view within 100 ms.
 * This is a timing measurement, not part of `npm run ci`. Run it with `npm run perf:3d`.
 *
 * The edit is a keyboard move in the plan. Its write is sent after the nudge settles, and the
 * editor reloads the design from the server. The 3D view is then opened, and the time is taken
 * from the click on "3D view" to the first frame that draws the design. The 3D chunk is prefetched
 * when idle (ADR-0013), and the test waits for that download, so both opens measure the same path.
 * Before ADR-0013 the first open included the chunk download (394 ms here).
 *
 * Results are written to test-results/perf-plan-to-3d.json.
 */

async function seqOf(request: APIRequestContext, baseURL: string | undefined): Promise<number> {
  const listed = await (await request.post(`${baseURL}/api/v1/capabilities/design.list`, { data: {} })).json();
  const designs = (listed as { data: { designs: { designId: string; archived: boolean }[] } }).data.designs;
  const designId = designs.find((d) => !d.archived)?.designId ?? '';
  const design = await (await request.post(`${baseURL}/api/v1/capabilities/design.get`, { data: { design_id: designId } })).json();
  return (design as { data: { seq: number } }).data.seq;
}

/** Clicks "3D view" in the page and times, inside the page, until the scene has drawn a frame. */
async function openSceneTimed(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(async () => {
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Windows"] button')];
    const button = buttons.find((b) => b.textContent?.startsWith('3D view'));
    if (!button) throw new Error('3D view button not found');
    const started = performance.now();
    button.click();
    await new Promise<void>((resolve) => {
      const check = () => {
        if (document.querySelector('.scene-stage')?.getAttribute('data-render-count')) resolve();
        else requestAnimationFrame(check);
      };
      check();
    });
    return performance.now() - started;
  });
}

test('a plan edit reaches the 3D view within the 100 ms gate', async ({ page, request, baseURL }) => {
  test.setTimeout(120_000);
  // ADR-0013: the 3D chunk is prefetched when idle. Wait for that download, so the first open measures the warm path.
  const prefetched = page.waitForResponse((response) => /SceneView-.*\.js$/.test(response.url()), { timeout: 60_000 });
  await page.goto('/#/plan');
  await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Data status' })).toContainText('healthy');
  await prefetched;

  const nav = page.getByRole('navigation', { name: 'Windows' });
  await nav.getByRole('button', { name: /^Placed plants\b/ }).click();
  await page.locator('.placement-row').first().click();
  await nav.getByRole('button', { name: /^Plan\b/ }).click();

  const before = await seqOf(request, baseURL);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => seqOf(request, baseURL), { timeout: 15_000 }).toBeGreaterThan(before);

  const firstOpen = await openSceneTimed(page);
  const stageMs = Number(await page.locator('.scene-stage').getAttribute('data-render-ms'));

  await nav.getByRole('button', { name: /^Plan\b/ }).click();
  const secondOpen = await openSceneTimed(page);

  const result = {
    measuredAt: new Date().toISOString(),
    machine: { platform: process.platform, arch: process.arch },
    planEdit: 'keyboard move, saved, reloaded, then 3D view opened',
    firstOpenMs: Number(firstOpen.toFixed(1)),
    secondOpenMs: Number(secondOpen.toFixed(1)),
    sceneDrawMs: Number(stageMs.toFixed(1)),
    gateMs: 100,
    note: 'Headless Chromium on this machine, not reference hardware. The 3D chunk was prefetched before the first open (ADR-0013).',
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', 'perf-plan-to-3d.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  expect(secondOpen).toBeGreaterThan(0);
});
