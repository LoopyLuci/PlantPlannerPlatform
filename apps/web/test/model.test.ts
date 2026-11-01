import { describe, expect, it } from 'vitest';
import type { Verdict } from '@ppp/core';
import {
  clampToSite,
  fitView,
  formatRange,
  gridStep,
  nearestFreeSpot,
  overlapBetween,
  pixelToMetres,
  snap,
  summarize,
} from '../src/model';

const site = { widthM: 6, depthM: 4 };

function verdict(partial: Partial<Verdict> & Pick<Verdict, 'status' | 'message'>): Verdict {
  return { rule: 'sun', placementId: 'p1', ...partial };
}

describe('summary wording', () => {
  it('puts problems first and says so in the headline', () => {
    const result = summarize([
      verdict({ status: 'pass', message: 'Sun is fine' }),
      verdict({ status: 'warn', message: 'Soil pH is off', rule: 'soil_ph' }),
      verdict({ status: 'unknown', message: 'Zone not set', rule: 'hardiness' }),
    ]);
    expect(result.headline).toBe('1 thing to check');
    expect(result.lines[0]).toBe('Soil pH is off');
    expect(result.lines).toContain('Unknown: Zone not set');
  });

  it('reports a clean placement as a good fit', () => {
    expect(summarize([verdict({ status: 'pass', message: 'ok' })]).headline).toBe('Good fit for this site');
  });

  it('lists beneficial companions as positive lines', () => {
    const result = summarize([
      verdict({ status: 'pass', rule: 'companion', direction: 'beneficial', message: 'A and B: pest repellence' }),
    ]);
    expect(result.lines).toEqual(['Companion: A and B: pest repellence']);
  });
});

describe('geometry', () => {
  it('snaps to the grid and removes float noise', () => {
    expect(snap(1.2349)).toBe(1.25);
    expect(snap(0.1 + 0.2)).toBe(0.3);
  });

  it('keeps a plant centre on the plan', () => {
    expect(clampToSite({ x: -1, y: 9 }, site)).toEqual({ x: 0, y: 4 });
  });

  it('measures overlap as the amount two footprints intrude into each other', () => {
    const overlap = overlapBetween({ x: 0, y: 0, footprintM: 0.6 }, { x: 0.4, y: 0, footprintM: 0.6 });
    expect(overlap).toBeCloseTo(0.2, 6);
  });

  it('finds a free spot next to an occupied one, inside the site', () => {
    const placed = [{ x: 3, y: 2, footprintM: 0.6 }];
    const spot = nearestFreeSpot(site, placed, 0.6, { x: 3, y: 2 });
    expect(spot).not.toBeNull();
    expect(overlapBetween({ ...spot!, footprintM: 0.6 }, placed[0])).toBeLessThanOrEqual(0.01);
    expect(spot!.x).toBeGreaterThanOrEqual(0);
    expect(spot!.y).toBeLessThanOrEqual(site.depthM);
  });

  it('returns null when the site is full', () => {
    const tiny = { widthM: 1, depthM: 1 };
    expect(nearestFreeSpot(tiny, [{ x: 0.5, y: 0.5, footprintM: 2 }], 0.5, { x: 0.5, y: 0.5 })).toBeNull();
  });
});

describe('view mapping', () => {
  it('fits the whole site inside the viewport', () => {
    const view = fitView(site, { width: 900, height: 600 });
    expect(site.widthM * view.scale + view.offsetX * 2).toBeCloseTo(900, 0);
    expect(view.scale).toBeGreaterThan(20);
  });

  it('converts pixels to metres through the view transform', () => {
    const view = { scale: 100, offsetX: 50, offsetY: 20 };
    expect(pixelToMetres({ x: 250, y: 120 }, view)).toEqual({ x: 2, y: 1 });
  });

  it('chooses a grid step that keeps lines readable', () => {
    expect(gridStep(100)).toBe(0.25);
    expect(gridStep(30)).toBe(1);
  });
});

describe('formatting', () => {
  it('shows ranges and unknowns plainly', () => {
    expect(formatRange(5, 9)).toBe('5-9');
    expect(formatRange(6, 6)).toBe('6');
    expect(formatRange(null, null)).toBe('not recorded');
  });
});
