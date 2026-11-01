# ADR-0001: Append-only, hash-chained event log as the durable substrate

**Status**: Proposed
**Date**: 2026-11-01
**Deciders**: agent proposed, human to accept
**Affects invariant(s)**: I6, I7

## Context

A garden design is a history of decisions: who placed what, who moved it, what was
changed and then undone. Users need undo, branching later, and a way to see what changed.
A design that is only its latest state cannot answer "why is this here?", and a mutable
record cannot prove it has not been altered.

## Decision

Each design is an append-only log of events. The current state is a fold over the log. Each
event carries the hash of the previous event, so editing, reordering, or deleting any event is
detectable. Every write validates its transition against the current state before it is appended.

## Consequences

- Undo is a new event that restores earlier values. History is never rewritten.
- Reads cost a replay. Snapshots bound this, and each snapshot must verify before use.
- Integrity can be checked by anyone with the file and a SHA-256 tool.
- Schema changes to events need a migration recorded as an event, not an edit.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Mutable rows with an audit table | The audit table can be edited with the data; no tamper evidence |
| A full CRDT document for everything now | Right later for co-editing (Phase 4); overkill for single-user edits today |

## Implementation notes

`packages/store/src/eventlog.ts`, `design-store.ts`; reducer in `packages/core/src/design.ts`.

## Verification

Store tests: edited event, deleted middle event, torn tail, concurrent appends, snapshot-equals-replay.
