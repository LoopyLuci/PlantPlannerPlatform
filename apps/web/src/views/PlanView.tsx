import type { DesignView, EvaluationView, SpeciesSummary } from '../api';
import { Canvas, type LayerState } from '../Canvas';
import { STATUS_WORD, type Point } from '../model';

const LAYER_LABELS: { key: keyof LayerState; label: string }[] = [
  { key: 'footprints', label: 'Footprints' },
  { key: 'envelopes', label: 'Mature outlines' },
  { key: 'arcs', label: 'Companion links' },
  { key: 'labels', label: 'Names' },
  { key: 'rings', label: 'Check rings' },
  { key: 'grid', label: 'Grid' },
];

export interface PlanViewProps {
  design: DesignView | null;
  evaluation: EvaluationView | null;
  speciesByUrn: Map<string, SpeciesSummary>;
  selectedId: string | null;
  overrides: Record<string, Point>;
  layers: LayerState;
  suggestionPoint: Point | null;
  onLayers: (layers: LayerState) => void;
  onSelect: (id: string | null) => void;
  onOpenDetails: () => void;
  onPreview: (id: string, point: Point) => void;
  onCommitMove: (placement: DesignView['placements'][number], point: Point) => void;
  onDrop: (urn: string, point: Point) => void;
}

/** The plan window: the plot, its layer toggles, and a pointer to the selected plant's details. */
export function PlanView(props: PlanViewProps) {
  const { design, selectedId, speciesByUrn, evaluation } = props;
  if (!design) return <p className="muted">Loading your design…</p>;
  const selected = design.placements.find((p) => p.id === selectedId) ?? null;
  const selectedName = selected ? speciesByUrn.get(selected.speciesUrn)?.commonName ?? selected.speciesUrn : '';
  const selectedStatus = selected ? evaluation?.placements[selected.id]?.status ?? 'unknown' : 'unknown';

  return (
    <div className="plan-view">
      <div className="toolbar">
        <div className="layer-toggles" role="group" aria-label="Plan layers">
          {LAYER_LABELS.map((item) => (
            <label key={item.key} className="chip-toggle">
              <input
                type="checkbox"
                checked={props.layers[item.key]}
                onChange={(e) => props.onLayers({ ...props.layers, [item.key]: e.target.checked })}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
        {selected ? (
          <div className="selection-strip" aria-live="polite">
            <span>
              <strong className="common">{selectedName}</strong> · {STATUS_WORD[selectedStatus]}
            </span>
            <button type="button" className="ghost" onClick={props.onOpenDetails}>Open details</button>
            <button type="button" className="ghost" onClick={() => props.onSelect(null)}>Clear</button>
          </div>
        ) : (
          <span className="muted small">Select a plant to see its details. Drag to move. Arrow keys nudge.</span>
        )}
      </div>

      <div className="plan-stage">
        <Canvas
          site={design.site}
          placements={design.placements}
          speciesByUrn={speciesByUrn}
          evaluation={evaluation}
          selectedId={selectedId}
          overrides={props.overrides}
          layers={props.layers}
          suggestionPoint={props.suggestionPoint}
          onSelect={props.onSelect}
          onPreview={props.onPreview}
          onCommitMove={props.onCommitMove}
          onDrop={props.onDrop}
        />
        {design.placements.length === 0 && (
          <div className="empty-hint">
            <p>No plants yet. Add one from the Plant library window, or drag a name onto the plot.</p>
          </div>
        )}
        <div className="legend" aria-hidden="true">
          <span className="legend-item"><i className="swatch s-ok" /> good fit</span>
          <span className="legend-item"><i className="swatch s-warn" /> check</span>
          <span className="legend-item"><i className="swatch s-danger" /> problem</span>
          <span className="legend-item"><i className="swatch s-unknown" /> unknown</span>
        </div>
      </div>
    </div>
  );
}
