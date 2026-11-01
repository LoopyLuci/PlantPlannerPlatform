# Plant Planner Platform

Plant a garden on a plan, and see at once whether it will work, and why.

Plant Planner Platform is a garden and landscape design tool built on three rules:

1. **Every horticultural claim is cited.** Each trait and each plant relationship names its source and an evidence grade (A, B or C).
2. **Every verdict is deterministic and explainable.** The same design always gives the same verdict, and each verdict names the rule and the data behind it.
3. **Every result carries the versions that produced it.** The model, the knowledge graph and the rule set are stamped on every answer.

Machine learning is optional, and it comes last. Nothing depends on it.

> **Status: early.** The core is built and tested. The plant data is a 12-species seed that has not been reviewed yet, so do not rely on its values for real planting decisions. See [PLAN.md](PLAN.md) for the roadmap and [TODO.md](TODO.md) for what is next.

## What it does today

- **Plan on a metric plot.** Place plants with their footprints, move them by dragging or with the keyboard, and undo any change.
- **Live checks.** Hardiness, sun, soil pH, footprint overlap, same-species spacing, mature canopy overlap, and companion relationships. Each one shows its reason and its source.
- **Suggestions for a spot.** Species that fail a hard constraint are removed first, and every rejection has a reason.
- **Views.** A 2D plan, a 3D view you can walk around, a side elevation with mature heights, and windows for the site, the plant library, placed plants, details, designs and data health.
- **Feedback on any verdict.** You can say why you disagree. The feedback is recorded and routed to a person. It never changes a design, the plant data or a rule.
- **A history you can check.** Every design is an append-only, hash-chained log. An integrity check tells you if anything was changed.
- **An archive you can read without this software.** `npm run archive` writes plain text and CSV, with checksums.
- **Four ways in, one contract.** The web editor, an HTTP API (with OpenAPI), a command-line tool and a read-only MCP server for agents all come from one capability registry.

## Quick start

You need Node 20.11 or newer. The project is developed on Node 24 (see `.nvmrc`).

```bash
npm install
npm run build      # builds the web app
npm start          # serves the app and the API at http://127.0.0.1:4010
```

For web development with hot reload, run `npm run dev:web` in a second terminal. It proxies `/api` to the server on port 4010.

The first time you open the app, a **Starter Garden** is created for you.

## Use it from the command line

```bash
npm run cli -- list                          # every capability
npm run cli -- help design.add_placement     # the flags for one capability
npm run cli -- plants.search --query sage --table
npm run cli -- design.create --name "Front bed" --template starter_pollinator
npm run cli -- design.evaluate --design-id <id>
npm run archive                              # regenerate data/archive
```

Writes get an Idempotency-Key automatically if you do not give one. Keep the key to retry safely.

## Use it from an agent

```bash
npm run mcp      # JSON-RPC over stdio
```

The MCP server exposes eleven read-only tools: health, plant search and profile, design list, get and history, evaluate, verify, placement check and suggestions, and feedback list. Agents cannot write through MCP (ADR-0005).

## Configuration

All variables are optional.

| Variable | Default | Purpose |
|---|---|---|
| `PPP_DATA_DIR` | `data/` | Where designs (`designs/`), feedback (`feedback/`) and archives (`archive/`) live |
| `PPP_KNOWLEDGE_DIR` | `data/knowledge-graph/` | The plant knowledge graph |
| `PPP_RULES_FILE` | `config/rules/rules-1.0.json` | The rule thresholds in use |
| `PPP_HOST` | `127.0.0.1` | Server bind address. Keep it on localhost (see [SECURITY.md](SECURITY.md)). |
| `PPP_PORT` | `4010` | Server port |
| `PPP_ACTOR` | `local-cli` | Actor name recorded on CLI writes |

## Checks and tools

```bash
npm test                              # every unit, integration and parity test
npm run typecheck                     # strict TypeScript across every package
npm run check                         # typecheck, tests and build: the bar for every change
npm run bench                         # performance gate: a 50-plant design evaluates in under 50 ms
npm run kill-test -- --iterations 100 # kills the writer at random points; the full gate is 1,000
```

## Documentation

| If you are | Read |
|---|---|
| A gardener or planner | This page, then the in-app Getting Started checklist |
| A contributor | [CONTRIBUTING.md](CONTRIBUTING.md), then [docs/DESIGN_PRINCIPLES.md](docs/DESIGN_PRINCIPLES.md) |
| A coding agent | [AGENTS.md](AGENTS.md), then [HANDOVER.md](HANDOVER.md) |
| A maintainer | [HANDOVER.md](HANDOVER.md) (current state) and [TODO.md](TODO.md) (what is next) |
| Deciding something | [PLAN.md](PLAN.md) and the decision records in [docs/adr/](docs/adr/INDEX.md) |
| Working with data | [docs/DATA_FORMATS.md](docs/DATA_FORMATS.md) and [data/knowledge-graph/SCHEMA.md](data/knowledge-graph/SCHEMA.md) |

The full index is in [docs/README.md](docs/README.md).

## Principles in brief

The invariants are in [docs/DESIGN_PRINCIPLES.md](docs/DESIGN_PRINCIPLES.md). The ones that shape everyday work:

- A knowledge graph, not a model, is the source of truth for plant facts (I1).
- The platform works with no learned model installed (I2).
- People make the decisions: archiving, deleting and curation are never automated (I3).
- Design history is never rewritten. A correction is a new event (I7).
- The plain-text archive always reads without this software (I10).

## Repository map

```
packages/registry     capability definitions (the single source of truth) and validation
packages/core         pure logic: rules engine, knowledge-graph loader, design reducer, feedback router
packages/store        durable storage: hash-chained logs, snapshots, feedback log, archive
packages/services     dispatch() and the handler for each capability
apps/server           HTTP adapter, OpenAPI document, static hosting
apps/cli              command-line adapter, flags generated from the registry
apps/mcp              MCP adapter (read-only)
apps/web              the editor: side-navigation windows, 3D view, offline shell
config/rules          rule thresholds as a versioned file
data/knowledge-graph  the curated plant graph as CSV, with sources and grades
data/archive          generated plain-text archive (do not edit by hand)
docs/                 architecture, principles, data formats, decision records, agent protocols
scripts/              the performance check and the process-kill test
```

Designs and feedback are local state under `data/designs/` and `data/feedback/`. They are not part of the repository.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. Plant data changes need a source and a grade for every value, and a person reviews them. Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

The server has no authentication yet. It is designed to listen on `127.0.0.1` only. To report a vulnerability, follow [SECURITY.md](SECURITY.md). Do not open a public issue for it.

## Licence

To be confirmed before the first public release. The proposal is Apache-2.0 for the software and CC-BY-4.0 for the plant knowledge graph (see HANDOVER, B-002). Until a `LICENSE` file is in the repository, no licence is granted.
