# ESCALATION.md: when to stop and ask a human

Pausing costs minutes. A silent invariant violation costs a history that future agents must untangle.

## Triggers (any one is enough)

1. An invariant (`docs/DESIGN_PRINCIPLES.md`) must be broken to finish the task.
2. A test fails and the correct fix is not clear after a reasonable attempt.
3. A stored format must change (`docs/DATA_FORMATS.md`).
4. A capability must be added, removed, or renamed.
5. A file you may not edit alone must change (see AGENTS.md section 2): accepted ADRs, `AGENTS.md`, `PLAN.md`, `VERSIONING.md`, the knowledge-graph data, or the archive.
6. A new dependency is needed. Note it in HANDOVER with its licence and why it is needed.
7. The documents contradict the code, or each other.
8. A health check reports a corrupt log or a snapshot mismatch.
9. A human decision needs to change. Never do this automatically (I3).
10. You cannot find a protocol for the task.
11. You would need a horticultural fact the graph does not contain. Do not invent one. Write a curation request.

## How to escalate

1. Stop the work. Do not make the change and leave a note to do it later.
2. Write it into [HANDOVER.md](../../HANDOVER.md) under "Blocked on human" as `B-00N`, with: what you were doing, the decision needed, your suggested default, and what is blocked.
3. Leave the tree passing `npm run check`, or say clearly that it does not. Do not leave a broken state unexplained.
4. Mark the item `[!]` in TODO.md.
5. Continue with unblocked work if there is any.

## Anti-patterns

- Proceeding with a guess when an invariant is at stake.
- Filing an escalation and then working around it.
- Escalating trivia (naming, formatting).
- Clearing your own escalation. Only a human does that.
