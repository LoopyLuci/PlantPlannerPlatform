package org.plantplanner.survey.feedback

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** A report the person opened in GitHub. The app keeps only this summary, not the text. */
data class SentReport(val kind: FeedbackKind, val title: String, val sentAt: String)

/** JSON for drafts and the sent list. Pure, so it is unit-tested without Android. */
object FeedbackJson {
    const val MAX_HISTORY = 50

    fun draftToJson(d: FeedbackDraft): String = JSONObject().apply {
        put("kind", d.kind.name)
        put("title", d.title)
        put("details", d.details)
        put("steps", d.steps)
        put("expected", d.expected)
        put("actual", d.actual)
        put("severity", d.severity.name)
    }.toString()

    /** Null when the saved text is not a draft we can read, so a bad value never crashes the form. */
    fun draftFromJson(text: String?): FeedbackDraft? {
        if (text.isNullOrBlank()) return null
        return try {
            val o = JSONObject(text)
            FeedbackDraft(
                kind = FeedbackKind.valueOf(o.getString("kind")),
                title = o.optString("title"),
                details = o.optString("details"),
                steps = o.optString("steps"),
                expected = o.optString("expected"),
                actual = o.optString("actual"),
                severity = Severity.valueOf(o.optString("severity", Severity.BLOCKING.name)),
            )
        } catch (_: Exception) {
            null
        }
    }

    /** Newest first, capped at [MAX_HISTORY]. */
    fun historyToJson(list: List<SentReport>): String {
        val array = JSONArray()
        list.take(MAX_HISTORY).forEach { r ->
            array.put(
                JSONObject()
                    .put("kind", r.kind.name)
                    .put("title", r.title)
                    .put("sentAt", r.sentAt),
            )
        }
        return array.toString()
    }

    fun historyFromJson(text: String?): List<SentReport> {
        if (text.isNullOrBlank()) return emptyList()
        return try {
            val array = JSONArray(text)
            (0 until array.length()).mapNotNull { i ->
                val o = array.optJSONObject(i) ?: return@mapNotNull null
                try {
                    SentReport(FeedbackKind.valueOf(o.getString("kind")), o.optString("title"), o.optString("sentAt"))
                } catch (_: Exception) {
                    null
                }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }
}

/**
 * Drafts and the sent list, kept in this app's private SharedPreferences. Nothing here leaves the
 * phone; the report goes to GitHub only when the person opens and submits the link.
 */
class FeedbackStore(context: Context) {
    private val prefs = context.getSharedPreferences("feedback", Context.MODE_PRIVATE)

    fun loadDraft(kind: FeedbackKind): FeedbackDraft? =
        FeedbackJson.draftFromJson(prefs.getString(draftKey(kind), null))

    fun saveDraft(draft: FeedbackDraft) {
        prefs.edit().putString(draftKey(draft.kind), FeedbackJson.draftToJson(draft)).apply()
    }

    fun clearDraft(kind: FeedbackKind) {
        prefs.edit().remove(draftKey(kind)).apply()
    }

    fun sent(): List<SentReport> = FeedbackJson.historyFromJson(prefs.getString(SENT_KEY, null))

    fun recordSent(report: SentReport) {
        val updated = listOf(report) + sent()
        prefs.edit().putString(SENT_KEY, FeedbackJson.historyToJson(updated)).apply()
    }

    private fun draftKey(kind: FeedbackKind) = "draft_${kind.name}"

    private companion object {
        const val SENT_KEY = "sent"
    }
}
