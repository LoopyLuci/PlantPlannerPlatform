# ADR index

Accepted ADRs are immutable. New decisions add new ADRs. Every ADR here is **Proposed**: agents cannot accept their own decisions (HANDOVER B-001).

| # | Title | Status | Affects |
|---|---|---|---|
| 0001 | Append-only, hash-chained event log as the durable substrate | Proposed | I6, I7 |
| 0002 | Plain files now, a spatial database later | Proposed | I5, I6 |
| 0003 | One capability registry; every adapter is generated from it | Proposed | I9 |
| 0004 | Deterministic rules first; any learned model comes last and is optional | Proposed | I1, I2 |
| 0005 | Humans write, agents read: MCP is read-only; archiving is human-gated | Proposed | I3 |
| 0006 | The plain-text archive is a first-class deliverable | Proposed | I10 |
| 0007 | Feedback log and deterministic router: feedback never changes data or rules | Proposed | I1, I3, I4, I7 |
| 0008 | Rule configuration as a versioned file (`config/rules/`) | Proposed | I1, I4 |
| 0009 | Perspective view (three.js), side elevation, and the offline app shell | Proposed | I2, I9 |
| 0010 | Public repository and contribution model | Proposed | I1, I3 |

To add an ADR: copy `0000-template.md` to `NNNN-short-title.md`, fill it in, add a row here, and ask a human to review it.
