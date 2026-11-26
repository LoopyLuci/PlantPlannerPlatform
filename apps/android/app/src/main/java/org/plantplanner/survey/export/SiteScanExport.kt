package org.plantplanner.survey.export

import org.json.JSONObject
import org.plantplanner.survey.model.Site
import org.plantplanner.survey.model.SiteJson
import org.plantplanner.survey.model.Survey
import java.io.OutputStream
import java.security.MessageDigest
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * A `.sitescan` file is a zip with four entries:
 *  - manifest.json: format, app version, export time, and the SHA-256 and size of every other entry
 *  - site.json: the full survey, readable by this app again
 *  - points.csv: one row per point, for a spreadsheet
 *  - README.txt: what the files are, in plain words
 * It needs no software from this project to read, which keeps the export plain (invariant I10).
 */
object SiteScanExport {
    const val FORMAT = "plantplanner.sitescan/1"
    /**
     * Octet-stream, not application/zip: MediaStore appends ".zip" to any name saved with a zip MIME
     * type, which would turn "x.sitescan" into "x.sitescan.zip".
     */
    const val MIME_TYPE = "application/octet-stream"
    const val EXTENSION = "sitescan"

    /** A file name that is safe on Android and Windows, for example "Front-garden-1a2b3c4d.sitescan". */
    fun fileName(site: Site): String {
        val safe = site.name.trim()
            .replace(Regex("[^A-Za-z0-9 _-]"), "")
            .trim()
            .replace(Regex("\\s+"), "-")
            .take(40)
            .ifEmpty { "site" }
        return "$safe-${site.id.take(8)}.$EXTENSION"
    }

    fun write(site: Site, appVersion: String, exportedAt: String, out: OutputStream) {
        val payload = linkedMapOf(
            "site.json" to SiteJson.toJson(site).toString(2).toByteArray(Charsets.UTF_8),
            "points.csv" to pointsCsv(site).toByteArray(Charsets.UTF_8),
            "README.txt" to readme(site).toByteArray(Charsets.UTF_8),
        )
        val manifest = JSONObject().apply {
            put("format", FORMAT)
            put("appVersion", appVersion)
            put("exportedAt", exportedAt)
            put("siteId", site.id)
            put("siteName", site.name)
            put("pointCount", site.points.size)
            put("areaM2", Survey.areaM2(site.points))
            put("perimeterM", Survey.perimeterM(site.points))
            put(
                "files",
                JSONObject().apply {
                    payload.forEach { (name, bytes) ->
                        put(name, JSONObject().put("sha256", sha256Hex(bytes)).put("bytes", bytes.size))
                    }
                },
            )
        }
        val manifestBytes = manifest.toString(2).toByteArray(Charsets.UTF_8)

        ZipOutputStream(out).use { zip ->
            val ordered = listOf("manifest.json" to manifestBytes) + payload.toList()
            for ((name, bytes) in ordered) {
                zip.putNextEntry(ZipEntry(name))
                zip.write(bytes)
                zip.closeEntry()
            }
        }
    }

    internal fun pointsCsv(site: Site): String {
        val sb = StringBuilder("label,x_m,y_m,distance_m,bearing_deg,height_m,note\n")
        for (p in site.points) {
            sb.append(csv(p.label)).append(',')
                .append(p.x).append(',')
                .append(p.y).append(',')
                .append(p.distanceM?.toString() ?: "").append(',')
                .append(p.bearingDeg?.toString() ?: "").append(',')
                .append(p.heightM?.toString() ?: "").append(',')
                .append(csv(p.note)).append('\n')
        }
        return sb.toString()
    }

    private fun csv(value: String): String =
        if (value.any { it == ',' || it == '"' || it == '\n' || it == '\r' }) {
            "\"" + value.replace("\"", "\"\"") + "\""
        } else {
            value
        }

    private fun readme(site: Site): String = buildString {
        appendLine("Plant Survey export: ${site.name}")
        appendLine()
        appendLine("Files in this archive:")
        appendLine("- manifest.json: what was exported, when, by which app version, with a SHA-256 for each file.")
        appendLine("- site.json: the full survey. Open it again in Plant Survey.")
        appendLine("- points.csv: one row per point. x and y are metres east and north of the first point.")
        appendLine()
        appendLine("Distances are measured along the bearing from the previous point, in metres.")
        appendLine("Bearings are degrees clockwise from north. Heights are metres above the first point.")
    }

    private fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
