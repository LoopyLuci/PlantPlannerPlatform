import { useState } from 'react';
import type { CandidateView, DesignView, PlacementView, SpeciesSummary, SuggestionView } from '../api';
import { NumberField } from '../Fields';
import { STATUS_WORD, formatRange, summarize } from '../model';
import { FEEDBACK_REASON_TAGS, type FeedbackReasonTag, type Status, type Verdict } from '@ppp/core';

export interface FeedbackInput {
  rule: string;
  reasonTag: FeedbackReasonTag;
  note: string;
}

const REASON_LABELS: Record<FeedbackReasonTag, string> = {
  source_outdated: 'The source is out of date',
  site_condition_differs: 'My site is different (sun, soil or zone)',
  variety_differs: 'My variety behaves differently',
  rule_too_strict: 'The rule is too strict for this case',
  rule_too_loose: 'The rule misses a real problem',
  data_wrong: 'The recorded data looks wrong',
  other: 'Something else',
};

export const ROUTE_LABELS: Record<string, string> = {
  curation_queue: 'the curation queue, for a person to check the source',
  rule_review: 'rule review, for a person to decide on the thresholds',
  site_update: 'the Site window, to update the site condition',
  design_note: 'the design notes',
};

export interface DetailsViewProps {
  design: DesignView | null;
  selected: PlacementView | null;
  speciesByUrn: Map<string, SpeciesSummary>;
  species: SpeciesSummary[];
  verdicts: Verdict[];
  companionScore: number;
  formula: string;
  suggestions: SuggestionView | null;
  onOpenPlan: () => void;
  onOpenPlacements: () => void;
  onUpdate: (changes: Partial<Pick<PlacementView, 'speciesUrn' | 'footprintM' | 'pinned' | 'x' | 'y'>>) => void;
  onRemove: () => void;
  onSuggest: () => void;
  onSwap: (candidate: CandidateView) => void;
  onCloseSuggestions: () => void;
  /** Records feedback on a verdict. Resolves to the message the form shows. */
  onFeedback: (input: FeedbackInput) => Promise<string>;
}

/** The plant-details window: the explanation for one plant, and every property you can change. */
export function DetailsView(props: DetailsViewProps) {
  const { design, selected, speciesByUrn } = props;
  const [showReasoning, setShowReasoning] = useState(false);

  if (!design) return <p className="muted">Loading…</p>;
  if (!selected) {
    return (
      <div className="card">
        <p>No plant is selected.</p>
        <div className="actions">
          <button type="button" className="ghost" onClick={props.onOpenPlan}>Go to the plan</button>
          <button type="button" className="ghost" onClick={props.onOpenPlacements}>Choose from placed plants</button>
        </div>
      </div>
    );
  }

  const species = speciesByUrn.get(selected.speciesUrn);
  const headline = summarize(props.verdicts);
  const rank: Record<Status, number> = { pass: 0, unknown: 1, warn: 2, fail: 3 };
  const status = props.verdicts.reduce<Status>((worst, v) => (rank[v.status] > rank[worst] ? v.status : worst), 'pass');

  return (
    <div className="cards two-col">
      <section className="card" aria-labelledby="why-heading">
        <div className="title-row">
          <div>
            <h2 id="why-heading" className="species-title">{species?.commonName ?? selected.speciesUrn}</h2>
            <p className="scientific">{species?.scientificName} · {species?.family}</p>
          </div>
          <span className={`status-pill status-${status}`}>{STATUS_WORD[status]}</span>
        </div>
        <p className="score" title={props.formula}>
          Companion score <strong>{props.companionScore}</strong>/100 <span className="muted small">· explained in the reasoning</span>
        </p>
        <p className="headline">{headline.headline}</p>
        <ul className="reason-list">
          {headline.lines.slice(0, showReasoning ? undefined : 4).map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
        <button type="button" className="ghost" aria-expanded={showReasoning} onClick={() => setShowReasoning((v) => !v)}>
          {showReasoning ? 'Hide full reasoning' : 'Show full reasoning'}
        </button>
        {showReasoning && (
          <table className="grid-table">
            <caption className="sr-only">Every rule that applies to this plant</caption>
            <thead>
              <tr><th scope="col">Rule</th><th scope="col">Status</th><th scope="col">Detail</th><th scope="col">Source</th></tr>
            </thead>
            <tbody>
              {props.verdicts.map((v, index) => (
                <tr key={`${v.rule}-${index}`}>
                  <td>{v.rule.replace(/_/g, ' ')}</td>
                  <td><span className={`status-text status-${v.status}`}>{STATUS_WORD[v.status]}</span></td>
                  <td>{v.message}</td>
                  <td>{v.sourceId ? <span className="mono">{v.sourceId}{v.grade ? ` (grade ${v.grade})` : ''}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {species && (
          <>
            <h3>Known traits</h3>
            <dl className="traits">
              <Trait label="Mature height" value={species.traits.matureHeightM} unit="m" />
              <Trait label="Mature spread" value={species.traits.matureSpreadM} unit="m" />
              <Trait label="Planting spacing" value={species.traits.plantingSpacingM} unit="m" />
              <div><dt>Sun needed</dt><dd>{species.traits.sunHoursMin === null ? 'not recorded' : `at least ${species.traits.sunHoursMin} h`}</dd></div>
              <div><dt>Soil pH</dt><dd>{formatRange(species.traits.phMin, species.traits.phMax)}</dd></div>
              <div><dt>Hardiness zone</dt><dd>{formatRange(species.traits.hardinessMin, species.traits.hardinessMax)}</dd></div>
            </dl>
          </>
        )}
      </section>

      <div className="stack">
        <section className="card" aria-labelledby="props-heading">
          <h2 id="props-heading">Properties</h2>
          <div className="site-grid">
            <NumberField label="x (m)" value={selected.x} min={0} max={design.site.widthM} step={0.05} onCommit={(v) => props.onUpdate({ x: v })} />
            <NumberField label="y (m)" value={selected.y} min={0} max={design.site.depthM} step={0.05} onCommit={(v) => props.onUpdate({ y: v })} />
            <NumberField label="Footprint (m)" value={selected.footprintM} min={0.05} max={50} step={0.05} onCommit={(v) => props.onUpdate({ footprintM: v })} />
          </div>
          <label className="field">
            <span>Species</span>
            <select value={selected.speciesUrn} onChange={(e) => props.onUpdate({ speciesUrn: e.target.value })}>
              {props.species.map((sp) => (
                <option key={sp.urn} value={sp.urn}>{sp.commonName}</option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={selected.pinned} onChange={(e) => props.onUpdate({ pinned: e.target.checked })} />
            <span>Pin position so automation never moves it</span>
          </label>
          <div className="actions">
            <button type="button" className="ghost" onClick={props.onSuggest}>Suggest plants for this spot</button>
            <button type="button" className="danger-outline" onClick={props.onRemove}>Remove plant</button>
          </div>
        </section>

        <section className="card" aria-labelledby="feedback-heading">
          <h2 id="feedback-heading">Disagree with a verdict?</h2>
          <FeedbackForm rules={[...new Set(props.verdicts.map((v) => v.rule))]} onSubmit={props.onFeedback} />
        </section>

        {props.suggestions && (
          <section className="card" aria-labelledby="suggest-heading">
            <div className="section-head">
              <h2 id="suggest-heading">Suggestions for this spot</h2>
              <button type="button" className="ghost" onClick={props.onCloseSuggestions}>Close</button>
            </div>
            {props.suggestions.candidates.length === 0 && <p className="small">No species passes the site filters here.</p>}
            <ul className="candidate-list">
              {props.suggestions.candidates.map((c) => (
                <li key={c.speciesUrn}>
                  <span><span className="common">{c.commonName}</span> <span className="muted small">· {STATUS_WORD[c.status]} · companion {c.companionScore}</span></span>
                  <button type="button" className="ghost" onClick={() => props.onSwap(c)}>Use this plant</button>
                </li>
              ))}
            </ul>
            <p className="muted small">{props.suggestions.rejected.length} species were filtered out, each with a reason in the data.</p>
          </section>
        )}
      </div>
    </div>
  );
}

/** Feedback is kept as a record. It never changes the plant, the site or a rule; the router only suggests who should look. */
function FeedbackForm({ rules, onSubmit }: { rules: string[]; onSubmit: (input: FeedbackInput) => Promise<string> }) {
  const [rule, setRule] = useState('');
  const [reasonTag, setReasonTag] = useState<FeedbackReasonTag>('site_condition_differs');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (rules.length === 0) {
    return <p className="muted small">No rule gives a verdict on this plant, so there is nothing to dispute.</p>;
  }
  const chosen = rules.includes(rule) ? rule : rules[0];

  return (
    <form
      className="feedback-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage(await onSubmit({ rule: chosen, reasonTag, note: note.trim() }));
        setNote('');
        setBusy(false);
      }}
    >
      <label className="field">
        <span>Verdict</span>
        <select value={chosen} onChange={(e) => setRule(e.target.value)}>
          {rules.map((r) => (
            <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Why</span>
        <select value={reasonTag} onChange={(e) => setReasonTag(e.target.value as FeedbackReasonTag)}>
          {FEEDBACK_REASON_TAGS.map((tag) => (
            <option key={tag} value={tag}>{REASON_LABELS[tag]}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Detail (optional, up to 500 characters)</span>
        <textarea maxLength={500} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="actions">
        <button type="submit" className="ghost" disabled={busy}>Send feedback</button>
      </div>
      {message && <p className="small" role="status">{message}</p>}
    </form>
  );
}

function Trait({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value === null ? 'not recorded' : `${value} ${unit}`}</dd>
    </div>
  );
}
