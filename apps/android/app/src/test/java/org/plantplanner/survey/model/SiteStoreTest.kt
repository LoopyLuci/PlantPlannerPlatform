package org.plantplanner.survey.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class SiteStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private fun site(id: String, created: String, withPoint: Boolean) = Site(
        id = id,
        name = "Site $id",
        createdAt = created,
        points = if (withPoint) {
            listOf(SurveyPoint("p1", "Origin", 0.0, 0.0, null, null, 2.0, "north bed"))
        } else {
            emptyList()
        },
    )

    @Test
    fun saveLoadListAndDeleteRoundTrip() {
        val store = SiteStore(tmp.newFolder("sites"))
        val a = site("aaa", "2026-11-01T00:00:00Z", withPoint = true)
        val b = site("bbb", "2026-11-20T00:00:00Z", withPoint = false)
        store.save(a)
        store.save(b)

        assertEquals(a, store.load("aaa"))
        assertEquals(listOf(b, a), store.list())

        store.delete("aaa")
        assertNull(store.load("aaa"))
        assertEquals(listOf(b), store.list())
    }

    @Test
    fun saveReplacesAnExistingSite() {
        val store = SiteStore(tmp.newFolder("sites2"))
        store.save(site("ccc", "2026-11-01T00:00:00Z", withPoint = false))
        val updated = site("ccc", "2026-11-01T00:00:00Z", withPoint = true)
        store.save(updated)
        assertEquals(updated, store.load("ccc"))
        assertEquals(1, store.list().size)
    }

    @Test
    fun rejectsIdsThatWouldEscapeTheFolder() {
        val store = SiteStore(tmp.newFolder("sites3"))
        assertThrows(IllegalArgumentException::class.java) { store.load("../secret") }
        assertThrows(IllegalArgumentException::class.java) { store.delete("a/b") }
    }

    @Test
    fun unreadableFilesAreSkippedNotFatal() {
        val dir = tmp.newFolder("sites4")
        dir.resolve("junk.json").writeText("{ not json")
        val store = SiteStore(dir)
        store.save(site("ddd", "2026-11-01T00:00:00Z", withPoint = false))
        assertEquals(listOf("ddd"), store.list().map { it.id })
    }
}
