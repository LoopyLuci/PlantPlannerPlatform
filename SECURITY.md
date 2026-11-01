# Security policy

## Supported versions

The project is pre-release. Only the `main` branch receives security fixes.

## Reporting a vulnerability

Do not open a public issue for a security problem. Report it privately:

- On GitHub, use **Security → Report a vulnerability** (private vulnerability reporting).

Please include the version (the three version fields the app shows), the steps to reproduce, and what you expect an attacker to be able to do. We aim to acknowledge a report within a week and to agree a fix and a disclosure date with you.

## What is in scope

- Anything that lets a request reach the local server from outside the machine.
- Writes that bypass the registry, the idempotency rules or the hash chain.
- MCP access that changes data. MCP is read-only by design (ADR-0005).
- Path traversal or prototype pollution through design or placement identifiers.
- A stored file that the server writes or reads outside `data/`.
- Any way to change a design's history without the chain detecting it.

## What is known and out of scope for now

- **There is no authentication.** The server listens on `127.0.0.1` only. Binding it to a network address is unsupported and unsafe. Authentication is planned (PLAN, TODO P2).
- The plant data is unreviewed (`seed-unreviewed`). A wrong trait is a data error, not a security issue, but please report it through the data curation template.
- Designs are local data. Do not share `data/designs/` or `data/feedback/` in public issues; they can contain your garden layout.

## After a fix

Fixes are recorded in [CHANGELOG.md](CHANGELOG.md) under Security. A test that fails without the fix is added to the suite.
