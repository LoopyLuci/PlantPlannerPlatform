import { expect, test } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Measurements for PLAN Phase 1 and ADR-0009: frame rate of the 3D view with 200 plants,
 * and the time a plan edit takes to reach the server. This is not part of `npm run ci`:
 * timing depends on the machine, so run it on purpose with `npm run perf:3d` and read
 * the numbers against the gates. The results are written to test-results/perf-3d.json.
 *
 * Gates (PLAN Phase 1): 200 plants at 60 fps; a 2D edit reaches 3D within 100 ms.
 * The 100 ms gate needs the render time, which is not exposed to the page, so this
 * measures only the write round trip. The render part is still unmeasured.
 */

const PLANTS = 200;
const runId = Date.now().toString(36);

interface DesignList {
  designs: { designId: string; archived: boolean }[];
}

test('3D view frame rate with 200 plants, and plan-edit write latency', async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);

  // Open the starter design once so it exists, then find its id.
  await page.goto('/#/plan');
  await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();
  const listed = await (await request.post(`${baseURL}/api/v1/capabilities/design.list`, { data: {} })).json();
  const designId: string = (listed as { data: DesignList }).data.designs.find((d) => !d.archived)?.designId ?? '';
  expect(designId).not.toBe('');

  const design = await (await request.post(`${baseURL}/api/v1/capabilities/design.get`, { data: { design_id: designId } })).json();
  const site = (design as { data: { site: { widthM: number; depthM: number } } }).data.site;
  const species = await (await request.post(`${baseURL}/api/v1/capabilities/plants.search`, { data: {} })).json();
  const urn = (species as { data: { items: { urn: string }[] } }).data.items[0].urn;

  // Fill the plot to 200 placements through the same API the editor uses.
  for (let i = 0; i < PLANTS; i += 1) {
    const x = Number(((i * 0.37) % site.widthM).toFixed(2));
    const y = Number(((i * 0.61) % site.depthM).toFixed(2));
    const response = await request.post(`${baseURL}/api/v1/capabilities/design.add_placement`, {
      headers: { 'idempotency-key': `perf-add-${runId}-${i}` },
      data: { design_id: designId, species_urn: urn, x, y },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  // Write latency: move one plant and time the acknowledgement.
  const placed = await (await request.post(`${baseURL}/api/v1/capabilities/design.get`, { data: { design_id: designId } })).json();
  const first = (placed as { data: { placements: { id: string; x: number; y: number }[] } }).data.placements[0];
  const writes: number[] = [];
  for (let i = 0; i < 20; i += 1) {
    const started = Date.now();
    await request.post(`${baseURL}/api/v1/capabilities/design.update_placement`, {
      headers: { 'idempotency-key': `perf-move-${runId}-${i}` },
      data: { design_id: designId, placement_id: first.id, x: first.x + (i % 2) * 0.1, y: first.y },
    });
    writes.push(Date.now() - started);
  }

  // Frame rate: open the 3D view and sample animation frames while the camera is moved.
  await page.goto('/#/scene');
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('3D canvas has no size');
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(centre.x, centre.y);
  // Start sampling without waiting for it, so the camera moves while frames are recorded.
  const sampling = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const times: number[] = [];
        const start = performance.now();
        const step = (now: number) => {
          times.push(now);
          if (now - start < 3000) requestAnimationFrame(step);
          else resolve(times);
        };
        requestAnimationFrame(step);
      }),
  );
  for (let i = 0; i < 10; i += 1) {
    await page.mouse.wheel(0, i % 2 === 0 ? 200 : -200);
    await page.waitForTimeout(250);
  }
  const frames = await sampling;
  const intervals = frames.slice(1).map((t, i) => t - frames[i]);
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)] ?? 0;
  const p95 = intervals[Math.floor(intervals.length * 0.95)] ?? 0;
  const result = {
    measuredAt: new Date().toISOString(),
    machine: { platform: process.platform, arch: process.arch, cpus: (await import('node:os')).cpus().length },
    plants: PLANTS,
    frameMedianMs: Number(median.toFixed(2)),
    fpsMedian: Number((1000 / median).toFixed(1)),
    frameP95Ms: Number(p95.toFixed(2)),
    frameMaxMs: Number((intervals[intervals.length - 1] ?? 0).toFixed(2)),
    frames: intervals.length,
    writeMedianMs: Number([...writes].sort((a, b) => a - b)[Math.floor(writes.length / 2)]),
    writeMaxMs: Math.max(...writes),
    note: 'Headless Chromium on this machine, not reference hardware. The 100 ms render gate is not measured here.',
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', 'perf-3d.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  expect(median).toBeGreaterThan(0);
});
