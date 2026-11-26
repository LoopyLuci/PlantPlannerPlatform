package org.plantplanner.survey.feedback

import java.net.URLEncoder

/** The two kinds of report the app sends. Each maps to one GitHub label and one title prefix. */
enum class FeedbackKind(val label: String, val titlePrefix: String, val githubLabel: String) {
    FEATURE("Feature request", "[Feature]", "enhancement"),
    BUG("Bug or error", "[Bug]", "bug"),
}

enum class Severity(val label: String) {
    MINOR("Minor"),
    BLOCKING("Blocks my work"),
    DATA_LOSS("Lost or wrong data, or a crash"),
}

/** What the person typed. Bug fields are empty for a feature request. */
data class FeedbackDraft(
    val kind: FeedbackKind,
    val title: String = "",
    val details: String = "",
    val steps: String = "",
    val expected: String = "",
    val actual: String = "",
    val severity: Severity = Severity.BLOCKING,
)

/** Facts about the app and phone, added to the report so a reviewer can reproduce the problem. */
data class DeviceInfo(
    val appVersion: String,
    val androidRelease: String,
    val sdkInt: Int,
    val model: String,
)

/** Turns a draft into the title, body, labels and GitHub link. Pure, so it is unit-tested. */
object FeedbackComposer {
    const val MIN_TITLE = 8
    const val MAX_TITLE = 120
    const val MIN_DETAILS = 10
    const val MAX_FIELD = 2000

    /** Browsers and GitHub limit how long a prefilled link can be, so the body is cut to this. */
    const val MAX_BODY = 3000

    /** The label every report from the app carries, so triage can find them in one filter. */
    const val APP_LABEL = "from-app"

    /** The list of problems to show above the form. An empty list means the draft can be sent. */
    fun validate(draft: FeedbackDraft): List<String> {
        val problems = mutableListOf<String>()
        val title = normalise(draft.title)
        if (title.length < MIN_TITLE) problems += "Give it a short title, at least $MIN_TITLE characters."
        if (title.length > MAX_TITLE) problems += "The title is longer than $MAX_TITLE characters."
        if (draft.details.trim().length < MIN_DETAILS) {
            problems += if (draft.kind == FeedbackKind.BUG) {
                "Describe what went wrong, at least $MIN_DETAILS characters."
            } else {
                "Describe the idea, at least $MIN_DETAILS characters."
            }
        }
        listOf(draft.details, draft.steps, draft.expected, draft.actual).forEach {
            if (it.length > MAX_FIELD) problems += "A field is longer than $MAX_FIELD characters."
        }
        return problems
    }

    fun issueTitle(draft: FeedbackDraft): String = "${draft.kind.titlePrefix} ${normalise(draft.title)}"

    fun labels(draft: FeedbackDraft): String = listOf(draft.kind.githubLabel, APP_LABEL).joinToString(",")

    /** The Markdown body of the issue. Sections are plain text so the report reads well in GitHub. */
    fun body(draft: FeedbackDraft, device: DeviceInfo): String = buildString {
        if (draft.kind == FeedbackKind.BUG) {
            appendLine("**Severity:** ${draft.severity.label}")
            appendLine()
            section("What happened", draft.details)
            section("Steps to reproduce", draft.steps)
            section("What I expected", draft.expected)
            section("What actually happened", draft.actual)
        } else {
            section("The idea", draft.details)
        }
        appendLine("---")
        appendLine("Sent from the Plant Survey app.")
        appendLine("- App version: ${device.appVersion}")
        appendLine("- Android: ${device.androidRelease} (API ${device.sdkInt})")
        appendLine("- Device: ${device.model}")
    }

    /**
     * The link that opens GitHub's new-issue page with the title, body and labels filled in. The
     * person still presses Submit on GitHub, so nothing is sent by the app itself.
     */
    fun issueUrl(repo: String, draft: FeedbackDraft, device: DeviceInfo): String {
        var body = body(draft, device)
        if (body.length > MAX_BODY) {
            body = body.take(MAX_BODY) + "\n\n(The report was cut short here to fit in the link. Add the rest below.)"
        }
        return "https://github.com/$repo/issues/new" +
            "?title=${encode(issueTitle(draft))}" +
            "&labels=${encode(labels(draft))}" +
            "&body=${encode(body)}"
    }

    /** Plain text of the whole report, for copying when the browser cannot be opened. */
    fun plainText(draft: FeedbackDraft, device: DeviceInfo): String =
        issueTitle(draft) + "\n\n" + body(draft, device)

    private fun StringBuilder.section(heading: String, text: String) {
        val value = text.trim()
        if (value.isEmpty()) return
        appendLine("### $heading")
        appendLine(value)
        appendLine()
    }

    private fun normalise(text: String): String = text.trim().replace(Regex("\\s+"), " ")

    /** URL-encodes with %20 for spaces, which every URL parser reads the same way. */
    internal fun encode(value: String): String =
        URLEncoder.encode(value, "UTF-8").replace("+", "%20")
}
