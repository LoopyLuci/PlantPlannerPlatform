package org.plantplanner.survey.ui

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.plantplanner.survey.export.AndroidExport
import org.plantplanner.survey.update.Release
import org.plantplanner.survey.update.ReleaseParser
import org.plantplanner.survey.update.UpdateMode
import org.plantplanner.survey.update.UpdatePrefs
import org.plantplanner.survey.update.UpdateService
import org.plantplanner.survey.update.UpdateStatus
import java.io.File
import java.io.IOException

/** A question the updater asks before it does anything the user did not just ask for. */
sealed interface UpdatePrompt {
    /** Mode "Download only": ask before saving the new APK to Downloads. */
    data class Download(val release: Release) : UpdatePrompt

    /** Mode "Download and install": ask before downloading and installing. */
    data class DownloadAndInstall(val release: Release) : UpdatePrompt

    /** The user tapped Install: confirm before downloading and installing. */
    data class ConfirmInstall(val release: Release) : UpdatePrompt

    /** Android needs "Install unknown apps" allowed for this app before it can install. */
    data object OpenUnknownSources : UpdatePrompt
}

/**
 * Holds the updater's state for the screen and runs its steps. Nothing is downloaded or installed
 * without the user's say-so: each step either follows a button the user tapped, or a prompt they
 * accepted.
 */
class UpdateController(
    private val context: Context,
    private val service: UpdateService,
    private val prefs: UpdatePrefs,
    private val scope: CoroutineScope,
) {
    var mode by mutableStateOf(prefs.mode)
        private set
    var status by mutableStateOf<UpdateStatus>(UpdateStatus.NotChecked)
        private set
    /** Short text while a step runs, for example "Checking for updates…". Null when idle. */
    var busy by mutableStateOf<String?>(null)
        private set
    /** 0 to 1 while downloading, null when not downloading or the size is unknown. */
    var progress by mutableStateOf<Float?>(null)
        private set
    var prompt by mutableStateOf<UpdatePrompt?>(null)
        private set
    /** The last thing that happened, shown to the user. */
    var notice by mutableStateOf<String?>(null)
        private set
    /** The APK on this device, when it has been downloaded. */
    var downloadedApk by mutableStateOf<File?>(null)
        private set

    val currentVersion get() = service.currentVersion()

    fun selectMode(newMode: UpdateMode) {
        mode = newMode
        prefs.mode = newMode
    }

    /**
     * Runs at launch. Checks GitHub at most once a day, and only if the mode is not MANUAL.
     * Nothing is checked in manual mode.
     */
    fun checkOnLaunchIfDue() {
        if (mode == UpdateMode.MANUAL) return
        val dayMillis = 24L * 60 * 60 * 1000
        if (System.currentTimeMillis() - prefs.lastCheckMillis < dayMillis) return
        checkNow(quietOnFailure = true)
    }

    /** Asks GitHub for the newest Android release and compares it with this app's version. */
    fun checkNow(quietOnFailure: Boolean = false) {
        if (busy != null) return
        busy = "Checking for updates…"
        scope.launch {
            try {
                val latest = service.fetchLatest()
                prefs.lastCheckMillis = System.currentTimeMillis()
                val result = ReleaseParser.status(service.currentVersion(), latest)
                status = result
                if (result is UpdateStatus.Available && mode != UpdateMode.MANUAL) {
                    prompt = if (mode == UpdateMode.DOWNLOAD) {
                        UpdatePrompt.Download(result.latest)
                    } else {
                        UpdatePrompt.DownloadAndInstall(result.latest)
                    }
                }
            } catch (e: IOException) {
                if (!quietOnFailure) {
                    status = UpdateStatus.Failed("Could not reach GitHub: ${e.message ?: "no connection"}")
                }
            } finally {
                busy = null
            }
        }
    }

    /** Downloads [release] and saves it to Downloads. Installs it afterwards when [thenInstall] is true. */
    fun download(release: Release, thenInstall: Boolean) {
        if (busy != null) return
        busy = "Downloading ${release.version}…"
        progress = 0f
        scope.launch {
            val apk: File? = try {
                val file = service.download(release) { done, total ->
                    progress = if (total > 0) (done.toFloat() / total).coerceIn(0f, 1f) else null
                }
                downloadedApk = file
                busy = "Saving to Downloads…"
                withContext(Dispatchers.IO) {
                    AndroidExport.saveToDownloads(context, file.name, APK_MIME) { out ->
                        file.inputStream().use { it.copyTo(out) }
                    }
                }
                notice = "Saved ${file.name} to Downloads/${AndroidExport.DOWNLOAD_SUBFOLDER}."
                file
            } catch (e: Exception) {
                notice = "Download failed: ${e.message ?: "unknown error"}"
                null
            } finally {
                busy = null
                progress = null
            }
            if (thenInstall && apk != null) startInstall(apk)
        }
    }

    /** The user tapped Install. Confirms first, then downloads if needed and installs. */
    fun askInstall(release: Release) {
        prompt = UpdatePrompt.ConfirmInstall(release)
    }

    /** Runs the install for [release] after the user confirmed it. */
    fun confirmInstall(release: Release) {
        prompt = null
        val apk = downloadedApk
        if (apk != null && apk.name == "plant-survey-${release.version}.apk" && apk.exists()) {
            startInstall(apk)
        } else {
            download(release, thenInstall = true)
        }
    }

    /** Opens the share sheet for the downloaded APK. */
    fun shareDownloadedApk() {
        val apk = downloadedApk
        if (apk == null || !apk.exists()) {
            notice = "Download the update first, then share it."
            return
        }
        scope.launch {
            try {
                val staged = withContext(Dispatchers.IO) {
                    AndroidExport.stageForShare(context, apk.name) { out ->
                        apk.inputStream().use { it.copyTo(out) }
                    }
                }
                AndroidExport.share(context, staged, APK_MIME, "Share Plant Survey ${apk.name}")
            } catch (e: Exception) {
                notice = "Could not share: ${e.message ?: "unknown error"}"
            }
        }
    }

    /** Ends the open prompt without doing anything. */
    fun dismissPrompt() {
        prompt = null
    }

    /** The user accepted a prompt. Runs the step the prompt asked about. */
    fun acceptPrompt() {
        when (val p = prompt) {
            is UpdatePrompt.Download -> {
                prompt = null
                download(p.release, thenInstall = false)
            }
            is UpdatePrompt.DownloadAndInstall -> {
                prompt = null
                download(p.release, thenInstall = true)
            }
            is UpdatePrompt.ConfirmInstall -> confirmInstall(p.release)
            UpdatePrompt.OpenUnknownSources -> prompt = null
            null -> Unit
        }
    }

    /** Hands [apk] to the installer, or asks for the unknown-apps permission first. */
    fun startInstall(apk: File) {
        if (!service.canInstallPackages()) {
            prompt = UpdatePrompt.OpenUnknownSources
            return
        }
        try {
            service.install(apk)
            notice = "Sent to Android. Confirm the install if Android asks."
        } catch (e: Exception) {
            notice = "The install could not start: ${e.message ?: "unknown error"}"
        }
    }

    companion object {
        const val APK_MIME = "application/vnd.android.package-archive"
    }
}
