package org.plantplanner.survey.model

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/**
 * One surveyed point. The first point of a site is the origin (0, 0) and carries no distance or
 * bearing. Every later point is placed by a measured distance and bearing from the point before it.
 */
data class SurveyPoint(
    val id: String,
    val label: String,
    /** Metres east of the origin. */
    val x: Double,
    /** Metres north of the origin. */
    val y: Double,
    /** Measured distance from the previous point, in metres. Null for the origin. */
    val distanceM: Double?,
    /** Bearing from north, clockwise, in degrees 0 to 360. Null for the origin. */
    val bearingDeg: Double?,
    /** Height above the origin's ground level, in metres. Null when not measured. */
    val heightM: Double?,
    val note: String,
)

/** A survey. Points are kept in the order they were taken. */
data class Site(
    val id: String,
    val name: String,
    /** ISO-8601 UTC instant, for example 2026-11-26T10:00:00Z. */
    val createdAt: String,
    val points: List<SurveyPoint>,
)

class SurveyException(message: String) : IllegalArgumentException(message)

object Survey {

    /**
     * Returns the point that follows the site's last point. For an empty site it returns the origin
     * and ignores [distanceM] and [bearingDeg]. Throws [SurveyException] for values that cannot be
     * a measurement.
     */
    fun nextPoint(
        site: Site,
        id: String,
        label: String,
        distanceM: Double,
        bearingDeg: Double,
        heightM: Double?,
        note: String,
    ): SurveyPoint {
        if (heightM != null && (!heightM.isFinite() || heightM < 0.0)) {
            throw SurveyException("Height must be 0 m or more")
        }
        val cleanLabel = label.trim().ifEmpty { "P${site.points.size + 1}" }
        val last = site.points.lastOrNull()
        if (last == null) {
            return SurveyPoint(id, cleanLabel, 0.0, 0.0, null, null, heightM, note.trim())
        }
        if (!distanceM.isFinite() || distanceM <= 0.0) {
            throw SurveyException("Distance must be greater than 0 m")
        }
        if (!bearingDeg.isFinite() || bearingDeg < 0.0 || bearingDeg > 360.0) {
            throw SurveyException("Bearing must be between 0 and 360 degrees")
        }
        val radians = bearingDeg * PI / 180.0
        return SurveyPoint(
            id = id,
            label = cleanLabel,
            x = last.x + distanceM * sin(radians),
            y = last.y + distanceM * cos(radians),
            distanceM = distanceM,
            bearingDeg = bearingDeg,
            heightM = heightM,
            note = note.trim(),
        )
    }

    /** Area of the polygon through the points in order, closed back to the first. Zero below 3 points. */
    fun areaM2(points: List<SurveyPoint>): Double {
        if (points.size < 3) return 0.0
        var twice = 0.0
        for (i in points.indices) {
            val a = points[i]
            val b = points[(i + 1) % points.size]
            twice += a.x * b.y - b.x * a.y
        }
        return abs(twice) / 2.0
    }

    /** Length of the path through the points. Closed back to the first point once there are 3 or more. */
    fun perimeterM(points: List<SurveyPoint>): Double {
        if (points.size < 2) return 0.0
        var length = 0.0
        for (i in 0 until points.size - 1) {
            length += hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
        }
        if (points.size >= 3) {
            val first = points.first()
            val last = points.last()
            length += hypot(first.x - last.x, first.y - last.y)
        }
        return length
    }

    /** Lowest and highest measured height, or null when no point has a height. */
    fun heightRangeM(points: List<SurveyPoint>): Pair<Double, Double>? {
        val heights = points.mapNotNull { it.heightM }
        if (heights.isEmpty()) return null
        return heights.min() to heights.max()
    }
}
