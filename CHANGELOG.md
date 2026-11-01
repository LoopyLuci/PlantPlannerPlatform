# CHANGELOG

All notable changes. Format: [Keep a Changelog](https://keepachangelog.com/). Versions: [VERSIONING.md](VERSIONING.md).

## [Unreleased]

### Added
- 3D render timing for the 100 ms gate: the scene update plus the next frame is written to the stage's `data-render-ms` attribute, and `npm run perf:3d` reports it as `sceneRenderMs` (60 to 66 ms at 200 plants in headless Chromium).
- Closing or reloading the page while changes wait for the server asks the person to confirm. Clearing site data in the browser's settings cannot be intercepted, so it is not covered. Browser test in `e2e/offline.spec.ts`.
- Scale check at 500 synthetic species (`packages/core/test/scale.test.ts`): the loader and the rules engine at 50 and 200 plants, under the 50 ms gate. The species are generated fixtures, not horticultural data.
- Browser test for removing a plant offline and undoing it: the server ends where it started after two log events.
- Candidate citations for the placeholder sources in `docs/curation/citation-candidates.md` (leads for curators, not citations).
- Local CI pipeline (`scripts/ci.ts`): `npm run ci`, `ci:quick`, `ci:full`. Preflight checks (Node version, pinned Node, required files, installed dependencies, free port, browser, working-tree state), parallel stages, per-stage timeouts that kill the process tree, a run lock with stale-lock recovery, a cross-platform archive checksum check, and a JSON report in `.ci/`. `ci:hooks` installs an opt-in pre-push hook.
- Performance measurement (`npm run perf:3d`, `e2e/perf/`): 200 plants in the 3D view while orbiting, and plan-edit write latency. Kept out of the pipeline; the journey suite ignores `e2e/perf/`.
- ADR-0012 (Accepted): corrects the PLAN Phase 0 and Phase 1 status, the I5 enforcement wording, and the git sentence in AGENTS section 3.
- CI workflow runs the local pipeline: the check job runs `npm run ci -- --skip e2e`, and the e2e job builds and then runs `npm run ci -- --only e2e`.
- Browser test for a refused offline change: shown as a conflict, and discarding it clears the queue.
- Plant-library search timing in `e2e/perf/search-timing.spec.ts`.
- Species profiles are cached on this device when they load, so a species opened online can be added offline.
- Offline outbox (ADR-0011): placement moves, adds and removes made while the server is unreachable are kept in IndexedDB, shown at once, and sent in order with their idempotency keys when the server returns. A refused change is shown as a conflict with a discard action. The last copy of each design, its checks and the species list are cached for an offline start. Unit tests in `apps/web/test/outbox.test.ts`; the journey test is in `e2e/offline.spec.ts`.
- ADR-0011 (Accepted): offline writes through a browser outbox with idempotent replay and conflicts surfaced to a human (J3).
- CI job `e2e`: installs Chromium with Playwright and runs `npm run e2e` on Ubuntu, Node 24; uploads traces on failure.
- End-to-end tests with Playwright (`npm run e2e`, which builds the web app first): journeys J1 (place, correct by keyboard, reload) and J5 (search, profile), the feedback journey, and the offline shell (J3, shell only). They run against a server on port 4411 with a fresh scratch data directory. Set `PPP_E2E_CHANNEL=msedge` (or `chrome`) to use an installed browser. Typecheck covers the tests.
- Feedback on verdicts: `feedback.record` and `feedback.list` capabilities, a hash-chained feedback log, a pure router to four suggested routes, and a form in Plant details (ADR-0007).
- Rule thresholds in `config/rules/rules-1.0.json`, loaded at start-up and validated; `PPP_RULES_FILE` overrides the path (ADR-0008).
- 3D view window (three.js, loaded on demand): instanced plants, drag to move (saved through the same write as the plan), and a fallback to the side elevation without WebGL (ADR-0009).
- Side elevation window, from the south or the west, with mature heights and a keyboard-accessible plant list.
- Offline app shell: a production-only service worker that keeps the app's files and never caches `/api/`.
- Per-design projection cache in the store, invalidated by any write to the log file.
- `npm run kill-test`: a process-kill test (SIGKILL at random points during writes), with a short version in `npm test`.
- `npm run bench`: a 50-plant evaluation gate and a 200-plant timing.
- Cold-storage readability test: reads the archive with Node only and recomputes every hash from the documented rule.
- Archive: `feedback/feedback.ndjson`, `feedback/feedback.csv`, and `rules/rules-1.0.json`.
- Capability registry (`packages/registry`) with 17 capabilities, validation, and JSON Schema generation. (19 after the feedback capabilities.)
- Pure core (`packages/core`): rules engine `rules-1.0` with cited verdicts, companion score, candidate checks and suggestions; knowledge-graph loader that refuses uncited facts; design event reducer.
- Store (`packages/store`): hash-chained append-only design logs, idempotent writes, optimistic `base_seq` guard, torn-tail quarantine, snapshots with verification, integrity report, plain-text archive export.
- Services (`packages/services`): `dispatch()` shared by all adapters, handlers for every capability, the Starter Garden template.
- HTTP adapter (`apps/server`): capability routes, OpenAPI document, health route, static hosting, input guards.
- CLI adapter (`apps/cli`): flags generated from the registry, `--table` output, stable exit codes.
- MCP adapter (`apps/mcp`): read-only stdio JSON-RPC server, 10 tools.
- Web editor (`apps/web`): seven windows in a side navigation (Plan, Site, Plant library, Placed plants, Plant details, Designs, Data health), live verdicts, undo toasts, suggestions for a spot, and a getting-started checklist.
- Seed knowledge graph `kg-2026.10` (`data/knowledge-graph`), status `seed-unreviewed`, with four sources and a schema document.
- Planning and agent documents: README, AGENTS, PLAN, TODO, HANDOVER, VERSIONING, architecture, principles, data formats, glossary, ADRs 0000-0006, agent protocols, longevity audit, durability runbook.

### Changed
- Companion-edge lookup uses an index built once per graph. Evaluating 200 plants with 500 species and 1,000 edges fell from about 118 ms to under 50 ms. The results are unchanged.
- The editor was split from one continuous workspace into side-navigation windows (user request).
- `DEFAULT_RULE_CONFIG` and `RULE_CONFIG_VERSION` are removed. Every rule function takes the configuration explicitly, and `versionTriple` takes `ruleConfigVersion`.
- The MCP server exposes 11 read tools (`feedback.list` added). The limit is 15.
- The main web bundle no longer includes three.js. The 3D window is fetched when it is first opened.

### Fixed
- Archiving while offline failed without a message. It now says the design was not archived, and archiving waits until queued changes have synced, since the server copy is behind the local view.
- Two tabs could both drain the same queue. Each drain now takes a Web Lock, so one tab sends at a time; a tab that finds the lock held skips the round. The browser test passes with and without the lock, because idempotency keys already make a duplicate send harmless. The lock avoids the duplicate requests.
- The browser is asked to keep this origin's storage (`navigator.storage.persist`), so queued changes are less likely to be evicted under storage pressure. Clearing site data by hand still removes the queue.
- A change queued offline did not offer Undo; the undo toast is now shown for queued changes too.
- `x` and `y` are required on placement capabilities, so a missing coordinate can no longer be stored as `NaN`.
- Undo sent a stale `base_seq`, which returned a conflict. Writes now run through a queue that reads the latest sequence.
- `design.get` returns its fields at the top level, matching the registry.

### Deprecated
- None.

### Removed
- Single-column editor panels (replaced by the windows).

### Security
- Design and placement ids are validated before use as file names or object keys.
- The HTTP adapter requires JSON content type and validates Idempotency-Key format.
- The server binds to 127.0.0.1 by default. There is no authentication yet (TODO P2).
- The service worker never caches `/api/` responses, so a stale design is never served as current.
- Feedback cannot change a design, the knowledge graph or a rule. Every route ends with a human action.
