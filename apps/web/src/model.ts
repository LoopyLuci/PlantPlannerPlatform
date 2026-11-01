import type { Direction, Status, Verdict } from '@ppp/core';

/**
 * Pure presentation logic for the editor. Nothing here touches the DOM or the
 * network, so every rule about how a result is shown can be unit-tested.
 */

export interface Point {
  x: number;
  y: number;
}

export interface SitePlan {
  widthM: number;
  depthM: number;
}

export interface Footprinted extends Point {
  footprintM: number;
}

/** Palette from the design system (paper, ink, leaf, and the guild layer colours). */
export const GUILD_COLORS: Record<string, string> = {
  canopy: '#3D5A47',
  understory: '#6B8F5E',
  groundcover: '#A8C25E',
  root: '#8B6F4E',
};

export const STATUS_COLOR: Record<Status, string> = {
  pass: '#5B8A5E',
  warn: '#C8963E',
  fail: '#B8503E',
  unknown: '#7A827D',
};

export const STATUS_WORD: Record<Status, string> = {
  pass: 'Good fit',
  warn: 'Check this',
  fail: 'Problem',
  unknown: 'Unknown',
};

export const DIRECTION_COLOR: Record<Direction, string> = {
  beneficial: '#5B8A5E',
  antagonistic: '#B8503E',
  neutral: '#A8AFA9',
};

const SEVERITY: Record<Status, number> = { fail: 0, warn: 1, unknown: 2, pass: 3 };

export function worstFirst(a: Status, b: Status): number {
  return SEVERITY[a] - SEVERITY[b];
}

/** Turns structured verdicts into the plain-language summary shown in the inspector. */
export function summarize(verdicts: readonly Verdict[]): { headline: string; lines: string[] } {
  const problems = verdicts
    .filter((v) => v.status === 'fail' || v.status === 'warn')
    .sort((a, b) => worstFirst(a.status, b.status));
  const unknowns = verdicts.filter((v) => v.status === 'unknown');
  const beneficial = verdicts.filter((v) => v.rule === 'companion' && v.direction === 'beneficial');
  const lines = [
    ...problems.map((v) => v.message),
    ...unknowns.map((v) => `Unknown: ${v.message}`),
    ...beneficial.map((v) => `Companion: ${v.message}`),
  ];
  let headline = 'Good fit for this site';
  if (problems.length > 0) headline = `${problems.length} thing${problems.length === 1 ? '' : 's'} to check`;
  else if (unknowns.length > 0) headline = 'No problems found, with some unknowns';
  return { headline, lines };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds to a grid step and removes floating-point noise. */
export function snap(value: number, step = 0.05): number {
  return Number((Math.round(value / step) * step).toFixed(3));
}

/** Keeps a plant's centre inside the site, so its centre is always on the plan. */
export function clampToSite(point: Point, site: SitePlan): Point {
  return {
    x: clamp(point.x, 0, site.widthM),
    y: clamp(point.y, 0, site.depthM),
  };
}

export function overlapBetween(a: Footprinted, b: Footprinted): number {
  return (a.footprintM + b.footprintM) / 2 - Math.hypot(a.x - b.x, a.y - b.y);
}

const TOLERANCE_M = 0.01;

/**
 * Finds the nearest spot to `start` where a footprint of `footprintM` fits inside
 * the site without overlapping any placement. Searches outward in rings.
 */
export function nearestFreeSpot(
  site: SitePlan,
  placed: readonly Footprinted[],
  footprintM: number,
  start: Point,
): Point | null {
  const fits = (p: Point) =>
    p.x >= 0 &&
    p.y >= 0 &&
    p.x <= site.widthM &&
    p.y <= site.depthM &&
    placed.every((other) => overlapBetween({ ...p, footprintM }, other) <= TOLERANCE_M);
  const origin = clampToSite(start, site);
  if (fits(origin)) return origin;
  const maxRadius = Math.max(site.widthM, site.depthM);
  for (let radius = 0.25; radius <= maxRadius; radius += 0.25) {
    for (let step = 0; step < 16; step += 1) {
      const angle = (step / 16) * Math.PI * 2;
      const candidate = snapPoint({ x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius });
      if (fits(candidate)) return candidate;
    }
  }
  return null;
}

function snapPoint(p: Point): Point {
  return { x: snap(p.x, 0.05), y: snap(p.y, 0.05) };
}

export function formatMetres(value: number): string {
  return `${value.toFixed(2)} m`;
}

export function formatRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return 'not recorded';
  if (min === null || max === null) return String(min ?? max);
  return min === max ? String(min) : `${min}-${max}`;
}

/** Converts a pointer position in CSS pixels to site metres, given the current view. */
export function pixelToMetres(
  pixel: Point,
  view: { scale: number; offsetX: number; offsetY: number },
): Point {
  return { x: (pixel.x - view.offsetX) / view.scale, y: (pixel.y - view.offsetY) / view.scale };
}

export function fitView(
  site: SitePlan,
  viewport: { width: number; height: number },
): { scale: number; offsetX: number; offsetY: number } {
  const pad = 32;
  const scale = clamp(
    Math.min((viewport.width - pad * 2) / site.widthM, (viewport.height - pad * 2) / site.depthM),
    20,
    260,
  );
  return {
    scale,
    offsetX: (viewport.width - site.widthM * scale) / 2,
    offsetY: (viewport.height - site.depthM * scale) / 2,
  };
}

/** Grid step in metres that keeps lines at least 24 px apart on screen. */
export function gridStep(scale: number): number {
  for (const step of [0.25, 0.5, 1, 2, 5, 10]) {
    if (step * scale >= 24) return step;
  }
  return 10;
}
