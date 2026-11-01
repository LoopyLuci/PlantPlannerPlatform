import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * J5 gate: a plant-library search returns in under 50 ms. Timed in the page, from the moment the
 * query changes to the moment the list has been redrawn for it (one animation frame later).
 * Run with `npm run perf:3d`, which runs every perf measurement; the result is appended to
 * test-results/perf-search.json.
 */
test('plant-library search takes under 50 ms', async ({ page }) => {
  await page.goto('/#/plants');
  await expect(page.getByRole('heading', { level: 1, name: 'Plant library' })).toBeVisible();
  const input = page.getByPlaceholder('Name or family');
  await expect(input).toBeVisible();

  const queries = ['lav', 'sa', 'mint', 'rose', 'l', 'fern', 'a', 'sage', 'zzz', ''];
  const timings: { query: string; ms: number; results: number }[] = [];
  for (const query of queries) {
    const result = await page.evaluate(async (text) => {
      const field = document.querySelector<HTMLInputElement>('input[type="search"]');
      const list = document.querySelector('.split-list');
      if (!field || !list) throw new Error('search field or list missing');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      const started = performance.now();
      setter.call(field, text);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const ms = performance.now() - started;
      return { ms, results: list.querySelectorAll('.split-list button, .split-list li').length };
    }, query);
    timings.push({ query, ms: Number(result.ms.toFixed(2)), results: result.results });
  }

  const sorted = timings.map((t) => t.ms).sort((a, b) => a - b);
  const summary = {
    measuredAt: new Date().toISOString(),
    machine: { platform: process.platform, arch: process.arch },
    queries: timings.length,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    worstMs: sorted[sorted.length - 1],
    gateMs: 50,
    timings,
    note: 'Headless Chromium on this machine, client-side filter over the loaded species. Not reference hardware.',
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', 'perf-search.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  expect(summary.worstMs).toBeLessThan(50);
});
