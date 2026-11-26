package org.plantplanner.survey.ui

import org.plantplanner.survey.model.SurveyPoint
import kotlin.math.hypot
import kotlin.math.max

/** One point in the side view: how far along the survey it is, and its height if measured. */
data class ElevationPoint(val distanceM: Double, val heightM: Double?)

/** Maps the survey into the side view. Pure arithmetic, so it is tested on the JVM. */
object ElevationGeometry {
    private const val PAD_PX = 24.0

    /**
     * Distance is the length of the path through the points, measured from the origin. Points
     * are kept in the order they were taken, so the side view follows that path.
     */
    fun profile(points: List<SurveyPoint>): List<ElevationPoint> {
        var along = 0.0
        return points.mapIndexed { i, p ->
            if (i > 0) {
                val prev = points[i - 1]
                along += hypot(p.x - prev.x, p.y - prev.y)
            }
            ElevationPoint(along, p.heightM)
        }
    }

    /** Length of the whole path, at least 1 m so a single point still gets a scale. */
    fun totalLengthM(profile: List<ElevationPoint>): Double =
        max(profile.lastOrNull()?.distanceM ?: 0.0, 1.0)

    /** The tallest measured height, at least 1 m so a flat survey still gets a scale. */
    fun maxHeightM(profile: List<ElevationPoint>): Double =
        max(profile.mapNotNull { it.heightM }.maxOrNull() ?: 0.0, 1.0)

    /** Screen x of a distance. The path starts at the left padding and ends at the right one. */
    fun toX(distanceM: Double, lengthM: Double, width: Double): Double {
        val usable = max(width - 2 * PAD_PX, 1.0)
        return PAD_PX + distanceM / lengthM * usable
    }

    /** Screen y of a height. Zero sits on the ground line at the bottom, the tallest point at the top. */
    fun toY(heightM: Double, maxHeightM: Double, height: Double): Double {
        val usable = max(height - 2 * PAD_PX, 1.0)
        return height - PAD_PX - heightM / maxHeightM * usable
    }
}
