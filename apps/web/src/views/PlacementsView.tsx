import type { DesignView, SpeciesSummary } from '../api';
import { STATUS_WORD } from '../model';
import type { Status } from '@ppp/core';

export interface PlacementsViewProps {
  design: DesignView | null;
  speciesByUrn: Map<string, SpeciesSummary>;
  statusOf: (id: string) => Status;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

/** The placed-plants window: an accessible list of everything in the design. */
export function PlacementsView({ design, speciesByUrn, statusOf, selectedId, onOpen }: PlacementsViewProps) {
  if (!design) return <p className="muted">Loading…</p>;
  if (design.placements.length === 0) {
    return <p className="muted">No plants are placed yet. Add some from the Plant library window.</p>;
  }
  return (
    <ol className="placement-table">
      {design.placements.map((p) => {
        const status = statusOf(p.id);
        return (
          <li key={p.id}>
            <button
              type="button"
              className={`placement-row${p.id === selectedId ? ' is-active' : ''}`}
              aria-pressed={p.id === selectedId}
              onClick={() => onOpen(p.id)}
            >
              <span className="common">{speciesByUrn.get(p.speciesUrn)?.commonName ?? p.speciesUrn}</span>
              <span className={`status-text status-${status}`}>{STATUS_WORD[status]}</span>
              <span className="coords">
                x {p.x.toFixed(2)} m · y {p.y.toFixed(2)} m · footprint {p.footprintM.toFixed(2)} m{p.pinned ? ' · pinned' : ''}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
