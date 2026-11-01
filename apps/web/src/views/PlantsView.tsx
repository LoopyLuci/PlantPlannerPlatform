import { useEffect, useMemo, useState } from 'react';
import { call, type SpeciesSummary } from '../api';
import { GUILD_COLORS } from '../model';

/** Everything the knowledge graph says about one species, with its sources and grades. */
interface Profile {
  species: SpeciesSummary;
  traits: { name: string; value: number; sourceId: string; grade: string }[];
  unknownTraits: string[];
  companions: {
    partnerName: string;
    mechanism: string;
    direction: string;
    sourceId: string;
    grade: string;
    note: string;
  }[];
  sources: { sourceId: string; title: string; citationStatus: string; grade: string }[];
  graphStatus: string;
}

export interface PlantsViewProps {
  species: SpeciesSummary[];
  onAdd: (urn: string) => void;
}

/** The plant library window: search and filter the graph, then read a profile. */
export function PlantsView({ species, onAdd }: PlantsViewProps) {
  const [query, setQuery] = useState('');
  const [layer, setLayer] = useState('');
  const [family, setFamily] = useState('');
  const [selectedUrn, setSelectedUrn] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const families = useMemo(() => [...new Set(species.map((s) => s.family))].sort(), [species]);
  const matches = useMemo(() => {
    const text = query.trim().toLowerCase();
    return species
      .filter((s) => !layer || s.guildLayer === layer)
      .filter((s) => !family || s.family === family)
      .filter((s) => !text || [s.commonName, s.scientificName, s.family].some((v) => v.toLowerCase().includes(text)))
      .sort((a, b) => a.commonName.localeCompare(b.commonName));
  }, [species, query, layer, family]);

  useEffect(() => {
    if (!selectedUrn) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    call<Profile>('plants.get_profile', { urn: selectedUrn }).then((envelope) => {
      if (cancelled) return;
      if (envelope.ok && envelope.data) {
        setProfile(envelope.data);
        setError(null);
      } else {
        setError(envelope.error?.message ?? 'Could not load this plant.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedUrn]);

  return (
    <div className="split">
      <section className="split-list" aria-label="Species">
        <div className="filters">
          <label className="grow">
            <span className="sr-only">Search species</span>
            <input type="search" placeholder="Name or family" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label>
            <span className="sr-only">Guild layer</span>
            <select value={layer} onChange={(e) => setLayer(e.target.value)}>
              <option value="">All layers</option>
              <option value="canopy">Canopy</option>
              <option value="understory">Understory</option>
              <option value="groundcover">Groundcover</option>
              <option value="root">Root</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Family</span>
            <select value={family} onChange={(e) => setFamily(e.target.value)}>
              <option value="">All families</option>
              {families.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted small">{matches.length} of {species.length} species</p>
        <ul className="species-list">
          {matches.map((sp) => (
            <li key={sp.urn}>
              <button
                type="button"
                className={`species-row${sp.urn === selectedUrn ? ' is-active' : ''}`}
                aria-pressed={sp.urn === selectedUrn}
                onClick={() => setSelectedUrn(sp.urn)}
              >
                <span className="swatch-dot" style={{ background: GUILD_COLORS[sp.guildLayer] }} aria-hidden="true" />
                <span className="species-names">
                  <span className="common">{sp.commonName}</span>
                  <span className="scientific">{sp.scientificName} · {sp.family}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="split-detail" aria-label="Profile">
        {!selectedUrn && <p className="muted">Choose a plant to read its traits, companions and sources.</p>}
        {error && <p className="banner-inline" role="alert">{error}</p>}
        {profile && (
          <article className="profile">
            <header className="profile-head">
              <div>
                <h2 className="species-title">{profile.species.commonName}</h2>
                <p className="scientific">{profile.species.scientificName} · {profile.species.family} · {profile.species.growthForm}</p>
              </div>
              <button type="button" className="primary" onClick={() => onAdd(profile.species.urn)}>Add to plan</button>
            </header>
            <p className="muted small">Graph {profile.graphStatus}. Each trait shows its source and evidence grade. Missing traits are shown as unknown, never guessed.</p>

            <h3>Traits</h3>
            <table className="grid-table">
              <thead>
                <tr><th scope="col">Trait</th><th scope="col">Value</th><th scope="col">Source</th><th scope="col">Grade</th></tr>
              </thead>
              <tbody>
                {profile.traits.map((t) => (
                  <tr key={t.name}>
                    <td>{t.name.replace(/_/g, ' ')}</td>
                    <td>{t.value}</td>
                    <td className="mono">{t.sourceId}</td>
                    <td>{t.grade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {profile.unknownTraits.length > 0 && (
              <p className="small">Not recorded: {profile.unknownTraits.map((t) => t.replace(/_/g, ' ')).join(', ')}.</p>
            )}

            <h3>Companion relationships</h3>
            {profile.companions.length === 0 && <p className="small muted">None recorded.</p>}
            <ul className="plain-list">
              {profile.companions.map((c, index) => (
                <li key={index}>
                  <strong>{c.partnerName}</strong>: {c.mechanism.replace(/_/g, ' ')} ({c.direction}, grade {c.grade}, <span className="mono">{c.sourceId}</span>)
                  {c.note && <span className="muted small"> {c.note}</span>}
                </li>
              ))}
            </ul>

            <h3>Sources</h3>
            <ul className="plain-list">
              {profile.sources.map((s) => (
                <li key={s.sourceId}>
                  <span className="mono">{s.sourceId}</span> {s.title} <span className="muted small">({s.citationStatus}; grade {s.grade})</span>
                </li>
              ))}
            </ul>
          </article>
        )}
      </section>
    </div>
  );
}
