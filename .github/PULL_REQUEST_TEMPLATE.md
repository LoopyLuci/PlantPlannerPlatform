## What and why

<!-- One or two sentences on the change, and the problem it solves. Link the issue if there is one. -->

## Checklist

- [ ] `npm run check` passes on my machine.
- [ ] A test fails without this change, and passes with it (or the change is documentation only).
- [ ] A line is added to `CHANGELOG.md` under Unreleased.
- [ ] `TODO.md` or `HANDOVER.md` is updated if the status of work changed.
- [ ] If this touches an invariant, a stored format or a capability contract, an ADR is proposed in `docs/adr/` and linked here.
- [ ] Every new plant fact has a `source_id` in `sources.csv` and an evidence grade. No values were guessed.
- [ ] Nothing under `data/archive/` was edited by hand (it is regenerated with `npm run archive`).
- [ ] No secrets, personal data, or design data (`data/designs/`, `data/feedback/`) are included.

## Invariants checked

<!-- Which of I1 to I10 does this touch? Write "none" if none. See docs/DESIGN_PRINCIPLES.md. -->
