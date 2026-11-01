import type { DesignView, EvaluationView } from '../api';
import { NumberField } from '../Fields';
import type { Verdict } from '@ppp/core';

export interface SiteViewProps {
  design: DesignView | null;
  evaluation: EvaluationView | null;
  attention: Verdict[];
  onUpdateSite: (changes: Record<string, number | undefined>) => void;
  onOpenPlant: (placementId: string) => void;
}

/** The site window: conditions that drive every check, and the guidance they produce. */
export function SiteView({ design, evaluation, attention, onUpdateSite, onOpenPlant }: SiteViewProps) {
  if (!design) return <p className="muted">Loading…</p>;
  const site = design.site;
  const summary = evaluation?.summary ?? { pass: 0, warn: 0, fail: 0, unknown: 0 };
  return (
    <div className="cards two-col">
      <section className="card" aria-labelledby="site-conditions">
        <h2 id="site-conditions">Conditions</h2>
        <div className="site-grid">
          <NumberField label="Width (m)" value={site.widthM} min={1} max={500} step={0.5} onCommit={(v) => onUpdateSite({ width_m: v })} />
          <NumberField label="Depth (m)" value={site.depthM} min={1} max={500} step={0.5} onCommit={(v) => onUpdateSite({ depth_m: v })} />
          <NumberField
            label="Hardiness zone"
            value={site.hardinessZone ?? null}
            min={1}
            max={13}
            step={1}
            placeholder="unknown"
            onCommit={(v) => onUpdateSite({ hardiness_zone: Math.round(v) })}
          />
          <NumberField
            label="Sun hours"
            value={site.sunHours ?? null}
            min={0}
            max={24}
            step={0.5}
            placeholder="unknown"
            onCommit={(v) => onUpdateSite({ sun_hours: v })}
          />
          <NumberField label="Soil pH" value={site.soilPh ?? null} min={0} max={14} step={0.1} placeholder="unknown" onCommit={(v) => onUpdateSite({ soil_ph: v })} />
        </div>
        <p className="muted small">Every change is saved as an event and can be undone. Leave a field alone to keep its value.</p>
      </section>

      <section className="card" aria-labelledby="site-guidance">
        <h2 id="site-guidance">Guidance</h2>
        <dl className="counts">
          <div><dt>Good fit</dt><dd>{summary.pass}</dd></div>
          <div><dt>Check</dt><dd>{summary.warn}</dd></div>
          <div><dt>Problem</dt><dd>{summary.fail}</dd></div>
          <div><dt>Unknown</dt><dd>{summary.unknown}</dd></div>
        </dl>
        {attention.length === 0 && <p className="small">Nothing needs attention right now.</p>}
        <ul className="attention-list">
          {attention.map((v, index) => (
            <li key={`${v.rule}-${v.placementId}-${index}`}>
              <button type="button" className="link-row" onClick={() => onOpenPlant(v.placementId)}>
                <span className={`status-dot status-${v.status}`} aria-hidden="true" />
                <span>{v.message}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
