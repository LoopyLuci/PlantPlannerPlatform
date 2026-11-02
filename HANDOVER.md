# HANDOVER.md: state snapshot

**Last updated**: 2026-11-02 by agent (Claude, session 6d7b425e, seventh pass: handover audit)
**Phase**: 0 (nearly complete) and the first half of Phase 1. See [PLAN.md](PLAN.md).
**Git**: public repository https://github.com/LoopyLuci/PlantPlannerPlatform on `main`, at `4995c9e`. Hosted CI passed on `4995c9e` and `7cdeb13`. The design transcript export stays out of the repository (B-006).

## Read this first

An agent starting here must read this file after [AGENTS.md](AGENTS.md). Update it at the
end of every session, not the start.

## What exists now

| Area | State | Where |
|---|---|---|
| Capability registry | 19 capabilities. 11 are MCP read tools (limit 15). Validated by tests. | `packages/registry` |
| Core logic | Rules engine `rules-1.0` (thresholds from a file), knowledge-graph loader with an edge index, design reducer, feedback router, canonical JSON | `packages/core` |
| Storage | Hash-chained NDJSON per design, snapshots, projection cache, integrity check, torn-tail repair, feedback log, plain-text archive | `packages/store` |
| Services | `dispatch()`, one handler per capability, starter template | `packages/services` |
| HTTP API | `POST /api/v1/capabilities/{id}`, `GET /api/v1/openapi.json`, `GET /api/v1/health`, static web app | `apps/server` |
| CLI | `npm run cli -- <capability> [--flags]`, generated from the registry | `apps/cli` |
| MCP | stdio JSON-RPC, read-only tools | `apps/mcp` |
| Web editor | Nine windows in a side navigation (Plan, 3D view, Side elevation, Site, Plant library, Placed plants, Plant details, Designs, Data health). Live rules, undo, suggestions, feedback form. Offline: service worker, IndexedDB outbox for placement writes (ADR-0011), export of waiting changes, warning on leaving with changes waiting. 3D module prefetched and shaders compiled when idle (ADR-0013). | `apps/web` |
| Knowledge graph | `kg-2026.10`, status `seed-unreviewed`, 12 species, 10 companion edges, 4 sources (unchanged) | `data/knowledge-graph` |
| Rule thresholds | `rules-1.0`, in a versioned file | `config/rules/rules-1.0.json` |
| Local pipeline | `npm run ci` (tiers quick, standard, full) with preflight, lock, logs in `.ci/`. Pre-push hook installed on this clone (`.githooks/`, `core.hooksPath`). | `scripts/ci.ts`, `.githooks/` |
| Tests | 154 unit tests across packages and the web model (`npm run check` passes). Browser journeys in `e2e/` (run by `npm run e2e`). Process-kill test and `npm run bench`. Perf measurements in `e2e/perf/` (run by `npm run perf:3d`, not in CI). | `packages/*/test`, `apps/*/test`, `apps/web/test`, `e2e/`, `scripts/` |

## Environment

- Windows 10, Git for Windows (Git Bash), PowerShell 7. In PowerShell, set an environment variable with `$env:NAME = "value"`, not `NAME=value`.
- Node 24.11.1, npm 11.15.0. The project supports Node 20.11 and later.
- Ports: the server uses `127.0.0.1:4010` by default. Environment variables: `PPP_DATA_DIR`, `PPP_KNOWLEDGE_DIR`, `PPP_RULES_FILE`, `PPP_HOST`, `PPP_PORT`, `PPP_ACTOR`, `PPP_E2E_CHANNEL`.
- Scratch data during testing lives in `E:\tmp\ppp-*` or the Playwright temp directory. The real store is `data/designs/` (gitignored).
- `.gitattributes` keeps text files in LF.
- Google Chrome is not installed on this machine. Microsoft Edge is at `C:\Program Files (x86)\Microsoft\Edge`. End-to-end tests use it with `PPP_E2E_CHANNEL=msedge`. Without that variable they use the Chromium that `npx playwright install chromium` downloads.
- The server on port 4010 was restarted by the owner on 2026-11-01 with `npm start`. The server runs from source, so restart it after server-side changes. The web app is served from `apps/web/dist`, so run `npm run build` after web changes.

## Known issues

- **Clearing site data loses queued changes.** Closing or reloading the page with changes waiting asks the person first. Clearing this origin's storage in the browser's settings removes the queue, and the page cannot detect or warn about it. The browser is asked to persist storage on start, which only reduces eviction under pressure. The export button saves the queue as a file. A decision is needed (B-008).
- **The first 3D open is at the 100 ms gate, not reliably under it.** Before the fixes it took about 398 ms. Two causes: `React.lazy` suspended for about 330 ms even with the module cached, and the first draw compiled every shader. The module is now prefetched when idle and held in state, and a hidden scene compiles the shaders in idle time (`warmUpScene`). Three runs of `npm run perf:3d` on this machine gave first opens of 84, 98 and 104 ms, and later opens of 61 to 68 ms. Reference hardware is still needed (B-009).
- **ADR-0013 is accepted, but its text is out of date.** Its implementation notes describe the import being discarded, and it has no warm-up. The ADR is not edited, so a follow-up ADR should record the state-held module and the shader warm-up.
- The 100 ms gate in `perf:3d` covers the scene update and the first frame, plus the write. The design fetch that precedes a mount is not timed, and the numbers come from one headless machine.
- The page has one banner, and the last message wins. An offline error from a background call can replace the archive message, so the archive test accepts either offline message.
- Two tabs share one queue and drain it under a Web Lock (`withOutboxLock`). The browser test passes with the lock bypassed too, because idempotency keys absorb a duplicate send. The lock stops duplicate requests; it is not shown to be needed for correctness.
- Offline create and archive of a design are refused. Archive now shows a message, but there is no offline path for either.
- The local pipeline does not regenerate the archive; it verifies the committed checksums. The GitHub workflow regenerates and then checks. A decision is needed on whether CI should call `npm run ci` so the two cannot drift.
- `loadState` replays the log on a cache miss. Fine at this size.
- The web app loads all species at start-up (about 12). Move search to the server before the library grows. The search gate at 500 species is not measured in the browser; the synthetic core test passes at 500.
- The sun value is one number for the whole site. It is not computed from geometry yet.
- Companion radius (2.5 m), canopy-overlap threshold (0.25 m) and the other `rules-1.0` values are unvalidated.
- The seed values are unverified (see B-004). Every trait is graded C on purpose.
- The server has no authentication. It is safe only because it binds to localhost. Do not bind it to a network address.
- The kill test never produced a partial final line in 1,000 kills. Torn-line repair is covered by unit tests that write a partial line by hand.
- The 3D view has no labels. Plants are listed beside it.
- The 3D chunk (about 560 kB, three.js) triggers Vite's size warning.
- The 200-plant test design overlaps heavily, so the side elevation draws one mass. It is a test artefact, not a planning case.
- Mobile layout: checked at 375 px for the side elevation (no horizontal scroll). The 3D view was not checked at phone width.
- `PLAN.md` status was corrected by ADR-0012, which was accepted and applied in `8d6a5de`.

## Open questions

| # | Question | Blocks | Needs |
|---|---|---|---|
| Q1 | Should the sun engine cache per solar hour or per placement point? | Phase 2 design | ADR + human decision |
| Q2 | Federated training: Flower or a custom gRPC and FedAvg? | Phase 3 | ADR |
| Q3 | Should archived designs be included in the plain-text archive by default? (Currently yes, marked `archived: true`.) | archive format | Human decision |
| Q4 | Should the 3D view get a density summary above a plant count, or labels for selected plants only? | Phase 1 polish | Human decision |

## Blocked on human

- **B-001** (resolved): ADRs `0001` to `0012` accepted by the project owner on 2026-11-01. **ADR-0013** accepted by the owner on 2026-11-01 (its text is out of date; see Known issues). Accepted ADRs are immutable; a change needs a new ADR.
- **B-002** (resolved): Licences adopted as proposed. Apache-2.0 for the software (`LICENSE`), CC-BY-4.0 for the knowledge graph (`data/knowledge-graph/LICENSE`).
- **B-003** (resolved): Git initialised on `main` with the owner's approval; commits follow the approval rule in `CONTRIBUTING.md` (ADR-0010).
- **B-004**: Verify or replace the two placeholder citations for `SRC-EXT-FAMILY` and `SRC-EXT-GENERIC`, and supply per-trait handbook references for `SRC-SEED`. `SRC-LORE` stays graded C. Why: traits and edges that cite placeholders stay C-grade, and the seed expansion waits on real sources. Candidate leads are in [docs/curation/citation-candidates.md](docs/curation/citation-candidates.md); none is a citation yet. Suggested decision: a curator reads the candidates and starts with about 12 species and one handbook.
- **B-005**: Confirm the feedback routes in ADR-0007 and who reviews the curation queue. Why: feedback is only useful if someone reads the queue. Suggested decision: accept the four routes; the project owner reviews the curation queue until a curator is named.
- **B-006**: Keep the design transcript export out of the repository. The files `We_are_going_to_design_and_develop_a_next_generation_and.md` and `.json` at the repo root are ignored by `.gitignore`, and git has never tracked them. Why: they are the raw chat export the requirements came from and may contain personal material. Suggested decision: keep them ignored, and move them to private storage.
- **B-008**: Decide whether to accept the site-data risk, or keep a server-side copy of queued changes. Why: clearing browser data loses queued offline changes, and the page cannot warn about it. Suggested decision: accept the risk, with the export button as mitigation. A server-side copy needs its own ADR, because it changes how offline writes apply.
- **B-009**: Run `npm run perf:3d` on the target laptop and record the numbers in the docs. Why: the 100 ms gate and the 60 fps gate are only measured on this machine. Suggested decision: run it once with the browser installed, and send the contents of `test-results/perf-3d.json` and `test-results/perf-plan-to-3d.json`.

## Latest verification (2026-11-02)

- `npm run ci:full` with `PPP_E2E_CHANNEL=msedge`: passed (typecheck, 154 unit tests, archive checksums, build, e2e, kill-test, bench), 111 s.
- Hosted CI: `4995c9e` and `7cdeb13` passed on GitHub. `26cc26f` was not checked.
- Offline journeys (`e2e/offline.spec.ts`): 9 of 9 pass.
- `npm run perf:3d` (headless Chromium, this Windows machine): 200 plants: frame median 16.7 ms (59.9 fps), worst 16.8 ms over 180 frames; write median 12 to 14 ms; scene update plus first frame 60 to 66 ms; search median 10.2 ms at 12 species (worst 12 ms, gate 50 ms).
- Plan-to-3D (`e2e/perf/plan-to-3d.spec.ts`): first open 84, 98 and 104 ms across three runs; later opens 61 to 68 ms.
- `npm run kill-test -- --iterations 1000 --seed 20261101` (2026-11-01): 1,000 kills, 21,746 acknowledged writes, 0 failed, 0 interrupted lines repaired.
- `npm run bench` (2026-11-01): 50 plants evaluate in 0.34 ms (median) against a 50 ms gate; 200 plants in 5.7 ms.
- Not verified: the 100 ms gate on reference hardware; the 60 fps gate on reference hardware; search at 500 species in the browser; a species never opened online cannot be added offline.

## Session log (most recent first)

| Date | Agent | Summary | State after |
|---|---|---|---|
| 2026-11-02 | agent (6d7b425e, seventh pass) | Handover audit: corrected stale statements (hook installed, e2e in CI, stale server restarted, PLAN status resolved by ADR-0012, verification record), recorded B-008 and B-009, and refreshed the current state. | Committed with this pass. Human decisions open: B-004, B-005, B-008, B-009. |
| 2026-11-02 | agent (6d7b425e, sixth pass) | ADR-0013 accepted by the owner and built: the 3D module is prefetched when idle and held in state, and a hidden scene compiles the shaders in idle time. First open cut from 398 ms to 84 to 104 ms (three runs), at the 100 ms gate. Docs brought up to date. | First-open gate at the line, not reliably under it. |
| 2026-11-01 | agent (6d7b425e, fifth pass) | Offline archive refused with a message, and refused while changes wait; Web Lock around the drain; persistent storage requested; two-tab and offline-archive browser tests. Hosted CI for 5dcfdac, 61be4ab and 2934993 is green. `npm run ci:full` passes. | Lock not shown to be needed; see Known issues. |
| 2026-11-01 | agent (6d7b425e, fourth pass) | Added Playwright end-to-end tests (`npm run e2e`): J1, J5, feedback and the offline shell. Typecheck now covers the tests. | Superseded by later passes. |
| 2026-11-01 | agent (6d7b425e, third pass) | Approved by the user (B-003): `git init` on `main`, first commit `1091e96` with the Co-Authored-By line. `.gitattributes` (LF) added; `data/feedback/` added to `.gitignore`. Design transcript export left untracked (B-006). | Committed. |
| 2026-11-01 | agent (6d7b425e, second pass) | Projection cache; performance check; 1,000-kill test; rule thresholds in a versioned file; feedback log, router and form; archive additions and cold-storage test; offline shell; 3D view and side elevation; lazy loading. Three ADRs (0007 to 0009) proposed. | Superseded by later passes. |
| 2026-11-01 | agent (6d7b425e) | Built the foundation (registry, rules, store, services, adapters, editor). Reorganised the editor into side-navigation windows after user feedback. Fixed a stale-sequence undo bug. Wrote the planning documents. | Foundation working. |
| 2026-10-31 | agent | Read the design transcript (about 8,900 lines) and recorded its requirements in this repo's plan | Design captured in PLAN and TODO |

## Postmortem notes

None this session. The 3D pick fault and the stale server are logged under Known issues and TODO "Discovered".

## Template for new entries

```
## State at last session end
Branch / commit:
Last green check: (npm run check output summary)
Known issues:
## Open questions
| # | Question | Blocks | Needs |
## Blocked on human
- **B-00N**: <item>. Why: <reason>. Suggested decision: <default>.
## Session log entry
| YYYY-MM-DD | agent:<id> | <one-line summary> | <state change> |
```
