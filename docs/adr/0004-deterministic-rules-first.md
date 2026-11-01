# ADR-0004: Deterministic rules first; any learned model comes last and is optional

**Status**: Proposed
**Date**: 2026-11-01
**Deciders**: agent proposed, human to accept
**Affects invariant(s)**: I1, I2

## Context

Planting decisions must be explainable. A model that says "tomato and potato are bad
together" without a reason cannot be audited, and a wrong guess looks the same as a right one.
Models also change over time, which would move verdicts without notice.

## Decision

All verdicts come from explicit rules over cited data: hardiness, sun, soil pH, footprint and
spacing geometry, and companion mechanisms. Each verdict names its rule, its inputs, its source and
its grade. A learned model, if added later, may only rank or propose candidates, and must never
produce a verdict. Nothing is built on a model today.

## Consequences

- Every verdict can be checked by reading one line of code and one row of data.
- Unknown data is reported as unknown, not replaced with a default.
- Coverage is limited by the curation effort, which is the honest limit.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| A language model writes the verdicts | Cannot be audited; cannot be reproduced across model versions |
| Hand-tuned weights with no citations | Looks precise but hides where each number came from |

## Verification

`packages/core/test/rules.test.ts`: each rule has a pass, a fail, and an unknown case; the seed graph test requires a source for every fact.
