package org.plantplanner.survey.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class ArCaptureTest {

    private val origin = ArCapture.WorldPoint(1.0, 0.2, 3.0)

    private fun site() = Site("s1", "Test", "2026-11-26T10:00:00Z", emptyList())

    @Test
    fun northIsTheStartHeadingNegativeZ() {
        val p = ArCapture.toSitePosition(origin, ArCapture.WorldPoint(1.0, 0.2, 1.0))
        assertEquals(2.0, p.north, 1e-9)
        assertEquals(0.0, p.east, 1e-9)
    }

    @Test
    fun eastIsPositiveX() {
        val p = ArCapture.toSitePosition(origin, ArCapture.WorldPoint(4.0, 0.2, 3.0))
        assertEquals(3.0, p.east, 1e-9)
        assertEquals(0.0, p.north, 1e-9)
    }

    @Test
    fun heightIsMeasuredUpFromTheOriginGround() {
        val p = ArCapture.toSitePosition(origin, ArCapture.WorldPoint(1.0, 1.7, 3.0))
        assertEquals(1.5, p.up, 1e-9)
    }

    @Test
    fun theFirstCaptureIsTheOriginAtZero() {
        val s = ArCapture.addPoint(site(), ArCapture.SitePosition(5.0, 5.0, 0.0), id = "a", label = "")
        assertEquals(1, s.points.size)
        assertEquals(0.0, s.points[0].x, 1e-9)
        assertEquals("Origin", s.points[0].label)
    }

    @Test
    fun laterCapturesAreChainedWithTheRightBearing() {
        var s = ArCapture.addPoint(site(), ArCapture.SitePosition(0.0, 0.0, 0.0), id = "a")
        s = ArCapture.addPoint(s, ArCapture.SitePosition(3.0, 0.0, 0.5), id = "b")
        s = ArCapture.addPoint(s, ArCapture.SitePosition(3.0, 4.0, 0.5), id = "c")
        assertEquals(90.0, s.points[1].bearingDeg!!, 1e-6)
        assertEquals(3.0, s.points[1].distanceM!!, 1e-9)
        assertEquals(0.0, s.points[2].bearingDeg!!, 1e-6)
        assertEquals(4.0, s.points[2].distanceM!!, 1e-9)
        assertEquals(3.0, s.points[2].x, 1e-9)
        assertEquals(4.0, s.points[2].y, 1e-9)
        assertEquals(0.5, s.points[2].heightM!!, 1e-9)
    }

    @Test
    fun aPointBelowTheOriginGroundIsRefused() {
        val s = ArCapture.addPoint(site(), ArCapture.SitePosition(0.0, 0.0, 0.0), id = "a")
        try {
            ArCapture.addPoint(s, ArCapture.SitePosition(2.0, 0.0, -0.1), id = "b")
            fail("expected a refusal")
        } catch (e: SurveyException) {
            assertTrue(e.message!!.contains("below"))
        }
    }

    @Test
    fun aPointTooCloseToTheLastIsRefused() {
        val s = ArCapture.addPoint(site(), ArCapture.SitePosition(0.0, 0.0, 0.0), id = "a")
        try {
            ArCapture.addPoint(s, ArCapture.SitePosition(0.01, 0.0, 0.0), id = "b")
            fail("expected a refusal")
        } catch (e: SurveyException) {
            assertTrue(e.message!!.contains("too close"))
        }
    }

    @Test
    fun worldDistanceIsEuclidean() {
        assertEquals(5.0, ArCapture.distance(ArCapture.WorldPoint(0.0, 0.0, 0.0), ArCapture.WorldPoint(3.0, 4.0, 0.0)), 1e-9)
    }
}
