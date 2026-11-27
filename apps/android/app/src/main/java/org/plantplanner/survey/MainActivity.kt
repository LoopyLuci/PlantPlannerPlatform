package org.plantplanner.survey

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.plantplanner.survey.feedback.DeviceInfo
import org.plantplanner.survey.feedback.FeedbackKind
import org.plantplanner.survey.feedback.FeedbackStore
import org.plantplanner.survey.model.Site
import org.plantplanner.survey.model.SiteStore
import org.plantplanner.survey.ui.ArCaptureScreen
import org.plantplanner.survey.ui.FeedbackScreen
import org.plantplanner.survey.ui.PlantScene3D
import org.plantplanner.survey.ui.SiteScreen
import org.plantplanner.survey.ui.SitesScreen
import org.plantplanner.survey.ui.UpdateController
import org.plantplanner.survey.ui.UpdatePromptDialog
import org.plantplanner.survey.ui.UpdatesScreen
import org.plantplanner.survey.ui.appVersionName
import org.plantplanner.survey.update.UpdatePrefs
import org.plantplanner.survey.update.UpdateService
import java.io.File
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

class MainActivity : ComponentActivity() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var store: SiteStore
    private lateinit var updates: UpdateController

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = SiteStore(File(filesDir, "sites"))
        updates = UpdateController(this, UpdateService(this), UpdatePrefs(this), scope)
        updates.checkOnLaunchIfDue()
        setContent {
            MaterialTheme {
                Surface(Modifier.fillMaxSize()) {
                    SurveyApp(store, updates)
                }
            }
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}

private sealed interface Screen {
    data object Sites : Screen
    data class Survey(val siteId: String) : Screen
    data class Scene3D(val siteId: String) : Screen
    data class ArCapture(val siteId: String) : Screen
    data object Updates : Screen
    data class Feedback(val kind: FeedbackKind) : Screen
}

@Composable
private fun SurveyApp(store: SiteStore, updates: UpdateController) {
    val context = LocalContext.current
    val feedbackStore = remember { FeedbackStore(context) }
    var screen by remember { mutableStateOf<Screen>(Screen.Sites) }
    // Bumped after every save so the open site and the list reload from disk.
    var revision by remember { mutableIntStateOf(0) }
    val sites = remember(revision) { store.list() }

    BackHandler(enabled = screen != Screen.Sites) { screen = Screen.Sites }

    when (val s = screen) {
        Screen.Sites -> SitesScreen(
            sites = sites,
            onOpen = { screen = Screen.Survey(it) },
            onCreate = { name ->
                val site = Site(
                    id = UUID.randomUUID().toString(),
                    name = name,
                    createdAt = Instant.now().truncatedTo(ChronoUnit.SECONDS).toString(),
                    points = emptyList(),
                )
                store.save(site)
                revision++
                screen = Screen.Survey(site.id)
            },
            onUpdates = { screen = Screen.Updates },
            onFeedback = { screen = Screen.Feedback(FeedbackKind.FEATURE) },
        )
        is Screen.Survey -> {
            val site = remember(s.siteId, revision) { store.load(s.siteId) }
            if (site == null) {
                screen = Screen.Sites
            } else {
                SiteScreen(
                    site = site,
                    onSave = { updated ->
                        store.save(updated)
                        revision++
                    },
                    onBack = { screen = Screen.Sites },
                    onDelete = {
                        store.delete(site.id)
                        revision++
                        screen = Screen.Sites
                    },
                    onOpen3D = { screen = Screen.Scene3D(site.id) },
                    onOpenAr = { screen = Screen.ArCapture(site.id) },
                )
            }
        }
        is Screen.Scene3D -> store.load(s.siteId)?.let { site ->
            PlantScene3D(site = site, onBack = { screen = Screen.Survey(site.id) })
        } ?: run { screen = Screen.Sites }
        is Screen.ArCapture -> store.load(s.siteId)?.let { site ->
            ArCaptureScreen(
                site = site,
                onSave = { updated ->
                    store.save(updated)
                    revision++
                },
                onBack = { screen = Screen.Survey(site.id) },
            )
        } ?: run { screen = Screen.Sites }
        Screen.Updates -> UpdatesScreen(controller = updates, onBack = { screen = Screen.Sites })
        is Screen.Feedback -> FeedbackScreen(
            initialKind = s.kind,
            device = deviceInfo(context),
            repo = BuildConfig.GITHUB_REPO,
            store = feedbackStore,
            onBack = { screen = Screen.Sites },
            onOpenUrl = { context.openInBrowser(it) },
            onCopy = { context.copyToClipboard(it) },
        )
    }

    UpdatePromptDialog(updates)
}

private fun deviceInfo(context: Context) = DeviceInfo(
    appVersion = appVersionName(context),
    androidRelease = Build.VERSION.RELEASE,
    sdkInt = Build.VERSION.SDK_INT,
    model = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
)

/** Opens [url] in a browser. Returns false when no app can open it. */
private fun Context.openInBrowser(url: String): Boolean = try {
    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    true
} catch (_: ActivityNotFoundException) {
    false
}

private fun Context.copyToClipboard(text: String) {
    val clipboard = getSystemService(android.content.ClipboardManager::class.java)
    clipboard?.setPrimaryClip(ClipData.newPlainText("Plant Survey feedback", text))
}
