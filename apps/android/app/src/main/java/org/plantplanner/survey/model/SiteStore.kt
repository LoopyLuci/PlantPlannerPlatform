package org.plantplanner.survey.model

import java.io.File

/**
 * Keeps sites as one JSON file each in [dir]. Everything is local: the app needs no network to
 * survey. Writes go to a temporary file first, so a crash never leaves a half-written site.
 */
class SiteStore(private val dir: File) {

    init {
        dir.mkdirs()
    }

    /** All readable sites, newest first. Unreadable files are skipped, not deleted. */
    fun list(): List<Site> = dir.listFiles { f -> f.isFile && f.extension == "json" }
        .orEmpty()
        .mapNotNull { file -> runCatching { SiteJson.fromJson(file.readText()) }.getOrNull() }
        .sortedByDescending { it.createdAt }

    fun load(id: String): Site? {
        val file = fileFor(id)
        if (!file.exists()) return null
        return SiteJson.fromJson(file.readText())
    }

    fun save(site: Site) {
        val target = fileFor(site.id)
        val temp = File(dir, "${site.id}.json.tmp")
        temp.writeText(SiteJson.toJson(site).toString(2))
        if (target.exists()) target.delete()
        if (!temp.renameTo(target)) {
            temp.delete()
            throw SurveyException("Could not save the site")
        }
    }

    fun delete(id: String) {
        fileFor(id).delete()
    }

    private fun fileFor(id: String): File {
        require(ID_PATTERN.matches(id)) { "Invalid site id" }
        return File(dir, "$id.json")
    }

    private companion object {
        val ID_PATTERN = Regex("[A-Za-z0-9_-]{1,64}")
    }
}
