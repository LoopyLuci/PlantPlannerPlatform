# ADR index

Accepted ADRs are immutable. New decisions add new ADRs. Every ADR from 0001 to 0012 is **Accepted**, by the project owner on 2026-11-01 (HANDOVER B-001). ADR-0013 is **Proposed** and waits for the project owner.

| # | Title | Status | Affects |
|---|---|---|---|
| 0001 | Append-only, hash-chained event log as the durable substrate | Accepted | I6, I7 |
| 0002 | Plain files now, a spatial database later | Accepted | I5, I6 |
| 0003 | One capability registry; every adapter is generated from it | Accepted | I9 |
| 0004 | Deterministic rules first; any learned model comes last and is optional | Accepted | I1, I2 |
| 0005 | Humans write, agents read: MCP is read-only; archiving is human-gated | Accepted | I3 |
| 0006 | The plain-text archive is a first-class deliverable | Accepted | I10 |
| 0007 | Feedback log and deterministic router: feedback never changes data or rules | Accepted | I1, I3, I4, I7 |
| 0008 | Rule configuration as a versioned file (`config/rules/`) | Accepted | I1, I4 |
| 0009 | Perspective view (three.js), side elevation, and the offline app shell | Accepted | I2, I9 |
| 0010 | Public repository and contribution model | Accepted | I1, I3 |
| 0011 | Offline writes through a browser outbox (J3) | Accepted | I3, I4, I5, I7 |
| 0012 | Correct the PLAN status, I5 wording, and the git rule in AGENTS | Accepted | I5 (wording) |
| 0013 | Prefetch the 3D view's code when the app is idle | Proposed | I2 (loading only) |

To add an ADR: copy `0000-template.md` to `NNNN-short-title.md`, fill it in, add a row here, and ask a human to review it.
