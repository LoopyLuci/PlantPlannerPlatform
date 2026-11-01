# ADR-0002: Plain files now, a spatial database later

**Status**: Accepted
**Date**: 2026-11-01
**Deciders**: agent proposed; accepted by the project owner on 2026-11-01
**Affects invariant(s)**: I5, I6

## Context

The roadmap names PostGIS as the spatial store. This build has no database server and
must run on a single machine with no setup. The durable data is small and append-only.

## Decision

Store designs as NDJSON logs and the knowledge graph as CSV, read and written with the Node
standard library. Treat any spatial database as a future projection of the logs, rebuilt on demand (I6),
not as the source of truth.

## Consequences

- Zero setup, and every file can be read with a text editor.
- No spatial queries yet. Collision checks are pairwise, which is fine up to a few hundred plants.
- A spatial index (for example an R-tree) is added as a projection when the pairwise check becomes slow.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| PostgreSQL with PostGIS now | Needs a server; adds setup before the model is proven |
| SQLite now | Would work, but adds a binary format for little gain at this size. Revisit for the encyclopedia. |

## Verification

The health and archive tests read the logs directly. Performance check is a P0 TODO.
