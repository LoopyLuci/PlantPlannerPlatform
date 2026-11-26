package org.plantplanner.survey.feedback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FeedbackJsonTest {

    @Test
    fun aDraftSurvivesASaveAndLoad() {
        val draft = FeedbackDraft(
            kind = FeedbackKind.BUG,
            title = "Save does nothing",
            details = "Nothing shows",
            steps = "Open, tap save",
            expected = "A message",
            actual = "Silence",
            severity = Severity.DATA_LOSS,
        )
        assertEquals(draft, FeedbackJson.draftFromJson(FeedbackJson.draftToJson(draft)))
    }

    @Test
    fun aBadOrMissingDraftIsIgnoredNotCrashed() {
        assertNull(FeedbackJson.draftFromJson(null))
        assertNull(FeedbackJson.draftFromJson(""))
        assertNull(FeedbackJson.draftFromJson("not json"))
        assertNull(FeedbackJson.draftFromJson("""{"kind":"UNKNOWN"}"""))
    }

    @Test
    fun aDraftMissingOptionalFieldsStillLoads() {
        val draft = FeedbackJson.draftFromJson("""{"kind":"FEATURE","title":"Dark mode"}""")!!
        assertEquals(FeedbackKind.FEATURE, draft.kind)
        assertEquals("Dark mode", draft.title)
        assertEquals("", draft.details)
        assertEquals(Severity.BLOCKING, draft.severity)
    }

    @Test
    fun theSentListKeepsOrderAndIsCapped() {
        val many = (1..60).map { SentReport(FeedbackKind.BUG, "Report $it", "2026-11-26T10:00:00Z") }
        val loaded = FeedbackJson.historyFromJson(FeedbackJson.historyToJson(many))
        assertEquals(FeedbackJson.MAX_HISTORY, loaded.size)
        assertEquals("Report 1", loaded.first().title)
    }

    @Test
    fun aBadSentListLoadsAsEmpty() {
        assertTrue(FeedbackJson.historyFromJson("oops").isEmpty())
        assertTrue(FeedbackJson.historyFromJson(null).isEmpty())
    }
}
