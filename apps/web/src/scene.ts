import type { Status } from '@ppp/core';
import type { DesignView, EvaluationView, PlacementView, SpeciesSummary } from './api';

/**
 * Pure geometry for the 3D and side-elevation windows. Nothing here touches
 * WebGL or the DOM, so the rules for how a plant is drawn can be unit-tested.
 * Units are metres. The plan's origin is the top-left corner, as everywhere else.
 */

/** Height used when a species has no recorded mature height. The view says so; it is not a fact. */
export const UNRECORDED_HEIGHT_M = 0.6;
/** Smallest canopy radius drawn, so a tiny footprint is still visible. */
const MIN_CANOPY_RADIUS_M = 0.05;

export interface PlantShape {
  id: string;
  name: string;
  status: Status;
  x: number;
  y: number;
  /** Horizontal radius of the canopy: half the mature spread, else half the footprint. */
  canopyRadiusM: number;
  heightM: number;
  heightRecorded: boolean;
}

export function plantShape(
  placement: PlacementView,
  species: SpeciesSummary | undefined,
  status: Status,
): PlantShape {
  const recordedHeight = species?.traits.matureHeightM ?? null;
  const recordedSpread = species?.traits.matureSpreadM ?? null;
  const spread = recordedSpread ?? placement.footprintM;
  return {
    id: placement.id,
    name: species?.commonName || placement.speciesUrn,
    status,
    x: placement.x,
    y: placement.y,
    canopyRadiusM: Math.max(spread / 2, MIN_CANOPY_RADIUS_M),
    heightM: recordedHeight ?? UNRECORDED_HEIGHT_M,
    heightRecorded: recordedHeight !== null,
  };
}

/** One shape per placement, sorted by id so the drawing order is stable. */
export function sceneShapes(
  design: DesignView,
  evaluation: EvaluationView | null,
  speciesByUrn: Map<string, SpeciesSummary>,
): PlantShape[] {
  return [...design.placements]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((placement) =>
      plantShape(placement, speciesByUrn.get(placement.speciesUrn), evaluation?.placements[placement.id]?.status ?? 'unknown'),
    );
}

/**
 * Level of detail for the canopies. Fewer polygon segments as the plant count
 * grows, so the frame time stays flat. Chosen by count, not by distance.
 */
export function canopySegments(plantCount: number): number {
  if (plantCount <= 50) return 16;
  if (plantCount <= 200) return 10;
  return 6;
}

/**
 * Where a point of the plan sits in the 3D scene, in metres. The site centre is the origin,
 * and plan y becomes world z (south is towards the viewer on the default camera).
 */
export function worldPosition(point: { x: number; y: number }, site: { widthM: number; depthM: number }): { x: number; z: number } {
  return { x: point.x - site.widthM / 2, z: point.y - site.depthM / 2 };
}

export type ElevationAxis = 'x' | 'y';

/**
 * Side elevation. 'x' looks from the south, so the horizontal axis is x (east-west).
 * 'y' looks from the west, so the horizontal axis is y (north-south). Plants that
 * line up on the horizontal axis overlap, as they would in a real elevation.
 */
export function elevationOrder(shapes: readonly PlantShape[], axis: ElevationAxis): PlantShape[] {
  // Farthest from the viewer first, so the nearest plant is drawn last, on top.
  // From the south, the nearest plant has the largest y. From the west, the largest x.
  const depth = (shape: PlantShape) => (axis === 'x' ? shape.y : shape.x);
  return [...shapes].sort((a, b) => depth(a) - depth(b) || a.id.localeCompare(b.id));
}

export function horizontalPosition(shape: PlantShape, axis: ElevationAxis): number {
  return axis === 'x' ? shape.x : shape.y;
}

export function horizontalExtent(site: { widthM: number; depthM: number }, axis: ElevationAxis): number {
  return axis === 'x' ? site.widthM : site.depthM;
}

/** The tallest thing on the page, with a margin, so nothing is clipped. Never less than 1 m. */
export function elevationHeight(shapes: readonly PlantShape[]): number {
  const tallest = shapes.reduce((max, shape) => Math.max(max, shape.heightM), 0);
  return Math.max(1, Math.ceil(tallest * 1.15 * 10) / 10);
}
