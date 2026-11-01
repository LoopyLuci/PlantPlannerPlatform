# TODO.md

Read [PLAN.md](PLAN.md) first. Legend: `[ ]` open · `[~]` in progress or partly done · `[x]` done · `[!]` blocked on a human.
Priority: `P0` blocks the current phase gate · `P1` next · `P2` scheduled · `P3` later.

## P0: finish the Phase 0 gate

- [x] `P0` Process-kill test: 1,000 SIGKILLs at random points during writes, 0 failures (`npm run kill-test -- --iterations 1000 --seed 20261101`). Caveat: no kill in that run left a partial line, so torn-line repair is covered only by unit tests.
- [x] `P0` Performance check: a 50-plant design evaluates in 0.34 ms (median; gate 50 ms), `npm run bench`. Plan drawing at 60 fps is still unmeasured on a reference laptop.
- [x] `P0` Projection cache: per design, invalidated by any write to the log file (`packages/store`).
- [!] `P0` Expand the seed graph toward ~500 species with cited traits. Blocked on curation (B-004): an agent must not add facts without sources (AGENTS.md sections 2 and 6).
- [ ] `P0` End-to-end browser tests for journeys J1, J3, J5 with Playwright. Chrome is installed, so `playwright-core` with the `chrome` channel needs no browser download. Not started.
- [x] `P0` Commit the work to git once a human approves (B-003). Done: `1091e96`.

## P1: next phase work

- [~] `P1` Offline app shell: service worker written and registered in production builds (`apps/web/public/sw.js`). Not verified offline: the built-in browser pane refused the registration. Needs a check in Chrome: stop the server, reload, and confirm the editor opens.
- [ ] `P1` Companion mechanism table: evidence grades and citations for every edge; add effect sizes where published (curation).
- [ ] `P1` Sun and shadow engine: compute hours of direct sun per placement from site geometry (Phase 2). Blocked on Q1 in HANDOVER.
- [x] `P1` Feedback log with reason tags and a deterministic router (ADR-0007; I7). The form is in Plant details, and `feedback.list` shows the routes.
- [x] `P1` Plain-text archive: feedback records and rule thresholds are included, and a cold-storage check runs in `npm test`. Scan folders are added when they exist.
- [!] `P1` Add a `LICENSE` file (Apache-2.0) and `data/knowledge-graph/LICENSE` (CC-BY-4.0) once B-002 is decided.
- [~] `P1` Rule config as data: thresholds in `config/rules/rules-1.0.json`, validated at start-up (ADR-0008). The dual-evaluation swap is not built.

## P2: scheduled

- [ ] `P2` Authentication, roles and the gateway policy layer across all four interfaces (single principal model).
- [~] `P2` 3D perspective and side-elevation windows (Phase 1; ADR-0009). Built: perspective view with drag-to-move through the same write as the plan, side elevation, and a side-by-side fallback without WebGL. Not done: 60 fps measured on reference hardware (the built-in pane showed about 53 fps while zooming with 200 plants), 2D-to-3D update within 100 ms measured end to end, labels in 3D, distance-based LOD.
- [ ] `P2` Variant generation: CP-SAT or annealing over region constraints, returning Pareto-diverse layouts (Phase 3).
- [ ] `P2` Design Brief: typed goals, objective weights and biome context, editable and inspectable.
- [ ] `P2` Durability watchdog as a running process: six probes, tri-state classification, graduated remediation, external beacon (see docs/runbooks/durability-incident.md). Only the one-shot check exists today.
- [ ] `P2` ACP command pack under `agent/commands/` (plan-bed, review-placement, audit-design) with human gates.
- [ ] `P2` Export: plain-text planting plan (CSV, GeoJSON), then PDF. The archive has per-design CSV and GeoJSON; a planting-plan export is not built.
- [ ] `P2` Structure and rainwater: manual footprints and roof outlines first, then roof-plane recognition.

## P3: later

- [ ] `P3` Ivy learned model: two-tower baseline first, then the graph encoder only if it beats the baseline by 10% on cold-start species.
- [ ] `P3` Android scanner, the desktop viewer, and the stream protocol (their contracts go in the registry first).
- [ ] `P3` Ecosystem profiles, ecoregion context, native and keystone flags, and GIS parcel import.
- [ ] `P3` Encyclopedia as a `.flora` bundle with full-text search, plus the image store with pinning and restore.
- [ ] `P3` Calendar, journal and harvest log (event-sourced, with phenology from the graph).
- [ ] `P3` Bill of materials and nursery import with review gates.
- [ ] `P3` Collaboration (CRDT) and per-author undo.
- [ ] `P3` Optional AI layer as an MCP and ACP client only (Phase 6).

## Discovered during build (add with date, do not reorder)

- 2026-10-31: `design.get` output shape was nested under `design`; flattened to match the registry. Done.
- 2026-10-31: `x` and `y` were not marked required on placement capabilities, so a missing coordinate could store `NaN`. Fixed in the registry, and `requireInside` now rejects non-finite values. Done.
- 2026-11-01: The Ctrl+Z undo sent a stale `base_seq` (409). Undo closures captured an old design. Fixed by a serialized write queue and a design ref. Verified in the browser.
- 2026-11-01: The first version put every panel in one column. Replaced by side-navigation windows. Done.
- 2026-11-01: The 3D view missed a plant on the first press after page load, and a missed press orbited the camera. The instanced mesh caches its bounding sphere, which goes stale after plants move, and OrbitControls also received the press. Fixed: the sphere is recomputed before each pick, and a press on a plant is stopped before the orbit controls. Verified in the browser.
- 2026-11-01: A server started earlier this session (old code, PID 22416) still held port 4010. It lacks `feedback.record` and `feedback.list`. Stopping it was denied by the automation classifier, so it was not forced. Restart the server to use the new capabilities.
- 2026-11-01: The built-in browser pane refused service-worker registration ("An unknown error occurred when fetching the script"), although `/sw.js` returns 200 as JavaScript. Cause not known. It may be the pane, not the file.
- 2026-11-01: The browser checks ran against the old server's scratch data (`E:/tmp/ppp-browser`), not `data/designs`. The real store was not changed.
- 2026-11-01: The main bundle was 841 kB with three.js. Lazy-loading the 3D window brings it to 277 kB. The three.js chunk (562 kB) still triggers Vite's size warning.
- 2026-11-01: 200 plants overlap in a 6 by 4 m plot, so the side elevation draws one mass. A density summary above a count threshold would help.
- 2026-11-01: Git initialised. `.gitattributes` keeps text files in LF, and `data/feedback/` is ignored like `data/designs/`. Done.
- Open: the plant library filters the species list in the browser (all species are loaded once). That is fine at 12 species, but it will need server-side search at a few thousand.
- Open: the rule thresholds (2.5 m companion radius, 0.25 m canopy overlap) are unvalidated. They now live in `config/rules/rules-1.0.json`. Check them against source data before the seed grows.

## Blocked on human (`[!]`)

- [!] B-001 Approve the proposed ADRs in [docs/adr/INDEX.md](docs/adr/INDEX.md), now 0001 to 0009 (agents cannot accept their own ADRs).
- [!] B-002 Confirm the licences: Apache-2.0 for code, CC-BY-4.0 for the knowledge graph.
- [x] B-003 Approved and done: `git init` on `main`, first commit `1091e96`.
- [!] B-006 Decide whether the design transcript export at the repo root belongs in the repository. It is untracked for now.
- [!] B-004 Verify the seed citations in `data/knowledge-graph/sources.csv`. Four sources are placeholders (`needs_specific_citation`, `not_a_citable_source`). This also blocks the P0 seed expansion.
- [!] B-005 Confirm the feedback routes (ADR-0007) and who reviews the curation queue.

## Done (recent)

- Capability registry with 19 capabilities and validation (registry tests)
- Hash-chained event log, snapshots, torn-tail quarantine, integrity report (store tests)
- Process-kill test (1,000 kills), projection cache, performance check
- Rules engine with cited verdicts and companion score; thresholds in a versioned file (core tests)
- Feedback log, router, `feedback.record` and `feedback.list`, and the form in Plant details
- Plain-text archive with checksums, feedback and rule files, and a cold-storage readability test
- HTTP API with OpenAPI, CLI with generated flags, MCP stdio server with 11 read tools (adapter tests)
- Web editor with nine side-navigation windows, including 3D and side elevation (browser verified), live verdicts, undo, and suggestions
- Offline shell service worker (production build; not yet verified offline)
