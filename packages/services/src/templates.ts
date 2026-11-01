/**
 * Starter Garden: the first-run design the user owns and can edit or delete.
 * It demonstrates placement, a site-condition warning, a cited companion
 * relationship and a cited antagonism, so the first screen shows the product's
 * core loop instead of an empty canvas.
 */
export interface StarterPlacement {
  key: string;
  speciesSlug: string;
  x: number;
  y: number;
}

export const STARTER_GARDEN = {
  site: {
    name: 'Starter Garden',
    widthM: 6,
    depthM: 4,
    hardinessZone: 7,
    sunHours: 6.5,
    soilPh: 7.4,
  },
  placements: [
    { key: 'lavender', speciesSlug: 'lavandula-angustifolia', x: 1.0, y: 1.0 },
    { key: 'sage', speciesSlug: 'salvia-officinalis', x: 1.8, y: 1.0 },
    { key: 'tomato', speciesSlug: 'solanum-lycopersicum', x: 3.2, y: 1.0 },
    { key: 'marigold', speciesSlug: 'tagetes-patula', x: 3.2, y: 1.7 },
    { key: 'potato', speciesSlug: 'solanum-tuberosum', x: 3.2, y: 3.0 },
    { key: 'onion', speciesSlug: 'allium-cepa', x: 4.6, y: 2.2 },
    { key: 'strawberry', speciesSlug: 'fragaria-ananassa', x: 5.2, y: 2.7 },
  ] satisfies StarterPlacement[],
};
