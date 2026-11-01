# DESIGN_PRINCIPLES.md: the constitution

Changes to this file need a human-approved ADR. Each invariant names the test that
enforces it. An invariant without a test is not enforced, and must get one before
the next release.

## Invariants

**I1. The knowledge graph is the source of truth for horticultural facts.**
Rules read the graph. Nothing else states a fact. A verdict without a citation is not a verdict.
*Enforced by:* `buildKnowledgeGraph` refuses uncited traits and edges (`packages/core/test`); every verdict copies `sourceId` and `grade` from its input.

**I2. The platform works with no learned model installed.**
*Enforced by:* `modelVersion` is `none`; suggestions are rule-based and tested without any model (`placement.suggest` tests).

**I3. Human decisions are never automated.**
Archiving needs `confirm: true` and a human-gated determinism class. Nothing removes or rewrites a human choice automatically.
*Enforced by:* `design.archive` refusal test; registry check that `sensitive_write` needs a `confirm` field.

**I4. Every result carries the version triple.**
*Enforced by:* `dispatch` builds the triple on every envelope, including failures (`services.test.ts`).

**I5. Atomicity is scoped per capability.**
A write touches one design log. Cross-store work does not exist yet; when it does, it is a saga.
*Enforced by:* registry check that each capability declares an atomicity class; `DesignStore.append` is the only write path to a design log, and every `design.*` write capability calls it.

**I6. Derived state is replayable.**
The design projection can always be rebuilt from its log.
*Enforced by:* snapshot restore equals full replay (`store.test.ts`).

**I7. The design log is append-only.**
Corrections are new events. Nothing edits a line.
*Enforced by:* the hash chain detects any edit, reorder, or deletion (`store.test.ts`).

**I8. Telemetry is lossy and never replayed.**
None exists yet. The rule is recorded so it is not broken when telemetry is added.

**I9. Every capability is defined once.**
*Enforced by:* `validateRegistry` and the handler parity test. Adapters contain no business logic.

**I10. The plain-text archive is a first-class deliverable.**
*Enforced by:* the archive test (checksums verify, CSV header is correct); `npm run archive` regenerates it.

## Heuristics (defaults, not invariants)

- **Calm by default.** Each window shows one job. Detail is one click away.
- **Fail visibly.** Unknown values are shown as unknown. A degraded state is reported, not hidden.
- **Cite everything.** Every trait and relationship shows its source and grade.
- **Small things.** Small modules and small events are easy to replace.
- **Undo, do not confirm.** Reversible actions get an undo toast. Only irreversible actions ask first.

## Anti-principles (what this project refuses)

- Generative images as design artefacts.
- Facts invented by a model, or by a default value.
- Writes that bypass dispatch, validation, or idempotency.
- Silently overwriting a human decision.
- Hiding a failed write behind a successful-looking screen.
