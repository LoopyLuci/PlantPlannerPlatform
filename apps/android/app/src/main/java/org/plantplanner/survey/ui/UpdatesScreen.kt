package org.plantplanner.survey.ui

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import org.plantplanner.survey.update.InstallMessages
import org.plantplanner.survey.update.Release
import org.plantplanner.survey.update.UpdateMode
import org.plantplanner.survey.update.UpdateStatus

/** Shows the installed and available versions, the update mode, and the update actions. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UpdatesScreen(controller: UpdateController, onBack: () -> Unit) {
    val installMessage by InstallMessages.message.collectAsState()
    val status = controller.status
    val available: Release? = (status as? UpdateStatus.Available)?.latest

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Updates") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .padding(16.dp)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Installed version: ${controller.currentVersion}", style = MaterialTheme.typography.titleMedium)
            Text("Available version: ${availableText(status)}", style = MaterialTheme.typography.titleMedium)
            Text(statusText(status), style = MaterialTheme.typography.bodyMedium)

            Spacer(Modifier.height(8.dp))
            Text("When a new version is found", style = MaterialTheme.typography.titleSmall)
            UpdateMode.entries.forEach { mode ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .selectable(
                            selected = controller.mode == mode,
                            onClick = { controller.selectMode(mode) },
                            role = Role.RadioButton,
                        )
                        .padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = controller.mode == mode, onClick = null)
                    Column(Modifier.padding(start = 8.dp)) {
                        Text(mode.label, style = MaterialTheme.typography.bodyMedium)
                        Text(mode.explanation, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }

            Spacer(Modifier.height(8.dp))
            Button(
                onClick = { controller.checkNow() },
                enabled = controller.busy == null,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Check for updates") }

            controller.busy?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            controller.progress?.let { p ->
                LinearProgressIndicator(progress = { p }, modifier = Modifier.fillMaxWidth())
            }

            if (available != null) {
                Button(
                    onClick = { controller.download(available, thenInstall = false) },
                    enabled = controller.busy == null,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Download and save to Downloads") }
                OutlinedButton(
                    onClick = { controller.askInstall(available) },
                    enabled = controller.busy == null,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Install") }
            }
            OutlinedButton(
                onClick = { controller.shareDownloadedApk() },
                enabled = controller.downloadedApk != null && controller.busy == null,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Share downloaded APK") }

            controller.notice?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            installMessage?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

private fun availableText(status: UpdateStatus): String = when (status) {
    UpdateStatus.NotChecked -> "not checked yet"
    is UpdateStatus.UpToDate -> "${status.latest.version} (you have the newest)"
    is UpdateStatus.Available -> "${status.latest.version}"
    is UpdateStatus.NoRelease -> "none published yet"
    is UpdateStatus.Failed -> "unknown"
}

private fun statusText(status: UpdateStatus): String = when (status) {
    UpdateStatus.NotChecked -> "Nothing has been checked. In Manual mode the app only checks when you tap Check."
    is UpdateStatus.UpToDate -> "This version is the newest published."
    is UpdateStatus.Available -> {
        val mb = status.latest.apk.sizeBytes / (1024.0 * 1024.0)
        "Version ${status.latest.version} is ready to download (${"%.1f".format(mb)} MB)."
    }
    is UpdateStatus.NoRelease -> "No Android release has been published on GitHub yet."
    is UpdateStatus.Failed -> status.message
}

/** The question dialogs. Shown above whatever screen is open. */
@Composable
fun UpdatePromptDialog(controller: UpdateController) {
    val context = LocalContext.current
    when (val p = controller.prompt) {
        null -> Unit
        is UpdatePrompt.Download -> AlertDialog(
            onDismissRequest = controller::dismissPrompt,
            title = { Text("Version ${p.release.version} is available") },
            text = {
                Text(
                    "You have ${controller.currentVersion}. Download the new version and save it to " +
                        "Downloads/${org.plantplanner.survey.export.AndroidExport.DOWNLOAD_SUBFOLDER}? It will not be installed.",
                )
            },
            confirmButton = { TextButton(onClick = controller::acceptPrompt) { Text("Download") } },
            dismissButton = { TextButton(onClick = controller::dismissPrompt) { Text("Not now") } },
        )
        is UpdatePrompt.DownloadAndInstall -> AlertDialog(
            onDismissRequest = controller::dismissPrompt,
            title = { Text("Version ${p.release.version} is available") },
            text = {
                Text(
                    "You have ${controller.currentVersion}. Download and install the new version now? " +
                        "Android may ask you to confirm the install.",
                )
            },
            confirmButton = { TextButton(onClick = controller::acceptPrompt) { Text("Download and install") } },
            dismissButton = { TextButton(onClick = controller::dismissPrompt) { Text("Not now") } },
        )
        is UpdatePrompt.ConfirmInstall -> AlertDialog(
            onDismissRequest = controller::dismissPrompt,
            title = { Text("Install version ${p.release.version}?") },
            text = {
                Text(
                    "Plant Survey will download the update if it is not already on this phone, then " +
                        "hand it to Android. Your sites are kept.",
                )
            },
            confirmButton = { TextButton(onClick = controller::acceptPrompt) { Text("Install") } },
            dismissButton = { TextButton(onClick = controller::dismissPrompt) { Text("Cancel") } },
        )
        UpdatePrompt.OpenUnknownSources -> AlertDialog(
            onDismissRequest = controller::dismissPrompt,
            title = { Text("Allow installs from Plant Survey") },
            text = {
                Text(
                    "Android needs permission for Plant Survey to install apps. Turn on " +
                        "\"Allow from this source\", then tap Install again.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    controller.dismissPrompt()
                    val intent = Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:${context.packageName}"),
                    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                }) { Text("Open settings") }
            },
            dismissButton = { TextButton(onClick = controller::dismissPrompt) { Text("Not now") } },
        )
    }
}
