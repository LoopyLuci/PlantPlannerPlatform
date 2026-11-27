package org.plantplanner.survey.model

import java.util.UUID
import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.sqrt

/**
 * Turns AR taps into survey points. ARCore reports positions in its own world frame: metres,
 * y up, with the heading of the phone at session start as -z. The phone has no compass in this
 * path, so north here is that start heading, not true north. The export says so in its readme.
 */
object ArCapture {

    /** A point in the site frame: metres east and north of the origin, and metres up from its ground. */
    data class SitePosition(val east: Double, val north: Double, val up: Double)

    /** A world position as ARCore gives it. */
    data class WorldPoint(val x: Double, val y: Double, val z: Double)

    /** Maps a tap at [point] into the site frame, with [origin] as the origin tap. */
    fun toSitePosition(origin: WorldPoint, point: WorldPoint): SitePosition = SitePosition(
        east = point.x - origin.x,
        north = -(point.z - origin.z),
        up = point.y - origin.y,
    )

    /**
     * Adds a captured point to [site]. The first capture is the origin. Each later capture is
     * measured from the last point, as with the manual flow, so the stored distances and bearings
     * stay consistent with the positions.
     */
    fun addPoint(site: Site, position: SitePosition, id: String = newId(), label: String = ""): Site {
        val last = site.points.lastOrNull()
        if (last == null) {
            val origin = Survey.nextPoint(site, id, label.ifBlank { "Origin" }, 0.0, 0.0, 0.0, "")
            return site.copy(points = listOf(origin))
        }
        if (position.up < 0.0) {
            throw SurveyException("That point is below the origin's ground. Aim at the same floor level as the origin.")
        }
        val dEast = position.east - last.x
        val dNorth = position.north - last.y
        val distance = hypot(dEast, dNorth)
        if (distance < Survey.MIN_SEGMENT_M) {
            throw SurveyException("That is too close to the last point. Move at least 5 cm.")
        }
        var bearing = Math.toDegrees(atan2(dEast, dNorth))
        if (bearing < 0.0) bearing += 360.0
        val point = Survey.nextPoint(site, id, label.ifBlank { "AR ${site.points.size}" }, distance, bearing, position.up, "")
        return site.copy(points = site.points + point)
    }

    /** Straight-line distance between two world points, in metres. */
    fun distance(a: WorldPoint, b: WorldPoint): Double {
        val dx = a.x - b.x
        val dy = a.y - b.y
        val dz = a.z - b.z
        return sqrt(dx * dx + dy * dy + dz * dz)
    }

    private fun newId(): String = "p" + UUID.randomUUID().toString().take(8)
}
