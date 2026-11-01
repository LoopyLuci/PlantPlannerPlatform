# HANDOVER.md: state snapshot

**Last updated**: 2026-11-01 by agent (Claude, session 6d7b425e, second pass)
**Phase**: 0 (nearly complete) and the first half of Phase 1. See [PLAN.md](PLAN.md).
**Git**: not a repository yet (see B-003).

## Read this first

An agent starting here must read this file after [AGENTS.md](AGENTS.md). Update it at the
end of every session, not the start.

## What exists now

| Area | State | Where |
|---|---|---|
| Capability registry | 19 capabilities. 11 are MCP read tools (limit 15). Validated by tests. | `packages/registry` |
| Core logic | Rules engine `rules-1.0` (thresholds from a file), knowledge-graph loader, design reducer, feedback router, canonical JSON | `packages/core` |
| Storage | Hash-chained NDJSON per design, snapshots, projection cache, integrity check, torn-tail repair, feedback log, plain-text archive | `packages/store` |
| Services | `dispatch()`, one handler per capability, starter template | `packages/services` |
| HTTP API | `POST /api/v1/capabilities/{id}`, `GET /api/v1/openapi.json`, `GET /api/v1/health`, static web app | `apps/server` |
| CLI | `npm run cli -- <capability> [--flags]`, generated from the registry | `apps/cli` |
| MCP | stdio JSON-RPC, read-only tools | `apps/mcp` |
| Web editor | Nine windows in a side navigation (Plan, 3D view, Side elevation, Site, Plant library, Placed plants, Plant details, Designs, Data health). Live rules, undo, suggestions, feedback form, offline shell (service worker). | `apps/web` |
| Knowledge graph | `kg-2026.10`, status `seed-unreviewed`, 12 species, 10 companion edges, 4 sources (unchanged) | `data/knowledge-graph` |
| Rule thresholds | `rules-1.0`, in a versioned file | `config/rules/rules-1.0.json` |
| Tests | 139 across packages and the web model (`npm run check` passes). Plus the process-kill test (1,000 kills passed) and the performance check (`npm run bench`). | `packages/*/test`, `apps/*/test`, `apps/web/test`, `scripts/` |

## Environment

- Windows 10, Git for Windows (Git Bash), PowerShell 7.
- Node 24.11.1, npm 11.15.0. The project supports Node 20.11 and later.
- Ports: the server uses `127.0.0.1:4010` by default. Environment variables: `PPP_DATA_DIR`, `PPP_KNOWLEDGE_DIR`, `PPP_RULES_FILE`, `PPP_HOST`, `PPP_PORT`, `PPP_ACTOR`.
- Scratch data during testing lived in `E:\tmp\ppp-*`. The real store is `data/designs/` (gitignored). It was empty at the end of this session.
- Chrome 156 is installed at `C:\Program Files\Google\Chrome`. Playwright can use it through the `chrome` channel.
- A server started earlier this session is still running on port 4010 with the old code (see Known issues). Restart it.

## Known issues

- **Stale server on port 4010.** It runs code from before this session's capability changes. Restart it (`Ctrl+C`, then `npm start`) before using `feedback.record` or `feedback.list`.
- The built-in browser pane refused service-worker registration. The offline path is therefore unverified. Check it in Chrome: open the editor, stop the server, reload, and confirm the editor opens with the "cannot reach" banner.
- `loadState` replays the log on a cache miss. Fine at this size.
- The web app loads all species at start-up (about 12). Move search to the server before the library grows.
- The sun value is one number for the whole site. It is not computed from geometry yet.
- Companion radius (2.5 m), canopy-overlap threshold (0.25 m) and the other `rules-1.0` values are unvalidated.
- The seed values are unverified (see B-004). Every trait is graded C on purpose.
- The server has no authentication. It is safe only because it binds to localhost. Do not bind it to a network address.
- The kill test never produced a partial final line in 1,000 kills. Torn-line repair is covered by unit tests that write a partial line by hand.
- The 3D view has no labels. Plants are listed beside it.
- The 3D chunk (about 560 kB, three.js) triggers Vite's size warning.
- The 200-plant test design overlaps heavily, so the side elevation draws one mass. It is a test artefact, not a planning case.
- Mobile layout: checked at 375 px for the side elevation (no horizontal scroll). The 3D view was not checked at phone width.
- `PLAN.md` status column is out of date. The Phase 0 kill and performance gates are now met, and Phase 1 is partly built. PLAN.md may only change through an ADR (AGENTS.md section 2), so this is recorded here until a human accepts a change.

## Open questions

| # | Question | Blocks | Needs |
|---|---|---|---|
| Q1 | Should the sun engine cache per solar hour or per placement point? | Phase 2 design | ADR + human decision |
| Q2 | Federated training: Flower or a custom gRPC and FedAvg? | Phase 3 | ADR |
| Q3 | Should archived designs be included in the plain-text archive by default? (Currently yes, marked `archived: true`.) | archive format | Human decision |
| Q4 | Should the 3D view get a density summary above a plant count, or labels for selected plants only? | Phase 1 polish | Human decision |

## Blocked on human

- **B-001**: Approve the proposed ADRs `0001` to `0009` in `docs/adr/INDEX.md`. Why: accepted ADRs are immutable, so agents cannot approve them. Suggested decision: accept as written.
- **B-002**: Confirm licences (Apache-2.0 code, CC-BY-4.0 data). Why: this affects redistribution. Suggested decision: as proposed.
- **B-003**: Approve `git init` and the first commit. Why: agents do not commit without approval. Suggested: create a repo, commit the current tree as `chore: initial foundation`, with the Co-Authored-By line.
- **B-004**: Verify or replace the four placeholder citations. Why: traits and edges that cite placeholders stay C-grade, and the P0 seed expansion waits on real sources. Suggested decision: keep them C until a curator supplies handbook references.
- **B-005**: Confirm the feedback routes in ADR-0007 and who reviews the curation queue. Why: feedback is only useful if someone reads the queue. Suggested decision: accept the four routes; the project owner reviews the curation queue until a curator is named.

## Verification record (2026-11-01, this session)

- `npm run check`: 11 test files, 139 tests passed; typecheck clean; production build clean (main bundle 277 kB, 3D chunk 562 kB).
- `npm run kill-test -- --iterations 1000 --seed 20261101`: 1,000 kills, 21,746 acknowledged writes, 0 failed, 0 interrupted lines repaired.
- `npm run bench`: 50 plants evaluate in 0.34 ms (median) against a 50 ms gate. 200 plants: 5.7 ms.
- `npm run archive`: regenerated (11 files, 0 designs, since the real store is empty). `sha256sum -c checksums.sha256`: all 11 OK.
- Browser (built-in pane, desktop and 375 px): 3D view draws the starter garden; a drag saved one write (seq 21, then 22) and the store returned the new position; the camera did not orbit; the side elevation toggles axis; the WebGL fallback appears when `getContext` returns null; the Details feedback form renders and shows the stale server's error message; 200 plants: 2 instanced draws per frame, median frame 16.8 ms while zooming; no horizontal scroll at 375 px.
- Not verified: the feedback success path in the browser (needs a restarted server); the offline shell; the 2D-to-3D latency gate; the 60 fps gate on reference hardware.

## Session log (most recent first)

| Date | Agent | Summary | State after |
|---|---|---|---|
| 2026-11-01 | agent (6d7b425e, second pass) | Projection cache; performance check; 1,000-kill test; rule thresholds in a versioned file; feedback log, router and form; archive additions and cold-storage test; offline shell; 3D view and side elevation; lazy loading. Three ADRs (0007 to 0009) proposed. | Phase 0 gate: seed expansion and Playwright still open. Phase 1: 3D built, gates partly measured. Not committed. |
| 2026-11-01 | agent (6d7b425e) | Built the foundation (registry, rules, store, services, adapters, editor). Reorganised the editor into side-navigation windows after user feedback. Fixed a stale-sequence undo bug. Wrote the planning documents. | Foundation working. Not committed. |
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
