import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  type CandidateView,
  type DesignSummary,
  type DesignView,
  type Envelope,
  type EvaluationView,
  type PlacementView,
  type SpeciesSummary,
  type SuggestionView,
  call,
  newKey,
} from './api';
import { type LayerState } from './Canvas';
import { Checklist } from './Checklist';
import { Nav } from './Nav';
import { Toasts, type Toast } from './Toasts';
import { type Point, clampToSite, nearestFreeSpot, snap } from './model';
import { type ViewId, viewDef, viewFromHash } from './windows';
import { DesignsView } from './views/DesignsView';
import { sceneShapes } from './scene';
import { DetailsView, type FeedbackInput, ROUTE_LABELS } from './views/DetailsView';
import { ElevationView } from './views/ElevationView';

/** The 3D window loads three.js, so it is fetched only when the window is opened. */
const SceneView = lazy(() => import('./views/SceneView').then((module) => ({ default: module.SceneView })));
import { HealthView } from './views/HealthView';
import { PlacementsView } from './views/PlacementsView';
import { PlanView } from './views/PlanView';
import { PlantsView } from './views/PlantsView';
import { SiteView } from './views/SiteView';

/**
 * The application shell. Each window is a separate view chosen from the side
 * navigation. Writes are optimistic and run one at a time through a queue, and
 * each write reads the latest sequence number, so undo never sends a stale base_seq.
 */

const DEFAULT_LAYERS: LayerState = {
  footprints: true,
  envelopes: true,
  arcs: true,
  labels: true,
  rings: true,
  grid: true,
};

const LAST_DESIGN_KEY = 'ppp.lastDesignId';
const FIRST_RUN_KEY = 'ppp.firstRunKey';
const UNDO_WINDOW_MS = 8000;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked. The app still works; it just forgets the last design.
  }
}

interface WriteOptions {
  label: string;
  announce?: string;
  undo?: () => Promise<void>;
}

interface VersionEnvelope {
  version?: { graphVersion: string; modelVersion: string; ruleConfigVersion: string };
}

export function App() {
  const [view, setView] = useState<ViewId>(() => viewFromHash(window.location.hash));
  const [designs, setDesigns] = useState<DesignSummary[]>([]);
  const [designId, setDesignId] = useState<string | null>(null);
  const [design, setDesign] = useState<DesignView | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationView | null>(null);
  const [species, setSpecies] = useState<SpeciesSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Point>>({});
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [health, setHealth] = useState<string>('checking');
  const [version, setVersion] = useState<string>('');
  const [suggestions, setSuggestions] = useState<SuggestionView | null>(null);

  // Refs hold the latest design for async work, so closures never act on a stale copy.
  const designRef = useRef<DesignView | null>(null);
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const nudge = useRef<{ id: string; origin: Point; timer: number | null } | null>(null);

  const speciesByUrn = useMemo(() => new Map(species.map((s) => [s.urn, s])), [species]);
  const selected = design?.placements.find((p) => p.id === selectedId) ?? null;
  const evaluationSummary = evaluation?.summary;
  const attention = useMemo(
    () => (evaluation?.verdicts ?? []).filter((v) => v.status === 'fail' || v.status === 'warn'),
    [evaluation],
  );

  const navigate = useCallback((next: ViewId) => {
    setView(next);
    if (window.location.hash !== `#/${next}`) window.location.hash = `#/${next}`;
  }, []);

  useEffect(() => {
    const onHash = () => setView(viewFromHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const noteVersion = useCallback((envelope: VersionEnvelope) => {
    if (envelope.version) {
      const v = envelope.version;
      setVersion(`model ${v.modelVersion} · graph ${v.graphVersion} · rules ${v.ruleConfigVersion}`);
    }
  }, []);

  const fail = useCallback((message: string) => setBanner(message), []);

  const dismiss = useCallback((id: string) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const pushToast = useCallback(
    (message: string, undo?: () => Promise<void>) => {
      const id = newKey('toast');
      setToasts((list) => [...list.slice(-2), { id, message, undo }]);
      window.setTimeout(() => dismiss(id), UNDO_WINDOW_MS);
    },
    [dismiss],
  );

  const loadDesign = useCallback(
    async (id: string): Promise<DesignView> => {
      const [detail, verdicts] = await Promise.all([
        call<DesignView>('design.get', { design_id: id }),
        call<EvaluationView>('design.evaluate', { design_id: id }),
      ]);
      if (!detail.ok || !detail.data) throw new Error(detail.error?.message ?? 'Could not load the design.');
      designRef.current = detail.data;
      setDesign(detail.data);
      setOverrides({});
      if (verdicts.ok && verdicts.data) setEvaluation(verdicts.data);
      noteVersion(detail);
      return detail.data;
    },
    [noteVersion],
  );

  const refreshDesigns = useCallback(async (): Promise<DesignSummary[]> => {
    const listed = await call<{ designs: DesignSummary[] }>('design.list', {});
    if (!listed.ok || !listed.data) throw new Error(listed.error?.message ?? 'Could not list designs.');
    setDesigns(listed.data.designs);
    return listed.data.designs;
  }, []);

  const createDesign = useCallback(async (name: string, template: 'blank' | 'starter_pollinator', key = newKey('design')) => {
    const created = await call<{ designId: string }>('design.create', { name, template }, { idempotencyKey: key });
    if (!created.ok || !created.data) throw new Error(created.error?.message ?? 'Could not create the design.');
    return created.data.designId;
  }, []);

  /** Runs one write against the latest design. Called only through the queue. */
  const performWrite = useCallback(
    async (capability: string, input: Record<string, unknown>, options: WriteOptions): Promise<boolean> => {
      const current = designRef.current;
      if (!current) return false;
      try {
        const envelope: Envelope<unknown> = await call(
          capability,
          { design_id: current.designId, base_seq: current.seq, ...input },
          { idempotencyKey: newKey('write') },
        );
        if (envelope.ok) {
          noteVersion(envelope);
          if (options.announce) setAnnounce(options.announce);
          await loadDesign(current.designId);
          await refreshDesigns();
          if (options.undo) pushToast(options.label, options.undo);
          return true;
        }
        setOverrides({});
        if (envelope.error?.code === 'conflict') {
          await loadDesign(current.designId);
          pushToast('The design changed in another window, so it was reloaded. Please try again.');
        } else {
          fail(envelope.error?.message ?? 'The change could not be saved.');
        }
        return false;
      } catch (error) {
        setOverrides({});
        fail(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [fail, loadDesign, noteVersion, pushToast, refreshDesigns],
  );

  /** Writes run one at a time, so each one reads the sequence left by the previous one. */
  const write = useCallback(
    (capability: string, input: Record<string, unknown>, options: WriteOptions): Promise<boolean> => {
      const run = writeQueue.current.then(() => performWrite(capability, input, options));
      writeQueue.current = run.catch(() => undefined);
      return run;
    },
    [performWrite],
  );

  // Start-up: health, species, designs. On first run, create the Starter Garden.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const healthEnvelope = await call<{ status: string }>('platform.get_health', {});
        if (!cancelled) setHealth(healthEnvelope.ok && healthEnvelope.data ? healthEnvelope.data.status : 'unknown');
        const speciesEnvelope = await call<{ items: SpeciesSummary[] }>('plants.search', { limit: 100 });
        if (!cancelled && speciesEnvelope.ok && speciesEnvelope.data) setSpecies(speciesEnvelope.data.items);
        const list = await refreshDesigns();
        if (list.length === 0) {
          let key = readStorage(FIRST_RUN_KEY);
          if (!key) {
            key = newKey('first-run');
            writeStorage(FIRST_RUN_KEY, key);
          }
          const id = await createDesign('Starter Garden', 'starter_pollinator', key);
          await refreshDesigns();
          if (!cancelled) setDesignId(id);
        } else if (!cancelled) {
          const remembered = readStorage(LAST_DESIGN_KEY);
          const open = list.find((d) => d.designId === remembered) ?? list[0];
          setDesignId(open.designId);
        }
      } catch (error) {
        if (!cancelled) fail(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createDesign, fail, refreshDesigns]);

  useEffect(() => {
    if (!designId) return;
    writeStorage(LAST_DESIGN_KEY, designId);
    setSelectedId(null);
    setSuggestions(null);
    loadDesign(designId).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
  }, [designId, fail, loadDesign]);

  const placementStatus = (id: string) => evaluation?.placements[id]?.status ?? 'unknown';

  const movePlacement = useCallback(
    async (placement: PlacementView, to: Point) => {
      const from = { x: placement.x, y: placement.y };
      if (Math.abs(from.x - to.x) < 0.001 && Math.abs(from.y - to.y) < 0.001) {
        setOverrides({});
        return;
      }
      const label = speciesByUrn.get(placement.speciesUrn)?.commonName ?? 'plant';
      setOverrides((prev) => ({ ...prev, [placement.id]: to }));
      await write('design.update_placement', { placement_id: placement.id, x: to.x, y: to.y }, {
        label: `Moved ${label} to ${to.x.toFixed(2)} m, ${to.y.toFixed(2)} m`,
        announce: `Moved ${label} to ${to.x.toFixed(2)} metres east, ${to.y.toFixed(2)} metres south.`,
        undo: () =>
          write('design.update_placement', { placement_id: placement.id, x: from.x, y: from.y }, { label: `Undid the move of ${label}` }).then(() => undefined),
      });
    },
    [speciesByUrn, write],
  );

  const addSpecies = useCallback(
    async (urn: string, at?: Point) => {
      const current = designRef.current;
      if (!current) return;
      const common = speciesByUrn.get(urn)?.commonName ?? 'plant';
      const footprint = speciesByUrn.get(urn)?.traits.plantingSpacingM ?? 0.5;
      const start = at ?? { x: current.site.widthM / 2, y: current.site.depthM / 2 };
      const spot = nearestFreeSpot(current.site, current.placements, footprint, start) ?? clampToSite(start, current.site);
      const point = { x: snap(spot.x), y: snap(spot.y) };
      const added = await write('design.add_placement', { species_urn: urn, x: point.x, y: point.y }, {
        label: `Added ${common}`,
        announce: `Added ${common} at ${point.x.toFixed(2)}, ${point.y.toFixed(2)} metres.`,
      });
      if (!added) return;
      const placed = designRef.current?.placements.find((p) => p.speciesUrn === urn && p.x === point.x && p.y === point.y);
      if (placed) {
        setSelectedId(placed.id);
        pushToast(`Added ${common}`, () =>
          write('design.remove_placement', { placement_id: placed.id }, { label: `Removed ${common}` }).then(() => undefined),
        );
      }
    },
    [pushToast, speciesByUrn, write],
  );

  const removePlacement = useCallback(
    async (placement: PlacementView) => {
      const common = speciesByUrn.get(placement.speciesUrn)?.commonName ?? 'plant';
      const removed = await write('design.remove_placement', { placement_id: placement.id }, {
        label: `Removed ${common}`,
        announce: `Removed ${common}.`,
        undo: () =>
          write(
            'design.add_placement',
            {
              species_urn: placement.speciesUrn,
              x: placement.x,
              y: placement.y,
              footprint_m: placement.footprintM,
              pinned: placement.pinned,
              placement_id: placement.id,
            },
            { label: `Restored ${common}` },
          ).then(() => undefined),
      });
      if (removed) setSelectedId(null);
    },
    [speciesByUrn, write],
  );

  const updatePlacement = useCallback(
    async (placement: PlacementView, changes: Partial<Pick<PlacementView, 'speciesUrn' | 'footprintM' | 'pinned' | 'x' | 'y'>>) => {
      const previous: Partial<PlacementView> = {};
      for (const key of Object.keys(changes) as (keyof typeof changes)[]) {
        (previous as Record<string, unknown>)[key] = placement[key];
      }
      const label = speciesByUrn.get(placement.speciesUrn)?.commonName ?? 'plant';
      await write(
        'design.update_placement',
        {
          placement_id: placement.id,
          species_urn: changes.speciesUrn,
          footprint_m: changes.footprintM,
          pinned: changes.pinned,
          x: changes.x,
          y: changes.y,
        },
        {
          label: `Changed ${label}`,
          announce: `Updated ${label}.`,
          undo: () =>
            write(
              'design.update_placement',
              {
                placement_id: placement.id,
                species_urn: previous.speciesUrn,
                footprint_m: previous.footprintM,
                pinned: previous.pinned,
                x: previous.x,
                y: previous.y,
              },
              { label: `Undid change to ${label}` },
            ).then(() => undefined),
        },
      );
    },
    [speciesByUrn, write],
  );

  const updateSite = useCallback(
    async (changes: Record<string, number | undefined>) => {
      const current = designRef.current;
      if (!current) return;
      const previous: Record<string, number | undefined> = {
        hardiness_zone: current.site.hardinessZone,
        sun_hours: current.site.sunHours,
        soil_ph: current.site.soilPh,
      };
      await write('design.update_site', changes, {
        label: 'Updated site conditions',
        announce: 'Site conditions updated.',
        undo: () => write('design.update_site', previous, { label: 'Undid site change' }).then(() => undefined),
      });
    },
    [write],
  );

  const archiveDesign = useCallback(async () => {
    const current = designRef.current;
    if (!current) return;
    if (!window.confirm(`Archive "${current.name}"? It stays in the history and can be shown again with "show archived".`)) return;
    const envelope = await call('design.archive', { design_id: current.designId, confirm: true, base_seq: current.seq }, {
      idempotencyKey: newKey('archive'),
    });
    if (!envelope.ok) {
      fail(envelope.error?.message ?? 'The design could not be archived.');
      return;
    }
    const remaining = (await refreshDesigns()).filter((d) => d.designId !== current.designId);
    if (remaining.length > 0) {
      setDesignId(remaining[0].designId);
    } else {
      const id = await createDesign('Starter Garden', 'starter_pollinator');
      await refreshDesigns();
      setDesignId(id);
    }
  }, [createDesign, fail, refreshDesigns]);

  /** Feedback never changes the design, so it needs no sequence number and does not queue behind writes. */
  const recordFeedback = useCallback(
    async (placement: PlacementView, input: FeedbackInput): Promise<string> => {
      const current = designRef.current;
      if (!current) return 'The design is not loaded yet.';
      try {
        const envelope = await call<{ route: { route: string; reason: string }; replayed: boolean }>(
          'feedback.record',
          {
            design_id: current.designId,
            placement_id: placement.id,
            rule: input.rule,
            reason_tag: input.reasonTag,
            note: input.note,
          },
          { idempotencyKey: newKey('feedback') },
        );
        if (!envelope.ok || !envelope.data) return envelope.error?.message ?? 'The feedback could not be saved.';
        const { route } = envelope.data;
        return `Recorded. It goes to ${ROUTE_LABELS[route.route] ?? route.route}. ${route.reason}`;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    [],
  );

  const suggestFor = useCallback(
    async (placement: PlacementView) => {
      const current = designRef.current;
      if (!current) return;
      const envelope = await call<SuggestionView>('placement.suggest', {
        design_id: current.designId,
        x: placement.x,
        y: placement.y,
        limit: 5,
      });
      if (envelope.ok && envelope.data) setSuggestions(envelope.data);
      else fail(envelope.error?.message ?? 'Suggestions are unavailable right now.');
    },
    [fail],
  );

  const swapTo = useCallback(
    async (placement: PlacementView, candidate: CandidateView) => {
      setSuggestions(null);
      await updatePlacement(placement, { speciesUrn: candidate.speciesUrn, footprintM: candidate.footprintM });
    },
    [updatePlacement],
  );

  const selectPlant = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id === null) setSuggestions(null);
  }, []);

  // Keyboard, on the plan and details windows: arrows nudge the selected plant (one undoable move),
  // Delete removes it, Ctrl+Z undoes the latest change, Escape clears the selection.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target !== null && target.matches('input, select, textarea, [contenteditable="true"]')) return;
      if (event.key === 'Escape') {
        selectPlant(null);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        const last = toasts.filter((t) => t.undo).at(-1);
        if (last?.undo) {
          event.preventDefault();
          dismiss(last.id);
          void last.undo();
        }
        return;
      }
      if (view !== 'plan' && view !== 'details') return;
      if (!selected || !design) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        void removePlacement(selected);
        return;
      }
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const direction = arrows[event.key];
      if (!direction) return;
      event.preventDefault();
      const step = event.shiftKey ? 0.01 : event.ctrlKey || event.metaKey ? 1 : 0.1;
      const pending = nudge.current?.id === selected.id ? nudge.current : null;
      const origin = pending?.origin ?? { x: selected.x, y: selected.y };
      const base = overrides[selected.id] ?? { x: selected.x, y: selected.y };
      const next = clampToSite({ x: base.x + direction[0] * step, y: base.y + direction[1] * step }, design.site);
      const point = { x: snap(next.x, 0.01), y: snap(next.y, 0.01) };
      setOverrides((prev) => ({ ...prev, [selected.id]: point }));
      if (pending?.timer) window.clearTimeout(pending.timer);
      const timer = window.setTimeout(() => {
        const finished = nudge.current;
        nudge.current = null;
        if (finished) void movePlacement({ ...selected, x: finished.origin.x, y: finished.origin.y }, point);
      }, 450);
      nudge.current = { id: selected.id, origin, timer };
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [design, selected, overrides, toasts, view, dismiss, movePlacement, removePlacement, selectPlant]);

  useEffect(() => {
    designRef.current = design;
  }, [design]);

  const current = viewDef(view);
  const counts = {
    plan: design?.placements.length ?? 0,
    placements: design?.placements.length ?? 0,
    site: attention.length,
    designs: designs.length,
  };

  let content: ReactNode;
  switch (view) {
    case 'plan':
      content = (
        <PlanView
          design={design}
          evaluation={evaluation}
          speciesByUrn={speciesByUrn}
          selectedId={selectedId}
          overrides={overrides}
          layers={layers}
          suggestionPoint={suggestions && selected ? { x: selected.x, y: selected.y } : null}
          onLayers={setLayers}
          onSelect={selectPlant}
          onOpenDetails={() => navigate('details')}
          onPreview={(id, point) => setOverrides((prev) => ({ ...prev, [id]: point }))}
          onCommitMove={(placement, point) => void movePlacement(placement, point)}
          onDrop={(urn, point) => void addSpecies(urn, point)}
        />
      );
      break;
    case 'scene':
      content = (
        <Suspense fallback={<p className="muted">Loading the 3D view…</p>}>
          <SceneView
            design={design}
            evaluation={evaluation}
            speciesByUrn={speciesByUrn}
            selectedId={selectedId}
            onSelect={selectPlant}
            onMove={(id, point) => {
              const placement = design?.placements.find((p) => p.id === id);
              if (placement) void movePlacement(placement, point);
            }}
          />
        </Suspense>
      );
      break;
    case 'elevation':
      content = (
        <ElevationView
          design={design}
          shapes={design ? sceneShapes(design, evaluation, speciesByUrn) : []}
          selectedId={selectedId}
          onSelect={selectPlant}
        />
      );
      break;
    case 'site':
      content = (
        <SiteView
          design={design}
          evaluation={evaluation}
          attention={attention}
          onUpdateSite={(changes) => void updateSite(changes)}
          onOpenPlant={(id) => {
            selectPlant(id);
            navigate('details');
          }}
        />
      );
      break;
    case 'plants':
      content = <PlantsView species={species} onAdd={(urn) => void addSpecies(urn).then(() => navigate('plan'))} />;
      break;
    case 'placements':
      content = (
        <PlacementsView
          design={design}
          speciesByUrn={speciesByUrn}
          statusOf={placementStatus}
          selectedId={selectedId}
          onOpen={(id) => {
            selectPlant(id);
            navigate('details');
          }}
        />
      );
      break;
    case 'details':
      content = (
        <DetailsView
          design={design}
          selected={selected}
          speciesByUrn={speciesByUrn}
          species={species}
          verdicts={selected ? evaluation?.placements[selected.id]?.verdicts ?? [] : []}
          companionScore={selected ? evaluation?.placements[selected.id]?.companionScore ?? 50 : 50}
          formula={evaluation?.companionScoreFormula ?? ''}
          suggestions={suggestions}
          onOpenPlan={() => navigate('plan')}
          onOpenPlacements={() => navigate('placements')}
          onUpdate={(changes) => selected && void updatePlacement(selected, changes)}
          onRemove={() => selected && void removePlacement(selected)}
          onFeedback={(input) => (selected ? recordFeedback(selected, input) : Promise.resolve('Select a plant first.'))}
          onSuggest={() => selected && void suggestFor(selected)}
          onSwap={(candidate) => selected && void swapTo(selected, candidate)}
          onCloseSuggestions={() => setSuggestions(null)}
        />
      );
      break;
    case 'designs':
      content = (
        <DesignsView
          designs={designs}
          currentId={designId}
          onOpen={(id) => {
            setDesignId(id);
            navigate('plan');
          }}
          onCreate={async (name, template) => {
            const id = await createDesign(name, template);
            await refreshDesigns();
            setDesignId(id);
            navigate('plan');
          }}
          onArchive={() => void archiveDesign()}
        />
      );
      break;
    case 'health':
      content = <HealthView version={version} />;
      break;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>Plant Planner Platform</span>
        </div>
        <div className="status-chips" role="status" aria-label="Data status">
          <span className={`chip chip-${health === 'healthy' ? 'pass' : health === 'checking' ? 'unknown' : 'warn'}`}>
            Local data: {health}
          </span>
          <span className="chip chip-muted" title="Versions stamped on every result">{version || 'loading versions'}</span>
        </div>
      </header>

      {banner && (
        <div className="banner" role="alert">
          <span>{banner}</span>
          <button type="button" className="ghost" onClick={() => setBanner(null)}>Dismiss</button>
        </div>
      )}

      <div className="shell">
        <Nav current={view} counts={counts} onNavigate={navigate} />
        <main className="window" aria-labelledby="window-title">
          <header className="window-head">
            <p className="eyebrow">{design?.name ?? 'Loading'}{evaluationSummary ? ` · ${evaluationSummary.fail + evaluationSummary.warn} to check` : ''}</p>
            <h1 id="window-title">{current.label}</h1>
            <p className="muted small">{current.description}</p>
          </header>
          <div className="window-body">{content}</div>
        </main>
      </div>

      <Toasts toasts={toasts} onDismiss={dismiss} onUndo={(toast) => { dismiss(toast.id); void toast.undo?.(); }} />
      {view === 'plan' && <Checklist hasSelection={selected !== null} placementCount={design?.placements.length ?? 0} />}
      <div className="sr-only" role="status" aria-live="polite">{announce}</div>
    </div>
  );
}
