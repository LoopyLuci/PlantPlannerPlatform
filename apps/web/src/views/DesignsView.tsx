import { useState, type FormEvent } from 'react';
import type { DesignSummary } from '../api';

export interface DesignsViewProps {
  designs: DesignSummary[];
  currentId: string | null;
  onOpen: (designId: string) => void;
  onCreate: (name: string, template: 'blank' | 'starter_pollinator') => Promise<void>;
  onArchive: () => void;
}

/** The designs window: switch between designs, start a new one, or archive the current one. */
export function DesignsView({ designs, currentId, onOpen, onCreate, onArchive }: DesignsViewProps) {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<'blank' | 'starter_pollinator'>('blank');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await onCreate(trimmed, template);
      setName('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cards two-col">
      <section className="card" aria-labelledby="designs-heading">
        <h2 id="designs-heading">Your designs</h2>
        {designs.length === 0 && <p className="muted small">No designs yet.</p>}
        <ul className="design-list">
          {designs.map((d) => (
            <li key={d.designId} className={d.designId === currentId ? 'is-current' : undefined}>
              <div>
                <span className="common">{d.name}</span>
                <span className="muted small"> · {d.placementCount} plant{d.placementCount === 1 ? '' : 's'} · revision {d.seq}</span>
              </div>
              {d.designId === currentId ? (
                <span className="chip chip-pass">Open</span>
              ) : (
                <button type="button" className="ghost" onClick={() => onOpen(d.designId)}>Open</button>
              )}
            </li>
          ))}
        </ul>
        {currentId && (
          <div className="actions">
            <button type="button" className="danger-outline" onClick={onArchive}>Archive the open design</button>
          </div>
        )}
        <p className="muted small">Archiving keeps the full history. Nothing is deleted.</p>
      </section>

      <section className="card" aria-labelledby="new-heading">
        <h2 id="new-heading">New design</h2>
        <form className="stack" onSubmit={submit}>
          <label className="field">
            <span>Name</span>
            <input value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Start from</span>
            <select value={template} onChange={(e) => setTemplate(e.target.value as 'blank' | 'starter_pollinator')}>
              <option value="blank">Empty site</option>
              <option value="starter_pollinator">Starter pollinator bed</option>
            </select>
          </label>
          <button type="submit" className="primary" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create design'}
          </button>
        </form>
      </section>
    </div>
  );
}
