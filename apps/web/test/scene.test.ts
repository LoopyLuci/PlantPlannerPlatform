import { describe, expect, it } from 'vitest';
import type { DesignView, EvaluationView, PlacementView, SpeciesSummary } from '../src/api';
import {
  UNRECORDED_HEIGHT_M,
  canopySegments,
  elevationHeight,
  elevationOrder,
  horizontalExtent,
  plantShape,
  sceneShapes,
  worldPosition,
} from '../src/scene';

function species(urn: string, height: number | null, spread: number | null): SpeciesSummary {
  return {
    urn,
    scientificName: 'Testus plantus',
    commonName: `Common ${urn.slice(-3)}`,
    family: 'Testaceae',
    growthForm: 'shrub',
    guildLayer: 'understory',
    traits: {
      matureHeightM: height,
      matureSpreadM: spread,
      plantingSpacingM: 0.5,
      sunHoursMin: null,
      phMin: null,
      phMax: null,
      hardinessMin: null,
      hardinessMax: null,
    },
  };
}

function placement(id: string, urn: string, x: number, y: number, footprintM = 0.5): PlacementView {
  return { id, speciesUrn: urn, x, y, footprintM, pinned: false };
}

const TALL = 'urn:ppp:species:tall-one';
const UNKNOWN = 'urn:ppp:species:unknown-two';

describe('plant geometry', () => {
  it('uses the recorded height and half the mature spread as the canopy radius', () => {
    const shape = plantShape(placement('p1', TALL, 1, 1), species(TALL, 2, 1.2), 'pass');
    expect(shape).toMatchObject({ heightM: 2, heightRecorded: true, canopyRadiusM: 0.6, status: 'pass' });
  });

  it('draws an unrecorded height at the stated default and says so', () => {
    const shape = plantShape(placement('p2', UNKNOWN, 1, 1, 0.8), species(UNKNOWN, null, null), 'unknown');
    expect(shape.heightM).toBe(UNRECORDED_HEIGHT_M);
    expect(shape.heightRecorded).toBe(false);
    expect(shape.canopyRadiusM).toBe(0.4);
  });

  it('never draws a canopy smaller than a visible radius', () => {
    const shape = plantShape(placement('p3', TALL, 1, 1, 0.01), undefined, 'pass');
    expect(shape.canopyRadiusM).toBeGreaterThanOrEqual(0.05);
  });

  it('takes status from the evaluation, and sorts shapes by id so the drawing order is stable', () => {
    const design = {
      designId: 'd_0123456789abcdef',
      name: 'Bed',
      archived: false,
      seq: 3,
      site: { name: 'Bed', widthM: 6, depthM: 4 },
      placements: [placement('p_b', TALL, 2, 2), placement('p_a', TALL, 1, 1)],
    } as DesignView;
    const evaluation = {
      placements: { p_a: { status: 'fail' }, p_b: { status: 'warn' } },
    } as unknown as EvaluationView;
    const shapes = sceneShapes(design, evaluation, new Map([[TALL, species(TALL, 1, 1)]]));
    expect(shapes.map((s) => [s.id, s.status])).toEqual([
      ['p_a', 'fail'],
      ['p_b', 'warn'],
    ]);
  });
});

describe('scene placement', () => {
  it('centres the site on the origin, with plan y becoming world z', () => {
    const site = { widthM: 6, depthM: 4 };
    expect(worldPosition({ x: 0, y: 0 }, site)).toEqual({ x: -3, z: -2 });
    expect(worldPosition({ x: 6, y: 4 }, site)).toEqual({ x: 3, z: 2 });
    expect(worldPosition({ x: 3, y: 2 }, site)).toEqual({ x: 0, z: 0 });
  });
});

describe('level of detail', () => {
  it('uses more segments for fewer plants and fewer as the count grows', () => {
    expect(canopySegments(1)).toBe(16);
    expect(canopySegments(50)).toBe(16);
    expect(canopySegments(51)).toBe(10);
    expect(canopySegments(200)).toBe(10);
    expect(canopySegments(201)).toBe(6);
  });
});

describe('side elevation', () => {
  const shapes = [
    { ...plantShape(placement('p_near', TALL, 2, 3.5), species(TALL, 1.5, 1), 'pass') },
    { ...plantShape(placement('p_far', TALL, 2, 0.5), species(TALL, 0.5, 1), 'warn') },
    { ...plantShape(placement('p_mid', TALL, 4, 2), species(TALL, 1, 1), 'fail') },
  ];

  it('orders plants from the far side to the near side when viewed from the south', () => {
    expect(elevationOrder(shapes, 'x').map((s) => s.id)).toEqual(['p_far', 'p_mid', 'p_near']);
  });

  it('orders plants from the far side to the near side when viewed from the west', () => {
    expect(elevationOrder(shapes, 'y').map((s) => s.id)).toEqual(['p_far', 'p_near', 'p_mid']);
  });

  it('measures the horizontal axis from the chosen direction', () => {
    const site = { widthM: 6, depthM: 4 };
    expect(horizontalExtent(site, 'x')).toBe(6);
    expect(horizontalExtent(site, 'y')).toBe(4);
  });

  it('leaves room for the tallest plant, with a margin, and never less than one metre', () => {
    expect(elevationHeight(shapes)).toBe(1.8);
    expect(elevationHeight([])).toBe(1);
  });
});
