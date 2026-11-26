package org.plantplanner.survey.ui

import org.plantplanner.survey.model.SurveyPoint
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/** How the plan is zoomed and panned. Zoom 1 fits every point; pan is in screen pixels. */
data class PlanView(val zoom: Double = 1.0, val panX: Double = 0.0, val panY: Double = 0.0)

/** The centre of the points in metres, and the scale that fits them on screen at zoom 1. */
data class PlanFrame(val centerX: Double, val centerY: Double, val fitPxPerM: Double)

/**
 * Maps survey metres to screen pixels and back. Plain arithmetic with no Compose types, so the
 * geometry is tested on the JVM. Screen y grows downward, and north is up.
 */
object PlanGeometry {
    const val MIN_ZOOM = 0.5
    const val MAX_ZOOM = 40.0
    private const val PAD_PX = 28.0
    private const val EMPTY_PX_PER_M = 20.0

    fun frame(points: List<SurveyPoint>, width: Double, height: Double): PlanFrame {
        if (points.isEmpty()) return PlanFrame(0.0, 0.0, EMPTY_PX_PER_M)
        val minX = points.minOf { it.x }
        val maxX = points.maxOf { it.x }
        val minY = points.minOf { it.y }
        val maxY = points.maxOf { it.y }
        // A span of at least 2 m stops one point from filling the whole plan.
        val spanX = max(maxX - minX, 2.0)
        val spanY = max(maxY - minY, 2.0)
        val fit = min((width - 2 * PAD_PX) / spanX, (height - 2 * PAD_PX) / spanY).coerceAtLeast(1e-3)
        return PlanFrame((minX + maxX) / 2, (minY + maxY) / 2, fit)
    }

    fun pxPerM(frame: PlanFrame, view: PlanView): Double = frame.fitPxPerM * view.zoom

    fun toScreen(x: Double, y: Double, frame: PlanFrame, view: PlanView, width: Double, height: Double): Pair<Double, Double> {
        val s = pxPerM(frame, view)
        return Pair(
            width / 2 + view.panX + (x - frame.centerX) * s,
            height / 2 + view.panY - (y - frame.centerY) * s,
        )
    }

    fun toWorld(sx: Double, sy: Double, frame: PlanFrame, view: PlanView, width: Double, height: Double): Pair<Double, Double> {
        val s = pxPerM(frame, view)
        return Pair(
            frame.centerX + (sx - width / 2 - view.panX) / s,
            frame.centerY - (sy - height / 2 - view.panY) / s,
        )
    }

    /**
     * Zooms by [factor] so the point under the screen position ([focusX], [focusY]) stays under
     * the finger. The zoom is clamped to [MIN_ZOOM] and [MAX_ZOOM].
     */
    fun zoomAbout(view: PlanView, factor: Double, focusX: Double, focusY: Double, width: Double, height: Double): PlanView {
        val newZoom = (view.zoom * factor).coerceIn(MIN_ZOOM, MAX_ZOOM)
        val f = newZoom / view.zoom
        val cx = width / 2
        val cy = height / 2
        return PlanView(
            zoom = newZoom,
            panX = (focusX - cx) * (1 - f) + view.panX * f,
            panY = (focusY - cy) * (1 - f) + view.panY * f,
        )
    }

    /** The index of the point nearest to the screen position, within [radiusPx], or null. */
    fun hitIndex(
        points: List<SurveyPoint>,
        frame: PlanFrame,
        view: PlanView,
        width: Double,
        height: Double,
        sx: Double,
        sy: Double,
        radiusPx: Double,
    ): Int? {
        var best: Int? = null
        var bestDistance = radiusPx
        points.forEachIndexed { i, p ->
            val (px, py) = toScreen(p.x, p.y, frame, view, width, height)
            val d = hypot(px - sx, py - sy)
            if (d <= bestDistance) {
                best = i
                bestDistance = d
            }
        }
        return best
    }

    /** A round length for the scale bar, close to [targetPx] on screen. */
    fun scaleBarM(pxPerM: Double, targetPx: Double = 100.0): Double {
        val candidates = listOf(0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0)
        return candidates.minBy { kotlin.math.abs(it * pxPerM - targetPx) }
    }
}
