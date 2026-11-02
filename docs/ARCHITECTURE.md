# ARCHITECTURE.md: the system as built

This file describes what exists in the repository. When it and the code disagree, fix
this file and record the divergence in an ADR.

## Shape

One capability registry defines every operation. One dispatch function runs them.
Three adapters translate transports into dispatch calls. A pure core computes
verdicts. A store persists events and nothing else.

```
  web editor (React)   CLI (generated flags)   MCP agents (stdio, read-only)
          |                    |                         |
          +---------- HTTP API /api/v1 (OpenAPI) --------+
                               |
                 dispatch()  (validation, idempotency, errors, version triple)
                               |
          handlers (one per capability)  <--  registry (definitions only)
                |                    |
        pure core (rules, KG)    store (hash-chained NDJSON, snapshots, archive)
                                       |
                        data/designs/*.ndjson   data/knowledge-graph/*.csv
```

## Packages

| Package | Depends on | Contents |
|---|---|---|
| `@ppp/registry` | nothing | Capability definitions, field specs, validation, JSON Schema, MCP helpers, registry checks |
| `@ppp/core` | nothing (pure; runs in the browser) | Version constants, geometry, knowledge-graph loader, design reducer, rules engine, canonical JSON |
| `@ppp/store` | core, Node | Event log and hash chain, `DesignStore`, snapshots, health, archive export, knowledge-file reader |
| `@ppp/services` | registry, core, store | `createContext`, `dispatch`, error mapping, `HANDLERS`, starter template |
| `@ppp/server` | services | `createAppServer`, OpenAPI generator, static file serving |
| `@ppp/cli` | services, registry | `runCli` (argument parsing, output, exit codes) |
| `@ppp/mcp` | services, registry | `createMcpHandler` (JSON-RPC, transport-free) and the stdio entry point |
| `@ppp/web` | core (types only), React, three.js | Editor: `App` (shell and state), `windows.ts` (navigation), `views/*` (nine windows), `Canvas` (SVG plan), `Scene3D.ts` (three.js, the only file that imports it), `scene.ts` and `model.ts` (pure presentation logic), `public/sw.js` (offline shell) |

## Request flow (a write)

1. An adapter collects input and an Idempotency-Key. The web client makes one per user action; the CLI makes one if you do not; HTTP requires the header.
2. `dispatch` validates input against the registry shape (unknown fields rejected, defaults applied).
3. The handler resolves ids (strict patterns), checks that the design and species exist, and checks that a placement is inside the site.
4. If the key was already applied to this design, the original event is returned with `replayed: true`. Nothing is written.
5. If `base_seq` is given and does not match the head, the write is refused with `conflict` (409).
6. The store validates the transition by applying the event to the current state. Only then is one line appended and fsynced.
7. The response is an envelope: `ok`, `data`, `version` (the triple), `provenance`, `idempotency`.

## Reads

Reads load the design projection from the newest valid snapshot plus the events after it, or by full replay when no valid snapshot exists. Reads never write. A corrupt log makes the read fail with `integrity_error`. It does not return a guess.

The projection is cached per design in the store process. A cached projection is used only while the log file's size and modification time are unchanged, so a write from any process invalidates it. The cache is derived data (I6): dropping it costs one replay. Health and verification always read the whole log.

## Editor

The web app is a shell with a side navigation. Each window is a view selected by URL hash (`#/plan`, `#/plants`, ...). The shell owns:

- the current design and its evaluation (both reloaded after every write),
- a write queue: writes run one at a time and read the latest sequence number when they start,
- optimistic positions during drag and keyboard nudges, cleared when the server confirms,
- undo toasts: each undo is a new write, never a rollback of history.

The plan canvas draws from the same verdicts the details window shows, so the picture and the explanation cannot disagree.

Nine windows: Plan (SVG), 3D view (three.js; its module is prefetched when idle and held in state, ADR-0013), Side elevation (SVG), Site, Plant library, Placed plants, Plant details (with the feedback form), Designs, Data health.

- **3D view.** Each plant is an instanced crown and stem. A drag previews the move and then saves it through `design.update_placement`, the same write as the plan. The 3D view restores the saved positions when the drag ends. Without WebGL it shows the side elevation instead. See ADR-0009.
- **Offline shell.** In production builds, a service worker keeps the app's own files. It is network-first, and it serves the last copy when the server is down. It never caches `/api/`.

## Durability (what exists)

- Each design is one append-only NDJSON file. Each event carries `prev_hash` and `hash` (see DATA_FORMATS.md).
- Writes: one line, `fsync`, then return. A torn final line from an interrupted write is quarantined on the next write, never silently dropped.
- Snapshots are written to a temporary file and renamed. Each snapshot records the offset and head hash it was taken at, and its state hash. A snapshot is used only if it verifies.
- `platform.get_health` and `design.verify` report chain status, torn tails, and snapshot mismatches. They never repair.

Feedback on verdicts is a second chained log (`data/feedback/`), with the same write rules. It never changes a design. See ADR-0007.

Crash safety has a test. `npm run kill-test` kills a writer with SIGKILL at random points during writes (1,000 kills in the run recorded in HANDOVER). After each kill it checks that every acknowledged write is in the log, at most one unacknowledged write is there, the chain verifies, and the state replays. A shorter version runs in `npm test`.

Not built yet: the continuous watchdog, outbox and projections beyond the per-design cache, the chaos drills (see PLAN, Phase 4).

## What is intentionally not here

- No learned model. `modelVersion` is `none`, and nothing depends on a model (I2).
- No external database. Storage is plain files (ADR-0002).
- No network calls from the core. Site data sources (soil, weather) will sit behind a cache-first proxy when added.
- No telemetry stream. Telemetry, when added, is outside the event log (I8).
