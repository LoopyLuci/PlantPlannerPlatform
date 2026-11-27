package org.plantplanner.survey.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class PlacementsCsvTest {

    private val header = "placement_id,species_urn,common_name,scientific_name,x_m,y_m,footprint_m,pinned\n"

    @Test
    fun readsTheExportedColumns() {
        val plants = PlacementsCsv.parse(
            header + "p1,urn:sp:apple,Apple,Malus domestica,1.5,2.25,3,false\n" +
                "p2,urn:sp:fern,Fern,Dryopteris,0,0,0.5,true\n",
        )
        assertEquals(2, plants.size)
        assertEquals("Apple", plants[0].commonName)
        assertEquals(1.5, plants[0].xM, 1e-9)
        assertEquals(2.25, plants[0].yM, 1e-9)
        assertEquals(3.0, plants[0].footprintM, 1e-9)
        assertFalse(plants[0].pinned)
        assertTrue(plants[1].pinned)
    }

    @Test
    fun quotedCellsKeepCommasQuotesAndLineBreaks() {
        val plants = PlacementsCsv.parse(
            header + "p1,urn:x,\"Rose, climbing\",\"Rosa \"\"Albertine\"\"\",1,1,2,false\n",
        )
        assertEquals("Rose, climbing", plants[0].commonName)
        assertEquals("Rosa \"Albertine\"", plants[0].scientificName)
    }

    @Test
    fun crlfLineEndingsAreAccepted() {
        val plants = PlacementsCsv.parse(header.replace("\n", "\r\n") + "p1,u,A,B,1,2,3,false\r\n")
        assertEquals(1, plants.size)
    }

    @Test
    fun aFileThatIsNotAPlantingPlanIsRefused() {
        expectRefusal("placement_id,x,y\np1,1,2\n", "Missing columns")
    }

    @Test
    fun aBadNumberRefusesTheWholeFile() {
        expectRefusal(header + "p1,u,A,B,1,2,3,false\np2,u,A,B,oops,2,3,false\n", "Line 3")
    }

    @Test
    fun anEmptyPlanIsRefused() {
        expectRefusal(header, "no plants")
    }

    @Test
    fun aNegativeFootprintIsRefused() {
        expectRefusal(header + "p1,u,A,B,1,2,-1,false\n", "negative")
    }

    @Test
    fun anUnclosedQuoteIsRefused() {
        expectRefusal(header + "p1,u,\"A,B,1,2,3,false\n", "unclosed quote")
    }

    private fun expectRefusal(text: String, mustMention: String) {
        try {
            PlacementsCsv.parse(text)
            fail("expected a refusal")
        } catch (e: SurveyException) {
            assertTrue("message was: ${e.message}", e.message!!.contains(mustMention))
        }
    }
}
