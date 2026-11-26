# Runbook: triaging reports and feature requests

Reports come from two places: GitHub issue forms (`.github/ISSUE_TEMPLATE/`) and the Android app's
Feedback screen, which opens a prefilled new-issue page. Both end as GitHub issues. This runbook says
how a human moves each one into the work queue (`TODO.md`). Triage is a human decision (invariant I3):
no agent closes, relabels as done, or promotes an issue without a person's instruction.

## Labels

| Label | Source | Meaning |
|---|---|---|
| `bug` | Bug form, Android "Bug or error" | Something does not work as the documents say, or the app shows wrong or lost data |
| `enhancement` | Android "Feature request" | A new capability or a change in behaviour, from a user of the app |
| `proposal` | Platform feature form | A change to behaviour, a rule, or a stored format; may need an ADR |
| `from-app` | Android Feedback screen | Submitted from the Android app. Not yet created on the repo (see below) |
| `documentation`, `accessibility`, `question`, `duplicate`, `invalid`, `wontfix` | Maintainers | As GitHub defines them |

`from-app` is added by the app's link. GitHub ignores a label that does not exist, so until the
label is created the app's reports arrive without it. Create it once with
`gh label create from-app --repo LoopyLuci/PlantPlannerPlatform --color ededed --description "Submitted from the Android app"`
after the owner approves the change to the public repo.

## Severity

The Android form asks for a severity. Map it when triaging:

| App wording | Triage |
|---|---|
| "Data loss" | Top of the queue. Reproduce first; check the survey export and outbox code paths. |
| "Blocks my work" | Next in the queue. Put it in `TODO.md` with the issue number. |
| "Minor" | Queue by value. Often a polish item. |

A report with severity "Data loss" that cannot be reproduced stays open with the label `bug` and a
comment asking for the steps. It is not closed.

## Steps for a maintainer

1. **Check it is a real report.** Remove any personal data, survey site names, or coordinates that
   identify a real property. Ask the reporter for the minimum needed, not for the whole site.
2. **Check for duplicates.** Search open and closed issues by the words in the title. Link the
   original and close the copy as `duplicate`.
3. **Confirm the version.** Android reports carry the app version. If it is older than the latest
   `android-v*` release, ask the reporter to update before investigating.
4. **Reproduce.** Use the steps given. If none are given, say so in a comment and leave the label.
5. **Decide the route.**
   - A bug in shipped behaviour: fix it on a branch, add a failing test first (AGENTS.md section 3),
     and add a CHANGELOG entry under Unreleased.
   - A feature request for the Android app: add it to `TODO.md` under the Android section.
   - A proposal that changes an invariant, a stored format, a capability, or a rule: it needs an ADR
     (`docs/adr/0000-template.md`) before code. Use the `proposal` label.
6. **Record the decision.** Add a comment with the decision and the `TODO.md` line, or the ADR
   number. Keep the issue open until the work it points to is released.
7. **Close with a reason.** Close as completed when the fix is in a release, quoting the release tag,
   or as `wontfix` / `invalid` with a sentence of reason. Do not close silently.

## What is not done here

- The `from-app` label is not created by this runbook. The owner decides.
- No automatic triage. Labels are applied by a person or by the reporter's form choice only.
