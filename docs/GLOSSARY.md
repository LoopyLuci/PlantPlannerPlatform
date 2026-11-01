# GLOSSARY.md

Alphabetical. Every term that appears in code or in a user-facing label is defined here.

| Term | Meaning |
|---|---|
| **Capability** | One operation the platform exposes, defined once in the registry. |
| **Companion edge** | A cited relationship between two species, with a mechanism, direction and grade. |
| **Companion score** | A 0 to 100 summary of companion relationships around one plant. Baseline 50. See the formula in `rules.ts`. |
| **Dispatch** | The single function every adapter calls. It validates, runs the handler, and wraps the result in an envelope. |
| **Evidence grade** | A, B or C. How well a fact is supported. A is measured or authoritative; B is expert consensus; C is anecdotal, unverified or mixed. |
| **Envelope** | The response wrapper: `ok`, `data` or `error`, `version`, `provenance`, `idempotency`. |
| **Feedback** | A planner's recorded disagreement with one verdict, with a reason tag. It never changes data or rules (ADR-0007). |
| **Level of detail (LOD)** | Fewer polygon segments for crowns when there are many plants. Chosen by count in this build, not by distance. |
| **Offline shell** | The app's own files kept by a service worker, so the editor opens when the local server is down. Design data is not kept (ADR-0009). |
| **Reason tag** | The closed reason a person gives for feedback, such as `site_condition_differs`. Each tag has one suggested route. |
| **Route** | Where the router suggests a piece of feedback should go: curation queue, rule review, site update, or design note. Always a human action. |
| **Side elevation** | The plants drawn from one side, at their mature heights. Viewed from the south (across x) or the west (across y). |
| **Footprint** | A plant's current circular area in metres (diameter). Defaults to its planting spacing. |
| **Guild layer** | Where a plant sits in a layered planting: canopy, understory, groundcover or root. |
| **Hash chain** | Each event's hash includes the previous event's hash, so editing any event breaks every later link. |
| **Idempotency key** | A client-supplied key that makes a retry return the original result instead of writing again. |
| **Knowledge graph** | The curated set of species, traits and relationships, with sources, stored as CSV. |
| **Mature spread** | The canopy width a plant reaches. Used to warn about future overlap. |
| **Projection** | The current state of a design, computed from its log. Always rebuildable. |
| **Rule config version** | The version of the rule thresholds, read from `config/rules/<version>.json`. Currently `rules-1.0`. |
| **Projection cache** | A per-design copy of the projected state, kept while the log file is unchanged. Derived data; dropping it costs a replay. |
| **Seq / base_seq** | The position of an event in its log. `base_seq` is the position a client last saw; a mismatch means the client is stale. |
| **Shadow mode** | (Future.) A candidate model scores live traffic without being shown. |
| **Snapshot** | A saved projection with the offset and hash it was taken at, used only after it verifies. |
| **Starter Garden** | The first design a new user gets. It shows placement, a warning, and a cited relationship. |
| **Torn tail** | A final log line left by an interrupted write. It is quarantined, not treated as data. |
| **Verdict** | One rule's result for one placement or pair, with its status, message, and source. |
| **Version triple** | `modelVersion`, `graphVersion`, `ruleConfigVersion`. Stamped on every result (I4). |
