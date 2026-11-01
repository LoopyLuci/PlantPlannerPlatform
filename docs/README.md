# Documentation index

Every document in this repository, grouped by what you are trying to do. If a document
contradicts the code, the code describes what exists, and the document is wrong: please
open an issue (see [CONTRIBUTING.md](../CONTRIBUTING.md)).

## Start

| Document | What it is for |
|---|---|
| [README](../README.md) | What the project is, how to run it, and how the repository is laid out |
| [CONTRIBUTING](../CONTRIBUTING.md) | How to contribute, and the rules that cannot be bent |
| [CODE_OF_CONDUCT](../CODE_OF_CONDUCT.md) | How everyone takes part |
| [SECURITY](../SECURITY.md) | How to report a vulnerability, and what is out of scope |
| [CHANGELOG](../CHANGELOG.md) | What changed, release by release |

## Understand the design

| Document | What it is for |
|---|---|
| [DESIGN_PRINCIPLES](DESIGN_PRINCIPLES.md) | The invariants (I1 to I10) and the rules that enforce them. Changes need an ADR. |
| [ARCHITECTURE](ARCHITECTURE.md) | How the system is built today: packages, request flow, storage, editor |
| [DATA_FORMATS](DATA_FORMATS.md) | Every stored format: event logs, snapshots, archive, feedback, rule files, envelopes |
| [GLOSSARY](GLOSSARY.md) | What each term in the code and the interface means |
| [VERSIONING](../VERSIONING.md) | How code, data, rules and models are versioned, and the version triple |
| [PLAN](../PLAN.md) | The phased roadmap, its exit gates, and the non-goals |

## Decisions

| Document | What it is for |
|---|---|
| [ADR index](adr/INDEX.md) | Every architecture decision record, with its status and the invariants it affects |
| [ADR template](adr/0000-template.md) | How to propose a decision |

Accepted decisions are never edited. A new decision supersedes an old one.

## Work

| Document | What it is for |
|---|---|
| [TODO](../TODO.md) | What is next, by priority, and what is blocked on a person |
| [HANDOVER](../HANDOVER.md) | The current state of the project, open questions, and the session log |
| [Checklist: longevity audit](checklists/longevity-audit.md) | The yearly test that the project can still be understood and rebuilt |
| [Runbook: durability incident](runbooks/durability-incident.md) | What to do when a design's log reports a problem |

## For coding agents

| Document | What it is for |
|---|---|
| [AGENTS](../AGENTS.md) | The operating manual: context order, invariants, file ownership, the work protocol |
| [PROTOCOLS](agent/PROTOCOLS.md) | Step-by-step guides for common tasks: add a capability, change a rule, change a format |
| [ESCALATION](agent/ESCALATION.md) | When to stop and ask a person |

## Data

| Document | What it is for |
|---|---|
| [Knowledge graph schema](../data/knowledge-graph/SCHEMA.md) | Every column of every plant data file |
| [Knowledge graph manifest](../data/knowledge-graph/manifest.json) | The graph version, its status and its licence |
| [Archive README](../data/archive/README.md) | How to read the generated archive without this software (generated; do not edit) |

## Conventions for these documents

- Each document says what it is for in its first line.
- A document links to the others instead of repeating them.
- Facts that can change (test counts, capability counts) are kept in one place, [HANDOVER](../HANDOVER.md), and linked from elsewhere.
