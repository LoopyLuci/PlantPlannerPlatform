# Plant Planner Platform (PPP)

A garden and landscape design tool built on three rules: every horticultural claim
is cited, every verdict is deterministic and explainable, and every result carries
the versions that produced it. Machine learning is optional and comes last.

## Status

Phase 0 (spatial core) is nearly complete, and the first half of Phase 1 (3D view) is built.
The editor, the API, the CLI and the MCP server all run from one capability registry.
Most of the roadmap is not built yet. See [PLAN.md](PLAN.md) for phases and gates, and
[HANDOVER.md](HANDOVER.md) for the exact state.

What works today:

- **Nine windows** in a side navigation: Plan (canvas), 3D view, Side elevation, Site,
  Plant library, Placed plants, Plant details, Designs, Data health.
- **Live rules** on every change: hardiness, sun, soil pH, footprint overlap,
  same-species spacing, mature canopy overlap, and cited companion relationships.
  Thresholds are in a versioned file, `config/rules/rules-1.0.json`.
- **Suggestions for a spot** that filter hard constraints first and explain every rejection.
- **Feedback on any verdict**, recorded in its own hash-chained log and routed to a person.
  Feedback never changes a design, the knowledge graph or a rule.
- **Undo** for each change, with optimistic updates and a stale-write guard.
- **Append-only, hash-chained design history**, snapshots, and an integrity check.
- **A plain-text archive** (`npm run archive`) that can be read without this software.
- **An offline app shell** (a production service worker that keeps the editor's own files).
- **Three adapters over one contract**: HTTP API (with OpenAPI), CLI, and MCP (read-only, 11 tools).

What is not built yet: the sun and shadow engine, the Ivy model and its training
loop, the scanner, the desktop app, the image store, GIS import, ecosystem profiles,
variant generation, CI tooling, authentication, and multi-user sync. These are
listed in [TODO.md](TODO.md) with their phase.

## Quick start

Requires Node 20.11 or newer (developed on Node 24).

```bash
npm install
npm run build          # builds the web app into apps/web/dist
npm start              # serves the app and API at http://127.0.0.1:4010
```

For web development with hot reload, run `npm run dev:web` in a second terminal
(it proxies `/api` to the server on port 4010).

Environment variables (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `PPP_DATA_DIR` | `data/` | Where designs (`designs/`), feedback (`feedback/`) and archives (`archive/`) live |
| `PPP_KNOWLEDGE_DIR` | `data/knowledge-graph/` | The plant knowledge graph |
| `PPP_RULES_FILE` | `config/rules/rules-1.0.json` | The rule thresholds in use |
| `PPP_HOST` | `127.0.0.1` | Server bind address. Keep it on localhost. |
| `PPP_PORT` | `4010` | Server port |
| `PPP_ACTOR` | `local-cli` | Actor name recorded on CLI writes |

## Command line

```bash
npm run cli -- list                         # every capability
npm run cli -- help design.add_placement    # flags for one capability
npm run cli -- plants.search --query sage --table
npm run cli -- design.create --name "Front bed" --template starter_pollinator
npm run cli -- design.evaluate --design-id <id>
npm run archive                             # regenerate data/archive
npm run bench                               # performance gate: a 50-plant design in under 50 ms
npm run kill-test -- --iterations 100       # kill the writer at random points; the full gate is 1000
```

Writes generate an Idempotency-Key if you do not pass one. Keep the key to retry safely.

## MCP server (for agents)

```bash
npm run mcp      # JSON-RPC over stdio
```

Exposes eleven read-only tools: health, plant search and profile, design list/get/history,
evaluate, verify, placement check, placement suggestions, and feedback list. Writes are not
exposed to agents (ADR-0005).

## Tests and checks

```bash
npm test           # 139 tests across registry, core, store, services, adapters and web model
npm run typecheck  # strict TypeScript across every package
npm run check      # typecheck + tests + build
```

## Repository map

```
packages/registry   capability definitions (single source of truth) and validation
packages/core       pure logic: rules engine, knowledge-graph loader, design reducer, feedback router
packages/store      durable storage: hash-chained logs, snapshots, feedback log, archive
packages/services   dispatch(), the handlers for each capability, starter template
apps/server         HTTP adapter, OpenAPI document, static web hosting
apps/cli            CLI adapter, flags generated from the registry
apps/mcp            MCP stdio adapter (read-only tools)
apps/web            React editor with side-navigation windows, 3D view, offline shell
config/rules        rule thresholds as a versioned file
scripts/            performance check and process-kill test
data/knowledge-graph  the curated plant graph as plain-text CSV (see SCHEMA.md)
data/archive        generated plain-text archive (do not edit by hand)
docs/               architecture, principles, data formats, ADRs, agent protocols
```

Designs are stored under `data/designs/` and are local state. They are not committed.

## Licence

Software: Apache-2.0 (see the LICENSE file once added). Knowledge-graph data: CC-BY-4.0
(see `data/knowledge-graph/manifest.json`). Both are proposed and need human confirmation (B-002).
