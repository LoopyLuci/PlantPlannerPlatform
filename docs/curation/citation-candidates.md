# Citation candidates for the placeholder sources

**Status: candidates only.** This file lists leads that might replace the four placeholder sources in
`data/knowledge-graph/sources.csv` (HANDOVER B-004). Nothing here is a citation yet. An entry becomes a
source only when a curator has read the full text, confirmed the exact claim it supports, and added a
row to `sources.csv` through a curation proposal (AGENTS.md sections 2 and 6).

The entries below were found by web search on 2026-11-01. The descriptions come from search result
snippets, not from the full documents. Every claim must be checked against the full text before use.

## SRC-EXT-FAMILY: family-level disease sharing in Solanaceae

Claim this would support: crops in the same plant family share pests and soil-borne diseases, so
rotating them is a poor plan (graded B, expert consensus).

| Candidate | Publisher | Link | What the snippet says | Curator to check |
|---|---|---|---|---|
| Plant Rotation in the Garden Based on Plant Families | Penn State Extension | https://extension.psu.edu/plant-rotation-in-the-garden-based-on-plant-families | Family-based rotation table; Solanaceae listed; shared verticillium wilt susceptibility | Confirm the Solanaceae entry and the wording on shared diseases |
| Crop Rotation in Home Gardens | Washington State University Extension (PDF) | https://wpcdn.web.wsu.edu/extension/uploads/sites/68/2015/08/Crop-Rotation-in-Home-Gardens.pdf | Avoid the same family more than once every three to four years | Confirm the interval and the family list |
| Crop rotation | Clemson Home & Garden Information Center | https://hgic.clemson.edu/factsheet/crop-rotation/ | Tomato, pepper and eggplant share pests; rotation helps only with soil-borne pests | Confirm the limit on soil-borne pests (useful for a caveat) |
| Solanaceae crops in rotation (NMSU) | New Mexico State University | https://swyg.nmsu.edu/2015/040415.html | Related crops with shared diseases build up in soil when grown in the same place year after year | Confirm the list of Solanaceae crops |
| Early blight and potato/eggplant | Ohio State University | https://u.osu.edu/bhanr/2017/05 | Early blight fungus can overwinter in some potato and eggplant cultivars | Confirm the claim; it is specific to one disease |

## SRC-EXT-GENERIC: crop competition for nutrients

Claim this would support: neighbouring plants compete for nutrients, water and light, and the balance
depends on resources and spacing (graded B, expert consensus).

| Candidate | Publisher | Link | What the snippet says | Curator to check |
|---|---|---|---|---|
| Rangeland intercropping guidance | University of Arizona, Rangelands journal | https://journals.uair.arizona.edu/index.php/rangelands/article/viewFile/11023/10296 | Limit competition between intercropped species through cultivar choice, spacing and water supply | Confirm it is a peer-reviewed source and the exact claim |
| Competition for light in strip intercropping | Wageningen University & Research | https://research.wur.nl/en/publications/competition-for-light-drives-yield-components-in-strip-intercropp/fingerprints/ | Light competition drives yield components in strip intercropping | Study scope; not a general extension source |
| Designing intercrops for high yield and resource use | Wageningen University & Research (PDF) | https://edepot.wur.nl/512589 | Intercrop design for resource efficiency | Read the sections on nutrients and water |
| Trees and crops compete for nutrients and water | Sri Lankan research (root trenching study) | https://dl.nsf.gov.lk/bitstreams/e0c086b5-424c-44f4-9030-a691a9624a65/download | Species differ in how much they compete | Tree-crop system; use only with a caveat about scope |

## SRC-LORE and SRC-SEED

- **SRC-LORE** (traditional companion-planting lore) is marked "not a citable source" and is graded C by
  definition. No candidate should replace it. Lore claims stay C, and the rules engine must say so.
- **SRC-SEED** is the seed trait table. Each trait value needs its own handbook citation. The search above
  does not cover that work. It needs a curator with access to a reference such as a regional plant
  handbook, and that is the larger part of B-004.

## Next steps for the curator

1. Read the full text of each candidate in the two tables and record the page or section for the claim.
2. Keep only candidates whose claim matches the trait or edge it supports, and drop the rest.
3. Add the accepted rows to `data/knowledge-graph/sources.csv` through a curation proposal, with a
   `citation_status` that names the page, and regenerate the archive with `npm run archive`.
4. Re-grade the edges that cite the placeholders, and record the change in `CHANGELOG.md`.
