package org.plantplanner.survey.ui

import org.junit.Assert.assertEquals
import org.junit.Test
import org.plantplanner.survey.model.SurveyPoint

class ElevationGeometryTest {

    private fun point(x: Double, y: Double, height: Double?) =
        SurveyPoint("p", "p", x, y, null, null, height, "")

    @Test
    fun distanceAddsUpAlongThePath() {
        val profile = ElevationGeometry.profile(
            listOf(point(0.0, 0.0, 1.0), point(3.0, 4.0, null), point(3.0, 0.0, 2.0)),
        )
        assertEquals(0.0, profile[0].distanceM, 1e-9)
        assertEquals(5.0, profile[1].distanceM, 1e-9)
        assertEquals(9.0, profile[2].distanceM, 1e-9)
        assertEquals(null, profile[1].heightM)
    }

    @Test
    fun theScalesHaveAFloorOfOneMetre() {
        val flat = ElevationGeometry.profile(listOf(point(0.0, 0.0, null)))
        assertEquals(1.0, ElevationGeometry.totalLengthM(flat), 1e-9)
        assertEquals(1.0, ElevationGeometry.maxHeightM(flat), 1e-9)
    }

    @Test
    fun maxHeightIsTheTallestMeasuredPoint() {
        val profile = ElevationGeometry.profile(
            listOf(point(0.0, 0.0, 1.5), point(2.0, 0.0, 4.0), point(4.0, 0.0, null)),
        )
        assertEquals(4.0, ElevationGeometry.maxHeightM(profile), 1e-9)
    }

    @Test
    fun theStartAndEndOfThePathSitOnTheSidePadding() {
        val width = 300.0
        assertEquals(24.0, ElevationGeometry.toX(0.0, 10.0, width), 1e-9)
        assertEquals(276.0, ElevationGeometry.toX(10.0, 10.0, width), 1e-9)
    }

    @Test
    fun groundIsAtTheBottomAndTheTallestHeightAtTheTop() {
        val height = 160.0
        assertEquals(136.0, ElevationGeometry.toY(0.0, 2.0, height), 1e-9)
        assertEquals(24.0, ElevationGeometry.toY(2.0, 2.0, height), 1e-9)
    }
}
