# ADR-0005: Humans write, agents read: MCP is read-only; archiving is human-gated

**Status**: Accepted
**Date**: 2026-11-01
**Deciders**: agent proposed; accepted by the project owner on 2026-11-01
**Affects invariant(s)**: I3

## Context

Agents are useful for answering questions about a design and checking it. Letting an agent
change a design, archive it, or alter the knowledge graph would let it make decisions that belong to a person.

## Decision

The MCP server exposes read-only tools only (ten in this phase). Writes are available through the HTTP
API and the CLI, which a person runs. `design.archive` requires `confirm: true` and is classed as a
human-gated, sensitive write. A registry test rejects any MCP-exposed write.

## Consequences

- An agent can explain, check, and suggest, but cannot change a design.
- Agent-driven editing will need a separate, gated design (ACP directives with human approval) before it is allowed.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Allow writes with a "sensitive" flag | A flag is only a label; agents can still call it in a loop |

## Verification

`validateRegistry` rejects MCP exposure of non-read capabilities; adapter test lists MCP tools and checks that every one is read-only.
