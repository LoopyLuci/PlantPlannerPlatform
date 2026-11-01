# ADR-0011: Offline writes through a browser outbox

**Status**: Proposed
**Date**: 2026-11-01
**Deciders**: agent proposed, human to accept
**Affects invariant(s)**: I3, I4, I5, I7

## Context

Journey J3 in the design transcript asks that a designer load a design, go offline, make three
edits, reload, and come back online, with the edits surviving the reload and syncing without
duplication. Today the editor opens offline from the service worker (ADR-0009, verified by
`e2e/offline.spec.ts`), but every write goes straight to `dispatch()` on the server. With the
server down, an edit fails and is lost.

The server already has what a retry needs: every write takes an idempotency key, and each design
write carries `base_seq`, which the server checks (a stale value returns 409). The browser has
no durable store for pending writes yet.

## Decision

1. While the server is unreachable, the web app keeps each write in an **outbox** in IndexedDB.
   Each entry holds the capability id, its arguments, a client-generated idempotency key, and the
   `base_seq` it was made against. The outbox is the browser's copy of intent, not of truth.
2. The app shows every pending edit as pending. It never shows an edit as saved until the server
   returns an acknowledged envelope.
3. When the server returns, the outbox replays entries in their original order, one at a time,
   with the same idempotency keys. A retry after a lost acknowledgement therefore returns the
   stored result rather than writing twice.
4. If a replayed write hits a 409 (the design moved on while the browser was offline), the entry
   is **not** rebased or merged automatically. It becomes a conflict for a human to resolve (I3).
   Conflict resolution (J4) is a separate ADR.
5. Every replayed result carries the version triple (I4). The event log stays append-only (I7);
   replay adds events, it never rewrites them.
6. Outbox entries are per browser and are not part of the design log. They are local state, like
   `data/designs/`, and are never exported or committed. Clearing site data discards them, and the
   UI says so before it can happen.

## Consequences

- J3 becomes testable end to end: go offline, make edits, reload, come back, and count the events
  on the server (one per edit, no duplicates).
- The client gains a second write path. It must share the request shapes of the registry, so it
  generates its calls from the same capability definitions and does not hand-write them (I9).
- Storage is browser-controlled and can be cleared. The app must say that, and must not promise
  durability it cannot give.
- Replay order and conflicts become a visible part of the UI. This is more work than a retry loop,
  but it keeps a human in charge of anything that conflicts.

## Alternatives considered

- **Keep writes online only.** Simple, but J3 fails and a closed laptop loses work.
- **Service-worker background sync.** Not supported in every browser, and it runs without the page
  visible, so it is harder to show the designer what is pending.
- **Last write wins on reconnect.** Quietly overwrites a second person's or an earlier session's
  edit. Rejected under I3.
- **CRDT now.** Solves concurrent edits, but is far larger than J3 needs. It is listed as P3
  collaboration in TODO.md.

## Implementation notes

- Start with the three placement capabilities used by J3 (`design.add_placement`,
  `design.update_placement`, `design.remove_placement`). Extend to the rest once the path is proven.
- Use IndexedDB, not `localStorage`, because entries are structured and can be large.
- Wrap every read and write of the outbox in try/catch. If IndexedDB is unavailable, writes stay
  online-only and the UI says so.

## Verification

- Playwright: go offline, make three edits, reload, reconnect, and check that the server holds
  exactly three new events with the expected hashes.
- A replay test: kill the replay after the server acknowledges but before the client records it,
  then check that the retry creates no duplicate events.
- A conflict test: change the design on the server while the browser is offline, then check that
  the replayed edit surfaces as a conflict and is not applied.
