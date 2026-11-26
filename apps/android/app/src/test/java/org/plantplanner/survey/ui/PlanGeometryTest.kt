package org.plantplanner.survey.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.plantplanner.survey.model.SurveyPoint

class PlanGeometryTest {

    private fun point(id: String, x: Double, y: Double) =
        SurveyPoint(id, id, x, y, null, null, null, "")

    @Test
    fun aSinglePointIsCentredWithAFittedScale() {
        val frame = PlanGeometry.frame(listOf(point("a", 3.0, 4.0)), 400.0, 400.0)
        assertEquals(3.0, frame.centerX, 1e-9)
        assertEquals(4.0, frame.centerY, 1e-9)
        // The 2 m minimum span: (400 - 2 * 28) / 2 = 172 px per metre.
        assertEquals(172.0, frame.fitPxPerM, 1e-9)
    }

    @Test
    fun screenAndWorldMapBackToEachOtherAtAnyZoomAndPan() {
        val points = listOf(point("a", 0.0, 0.0), point("b", 10.0, 6.0))
        val frame = PlanGeometry.frame(points, 360.0, 640.0)
        val view = PlanView(zoom = 2.0, panX = 10.0, panY = -5.0)
        val (sx, sy) = PlanGeometry.toScreen(7.5, 2.25, frame, view, 360.0, 640.0)
        val (wx, wy) = PlanGeometry.toWorld(sx, sy, frame, view, 360.0, 640.0)
        assertEquals(7.5, wx, 1e-9)
        assertEquals(2.25, wy, 1e-9)
    }

    @Test
    fun northIsUpOnTheScreen() {
        val frame = PlanFrame(0.0, 0.0, 10.0)
        val (_, syNorth) = PlanGeometry.toScreen(0.0, 5.0, frame, PlanView(), 200.0, 200.0)
        val (_, sySouth) = PlanGeometry.toScreen(0.0, -5.0, frame, PlanView(), 200.0, 200.0)
        assertEquals(true, syNorth < sySouth)
    }

    @Test
    fun zoomKeepsTheFocusedPointUnderTheFinger() {
        val points = listOf(point("a", 0.0, 0.0), point("b", 10.0, 10.0))
        val frame = PlanGeometry.frame(points, 400.0, 400.0)
        val view = PlanView()
        val focusX = 120.0
        val focusY = 300.0
        val before = PlanGeometry.toWorld(focusX, focusY, frame, view, 400.0, 400.0)

        val zoomed = PlanGeometry.zoomAbout(view, 2.5, focusX, focusY, 400.0, 400.0)
        val after = PlanGeometry.toWorld(focusX, focusY, frame, zoomed, 400.0, 400.0)

        assertEquals(before.first, after.first, 1e-9)
        assertEquals(before.second, after.second, 1e-9)
        assertEquals(2.5, zoomed.zoom, 1e-9)
    }

    @Test
    fun zoomIsClampedToTheLimits() {
        val view = PlanView()
        assertEquals(PlanGeometry.MAX_ZOOM, PlanGeometry.zoomAbout(view, 1000.0, 0.0, 0.0, 300.0, 300.0).zoom, 1e-9)
        assertEquals(PlanGeometry.MIN_ZOOM, PlanGeometry.zoomAbout(view, 0.001, 0.0, 0.0, 300.0, 300.0).zoom, 1e-9)
    }

    @Test
    fun aTapFindsTheNearestPointWithinTheRadius() {
        val points = listOf(point("a", 0.0, 0.0), point("b", 10.0, 0.0))
        val frame = PlanFrame(5.0, 0.0, 10.0)
        val view = PlanView()
        // With the centre at x = 5 m and 10 px per metre, point a sits at screen x = 100 - 50 = 50
        // and point b at x = 150, both on the line y = 100.
        assertEquals(0, PlanGeometry.hitIndex(points, frame, view, 200.0, 200.0, 53.0, 100.0, 40.0))
        assertEquals(1, PlanGeometry.hitIndex(points, frame, view, 200.0, 200.0, 147.0, 100.0, 40.0))
        assertNull(PlanGeometry.hitIndex(points, frame, view, 200.0, 200.0, 150.0, 20.0, 40.0))
    }

    @Test
    fun scaleBarIsARoundLengthNearTheTarget() {
        assertEquals(10.0, PlanGeometry.scaleBarM(10.0, 100.0), 1e-9)
        assertEquals(0.1, PlanGeometry.scaleBarM(1000.0, 100.0), 1e-9)
    }
}
