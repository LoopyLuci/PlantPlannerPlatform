import { useCallback, useEffect, useState } from 'react';
import { call } from '../api';

interface HealthData {
  status: 'healthy' | 'degraded' | 'corrupt';
  checkedDesigns: number;
  designs: {
    designId: string;
    headSeq: number;
    chainOk: boolean;
    chainProblem?: string;
    tornTail: boolean;
    snapshot: { status: string; reason?: string };
  }[];
  knowledge: { graphVersion: string; graphStatus: string; species: number; edges: number };
}

export interface HealthViewProps {
  version: string;
}

const STATUS_NOTE: Record<HealthData['status'], string> = {
  healthy: 'Every stored design verifies. Nothing needs action.',
  degraded: 'A recoverable issue was found, such as an incomplete last write or a stale snapshot. Data is intact.',
  corrupt: 'A design log fails verification. Writes to that design are refused until it is restored from a copy.',
};

/** The health window: integrity of stored data, the knowledge graph, and the versions in use. */
export function HealthView({ version }: HealthViewProps) {
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    const envelope = await call<HealthData>('platform.get_health', {});
    if (envelope.ok && envelope.data) {
      setData(envelope.data);
      setError(null);
    } else {
      setError(envelope.error?.message ?? 'The health check failed.');
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  if (error) return <p className="banner-inline" role="alert">{error}</p>;
  if (!data) return <p className="muted">Checking…</p>;

  return (
    <div className="stack">
      <section className="card">
        <div className="title-row">
          <h2>Overall</h2>
          <span className={`chip chip-${data.status === 'healthy' ? 'pass' : 'warn'}`}>{data.status}</span>
        </div>
        <p>{STATUS_NOTE[data.status]}</p>
        <p className="muted small">{data.checkedDesigns} design{data.checkedDesigns === 1 ? '' : 's'} checked · {version}</p>
        <div className="actions">
          <button type="button" className="ghost" onClick={() => void check()} disabled={checking}>
            {checking ? 'Checking…' : 'Check again'}
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Designs</h2>
        {data.designs.length === 0 && <p className="muted small">No designs to check.</p>}
        <table className="grid-table">
          <thead>
            <tr><th scope="col">Design</th><th scope="col">Revision</th><th scope="col">Log</th><th scope="col">Snapshot</th></tr>
          </thead>
          <tbody>
            {data.designs.map((d) => (
              <tr key={d.designId}>
                <td className="mono">{d.designId}</td>
                <td>{d.headSeq}</td>
                <td>{d.chainOk ? (d.tornTail ? 'verified, incomplete last write' : 'verified') : `failed: ${d.chainProblem ?? 'unknown'}`}</td>
                <td>{d.snapshot.status === 'none' ? 'none' : d.snapshot.status === 'verified' ? 'verified' : `mismatch: ${d.snapshot.reason ?? ''}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Knowledge graph</h2>
        <p>
          Version <span className="mono">{data.knowledge.graphVersion}</span> · status <strong>{data.knowledge.graphStatus}</strong> · {data.knowledge.species} species · {data.knowledge.edges} companion relationships.
        </p>
        <p className="muted small">
          The seed values are typical reference ranges that no one has verified against a cited handbook yet, so every trait is graded C. Treat them as placeholders.
        </p>
      </section>
    </div>
  );
}
