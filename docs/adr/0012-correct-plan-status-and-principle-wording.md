# ADR-0012: Correct the PLAN status, invariant I5 wording, and the git rule in AGENTS

**Status**: Accepted
**Date**: 2026-11-01
**Deciders**: agent proposed; accepted by the project owner on 2026-11-01
**Affects invariant(s)**: I5 (wording only); no invariant's meaning changes

## Context

Three planning documents are out of date with the code. AGENTS.md (section 2) allows agents to change
`PLAN.md`, `AGENTS.md` and `docs/DESIGN_PRINCIPLES.md` only through an ADR, so the corrections are
proposed here rather than edited in place.

1. **PLAN.md, Phase 0 and Phase 1 status.** The Phase 0 row says the 1,000-point kill test and the 50-plant
   performance check are not yet done. Both pass (`npm run kill-test`, `npm run bench`). The seed graph is
   still 12 species, so Phase 0 remains partial for that reason only. Phase 1 says "not started", but the
   perspective view, drag-to-move through the same write path, and the side elevation are built. The 60 fps
   and 100 ms gates are not measured on reference hardware, so Phase 1 is partial.
2. **DESIGN_PRINCIPLES.md, I5 enforcement.** It names `design.append` as the only write path. No capability
   of that name exists. The store's append function is `DesignStore.append`, which the `design.*` write
   capabilities call. The principle is correct; the name is wrong.
3. **AGENTS.md, section 3, step 7.** It says "Do not commit unless a human asks. This repository is not under
   git yet." The repository has been under git since `1091e96`, is public, and follows the approval rule in
   `CONTRIBUTING.md` (ADR-0010). Agents must not commit unless a human asks, and that rule still holds. Only
   the "not under git" sentence is wrong.

## Decision

1. PLAN.md, Phase 0 status becomes **partial**: the kill test and performance check are done, and the journeys
   J1, J3 and J5 pass in the end-to-end suite, including offline placement writes (ADR-0011). The seed graph
   (12 species) is not curated enough to pass the gate. Phase 1 status becomes **partial**: the perspective view,
   drag-to-move, side elevation and WebGL fallback are built. Measured headless at 200 plants: 60 fps while
   orbiting, and a plan edit acknowledged in a median of 12 ms. Not measured: the 100 ms plan-to-render gate and
   frame rate on reference hardware.
2. DESIGN_PRINCIPLES.md, I5 enforcement reads: "`DesignStore.append` is the only write path to a design log, and
   every `design.*` write capability calls it." The invariant's meaning does not change.
3. AGENTS.md, section 3, step 7 reads: "Do not commit unless a human asks. Commits follow the approval rule in
   `CONTRIBUTING.md`." The line about git is removed.

## Consequences

- Planning documents match the code, so a new agent does not re-do finished gates.
- Accepting this ADR is a documentation change only. No code or data changes.

## Alternatives considered

- **Edit the documents directly.** Not allowed under AGENTS.md section 2.
- **Leave them stale and note it in HANDOVER.** Works, but the next agent reads PLAN.md as authoritative.

## Implementation notes

- On acceptance, the edits in this ADR are made in one commit, and the ADR index is updated.

## Verification

- Every name cited in this ADR is checked by `grep` against the code before acceptance (`DesignStore.append`
  in `packages/store/src/design-store.ts`; no `design.append` in `packages/registry/src/capabilities.ts`).
