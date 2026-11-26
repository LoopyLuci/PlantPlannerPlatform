package org.plantplanner.survey

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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.plantplanner.survey.model.Site
import org.plantplanner.survey.model.SiteStore
import org.plantplanner.survey.ui.SiteScreen
import org.plantplanner.survey.ui.SitesScreen
import org.plantplanner.survey.ui.UpdateController
import org.plantplanner.survey.ui.UpdatePromptDialog
import org.plantplanner.survey.ui.UpdatesScreen
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
    data object Updates : Screen
}

@Composable
private fun SurveyApp(store: SiteStore, updates: UpdateController) {
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
                )
            }
        }
        Screen.Updates -> UpdatesScreen(controller = updates, onBack = { screen = Screen.Sites })
    }

    UpdatePromptDialog(updates)
}
