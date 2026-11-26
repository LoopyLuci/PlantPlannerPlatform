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
    }

    fun fromJson(text: String): Site {
        val root = JSONObject(text)
        if (root.optString("schema") != SCHEMA) {
            throw SurveyException("This file is not a site file this app can read")
        }
        val array = root.getJSONArray("points")
        val points = (0 until array.length()).map { pointFromJson(array.getJSONObject(it)) }
        return Site(
            id = root.getString("id"),
            name = root.getString("name"),
            createdAt = root.getString("createdAt"),
            points = points,
        )
    }

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
