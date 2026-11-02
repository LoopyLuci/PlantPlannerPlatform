# ADR-0013: Prefetch the 3D view's code when the app is idle

**Status**: Accepted
**Date**: 2026-11-01
**Deciders**: agent proposed; accepted by the project owner on 2026-11-01
**Affects invariant(s)**: I2 (the platform works with no learned model; this touches only the web app's loading)

## Context

ADR-0009 loads the 3D view on demand, so the main bundle stays small (277 kB). The 3D chunk is 562 kB. Measured in headless Chromium on this machine (`e2e/perf/plan-to-3d.spec.ts`, `npm run perf:3d`):

- First open of the 3D view: 394 ms, almost all of it loading the chunk.
- Later opens: 37 ms.

PLAN Phase 1 sets a gate of 100 ms from a plan edit to the rendered 3D view. The first open misses it on this machine, and it would miss it by more on a slower network.

## Decision

After the plan has loaded and the browser is idle, the web app fetches the 3D view's chunk in the background, using a dynamic import whose result is discarded. Opening the 3D view then uses the same module. The prefetch is skipped when the browser reports a slow connection (`navigator.connection.saveData` or an effective type of `2g`).

## Consequences

- The first open of the 3D view is expected to drop to the warm-open time, once the prefetch has finished. The cost is one 562 kB download on every visit to the plan, even for users who never open the 3D view.
- The main bundle does not change, so the first paint of the plan is unaffected.
- The change needs no server or data change. It is a loading policy in the web app only.
- It is harder to say "the 3D code loads only when asked" as a rule. Operators on metered connections can opt out through `saveData`.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Keep on-demand loading and accept the first-open miss | The gate is a Phase 1 requirement, and the miss is one of the two things the user sees first. |
| Merge the 3D code into the main bundle | Adds about 560 kB to every first visit, including visits that never open the 3D view. |
| Prefetch on hover over the 3D view button | Helps only a user who hovers first. Too unreliable for a gate. |

## Implementation notes

- `apps/web/src/App.tsx`: after the first design loads, call `import('./views/SceneView')` inside an idle callback (`requestIdleCallback`, falling back to a short timeout), unless `saveData` is set or the effective type is `2g` or slower.
- Nothing else changes. `SceneView` stays the same module, so no code is duplicated.
- Once accepted, record the change as an amendment in the CHANGELOG under Changed, and update `docs/adr/INDEX.md`.

## Verification

- `e2e/perf/plan-to-3d.spec.ts` reports `firstOpenMs`. The gate is met when it is 100 ms or less on a machine with a warm cache. The test should be extended to wait for the prefetch to finish before the first open.
- The main bundle size in the build output must not change.
