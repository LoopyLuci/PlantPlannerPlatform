# ADR-0007: Feedback log and deterministic router

**Status**: Proposed
**Date**: 2026-11-01
**Deciders**: agent proposed, human to accept
**Affects invariant(s)**: I1, I3, I4, I7

## Context

A planner will sometimes disagree with a verdict: the site is different from the data, the
source is out of date, or a threshold is too strict. Those disagreements are valuable, but they
must not change anything by themselves. A rule that quietly learns from feedback would break
I1 (the graph is the source of truth) and I3 (human decisions are never automated).

## Decision

Feedback is a separate, append-only, hash-chained log (`data/feedback/feedback.ndjson`). Each
entry records the design, the placement, the rule being disputed, a reason tag from a closed list,
an optional note, and the version triple in force when it was written. Feedback never changes a
design, the knowledge graph or a rule.

A pure router maps each reason tag to one suggested destination: `curation_queue` (data and source
problems), `rule_review` (threshold problems), `site_update` (the site differs), or `design_note`.
Every route is marked `humanActionRequired: true`. The router is applied when feedback is read,
not when it is written, so a change to the router applies to old feedback without rewriting it (I7).

## Consequences

- Feedback is never lost and never silently applied. A person reads the route and decides.
- The reason list is closed. A new reason needs a change to `FEEDBACK_REASON_TAGS` and to the
  registry enum, and a services test keeps the two equal.
- The curation queue is a list read through `feedback.list`. There is no separate review tool yet.
- Two copies of the chain logic exist (design log and feedback log). They share the hash function
  and the torn-tail rule, and both have tests. Merging them is possible later.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Store feedback inside each design's event log | Mixes opinions with facts, and makes the design history depend on reviews. |
| Let feedback adjust a plant's trait or a rule weight automatically | Violates I1 and I3. A model-like update would also be impossible to audit. |
| Free-text feedback with no reason tags | Cannot be routed or counted. |
| Route on write and store the route | Changing the router would need a rewrite of history (I7). |

## Implementation notes

- `packages/core/src/feedback.ts`: `FEEDBACK_REASON_TAGS`, `FEEDBACK_ROUTES`, `routeFeedback`.
- `packages/store/src/feedback-log.ts`: `FeedbackLog` (read, append, torn-tail quarantine).
- `packages/services/src/handlers.ts`: `feedback.record` (write, idempotent, id derived from the key) and `feedback.list` (read).
- Registry: `feedback.record` is a `write` and is exposed on HTTP, CLI and the web editor. `feedback.list` is a read and is also on MCP.
- The archive writes `feedback/feedback.ndjson` and `feedback/feedback.csv`, with the route in each row.

## Verification

- `packages/store/test/feedback-log.test.ts`: chain, idempotent replay, edited note detected, torn tail quarantined, concurrent appends.
- `packages/services/test/services.test.ts` (feedback block): the design sequence does not change; unknown placements and rules are refused; the route is correct; registry enums equal the core lists.
- `packages/store/test/cold-storage.test.ts`: each feedback hash is recomputed by a reader that imports no project code.
