package org.plantplanner.survey.model

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SiteJsonPlantsTest {

    private val plant = PlantPlacement(
        id = "p1", speciesUrn = "urn:sp:apple", commonName = "Apple", scientificName = "Malus",
        xM = 1.25, yM = -2.5, footprintM = 3.0, pinned = true,
    )

    @Test
    fun plantsSurviveASaveAndLoad() {
        val site = Site("s1", "Garden", "2026-11-26T10:00:00Z", emptyList(), listOf(plant))
        assertEquals(listOf(plant), SiteJson.fromJson(SiteJson.toJson(site).toString()).plants)
    }

    @Test
    fun aSiteFileWithoutPlantsStillLoads() {
        val json = SiteJson.toJson(Site("s1", "Garden", "2026-11-26T10:00:00Z", emptyList())).toString()
        val without = JSONObject(json).apply { remove("plants") }.toString()
        assertTrue(SiteJson.fromJson(without).plants.isEmpty())
        assertEquals(0, SiteJson.fromJson(json).plants.size)
    }
}
