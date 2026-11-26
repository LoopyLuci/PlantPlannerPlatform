package org.plantplanner.survey.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SurveyMoveTest {

    private val origin = SurveyPoint("a", "O", 0.0, 0.0, null, null, null, "")
    private val second = SurveyPoint("b", "B", 4.0, 0.0, 4.0, 90.0, null, "")
    private val third = SurveyPoint("c", "C", 4.0, 3.0, 3.0, 0.0, null, "")
    private val points = listOf(origin, second, third)

    @Test
    fun movingAPointRecomputesItsOwnAndTheNextPointsMeasurements() {
        val moved = Survey.moveTo(points, 1, 0.0, 5.0)!!

        assertEquals(0.0, moved[1].x, 1e-9)
        assertEquals(5.0, moved[1].y, 1e-9)
        assertEquals(5.0, moved[1].distanceM!!, 1e-9)
        assertEquals(0.0, moved[1].bearingDeg!!, 1e-9)

        // The point after it keeps its coordinates, and its measurement is taken from the new place.
        assertEquals(4.0, moved[2].x, 1e-9)
        assertEquals(3.0, moved[2].y, 1e-9)
        assertEquals(Math.sqrt(20.0), moved[2].distanceM!!, 1e-6)
        assertEquals(116.5651, moved[2].bearingDeg!!, 1e-3)
    }

    @Test
    fun bearingIsKeptInZeroToThreeSixty() {
        val moved = Survey.moveTo(points, 1, -3.0, 4.0)!!
        assertEquals(323.1301, moved[1].bearingDeg!!, 1e-3)
    }

    @Test
    fun aSouthwardMoveGivesABearingOf180() {
        val moved = Survey.moveTo(points, 2, 4.0, -3.0)!!
        assertEquals(180.0, moved[2].bearingDeg!!, 1e-9)
        assertEquals(3.0, moved[2].distanceM!!, 1e-9)
    }

    @Test
    fun theOriginCannotMove() {
        assertNull(Survey.moveTo(points, 0, 1.0, 1.0))
    }

    @Test
    fun aMoveOntoANeighbourIsRefused() {
        assertNull(Survey.moveTo(points, 1, 0.01, 0.0))
        assertNull(Survey.moveTo(points, 2, 4.0, 0.0))
    }

    @Test
    fun aMoveToANonFiniteCoordinateIsRefused() {
        assertNull(Survey.moveTo(points, 1, Double.NaN, 0.0))
        assertNull(Survey.moveTo(points, 1, 0.0, Double.POSITIVE_INFINITY))
    }
}
