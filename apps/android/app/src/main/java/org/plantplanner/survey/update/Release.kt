package org.plantplanner.survey.update

import org.json.JSONArray
import org.json.JSONObject

/** The Android APK attached to a GitHub release. */
data class ReleaseAsset(
    val name: String,
    val downloadUrl: String,
    val sizeBytes: Long,
)

/** An Android release. Only releases tagged `android-v<version>` with an APK count. */
data class Release(
    val tag: String,
    val version: Version,
    val pageUrl: String,
    val notes: String,
    val apk: ReleaseAsset,
)

/** What the updater knows after a check. */
sealed interface UpdateStatus {
    data object NotChecked : UpdateStatus
    data class UpToDate(val current: Version, val latest: Release) : UpdateStatus
    data class Available(val current: Version, val latest: Release) : UpdateStatus
    data class NoRelease(val current: Version) : UpdateStatus
    data class Failed(val message: String) : UpdateStatus
}

object ReleaseParser {
    const val TAG_PREFIX = "android-v"

    /** Reads GitHub's `GET /repos/{owner}/{repo}/releases` response and keeps usable Android releases. */
    fun parseReleases(json: String): List<Release> {
        val array = JSONArray(json)
        val releases = mutableListOf<Release>()
        for (i in 0 until array.length()) {
            parseOne(array.getJSONObject(i))?.let { releases += it }
        }
        return releases
    }

    /** The newest usable Android release, or null when there is none. */
    fun newest(releases: List<Release>): Release? = releases.maxByOrNull { it.version }

    /** Compares [current] with [latest] and reports whether an update exists. */
    fun status(current: Version, latest: Release?): UpdateStatus = when {
        latest == null -> UpdateStatus.NoRelease(current)
        latest.version > current -> UpdateStatus.Available(current, latest)
        else -> UpdateStatus.UpToDate(current, latest)
    }

    private fun parseOne(o: JSONObject): Release? {
        if (o.optBoolean("draft", false)) return null
        val tag = o.optString("tag_name", "")
        if (!tag.startsWith(TAG_PREFIX)) return null
        val version = Version.parse(tag) ?: return null
        val assets = o.optJSONArray("assets") ?: return null
        var apk: ReleaseAsset? = null
        for (i in 0 until assets.length()) {
            val a = assets.getJSONObject(i)
            val name = a.optString("name", "")
            if (name.endsWith(".apk", ignoreCase = true) && apk == null) {
                apk = ReleaseAsset(
                    name = name,
                    downloadUrl = a.optString("browser_download_url", ""),
                    sizeBytes = a.optLong("size", 0L),
                )
            }
        }
        val found = apk ?: return null
        if (found.downloadUrl.isEmpty()) return null
        return Release(
            tag = tag,
            version = version,
            pageUrl = o.optString("html_url", ""),
            notes = o.optString("body", ""),
            apk = found,
        )
    }
}
