package org.plantplanner.survey.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class SurveyTest {

    private val empty = Site("s1", "Plot", "2026-11-26T10:00:00Z", emptyList())

    private fun point(x: Double, y: Double) =
        SurveyPoint("id$x$y", "P", x, y, 1.0, 90.0, null, "")

    @Test
    fun firstPointIsTheOriginAndIgnoresDistanceAndBearing() {
        val p = Survey.nextPoint(empty, "p1", "Corner", 99.0, 359.0, 1.5, "  note  ")
        assertEquals(0.0, p.x, 1e-9)
        assertEquals(0.0, p.y, 1e-9)
        assertNull(p.distanceM)
        assertNull(p.bearingDeg)
        assertEquals(1.5, p.heightM!!, 1e-9)
        assertEquals("note", p.note)
    }

    @Test
    fun blankLabelGetsANumberedDefault() {
        val p = Survey.nextPoint(empty, "p1", "   ", 0.0, 0.0, null, "")
        assertEquals("P1", p.label)
    }

    @Test
    fun bearingNinetyMovesEast() {
        val origin = Survey.nextPoint(empty, "p1", "O", 0.0, 0.0, null, "")
        val site = empty.copy(points = listOf(origin))
        val p = Survey.nextPoint(site, "p2", "E", 10.0, 90.0, null, "")
        assertEquals(10.0, p.x, 1e-9)
        assertEquals(0.0, p.y, 1e-6)
        assertEquals(10.0, p.distanceM!!, 1e-9)
    }

    @Test
    fun bearingZeroMovesNorth() {
        val origin = Survey.nextPoint(empty, "p1", "O", 0.0, 0.0, null, "")
        val p = Survey.nextPoint(empty.copy(points = listOf(origin)), "p2", "N", 4.0, 0.0, null, "")
        assertEquals(0.0, p.x, 1e-6)
        assertEquals(4.0, p.y, 1e-9)
    }

    @Test
    fun rejectsImpossibleMeasurements() {
        val site = empty.copy(points = listOf(point(0.0, 0.0)))
        assertThrows(SurveyException::class.java) { Survey.nextPoint(site, "p", "", 0.0, 10.0, null, "") }
        assertThrows(SurveyException::class.java) { Survey.nextPoint(site, "p", "", -3.0, 10.0, null, "") }
        assertThrows(SurveyException::class.java) { Survey.nextPoint(site, "p", "", 3.0, 361.0, null, "") }
        assertThrows(SurveyException::class.java) { Survey.nextPoint(site, "p", "", 3.0, Double.NaN, null, "") }
        assertThrows(SurveyException::class.java) { Survey.nextPoint(empty, "p", "", 0.0, 0.0, -0.1, "") }
    }

    @Test
    fun squareHasAreaFourAndPerimeterEight() {
        val square = listOf(point(0.0, 0.0), point(2.0, 0.0), point(2.0, 2.0), point(0.0, 2.0))
        assertEquals(4.0, Survey.areaM2(square), 1e-9)
        assertEquals(8.0, Survey.perimeterM(square), 1e-9)
    }

    @Test
    fun twoPointsHaveNoAreaAndOneSideOfPerimeter() {
        val line = listOf(point(0.0, 0.0), point(3.0, 4.0))
        assertEquals(0.0, Survey.areaM2(line), 1e-9)
        assertEquals(5.0, Survey.perimeterM(line), 1e-9)
    }

    @Test
    fun heightRangeIgnoresPointsWithoutHeight() {
        val points = listOf(
            SurveyPoint("a", "A", 0.0, 0.0, null, null, 1.0, ""),
            SurveyPoint("b", "B", 1.0, 0.0, 1.0, 90.0, null, ""),
            SurveyPoint("c", "C", 1.0, 1.0, 1.0, 0.0, 3.5, ""),
        )
        assertEquals(1.0, Survey.heightRangeM(points)!!.first, 1e-9)
        assertEquals(3.5, Survey.heightRangeM(points)!!.second, 1e-9)
        assertNull(Survey.heightRangeM(listOf(point(0.0, 0.0))))
    }
}
