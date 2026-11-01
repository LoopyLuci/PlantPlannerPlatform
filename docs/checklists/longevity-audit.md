# Longevity audit: annual gate

Run once a year. A release that fails the cold-storage test does not ship.

## 1. Cold-storage test (highest priority)

**Setup:** someone who has never seen this project. A computer with none of this project's software installed. Only the output of `npm run archive`, in `data/archive/`.

**Time limit:** 4 hours.

**The reader must be able to:**

- [ ] Find every plant trait in `knowledge-graph/traits.csv`, and read its source and grade.
- [ ] Reconstruct a design's placements from `designs/<id>/placements.csv` or `.geojson`.
- [ ] Read a design's history in `events.ndjson` and say what changed and when.
- [ ] Recompute one event's hash by hand, using the rule in `docs/DATA_FORMATS.md`.
- [ ] Verify the checksums with `sha256sum -c checksums.sha256`.
- [ ] Find the schema for every CSV column in `knowledge-graph/SCHEMA.md`.

**If any item fails:** the archive is wrong, not the reader. Fix the export, add a test, and repeat.

## 2. Onboarding test

**Setup:** a new developer with general skills, the repository, and its documents. No verbal handover.

- [ ] Makes a working change to a non-core part (a window, a seed row, a CSV note) within 2 weeks.
- [ ] Explains the invariants in `docs/DESIGN_PRINCIPLES.md` within 4 weeks.

**If it fails:** the documents are wrong. Fix the documents.

## 3. Invariant test

- [ ] `npm test` passes, including the registry, parity, hash-chain, snapshot and archive tests.
- [ ] Every result in the year's logs carries the version triple (I4).
- [ ] No automated change to a human decision (I3). Check the design logs for `DesignArchived` events that have no `confirm` in the history.

## 4. Boring-tech audit

- [ ] No load-bearing part depends on a single cloud service.
- [ ] Every dependency added this year is justified in an ADR or in HANDOVER.
- [ ] The storage formats (NDJSON, CSV, JSON, GeoJSON, plain text) are still readable with standard tools.

## Sign-off

| Check | Owner | Date | Pass / Fail | Notes |
|---|---|---|---|---|
| Cold storage | | | | |
| Onboarding | | | | |
| Invariants | | | | |
| Boring tech | | | | |

The audit passes only if all four pass. A cold-storage failure blocks the release.
