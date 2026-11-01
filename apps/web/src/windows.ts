/**
 * The editor's windows. Each one is a separate view chosen from the side
 * navigation and addressed by URL hash, so a window can be bookmarked and
 * reopened directly (for example #/plants).
 */
export type ViewId = 'plan' | 'scene' | 'elevation' | 'site' | 'plants' | 'placements' | 'details' | 'designs' | 'health';

export interface ViewDef {
  id: ViewId;
  label: string;
  description: string;
}

export const VIEWS: readonly ViewDef[] = [
  { id: 'plan', label: 'Plan', description: 'Arrange plants on the plot, see live checks and companion links.' },
  { id: 'scene', label: '3D view', description: 'Walk around the plot in perspective. Drag a plant to move it; the plan updates too.' },
  { id: 'elevation', label: 'Side elevation', description: 'The plants seen from the side, drawn at their mature heights.' },
  { id: 'site', label: 'Site', description: 'Hardiness zone, sun, soil pH and size. These drive every check.' },
  { id: 'plants', label: 'Plant library', description: 'Search cited species, read their traits and sources, and add them to the plan.' },
  { id: 'placements', label: 'Placed plants', description: 'Every plant in this design, with its current status.' },
  { id: 'details', label: 'Plant details', description: 'Why the selected plant is there, and its properties.' },
  { id: 'designs', label: 'Designs', description: 'Open, create or archive designs.' },
  { id: 'health', label: 'Data health', description: 'Integrity of stored designs, the knowledge graph and the versions in use.' },
];

export function isViewId(value: string): value is ViewId {
  return VIEWS.some((view) => view.id === value);
}

export function viewFromHash(hash: string): ViewId {
  const name = hash.replace(/^#\/?/, '');
  return isViewId(name) ? name : 'plan';
}

export function viewDef(id: ViewId): ViewDef {
  return VIEWS.find((view) => view.id === id) ?? VIEWS[0];
}
