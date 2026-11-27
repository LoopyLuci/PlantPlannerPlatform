package org.plantplanner.survey.model

import org.json.JSONArray
import org.json.JSONObject

/** Reads and writes a [Site] as `site.json`. The schema string is versioned so old files stay readable. */
object SiteJson {
    const val SCHEMA = "plantplanner.site/1"

    fun toJson(site: Site): JSONObject = JSONObject().apply {
        put("schema", SCHEMA)
        put("id", site.id)
        put("name", site.name)
        put("createdAt", site.createdAt)
        put("points", JSONArray().apply { site.points.forEach { put(pointToJson(it)) } })
        // Optional: files written before plant import have no "plants" key.
        put("plants", JSONArray().apply { site.plants.forEach { put(plantToJson(it)) } })
    }

    fun fromJson(text: String): Site {
        val root = JSONObject(text)
        if (root.optString("schema") != SCHEMA) {
            throw SurveyException("This file is not a site file this app can read")
        }
        val array = root.getJSONArray("points")
        val points = (0 until array.length()).map { pointFromJson(array.getJSONObject(it)) }
        val plantArray = root.optJSONArray("plants")
        val plants = if (plantArray == null) emptyList() else
            (0 until plantArray.length()).map { plantFromJson(plantArray.getJSONObject(it)) }
        return Site(
            id = root.getString("id"),
            name = root.getString("name"),
            createdAt = root.getString("createdAt"),
            points = points,
            plants = plants,
        )
    }

    private fun plantToJson(p: PlantPlacement): JSONObject = JSONObject().apply {
        put("id", p.id)
        put("speciesUrn", p.speciesUrn)
        put("commonName", p.commonName)
        put("scientificName", p.scientificName)
        put("xM", p.xM)
        put("yM", p.yM)
        put("footprintM", p.footprintM)
        put("pinned", p.pinned)
    }

    private fun plantFromJson(o: JSONObject): PlantPlacement = PlantPlacement(
        id = o.getString("id"),
        speciesUrn = o.optString("speciesUrn", ""),
        commonName = o.optString("commonName", ""),
        scientificName = o.optString("scientificName", ""),
        xM = o.getDouble("xM"),
        yM = o.getDouble("yM"),
        footprintM = o.getDouble("footprintM"),
        pinned = o.optBoolean("pinned", false),
    )

    private fun pointToJson(p: SurveyPoint): JSONObject = JSONObject().apply {
        put("id", p.id)
        put("label", p.label)
        put("x", p.x)
        put("y", p.y)
        put("distanceM", p.distanceM ?: JSONObject.NULL)
        put("bearingDeg", p.bearingDeg ?: JSONObject.NULL)
        put("heightM", p.heightM ?: JSONObject.NULL)
        put("note", p.note)
    }

    private fun pointFromJson(o: JSONObject): SurveyPoint = SurveyPoint(
        id = o.getString("id"),
        label = o.getString("label"),
        x = o.getDouble("x"),
        y = o.getDouble("y"),
        distanceM = o.nullableDouble("distanceM"),
        bearingDeg = o.nullableDouble("bearingDeg"),
        heightM = o.nullableDouble("heightM"),
        note = o.optString("note", ""),
    )

    private fun JSONObject.nullableDouble(key: String): Double? =
        if (!has(key) || isNull(key)) null else getDouble(key)
}
