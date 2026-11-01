# ADR-0009: Perspective view, side elevation and offline shell

**Status**: Accepted
**Date**: 2026-11-01
**Deciders**: agent proposed; accepted by the project owner on 2026-11-01
**Affects invariant(s)**: I2, I9

## Context

PLAN Phase 1 asks for a WebGL perspective view, a side elevation, and two-way sync with the store.
It also asks that the app open when the local server is down (TODO P1). Both add browser code.
The first adds a rendering library. The second adds a service worker that caches the app's own files.

## Decision

1. The perspective window uses **three.js**, pinned to an exact version (`three@0.186.0`, with matching
   `@types/three`). It is loaded only when the window is opened (a lazy import), so the editor's first
   load does not include it. Each plant is drawn as instanced meshes: one crown and one stem per plant,
   with the crown's colour set by the status from the rules.
2. A drag in the 3D view goes through the same write path as the plan (`design.update_placement`, with the
   same undo and queue). The 3D view previews the drag and restores the saved positions when the drag ends,
   so the store remains the only source of truth.
3. Without WebGL, the side elevation (SVG, read-only except for selection) takes the place of the 3D view.
4. The side elevation is a second window. It draws the same shapes from the same pure model (`scene.ts`).
5. The offline shell is a service worker (`apps/web/public/sw.js`), registered in production builds only.
   It is network-first for the app's own files and serves the last copy when the server is down.
   It never caches `/api/` responses, so a stale design is never shown as current.

## Consequences

- The app depends on one rendering library, pinned. Upgrading it needs a test pass and a new pin.
- Level of detail is chosen by plant count (16, 10 or 6 segments), not by camera distance. Distance-based
  culling is not built.
- The 3D view does not show labels. Every plant is listed beside it, which is also the keyboard path.
- The offline shell caches only the app. Designs and plant data are not cached offline, by design. An
  IndexedDB cache of data would need its own ADR, because it would show data that may be stale.
- The service worker is inert in development, so hot reload is unaffected.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Raw WebGL | More code to maintain for the same result. |
| Babylon.js or a game engine | Heavier, and designed for games rather than planning plans. |
| 3D view as the only plan | Drops the keyboard-accessible 2D plan. |
| Cache design data offline | Would show out-of-date designs as current. |

## Implementation notes

- `apps/web/src/scene.ts`: pure geometry (`plantShape`, `sceneShapes`, `canopySegments`, `worldPosition`, elevation helpers).
- `apps/web/src/Scene3D.ts`: the three.js class (`PlantScene`). It is the only file that imports `three`.
- `apps/web/src/views/SceneView.tsx`, `ElevationView.tsx`, `PlantList.tsx`.
- `apps/web/src/windows.ts`: `scene` and `elevation` views in the side navigation.
- `apps/web/public/sw.js`, registration in `apps/web/src/main.tsx`.

## Verification

- `apps/web/test/scene.test.ts`: geometry rules, LOD thresholds, elevation ordering and height.
- Browser checks (built-in pane, 2026-11-01): the 3D view draws the starter garden; a drag saves one write and
  the position is read back from the store; the side elevation toggles axis; without WebGL the fallback appears;
  200 plants render with two instanced draw calls per frame. The service worker could not be registered in the
  built-in pane, so the offline path has not been exercised. This needs a check in a standard browser.
