# PLAN.md: phased roadmap

This file is stable. Changes need an ADR. [TODO.md](TODO.md) tracks daily work;
[HANDOVER.md](HANDOVER.md) tracks the live state.

Status key: **done** (built and tested), **partial** (some of the gate is met), **not started**.

| Phase | Scope | Exit gate | Status |
|---|---|---|---|
| **0. Spatial core** | Capability registry; event log with hash chain, snapshots, integrity check; curated seed graph with citations; 2D plan with live rules; undo; plain-text archive; HTTP, CLI and MCP adapters | A 50-plant design with accurate footprints and warnings; every warning traceable to a trait and a source; a process kill mid-write leaves no partial state | **partial**. Built and tested: registry, store, rules, adapters, editor, archive, the 1,000-kill test, the 50-plant performance check, offline placement writes (ADR-0011), and end-to-end journeys J1, J3 and J5. Not yet done: a full curated graph (the seed has 12 species). |
| **1. 3D sync** | WebGL perspective view, LOD, side elevation, two-way store sync | 200 plants at 60 fps; 2D edits reach 3D within 100 ms | **partial**. Built: perspective view with drag-to-move through the same write as the plan, side elevation, WebGL fallback. Measured headless at 200 plants: 60 fps while orbiting; a plan edit acknowledged in a median of 12 ms. Not yet measured: the 100 ms plan-to-render gate and frame rate on reference hardware. |
| **2. Site intelligence** | SoilGrids, sun and shadow engine, slope and hydrology, hard filters on pH, sun and slope | Every placement validated against pH, sun and slope; shadow heatmaps per zone | partial. Hardiness, sun, pH and spacing filters exist, using typed site values. Sun is one value per site, not computed from terrain. |
| **3. Rules and solver** | Companion mechanism table at scale, guild solver, variant generation, Design Brief, objectives | An empty-bed guild with cited rationale for every species and rejection | partial. Companion verdicts and single-spot suggestions exist. No solver, variants, or brief yet. |
| **4. Hardening** | Auth and gateway across all interfaces, CRDT co-editing, exports (PDF, BOM), caching, watchdog, chaos drills | Session survives API failure with no loss; two editors converge; all drills pass | not started |
| **5. Data depth** | Larger knowledge graph, regional variants, phenology, correction workflow, GIS and ecoregion context, ecosystem profiles | Graph covers target regions with citations; correction workflow live | not started |
| **6. AI layer (optional, last)** | LLM narration, conversational refinement that calls the solvers, natural-language search | Removing the AI layer changes no correctness | not started |

## Cross-cutting requirements (every phase)

- Every capability is defined once in the registry (I9).
- Every write is idempotent and carries an Idempotency-Key.
- Every result carries the version triple (I4).
- Every stored format is documented in [docs/DATA_FORMATS.md](docs/DATA_FORMATS.md).
- Every invariant has a test that enforces it.
- The plain-text archive regenerates and checksums cleanly (I10).

## Non-goals (permanent)

- Generative images as design artifacts. Renders are projections of the model.
- Closed-source knowledge graph.
- Lock-in to a single model, cloud, or language model provider.
- A learned model deciding a horticultural fact.
