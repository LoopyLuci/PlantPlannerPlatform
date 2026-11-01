import { useState } from 'react';
import type { DesignView } from '../api';
import { STATUS_COLOR } from '../model';
import {
  type ElevationAxis,
  type PlantShape,
  elevationHeight,
  elevationOrder,
  horizontalExtent,
  horizontalPosition,
} from '../scene';
import { PlantList } from './PlantList';

const PIXELS_PER_METRE = 60;
const MARGIN = 24;
const GROUND_ROOM = 28;

export interface ElevationViewProps {
  design: DesignView | null;
  shapes: readonly PlantShape[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * The side elevation: the plants as they look from one side, with their mature
 * heights. It is drawn in SVG, so every plant is also a labelled, clickable shape.
 */
export function ElevationView({ design, shapes, selectedId, onSelect }: ElevationViewProps) {
  const [axis, setAxis] = useState<ElevationAxis>('x');
  if (!design) return <p className="muted">Loading…</p>;

  const extent = horizontalExtent(design.site, axis);
  const top = elevationHeight(shapes);
  const width = extent * PIXELS_PER_METRE + MARGIN * 2;
  const height = top * PIXELS_PER_METRE + MARGIN + GROUND_ROOM;
  const groundY = height - GROUND_ROOM / 2;

  return (
    <div className="elevation">
      <div className="segmented" role="group" aria-label="Viewing direction">
        <button type="button" className="ghost" aria-pressed={axis === 'x'} onClick={() => setAxis('x')}>
          From the south (across the site’s width)
        </button>
        <button type="button" className="ghost" aria-pressed={axis === 'y'} onClick={() => setAxis('y')}>
          From the west (across the site’s depth)
        </button>
      </div>
      <svg
        className="elevation-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Side elevation of ${shapes.length} plant${shapes.length === 1 ? '' : 's'}, viewed ${axis === 'x' ? 'from the south' : 'from the west'}`}
      >
        <line x1={MARGIN} x2={MARGIN + extent * PIXELS_PER_METRE} y1={groundY} y2={groundY} className="elevation-ground" />
        {elevationOrder(shapes, axis).map((shape) => {
          const cx = MARGIN + horizontalPosition(shape, axis) * PIXELS_PER_METRE;
          const crownCentre = groundY - shape.heightM * 0.62 * PIXELS_PER_METRE;
          const crownRadiusY = shape.heightM * 0.38 * PIXELS_PER_METRE;
          const crownBottom = groundY - shape.heightM * 0.24 * PIXELS_PER_METRE;
          const selected = shape.id === selectedId;
          return (
            <g key={shape.id} onClick={() => onSelect(shape.id)} className="elevation-plant">
              <title>
                {shape.heightRecorded
                  ? `${shape.name}: ${shape.heightM} m mature height`
                  : `${shape.name}: height not recorded, drawn at ${shape.heightM} m`}
              </title>
              <line x1={cx} x2={cx} y1={groundY} y2={crownBottom} className="elevation-stem" />
              <ellipse
                cx={cx}
                cy={crownCentre}
                rx={shape.canopyRadiusM * PIXELS_PER_METRE}
                ry={crownRadiusY}
                fill={STATUS_COLOR[shape.status]}
                fillOpacity={0.85}
                className={selected ? 'elevation-crown elevation-selected' : 'elevation-crown'}
              />
            </g>
          );
        })}
      </svg>
      <PlantList shapes={shapes} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}
