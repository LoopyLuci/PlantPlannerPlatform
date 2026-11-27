package org.plantplanner.survey.model

/**
 * One planned plant, imported from a planting plan's `placements.csv`. Positions are metres east
 * (x) and north (y) of the plan origin, the same frame as survey points. [footprintM] is the
 * planned spread. The export carries no height, so none is invented here: the 3D view draws a
 * placeholder canopy sized from the footprint.
 */
data class PlantPlacement(
    val id: String,
    val speciesUrn: String,
    val commonName: String,
    val scientificName: String,
    val xM: Double,
    val yM: Double,
    val footprintM: Double,
    val pinned: Boolean,
)

/** Reads the planting-plan CSV written by `design.export_planting_plan`. */
object PlacementsCsv {

    val HEADER = listOf(
        "placement_id", "species_urn", "common_name", "scientific_name", "x_m", "y_m", "footprint_m", "pinned",
    )

    /**
     * Parses the CSV text. Throws [SurveyException] with a readable message when the header is
     * wrong or a row cannot be read. Rows are never partly imported.
     */
    fun parse(text: String): List<PlantPlacement> {
        val rows = splitRows(text).filter { row -> row.any { it.isNotBlank() } }
        if (rows.isEmpty()) throw SurveyException("The file is empty")
        val header = rows.first().map { it.trim() }
        val index = HEADER.associateWith { name -> header.indexOf(name) }
        val missing = index.filterValues { it < 0 }.keys
        if (missing.isNotEmpty()) {
            throw SurveyException("This is not a planting plan file. Missing columns: ${missing.joinToString()}")
        }
        val plants = rows.drop(1).mapIndexed { i, row ->
            val line = i + 2
            fun cell(name: String): String = row.getOrElse(index.getValue(name)) { "" }.trim()
            fun number(name: String): Double {
                val value = cell(name).toDoubleOrNull()
                    ?: throw SurveyException("Line $line: $name is not a number")
                if (!value.isFinite()) throw SurveyException("Line $line: $name is not a finite number")
                return value
            }
            val id = cell("placement_id")
            if (id.isEmpty()) throw SurveyException("Line $line: placement_id is empty")
            val footprint = number("footprint_m")
            if (footprint < 0) throw SurveyException("Line $line: footprint_m is negative")
            PlantPlacement(
                id = id,
                speciesUrn = cell("species_urn"),
                commonName = cell("common_name"),
                scientificName = cell("scientific_name"),
                xM = number("x_m"),
                yM = number("y_m"),
                footprintM = footprint,
                pinned = cell("pinned").equals("true", ignoreCase = true),
            )
        }
        if (plants.isEmpty()) throw SurveyException("The plan has no plants")
        return plants
    }

    /** RFC 4180 style: quoted cells may hold commas, line breaks and doubled quotes. */
    internal fun splitRows(text: String): List<List<String>> {
        val rows = mutableListOf<List<String>>()
        var row = mutableListOf<String>()
        val cell = StringBuilder()
        var quoted = false
        var i = 0
        while (i < text.length) {
            val c = text[i]
            when {
                quoted -> when {
                    c == '"' && i + 1 < text.length && text[i + 1] == '"' -> { cell.append('"'); i++ }
                    c == '"' -> quoted = false
                    else -> cell.append(c)
                }
                c == '"' -> quoted = true
                c == ',' -> { row.add(cell.toString()); cell.clear() }
                c == '\r' -> Unit
                c == '\n' -> { row.add(cell.toString()); cell.clear(); rows.add(row); row = mutableListOf() }
                else -> cell.append(c)
            }
            i++
        }
        if (quoted) throw SurveyException("The file has an unclosed quote")
        if (cell.isNotEmpty() || row.isNotEmpty()) { row.add(cell.toString()); rows.add(row) }
        return rows
    }
}
