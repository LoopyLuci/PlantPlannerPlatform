# Plant Planner Platform: plain-text archive

Generated 2026-11-01T05:08:19.869Z from knowledge graph kg-2026.10 and 0 design(s).

You can read every file here with a text editor or a spreadsheet program.
No project software is needed.

## What is where

- `knowledge-graph/`: the plant knowledge graph. `species.csv` lists plants. `traits.csv`
  lists each trait value with its source and evidence grade. `companion_edges.csv` lists
  plant relationships with their mechanisms. `sources.csv` lists every citation.
  `SCHEMA.md` defines every column.
- `designs/<design_id>/design.json`: the design settings and its current sequence number.
- `designs/<design_id>/placements.csv`: every plant placed, with position in metres.
- `designs/<design_id>/placements.geojson`: the same placements as GeoJSON points.
  Coordinates are metres from the site top-left corner, not GPS. x grows to the east,
  y grows downward on a north-up plan.
- `designs/<design_id>/events.ndjson`: the full history. One JSON object per line.
  Each line has a `hash` and a `prev_hash`. Replaying the lines in order rebuilds the design.
- `rules/`: the rule thresholds in use (`rules-1.0.json`). Every verdict names this version.
- `feedback/feedback.csv`: every recorded disagreement with a verdict, its reason, and where it was routed.
  Routing suggests a human action only. Nothing in this archive was changed by feedback.
- `feedback/feedback.ndjson`: the same records as the hash-chained log, one JSON object per line.
- `checksums.sha256`: a SHA-256 for every file. Check them with `sha256sum -c checksums.sha256`.

## Confidence

Each trait has an evidence grade: A (measured or authoritative), B (expert consensus),
C (anecdotal, unverified, or mixed). Current seed data is C until it is curated.
