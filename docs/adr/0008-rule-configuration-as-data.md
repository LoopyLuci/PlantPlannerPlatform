# ADR-0008: Rule configuration as a versioned file

**Status**: Accepted
**Date**: 2026-11-01
**Deciders**: agent proposed; accepted by the project owner on 2026-11-01
**Affects invariant(s)**: I1, I4

## Context

The rule thresholds (companion radius, overlap tolerance, canopy-overlap warning, fallback footprint)
were constants in code. Changing one changed `ruleConfigVersion` only by editing a source
constant, and a reviewer could not see the old and new values side by side. The thresholds are
judgements, not facts, so they need a reviewable home and a version of their own.

## Decision

The thresholds live in `config/rules/<version>.json`. The file has a `version` (for example
`rules-1.0`), and every value must be a positive number. The service context loads the file at start-up,
refuses it if it is malformed, and stamps its version on every result as `ruleConfigVersion` (I4).
The default file is `config/rules/rules-1.0.json`; `PPP_RULES_FILE` overrides it.

A change to any value means a new file with a new version and an ADR. The old file stays in the
repository, so old results can still be explained.

## Consequences

- The thresholds can be reviewed as data, with a diff. Tests read the same file the app reads.
- A bad or missing file stops start-up with a clear message. The app does not fall back silently.
- The archive copies the file into `rules/`, so a reader without this software can see the thresholds in use.
- Companion weights (A 1.0, B 0.7, C 0.4) and the score formula still live in code. They are part of
  `rules-1.0` as a formula, so moving them to the file would be a later change under a new version.
- A "dual-evaluation swap" (run two versions side by side before switching) is not built.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Keep the constants in code | Hides the judgement inside source. Harder to review and compare. |
| Store the thresholds in the knowledge graph | The graph holds cited facts. These are the platform's own judgements, so they carry no source. |
| Read thresholds per design | Two designs would then be evaluated under two rule sets with one version label. |

## Implementation notes

- `packages/core/src/rules.ts`: `RuleConfig` (with `version`), `parseRuleConfig`, `RULE_NAMES`. The `DEFAULT_RULE_CONFIG` constant is removed; every function takes the configuration explicitly.
- `packages/core/src/versions.ts`: `versionTriple(graphVersion, ruleConfigVersion)`.
- `packages/store/src/rule-files.ts`: `readRuleConfig(path)`.
- `packages/services/src/context.ts`: loads the file; `dispatch` stamps its version.
- `packages/store/src/archive.ts`: copies the file to `rules/`.

## Verification

- `packages/core/test/rules.test.ts`: the shipped file loads with every threshold; a missing version or a non-positive value is refused.
- `packages/services/test/services.test.ts`: every envelope, including failures, carries `ruleConfigVersion: rules-1.0`.
- `packages/store/test/cold-storage.test.ts`: the archive contains `rules/rules-1.0.json` with the version.
