import { STATUS_WORD } from '../model';
import type { PlantShape } from '../scene';

/**
 * The keyboard and screen-reader route to the plants drawn in 3D or in the
 * elevation. Canvas drawings cannot be read by a screen reader, so every plant
 * also appears here as a button.
 */
export function PlantList(props: { shapes: readonly PlantShape[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (props.shapes.length === 0) return <p className="muted small">No plants on this plan yet.</p>;
  return (
    <ul className="plant-list" aria-label="Plants in this design">
      {props.shapes.map((shape) => (
        <li key={shape.id}>
          <button
            type="button"
            className="ghost"
            aria-pressed={shape.id === props.selectedId}
            onClick={() => props.onSelect(shape.id)}
          >
            {shape.name}
          </button>
          <span className="muted small">
            {' '}
            · {STATUS_WORD[shape.status]} · {shape.heightRecorded ? `${shape.heightM} m tall` : 'height not recorded'}
          </span>
        </li>
      ))}
    </ul>
  );
}
