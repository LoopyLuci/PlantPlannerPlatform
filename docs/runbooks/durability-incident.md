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
|| `tornTail: true`, `chainOk: true` | An interrupted write. Not part of the log. | Nothing. The next write quarantines it. Note it in HANDOVER. |
| `snapshot.status: mismatch` | The snapshot disagrees with the log. The log is still the truth. | Note the design and reason. Do not delete the snapshot without a human. Reads already ignore it. |
| `chainOk: false` | The log has been edited, reordered, truncated, or damaged. | Stop. Do not write to this design. Escalate. |

## 3. Automated watcher (watchdog)

A process runs alongside `npm start` (started through `apps/server/src/main.ts`)
and watches the store and the host process. It is the automated twin of this
runbook: it classifies the platform and reports, and it never repairs data or
applies a human decision.

**Probes** (six, each reported tri-state `ok` / `degraded` / `critical`):

1. `chainIntegrity` — every design log verifies its hash chain.
2. `tornTail` — whether any design has a torn final line.
3. `snapshotConsistent` — whether any snapshot disagrees with its log.
4. `eventLoopLag` — `setImmediate` round-trip latency; p50 over threshold is
   critical, p95 over threshold is degraded.
5. `memoryRss` — process RSS; over `rssLimitMb` is degraded, over `memoryLimitMb`
   is critical.
6. `heartBeat` — the watcher itself is still ticking.

**Status** is derived from the highest-severity probe: `healthy` (all probes
ok), `degraded` (at least one degraded), `critical` (at least one critical).
There is no override: the classification is mechanical and reproducible.

**Configuration** (environment variables read by the server):

| Variable | Meaning | Default |
|---|---|---|
| `PPP_WATCHDOG` | `'0'` disables the watcher | enabled |
| `PPP_WATCHDOG_INTERVAL_MS` | seconds between probe runs | `30_000` |
| `PPP_RSS_LIMIT_MB` | degraded RSS threshold (MiB) | `192` |
| `PPP_MEMORY_LIMIT_MB` | critical RSS threshold (MiB) | `320` |

**External beacon.** On `degraded` or `critical`, the watcher POSTs a copy of the
report to `PPP_DURABILITY_BEACON_URL` if set (Content-Type `application/json`,
with an Idempotency-Key generated per run). A beacon outage is recorded on the
sidecar and must not crash the watcher. The sidecar `data/durability/watchdog.jsonl`
always receives the report, on every run.

**When the watcher is the tripwire.** Because it reports the same store signals as
this runbook, treat a critical report as a *stop and escalate* signal exactly as
you would a `chainOk: false` or a torn tail: the human steps, following steps 1–5
of "If the log is corrupt". The watcher does not write to any design log.

## 4. If the log is corrupt (human steps)

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
