# Contributing

Thank you for helping. This project is careful by design: plant facts need sources, verdicts
need to be explainable, and every result has to say which versions produced it. These rules
protect people who plan real gardens, so please read this page and the principles before you
change anything.

## Start here

1. [AGENTS.md](AGENTS.md): the working rules. They apply to people as well as coding agents.
2. [docs/DESIGN_PRINCIPLES.md](docs/DESIGN_PRINCIPLES.md): the invariants (I1 to I10). Some of them are never negotiable.
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the system is built today.
4. [TODO.md](TODO.md): what is next, and what is blocked on a human decision.

## Ways to contribute

| You want to | Start with |
|---|---|
| Report a bug | A bug report issue. Use the template, and include the version triple shown in the app. |
| Report a security problem | [SECURITY.md](SECURITY.md). Do not use a public issue. |
| Propose a feature | A feature issue. If it touches an invariant, a data format or a capability contract, it needs an ADR (see below). |
| Correct or add plant data | A data curation issue, then a pull request with a source and a grade for every value. |
| Improve the documents | A pull request. Documents are part of the product. |
| Fix code | An issue first for anything larger than a small fix, then a pull request. |

## Set up

You need Node 20.11 or newer. Node 24 is what the project is developed on (see `.nvmrc`).

```bash
npm install
npm run check      # typecheck, all tests, production build
```

`npm run check` is the bar for every change. A change is not done until it passes.

## The change protocol

1. Check [docs/adr/INDEX.md](docs/adr/INDEX.md). A change to an invariant, a stored format or a capability's contract needs an ADR first. Copy [docs/adr/0000-template.md](docs/adr/0000-template.md). An accepted ADR is never edited; a new one supersedes it.
2. Read the matching step in [docs/agent/PROTOCOLS.md](docs/agent/PROTOCOLS.md) if one exists.
3. Write a test that fails without your change, then make the smallest change that passes it.
4. Run `npm run check`.
5. Add a line to [CHANGELOG.md](CHANGELOG.md) under Unreleased.
6. Update [TODO.md](TODO.md) or [HANDOVER.md](HANDOVER.md) if the status of work changed.

## Rules that cannot be bent

These come from the invariants. A pull request that breaks one will not be merged.

- **No horticultural fact in code or prompts.** Facts live in the knowledge graph, with a source and an evidence grade (I1).
- **No learned model decides a verdict.** Verdicts come from the deterministic rules (ADR-0004).
- **Every result carries the version triple** `modelVersion`, `graphVersion`, `ruleConfigVersion` (I4).
- **Design logs are append-only.** Corrections are new events; history is never rewritten (I7).
- **Human decisions are never automated.** Archiving, deleting and promoting data need a person (I3).
- **Every capability is defined once** in `packages/registry`. The HTTP, CLI and MCP adapters are generated from it (I9).
- **MCP is read-only** (ADR-0005).
- **Do not hand-edit generated output.** `data/archive/` is regenerated with `npm run archive`.
- **No secrets or personal data in the repository.** Designs under `data/designs/` and `data/feedback/` are local state and are ignored.

## Plant data

The knowledge graph is curated, and it is reviewed by a person before it changes.

- Every trait and every companion relationship needs a `source_id` that exists in `sources.csv`, and an evidence grade (A, B or C). The loader refuses anything else.
- Do not guess a value. If a value is unknown, leave it out. Missing data is reported as unknown, never filled in.
- A placeholder citation is not a source. Mark the grade honestly.
- Open a data curation issue first, or put the proposal in your pull request description.

See [data/knowledge-graph/SCHEMA.md](data/knowledge-graph/SCHEMA.md) for every column.

## Decisions that a maintainer makes

- Accepting an ADR. Agents and contributors propose; a maintainer accepts.
- Licence changes.
- Changes to [PLAN.md](PLAN.md) and [VERSIONING.md](VERSIONING.md). Propose them through an ADR.
- Curation of the knowledge graph.

## Commits and pull requests

- Use short, clear commit messages in the form `type: summary`, for example `feat:`, `fix:`, `docs:`, `test:`, `chore:`. Explain the why in the body.
- A pull request should do one thing. Keep it small enough to review in one sitting.
- Fill in the pull request template. Say which invariant you checked, if one is touched.
- Keep generated files out of the diff unless the change regenerates them on purpose.

## Code style

- TypeScript in strict mode. Match the style of the file you are changing.
- Comments explain why, not what. Keep the density of the surrounding code.
- Prefer plain text, open formats and explicit decisions over clever code. A new contributor, years from now, should understand a change from the repository alone.

## Conduct and security

Everyone takes part under the [Code of Conduct](CODE_OF_CONDUCT.md). Report security problems privately, as described in [SECURITY.md](SECURITY.md).
