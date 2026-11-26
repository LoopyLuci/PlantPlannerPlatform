package org.plantplanner.survey.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateLogicTest {

    private val releasesJson = """
        [
          {
            "tag_name": "android-v0.3.0", "draft": true, "html_url": "https://example/draft", "body": "",
            "assets": [{"name": "PlantSurvey-0.3.0.apk", "browser_download_url": "https://example/d.apk", "size": 10}]
          },
          {
            "tag_name": "v9.9.9", "draft": false, "html_url": "https://example/web", "body": "",
            "assets": [{"name": "web.apk", "browser_download_url": "https://example/w.apk", "size": 10}]
          },
          {
            "tag_name": "android-v0.2.0", "draft": false, "html_url": "https://example/0.2.0", "body": "Notes 0.2.0",
            "assets": [
              {"name": "notes.txt", "browser_download_url": "https://example/n.txt", "size": 1},
              {"name": "PlantSurvey-0.2.0.apk", "browser_download_url": "https://example/0.2.0.apk", "size": 2048}
            ]
          },
          {
            "tag_name": "android-v0.4.0", "draft": false, "html_url": "https://example/0.4.0", "body": "",
            "assets": []
          },
          {
            "tag_name": "android-v0.1.5", "draft": false, "html_url": "https://example/0.1.5", "body": "",
            "assets": [{"name": "PlantSurvey-0.1.5.apk", "browser_download_url": "https://example/0.1.5.apk", "size": 5}]
          }
        ]
    """.trimIndent()

    @Test
    fun versionsCompareNumerically() {
        assertTrue(Version.parse("0.1.1")!! > Version.parse("0.1.0")!!)
        assertTrue(Version.parse("0.10.0")!! > Version.parse("0.9.0")!!)
        assertEquals(0, Version.parse("0.1.0")!!.compareTo(Version.parse("0.1")!!))
        assertEquals(Version.parse("1.2.3"), Version.parse("android-v1.2.3"))
        assertNull(Version.parse("latest"))
    }

    @Test
    fun parsesOnlyAndroidReleasesWithAnApk() {
        val releases = ReleaseParser.parseReleases(releasesJson)
        assertEquals(listOf("android-v0.2.0", "android-v0.1.5"), releases.map { it.tag })
        val first = releases.first()
        assertEquals("PlantSurvey-0.2.0.apk", first.apk.name)
        assertEquals("https://example/0.2.0.apk", first.apk.downloadUrl)
        assertEquals(2048L, first.apk.sizeBytes)
        assertEquals("Notes 0.2.0", first.notes)
    }

    @Test
    fun newestIsTheHighestVersionWithAnApk() {
        val newest = ReleaseParser.newest(ReleaseParser.parseReleases(releasesJson))
        assertEquals(Version.parse("0.2.0"), newest?.version)
    }

    @Test
    fun statusReportsAvailableUpToDateAndNoRelease() {
        val latest = ReleaseParser.newest(ReleaseParser.parseReleases(releasesJson))!!
        val older = Version.parse("0.1.0")!!
        val same = Version.parse("0.2.0")!!

        assertTrue(ReleaseParser.status(older, latest) is UpdateStatus.Available)
        assertTrue(ReleaseParser.status(same, latest) is UpdateStatus.UpToDate)
        assertTrue(ReleaseParser.status(older, null) is UpdateStatus.NoRelease)
    }

    @Test
    fun emptyReleaseListMeansNoRelease() {
        assertNull(ReleaseParser.newest(ReleaseParser.parseReleases("[]")))
    }
}
