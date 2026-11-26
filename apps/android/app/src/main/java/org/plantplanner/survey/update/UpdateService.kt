package org.plantplanner.survey.update

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import org.plantplanner.survey.BuildConfig
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** How the updater behaves. MANUAL is the default: nothing is checked or downloaded unless you ask. */
enum class UpdateMode(val label: String, val explanation: String) {
    MANUAL(
        "Manual (default)",
        "Only checks when you tap Check. Downloads and installs only when you tap them.",
    ),
    DOWNLOAD(
        "Download only",
        "Checks at most once a day. When a new version exists, asks before downloading it to Downloads. Never installs.",
    ),
    DOWNLOAD_AND_INSTALL(
        "Download and install",
        "Checks at most once a day. When a new version exists, asks before downloading and installing it. Android may still ask you to confirm the install.",
    ),
}

/** Saves the updater's settings on this device. */
class UpdatePrefs(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("updater", Context.MODE_PRIVATE)

    var mode: UpdateMode
        get() = runCatching { UpdateMode.valueOf(prefs.getString(KEY_MODE, null) ?: "") }
            .getOrDefault(UpdateMode.MANUAL)
        set(value) = prefs.edit().putString(KEY_MODE, value.name).apply()

    var lastCheckMillis: Long
        get() = prefs.getLong(KEY_LAST_CHECK, 0L)
        set(value) = prefs.edit().putLong(KEY_LAST_CHECK, value).apply()

    private companion object {
        const val KEY_MODE = "mode"
        const val KEY_LAST_CHECK = "lastCheckMillis"
    }
}

/** Messages from the installer that the UI shows once. */
object InstallMessages {
    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    fun post(text: String) {
        _message.value = text
    }

    fun clear() {
        _message.value = null
    }
}

/** Checks GitHub for a newer Android release, downloads its APK, and hands it to the installer. */
class UpdateService(private val context: Context) {

    fun currentVersion(): Version =
        Version.parse(BuildConfig.VERSION_NAME) ?: Version(listOf(0))

    /** The newest Android release on GitHub, or null when none has an APK. Throws IOException when offline. */
    suspend fun fetchLatest(): Release? = withContext(Dispatchers.IO) {
        val url = URL("https://api.github.com/repos/${BuildConfig.GITHUB_REPO}/releases?per_page=30")
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 15_000
            conn.readTimeout = 15_000
            conn.setRequestProperty("Accept", "application/vnd.github+json")
            conn.setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
            conn.setRequestProperty("User-Agent", "PlantSurvey-Android/${BuildConfig.VERSION_NAME}")
            val code = conn.responseCode
            if (code != HttpURLConnection.HTTP_OK) throw IOException("GitHub answered HTTP $code")
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            ReleaseParser.newest(ReleaseParser.parseReleases(body))
        } finally {
            conn.disconnect()
        }
    }

    /**
     * Downloads [release] into the app's private updates folder. Calls [onProgress] with bytes
     * so far and total bytes (0 when unknown). Checks the size and that the file is this app.
     */
    suspend fun download(release: Release, onProgress: (Long, Long) -> Unit): File = withContext(Dispatchers.IO) {
        val dir = File(context.filesDir, "updates").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        val target = File(dir, "plant-survey-${release.version}.apk")
        val temp = File(dir, "${target.name}.part")

        val conn = URL(release.apk.downloadUrl).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            conn.setRequestProperty("User-Agent", "PlantSurvey-Android/${BuildConfig.VERSION_NAME}")
            val code = conn.responseCode
            if (code != HttpURLConnection.HTTP_OK) throw IOException("Download failed: HTTP $code")
            val total = conn.contentLengthLong.takeIf { it > 0 } ?: release.apk.sizeBytes
            var done = 0L
            conn.inputStream.use { input ->
                temp.outputStream().use { out ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        out.write(buffer, 0, n)
                        done += n
                        onProgress(done, total)
                    }
                }
            }
            if (release.apk.sizeBytes > 0 && done != release.apk.sizeBytes) {
                temp.delete()
                throw IOException("Download was incomplete (${done} of ${release.apk.sizeBytes} bytes)")
            }
        } finally {
            conn.disconnect()
        }

        if (!temp.renameTo(target)) throw IOException("Could not save the download")
        verifyPackage(target, release)
        target
    }

    /** The APK must be this app's package and must not be older than the release it came from. */
    private fun verifyPackage(apk: File, release: Release) {
        val info = context.packageManager.getPackageArchiveInfo(apk.path, 0)
            ?: throw IOException("The download is not a readable APK")
        if (info.packageName != context.packageName) {
            apk.delete()
            throw IOException("The download is for a different app")
        }
        val downloaded = Version.parse(info.versionName ?: "")
        if (downloaded == null || downloaded < release.version) {
            apk.delete()
            throw IOException("The download does not match the release it came from")
        }
    }

    fun canInstallPackages(): Boolean = context.packageManager.canRequestPackageInstalls()

    /**
     * Hands [apk] to the system installer. Asks for no confirmation of our own. On Android 12 and
     * later it asks the system not to prompt; Android still prompts whenever it requires it, and
     * [InstallResultReceiver] opens that prompt.
     */
    fun install(apk: File) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(context.packageName)
            if (Build.VERSION.SDK_INT >= 31) {
                setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
        }
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            session.openWrite("base.apk", 0, apk.length()).use { out ->
                apk.inputStream().use { input -> input.copyTo(out) }
                session.fsync(out)
            }
            val intent = Intent(context, InstallResultReceiver::class.java)
                .setPackage(context.packageName)
            val pending = PendingIntent.getBroadcast(
                context,
                sessionId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
            session.commit(pending.intentSender)
        }
    }
}
