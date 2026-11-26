package org.plantplanner.survey.feedback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.URLDecoder

class FeedbackComposerTest {

    private val device = DeviceInfo("0.1.2", "14", 34, "Xiaomi Redmi Note 12 Pro 5G")
    private val repo = "LoopyLuci/PlantPlannerPlatform"

    private fun bug(title: String = "Save button does nothing", details: String = "Tapping save shows no message at all.") =
        FeedbackDraft(FeedbackKind.BUG, title = title, details = details, severity = Severity.BLOCKING)

    private fun feature(title: String = "Dark mode for the plan", details: String = "Easier to read in sunlight.") =
        FeedbackDraft(FeedbackKind.FEATURE, title = title, details = details)

    @Test
    fun aValidDraftHasNoProblems() {
        assertTrue(FeedbackComposer.validate(bug()).isEmpty())
        assertTrue(FeedbackComposer.validate(feature()).isEmpty())
    }

    @Test
    fun aShortTitleAndShortDetailsAreRefused() {
        val problems = FeedbackComposer.validate(bug(title = "Bad", details = "no"))
        assertEquals(2, problems.size)
    }

    @Test
    fun aTitleOfOnlySpacesIsTooShort() {
        assertFalse(FeedbackComposer.validate(feature(title = "        ")).isEmpty())
    }

    @Test
    fun theTitleGetsAPrefixAndCollapsedSpaces() {
        val title = FeedbackComposer.issueTitle(bug(title = "  Save   does\tnothing  "))
        assertEquals("[Bug] Save does nothing", title)
        assertTrue(FeedbackComposer.issueTitle(feature()).startsWith("[Feature] "))
    }

    @Test
    fun labelsCarryTheKindAndTheAppLabel() {
        assertEquals("bug,from-app", FeedbackComposer.labels(bug()))
        assertEquals("enhancement,from-app", FeedbackComposer.labels(feature()))
    }

    @Test
    fun aBugBodyHasSeverityAndSectionsAndDeviceFacts() {
        val body = FeedbackComposer.body(
            bug().copy(steps = "1. Open a site\n2. Tap save", expected = "A message", actual = "Nothing"),
            device,
        )
        assertTrue(body.contains("**Severity:** Blocks my work"))
        assertTrue(body.contains("### Steps to reproduce"))
        assertTrue(body.contains("### What actually happened"))
        assertTrue(body.contains("- App version: 0.1.2"))
        assertTrue(body.contains("- Android: 14 (API 34)"))
        assertTrue(body.contains("- Device: Xiaomi Redmi Note 12 Pro 5G"))
    }

    @Test
    fun emptyOptionalSectionsAreLeftOut() {
        val body = FeedbackComposer.body(bug(), device)
        assertFalse(body.contains("### Steps to reproduce"))
        assertFalse(body.contains("### What I expected"))
    }

    @Test
    fun aFeatureBodyHasOnlyTheIdea() {
        val body = FeedbackComposer.body(feature(), device)
        assertTrue(body.contains("### The idea"))
        assertFalse(body.contains("Severity"))
    }

    @Test
    fun theIssueLinkPointsAtTheRepoAndDecodesBackToTheReport() {
        val url = FeedbackComposer.issueUrl(repo, bug(), device)
        assertTrue(url.startsWith("https://github.com/LoopyLuci/PlantPlannerPlatform/issues/new?"))
        assertFalse("spaces must be %20, not +", url.contains("+"))

        val query = url.substringAfter("?").split("&").associate {
            val (k, v) = it.split("=", limit = 2)
            k to URLDecoder.decode(v, "UTF-8")
        }
        assertEquals("[Bug] Save button does nothing", query["title"])
        assertEquals("bug,from-app", query["labels"])
        assertTrue(query["body"]!!.contains("Tapping save shows no message at all."))
    }

    @Test
    fun aVeryLongReportIsCutToFitTheLink() {
        val long = bug(details = "x".repeat(5000))
        val url = FeedbackComposer.issueUrl(repo, long, device)
        val body = URLDecoder.decode(url.substringAfter("&body="), "UTF-8")
        assertTrue(body.length <= FeedbackComposer.MAX_BODY + 100)
        assertTrue(body.contains("cut short"))
    }

    @Test
    fun encodingKeepsSpecialCharactersSafe() {
        assertEquals("a%20b%26c%3Dd", FeedbackComposer.encode("a b&c=d"))
    }
}
