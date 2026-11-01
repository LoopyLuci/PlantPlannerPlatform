# Runbook: durability incident

**Trigger:** `platform.get_health` reports `corrupt` or `degraded`, or `design.verify` fails.

**Rule for agents:** do not repair a log, delete a snapshot, or edit anything under `data/designs/`. Report and escalate.

## 1. Read the state

```bash
npm run cli -- platform.get_health
npm run cli -- design.verify --design-id <id>
```

Read the `status` and, for each design, `chainOk`, `chainProblem`, `tornTail`, and `snapshot.status`.

## 2. Classify

| Symptom | Meaning | Action |
|---|---|---|
| `tornTail: true`, `chainOk: true` | An interrupted write. Not part of the log. | Nothing. The next write quarantines it. Note it in HANDOVER. |
| `snapshot.status: mismatch` | The snapshot disagrees with the log. The log is still the truth. | Note the design and reason. Do not delete the snapshot without a human. Reads already ignore it. |
| `chainOk: false` | The log has been edited, reordered, truncated, or damaged. | Stop. Do not write to this design. Escalate. |

## 3. If the log is corrupt (human steps)

1. Stop the server so no writes arrive: `Ctrl+C` in the terminal running `npm start`.
2. Copy the whole `data/designs/` folder to a safe place. Do this before anything else.
3. Find the first bad line. `chainProblem` names the sequence number.
4. Restore the design from a copy you trust (an earlier backup, or the plain-text archive's `events.ndjson` if it was generated before the damage).
5. Run `design.verify` on the restored copy. It must report `chainOk: true`.
6. Start the server again. Record the incident in HANDOVER with: trigger, duration, data lost (or none), root cause, fix, and any test to add.

## 4. Postmortem block (append to HANDOVER)

```
## Postmortem: <date>
- Trigger: <which check>
- Duration: <detected to resolved>
- Data loss: <none | describe>
- Root cause: <one line>
- Fix applied: <one line>
- Follow-up ADR: <number or none>
- Test added: <name, or "none, because ...">
```

## What not to do

- Do not delete `.torn-*.txt` files until you have read them.
- Do not edit a log to make the chain verify. That hides the damage, and it is the one thing this system is built to prevent.
- Do not restart the process repeatedly to clear a status. The status reflects the data, not the process.
