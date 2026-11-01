# ADR-0003: One capability registry; every adapter is generated from it

**Status**: Accepted
**Date**: 2026-11-01
**Deciders**: agent proposed; accepted by the project owner on 2026-11-01
**Affects invariant(s)**: I4, I9

## Context

The platform needs an HTTP API, a CLI, an MCP server, and a web client. Maintaining four
hand-written surfaces lets them drift: one allows a write the other refuses, or one forgets
the version triple.

## Decision

Define each capability once in `packages/registry` with its input shape, side effect, scopes and
exposure. A single `dispatch()` enforces validation, idempotency and version stamping. The HTTP
routes, the CLI flags and the MCP tool list are generated from the registry. Adapters contain no
business logic.

## Consequences

- Adding a capability is one definition plus one handler. Every adapter picks it up.
- Mistakes in the definition (missing scope, unguarded write) fail the test suite.
- Deviation: the HTTP API uses camel-case JSON, while the stored formats use snake_case. This is deliberate
  (DATA_FORMATS.md section 6).

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| OpenAPI as the source, generating everything from it | Describes HTTP well but not MCP tool annotations or CLI behaviour |
| Hand-written adapters with shared helpers | Drift is likely and invisible until a user hits it |

## Verification

`validateRegistry` tests; handler parity test; HTTP/CLI/in-process parity test (`adapters.test.ts`).
