# PROTOCOLS.md: step-by-step for common tasks

Each protocol assumes you have read [AGENTS.md](../../AGENTS.md) and [HANDOVER.md](../../HANDOVER.md).
Each one ends with the verification step and a HANDOVER update.

## P1: add a capability

1. Add the definition to `packages/registry/src/capabilities.ts`: id (`area.action`), input fields, side effect, determinism, scopes, atomicity, idempotency (required for every write), recovery behaviour, and exposure. Only read capabilities may be exposed over MCP.
2. Add a handler with the same id to `HANDLERS` in `packages/services/src/handlers.ts`.
3. Add a test in `packages/services/test/services.test.ts` (happy path and one refusal).
4. Run `npm run check`. The registry and parity tests must pass.
5. Add a CHANGELOG entry and update HANDOVER.

Do not hand-write an adapter. The CLI flags, HTTP route and MCP tool come from the definition.

## P2: add a species or trait to the knowledge graph

1. Do not edit `data/knowledge-graph/` for a new fact without a source. Every trait and edge needs a `source_id` that exists in `sources.csv`, plus a grade.
2. Add the rows to `species.csv`, `traits.csv` or `companion_edges.csv`, and any new source to `sources.csv`. Keep the existing seed status unless a curator has verified the value.
3. Run `npm test`. The loader refuses uncited or malformed rows.
4. If the change alters a value already shown to users, raise it in HANDOVER under "Blocked on human" for curator review.

## P3: change a rule

1. Write the new test first, with a case the old rule gets wrong.
2. Change the rule in `packages/core/src/rules.ts`. Keep the verdict shape. Every verdict copies its source and grade.
3. If the change alters what a status means or moves a threshold, add a new file `config/rules/rules-<version>.json` with the new version and record an ADR (ADR-0008). Point `createContext` at the new file. Do not edit the old file.
4. Run `npm run check`. Note in HANDOVER that existing designs may evaluate differently now.

## P4: change the storage format

This is a breaking change to stored data. Stop and escalate (ESCALATION.md, trigger 3). Do not proceed without an ADR and a migration plan that is recorded as events.

## P5: update the editor

1. Put logic that does not touch the DOM in `apps/web/src/model.ts` and test it in `apps/web/test`.
2. Add a window to `apps/web/src/windows.ts` only when the user has asked for it. Each window is one job.
3. Every write goes through `write()` in `App.tsx`, so the queue, the sequence guard and undo all apply.
4. Run `npm run build`, then check the affected window in the browser.

## P6: regenerate the plain-text archive

1. `npm run archive`.
2. Check `data/archive/checksums.sha256` with `sha256sum -c` (Git Bash) or an equivalent tool.
3. Record the generation time and design count in HANDOVER.

## P7: investigate a health warning

1. Open the Data health window, or run `npm run cli -- platform.get_health`.
2. For a torn tail: no action. The next write quarantines it. Note the file in HANDOVER.
3. For a snapshot mismatch: do not repair. Note the design and the reason. Delete the snapshot only with a human's approval, and rebuild it from the log.
4. For a corrupt log: stop. Escalate with the `design.verify` output. See [docs/runbooks/durability-incident.md](../runbooks/durability-incident.md).

## P8: onboard to a new area

1. Read the ADRs in `docs/adr/` that touch the area.
2. Read the tests for the area. They describe the expected behaviour.
3. Run `npm run start`, open the app, and exercise the feature.
4. If something is unclear after that, escalate. Do not guess.
