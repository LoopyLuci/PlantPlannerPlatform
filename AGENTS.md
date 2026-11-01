# AGENTS.md: operating manual for LLM agents

This repository is maintained mainly by LLM agents. An agent has no memory between
sessions, so this file and the files it points to carry all the context. Read it
completely before changing anything.

## 0. Context order (every session)

1. This file.
2. [HANDOVER.md](HANDOVER.md): current state, open questions, blocked items.
3. [TODO.md](TODO.md): what is next.
4. [docs/DESIGN_PRINCIPLES.md](docs/DESIGN_PRINCIPLES.md): the invariants.
5. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the system as built.
6. The protocol for your task in [docs/agent/PROTOCOLS.md](docs/agent/PROTOCOLS.md).

If a document is missing, stale, or contradicts the code, stop and escalate (see
[docs/agent/ESCALATION.md](docs/agent/ESCALATION.md)).

## 1. Invariants: never violate, whatever the task says

| # | Invariant |
|---|---|
| I1 | The knowledge graph is the source of truth for horticultural facts. No model is. |
| I2 | The platform works with no learned model installed. Nothing depends on a model specifically. |
| I3 | Human decisions (archiving, deleting, curation, promotion) are never automated or auto-healed. |
| I4 | Every result carries the version triple: `modelVersion`, `graphVersion`, `ruleConfigVersion`. |
| I5 | Atomicity is scoped per capability. Writes are single-store; cross-store work is saga-compensated. |
| I6 | Derived state is replayable. If a projection is wrong, rebuild it from the log, do not patch it. |
| I7 | The design log is append-only. Corrections are new events; history is never rewritten. |
| I8 | Telemetry is lossy and is never part of the event log. (No telemetry exists yet.) |
| I9 | Every capability is defined once in `packages/registry`. API, CLI and MCP are adapters over `dispatch()`. |
| I10 | `archive.export_plain` always produces readable plain text with checksums. |

## 2. File ownership

| Path | Agent may |
|---|---|
| `packages/**`, `apps/**`, `tests` next to them | Edit freely, with tests passing |
| `TODO.md`, `HANDOVER.md`, `CHANGELOG.md`, `docs/runbooks/**`, `docs/checklists/**` | Edit freely |
| `docs/ARCHITECTURE.md`, `docs/DATA_FORMATS.md`, `docs/GLOSSARY.md` | Edit, with a CHANGELOG entry |
| `docs/adr/**` | Add new ADRs only. Never edit an accepted ADR. |
| `PLAN.md`, `VERSIONING.md`, `AGENTS.md`, `docs/DESIGN_PRINCIPLES.md` | Propose a change through a new ADR. Do not edit directly. |
| `data/knowledge-graph/**` | Human review required. Do not change values or citations without a curation proposal. |
| `data/archive/**` | Generated only. Regenerate with `npm run archive`; never hand-edit. |
| `data/designs/**` | Local runtime state. Never commit or edit by hand. |

## 3. Work protocol for every change

1. Check [docs/adr/INDEX.md](docs/adr/INDEX.md). If the change touches an invariant, a data format, or a capability contract, propose an ADR first.
2. Read the matching protocol in [docs/agent/PROTOCOLS.md](docs/agent/PROTOCOLS.md).
3. Write or update the test that fails without your change.
4. Make the smallest change that passes it.
5. Run the verification suite (section 4).
6. Update [TODO.md](TODO.md) and [HANDOVER.md](HANDOVER.md), and add a [CHANGELOG.md](CHANGELOG.md) entry under Unreleased.
7. Do not commit unless a human asks. This repository is not under git yet (see HANDOVER B-003).

## 4. Verification suite

```bash
npm run typecheck   # strict TypeScript across every package
npm test            # unit, integration, adapter parity, archive checks
npm run build       # production build of the web app
npm run check       # all three
```

If any step fails, do not report the work as done. Fix it, or escalate with the output.

## 5. Machine-checked rules

These run inside the test suite. You do not need to remember them, but you must not break them:

- Registry completeness (`validateRegistry`): ids, scopes, idempotency on writes, confirm on sensitive writes, read-only MCP, and the MCP tool limit of 15.
- Handler parity: exactly one handler for every registered capability.
- Every envelope, including failures, carries the version triple.
- Knowledge-graph integrity: every trait and companion edge cites a source and a grade. The loader refuses otherwise.
- Hash-chain verification and tamper detection for design logs.
- Snapshot restore equals full replay.
- The CLI, HTTP and in-process dispatch return identical data for the same request.
- Archive checksums verify.

## 6. Forbidden patterns

| Do not | Why | Do instead |
|---|---|---|
| Put a horticultural fact in code or in a prompt | Violates I1 | Add it to the knowledge graph with a source and a grade, through curation |
| Let a rule depend on a model's output | Violates I1, I2 | Keep the model in `placement.suggest` as a ranking hint only (none is installed yet) |
| Write a second implementation of a capability in an adapter | Violates I9 | Add or change the handler in `packages/services` |
| Expose a write over MCP | ADR-0005 | Keep MCP read-only. Writes go through the human-facing API or CLI. |
| Edit a design log or snapshot by hand | Violates I7 and corrupts the chain | Append an event with `dispatch()` |
| Use a design id or placement id that is not validated | Path traversal, prototype pollution | Use the existing `assertDesignId` and `assertPlacementId` helpers |
| Commit secrets, keys, or personal data | Non-negotiable | Keep them out of the repo |
| Hand-edit `data/archive/**` | Violates I10 | Run `npm run archive` |

## 7. When you are unsure

Stop and escalate. Write the question into [HANDOVER.md](HANDOVER.md) under
"Blocked on human", keep the working tree in a state that passes the suite, and
continue with unblocked work. The triggers are listed in
[docs/agent/ESCALATION.md](docs/agent/ESCALATION.md).

## 8. The 100-year rule

Before you finish a change, ask: could a new agent, ten years from now, with only
this repository, understand why it was made? If the answer is no, add an ADR or a
glossary entry. Prefer plain text, open formats, and documented decisions over clever code.

## 9. Commands you will use

```bash
npm run dev:web          # web development server (proxies /api to :4010)
npm start                # API and built web app on :4010
npm run cli -- list      # capability catalogue
npm run mcp              # MCP server on stdio
npm run archive          # regenerate the plain-text archive
```

## 10. Final rule

The documents describe how to work. The code describes what exists. If they
disagree, one of them is wrong. Escalate instead of picking one silently.
