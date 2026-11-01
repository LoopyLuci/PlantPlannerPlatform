# Knowledge graph schema (`ppp-kg-1`)

This folder is the curated plant knowledge graph in plain text. Every file is
UTF-8 CSV (RFC 4180: quoted fields, commas inside quotes) or JSON. You can read
it in any text editor or spreadsheet. No project software is needed.

The graph version (for example `kg-2026.10`) is in `manifest.json`. Every
verdict the platform produces records that version.

## Invariant

Every trait row and every companion edge cites a `source_id` that exists in
`sources.csv`, and carries an evidence `grade`. The loader in
`packages/core/src/knowledge.ts` refuses to build the graph otherwise.

## `manifest.json`

| Field | Meaning |
|---|---|
| `schema` | Format id, `ppp-kg-1` |
| `graph_version` | Version of this graph, `kg-YYYY.MM` |
| `status` | `seed-unreviewed` means no human has verified the values yet |
| `license` | License of the data (CC-BY-4.0) |

## `species.csv`

One row per species. Columns: `urn`, `scientific_name`, `common_name`,
`family`, `growth_form`, `guild_layer`.

- `urn`: stable identifier, `urn:ppp:species:<slug>`. Never reuse a retired urn.
- `guild_layer`: one of `canopy`, `understory`, `groundcover`, `root`.
- `growth_form` containing the word `annual` means the species is grown each
  season, so the hardiness range is not applied to it.

## `traits.csv` (long format)

One row per trait value. Columns: `urn`, `trait`, `value`, `unit`, `source_id`,
`grade`.

| trait | unit | meaning |
|---|---|---|
| `mature_height_m` | m | typical height at maturity |
| `mature_spread_m` | m | typical canopy spread at maturity |
| `planting_spacing_m` | m | recommended centre-to-centre spacing |
| `sun_hours_min` | h | minimum direct sun per day in the growing season |
| `ph_min`, `ph_max` | pH | tolerated soil pH range |
| `hardiness_min`, `hardiness_max` | USDA zone | hardiness range |

A missing trait means **unknown**. Nothing is assumed. The rules report
`unknown` for that check.

## `companion_edges.csv`

Columns: `species_a_urn`, `species_b_urn`, `mechanism`, `direction`,
`source_id`, `grade`, `note`.

- `direction`: `beneficial`, `antagonistic`, or `neutral`.
- `mechanism`: the claimed mechanism in snake_case, for example
  `shared_family_disease_risk`. A claim is never a bare good or bad verdict.

## `sources.csv`

Columns: `source_id`, `title`, `author`, `year`, `url`, `archive_url`,
`license`, `citation_status`, `grade`.

- `citation_status`: `unverified`, `needs_specific_citation`, or a free note.
  A source that is not a citable work (for example lore) says so here.
- `grade`: the evidence grade that applies to everything citing this source.

## Evidence grades

| Grade | Meaning | Weight in companion score |
|---|---|---|
| A | Empirical measurement or authoritative database | 1.0 |
| B | Expert consensus or curated horticultural reference | 0.7 |
| C | Anecdotal, single-source, unverified, or mixed evidence | 0.4 |
