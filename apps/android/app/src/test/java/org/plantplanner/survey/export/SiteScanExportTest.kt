package org.plantplanner.survey.export

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.plantplanner.survey.model.Site
import org.plantplanner.survey.model.SiteJson
import org.plantplanner.survey.model.SurveyPoint
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.util.zip.ZipInputStream

class SiteScanExportTest {

    private val site = Site(
        id = "11112222-3333-4444-5555-666677778888",
        name = "Front garden",
        createdAt = "2026-11-26T10:00:00Z",
        points = listOf(
            SurveyPoint("p1", "Corner, north", 0.0, 0.0, null, null, 1.2, ""),
            SurveyPoint("p2", "East \"fence\"", 4.0, 0.0, 4.0, 90.0, null, "gate"),
            SurveyPoint("p3", "South-east", 4.0, -3.0, 3.0, 180.0, 0.4, ""),
        ),
    )

    private fun unzip(bytes: ByteArray): LinkedHashMap<String, ByteArray> {
        val out = LinkedHashMap<String, ByteArray>()
        ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                out[entry.name] = zip.readBytes()
            }
        }
        return out
    }

    private fun sha256(bytes: ByteArray) =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    private fun export(): LinkedHashMap<String, ByteArray> {
        val buf = ByteArrayOutputStream()
        SiteScanExport.write(site, "0.1.0", "2026-11-26T10:00:00Z", buf)
        return unzip(buf.toByteArray())
    }

    @Test
    fun containsManifestFirstAndThePayloadFiles() {
        val entries = export()
        assertEquals(listOf("manifest.json", "site.json", "points.csv", "README.txt"), entries.keys.toList())
    }

    @Test
    fun manifestChecksumsMatchEveryFile() {
        val entries = export()
        val manifest = JSONObject(String(entries.getValue("manifest.json"), Charsets.UTF_8))
        assertEquals(SiteScanExport.FORMAT, manifest.getString("format"))
        assertEquals("0.1.0", manifest.getString("appVersion"))
        assertEquals(3, manifest.getInt("pointCount"))

        val files = manifest.getJSONObject("files")
        for (name in listOf("site.json", "points.csv", "README.txt")) {
            val bytes = entries.getValue(name)
            val recorded = files.getJSONObject(name)
            assertEquals(name, sha256(bytes), recorded.getString("sha256"))
            assertEquals(name, bytes.size, recorded.getInt("bytes"))
        }
    }

    @Test
    fun siteJsonInsideTheArchiveReadsBackToTheSameSurvey() {
        val entries = export()
        val back = SiteJson.fromJson(String(entries.getValue("site.json"), Charsets.UTF_8))
        assertEquals(site, back)
    }

    @Test
    fun csvQuotesLabelsWithCommasAndQuotes() {
        val csv = String(export().getValue("points.csv"), Charsets.UTF_8)
        val lines = csv.trim().split("\n")
        assertEquals("label,x_m,y_m,distance_m,bearing_deg,height_m,note", lines[0])
        assertTrue(lines[1].startsWith("\"Corner, north\",0.0,0.0,,,1.2,"))
        assertTrue(lines[2].startsWith("\"East \"\"fence\"\"\",4.0,0.0,4.0,90.0,,gate"))
    }

    @Test
    fun fileNameIsSafeAndCarriesTheExtension() {
        assertEquals("Front-garden-11112222.sitescan", SiteScanExport.fileName(site))
        val odd = site.copy(name = "../../etc/passwd ?*", id = "abcdef12")
        assertEquals("etcpasswd-abcdef12.sitescan", SiteScanExport.fileName(odd))
        val empty = site.copy(name = "???", id = "abcdef12")
        assertEquals("site-abcdef12.sitescan", SiteScanExport.fileName(empty))
    }
}
