# VERSIONING.md

Four version lines. Each follows major.minor.patch, but tracks a different artifact.
The **version triple** is a snapshot of the first three.

## 1. Code (`packages/**`, `apps/**`)

Semantic versioning. `MAJOR`: a breaking change to the capability contract (API, CLI, or MCP), or to a stored format. `MINOR`: additive. `PATCH`: fix.

## 2. Knowledge graph (`kg-YYYY.MM`)

Calendar versioning, for example `kg-2026.10`. Each accepted curation change lands in the next monthly version. Species URNs are stable forever. A retired species keeps a tombstone row. The current graph is `seed-unreviewed` until a human curates it.

## 3. Model (`ivy-<major>.<minor>.<patch>`)

Not in use. The model version is `none` (I2). When a model exists, `MAJOR` means a changed embedding shape or label schema, `MINOR` a retrain with the same shape, `PATCH` a re-export.

## 4. Rule configuration (`rules-<major>.<minor>`)

Currently `rules-1.0`, defined in `packages/core/src/versions.ts` and `rules.ts`. `MAJOR` changes a hard constraint (for example, sun becomes a warning instead of a failure). `MINOR` changes a soft weight or a threshold.

## The version triple

Every result, saved design, exported file and API response carries `(modelVersion, graphVersion, ruleConfigVersion)`. A design created under one triple is reproducible under that triple. A change to any of the three means a new release and a changelog entry.

## Compatibility

| Consumer | Requires |
|---|---|
| Saved design | Same triple, or a migration that reproduces the behaviour |
| Archive | Written with the triple recorded in each `design.json` |
| Feedback record (future) | The graph version it was submitted under, stored with it |
