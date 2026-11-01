# ADR-0006: The plain-text archive is a first-class deliverable

**Status**: Accepted
**Date**: 2026-11-01
**Deciders**: agent proposed; accepted by the project owner on 2026-11-01
**Affects invariant(s)**: I10

## Context

Software does not last 100 years unchanged. Data does, if people can read it without the software
that wrote it. A project whose data is readable only by its own code is a project that dies with that code.

## Decision

`archive.export_plain` regenerates a folder of plain text and CSV: the knowledge graph, every design's
settings, placements (CSV and GeoJSON), and the full event log, with SHA-256 checksums. The folder is
generated, never edited by hand. The README inside explains how to read every file.

## Consequences

- The archive is a second copy of the data, not a backup mechanism. It does not replace the logs.
- Every new durable format needs a plain-text form in the archive before it ships.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Only the native logs | Readable only with this software's verification logic |
| A binary database dump | Not readable without the database engine |

## Verification

`packages/store/test/store.test.ts` (archive checksums verify; CSV header is correct). Annual cold-storage test: see `docs/checklists/longevity-audit.md`.
