# ADR-0010: Public repository and contribution model

**Status**: Proposed
**Date**: 2026-11-01
**Deciders**: agent proposed, human to accept
**Affects invariant(s)**: I3, I1

## Context

The repository was first committed on 2026-11-01 (`1091e96`), and it is to become public so
that other people can contribute and use it. Until now the working rules in `AGENTS.md` were
written for agents working inside a private project. Two of them are now out of date: section 3
says "Do not commit unless a human asks" and "This repository is not under git yet". Nothing says
who may propose plant data, how a change is reviewed, or what a new contributor must read first.
An unclear contribution path is a risk: plant data without a source can harm someone who plans a
real garden.

`AGENTS.md` may only change through an ADR (its file-ownership table), so this decision is proposed
here rather than edited in place.

## Decision

1. The repository is public once a human accepts this ADR, approves the licence (B-002), and confirms
   the owner and name of the GitHub repository (B-007). Until then it stays private.
2. Contributions arrive as pull requests against `main`. Each one must pass `npm run check` in CI on
   Ubuntu and Windows, on Node 20 and Node 24. CI also regenerates the plain-text archive and verifies
   its checksums. A nightly job runs the 1,000-kill test.
3. Plant data changes need a source and an evidence grade for every value. A person reviews them
   before they merge (I1). A value without a source is not merged, and a placeholder citation is not a source.
4. Changes to invariants, stored formats or capability contracts need an ADR first. An accepted ADR is
   never edited. Only a human accepts an ADR.
5. Commits follow `type: summary` (Conventional Commits). A commit or pull request may name an
   assistant as co-author; the human who approves the change is accountable for it.
6. Designs and feedback are local state. They are never committed, and the templates ask contributors
   not to paste them.
7. `AGENTS.md` section 3, step 7 is updated on acceptance to say that commits follow the approval rule in
   `CONTRIBUTING.md`, and that the repository is public. Until then, the old wording is superseded by
   this ADR for everyone who reads both.

## Consequences

- A newcomer finds one entry point (`README.md`), one contribution guide (`CONTRIBUTING.md`), and an index
  of every document (`docs/README.md`).
- Review load falls on the people who accept data and ADRs. Contributors can propose freely, but nothing
  about plant facts merges without that review.
- CI costs run time on every push. The nightly kill test is the slow part, about four minutes.
- A Windows CI runner is needed because the project is developed on Windows. This doubles the matrix.
- Releases and version tags are not covered here. They need their own ADR.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Keep the repository private until a 1.0 release | Contributors cannot help. The planning documents are already written for outside readers. |
| Let agents accept their own ADRs | Violates the rule that human decisions are not automated (I3). |
| Accept plant data from anyone without review | Violates I1: a fact without a source is worse than no fact. |
| Use a wiki for the documents | Wikis are not versioned with the code, and they drift from it. |

## Implementation notes

- Added: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md`, `docs/README.md`, the issue and pull request templates under `.github/`, `.github/workflows/ci.yml`, `.editorconfig` and `.nvmrc`.
- `README.md` is rewritten for readers who have not seen the project before.
- `scripts/docs-links.test.ts` checks that every relative link in the Markdown documents resolves. It runs inside `npm test`.
- Before acceptance: a `LICENSE` file, `package.json` repository fields, and the links in the issue template configuration need the confirmed owner and name.

## Verification

- `npm test` runs the link check, so a broken document link fails the build.
- CI runs `npm run check` on the matrix above. The workflow file was parsed as valid YAML locally. It has not run on GitHub yet.
- The issue and pull request templates were reviewed by hand against the rules in `AGENTS.md` and `docs/DESIGN_PRINCIPLES.md`. No automated check covers them yet.
