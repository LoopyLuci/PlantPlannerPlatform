package org.plantplanner.survey.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.plantplanner.survey.feedback.DeviceInfo
import org.plantplanner.survey.feedback.FeedbackComposer
import org.plantplanner.survey.feedback.FeedbackDraft
import org.plantplanner.survey.feedback.FeedbackKind
import org.plantplanner.survey.feedback.FeedbackStore
import org.plantplanner.survey.feedback.SentReport
import org.plantplanner.survey.feedback.Severity
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * A form for a feature request or a bug report. "Open on GitHub" opens the new-issue page with the
 * report filled in; the person presses Submit there. Each kind keeps its own draft on this phone.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedbackScreen(
    initialKind: FeedbackKind,
    device: DeviceInfo,
    repo: String,
    store: FeedbackStore,
    onBack: () -> Unit,
    onOpenUrl: (String) -> Boolean,
    onCopy: (String) -> Unit,
) {
    var kind by remember { mutableStateOf(initialKind) }
    val saved = remember(kind) { store.loadDraft(kind) ?: FeedbackDraft(kind) }

    var title by remember(kind) { mutableStateOf(saved.title) }
    var details by remember(kind) { mutableStateOf(saved.details) }
    var steps by remember(kind) { mutableStateOf(saved.steps) }
    var expected by remember(kind) { mutableStateOf(saved.expected) }
    var actual by remember(kind) { mutableStateOf(saved.actual) }
    var severity by remember(kind) { mutableStateOf(saved.severity) }

    var problems by remember { mutableStateOf<List<String>>(emptyList()) }
    var message by remember { mutableStateOf<String?>(null) }
    var sentRevision by remember { mutableIntStateOf(0) }
    val sent = remember(sentRevision) { store.sent() }

    val draft = FeedbackDraft(kind, title, details, steps, expected, actual, severity)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Feedback") },
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
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                "Tell us what would help, or what went wrong. Opening the report takes you to GitHub, " +
                    "where you press Submit. The app sends nothing by itself. Leave out personal details.",
                style = MaterialTheme.typography.bodySmall,
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FeedbackKind.entries.forEach { k ->
                    FilterChip(
                        selected = kind == k,
                        onClick = { kind = k; problems = emptyList(); message = null },
                        label = { Text(k.label) },
                    )
                }
            }

            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                label = { Text("Short title") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = details,
                onValueChange = { details = it },
                label = { Text(if (kind == FeedbackKind.BUG) "What went wrong" else "The idea and why it helps") },
                minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )

            if (kind == FeedbackKind.BUG) {
                Text("How serious is it?", style = MaterialTheme.typography.bodyMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Severity.entries.forEach { s ->
                        FilterChip(
                            selected = severity == s,
                            onClick = { severity = s },
                            label = { Text(s.label) },
                        )
                    }
                }
                OutlinedTextField(
                    value = steps,
                    onValueChange = { steps = it },
                    label = { Text("Steps to reproduce, optional") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = expected,
                    onValueChange = { expected = it },
                    label = { Text("What you expected, optional") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = actual,
                    onValueChange = { actual = it },
                    label = { Text("What actually happened, optional") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            problems.forEach {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Button(
                onClick = {
                    val found = FeedbackComposer.validate(draft)
                    problems = found
                    if (found.isEmpty()) {
                        val url = FeedbackComposer.issueUrl(repo, draft, device)
                        if (onOpenUrl(url)) {
                            store.recordSent(
                                SentReport(kind, FeedbackComposer.issueTitle(draft), Instant.now().truncatedTo(ChronoUnit.SECONDS).toString()),
                            )
                            store.clearDraft(kind)
                            sentRevision++
                            message = "Opened GitHub. Press Submit new issue there to send it."
                        } else {
                            message = "No browser could open the link. Use Copy report text instead."
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Open report on GitHub") }

            OutlinedButton(
                onClick = {
                    onCopy(FeedbackComposer.plainText(draft, device))
                    message = "Copied. Paste it into a new issue on GitHub."
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Copy report text") }

            OutlinedButton(
                onClick = {
                    store.saveDraft(draft)
                    message = "Draft saved on this phone."
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Save draft") }

            TextButton(
                onClick = {
                    title = ""; details = ""; steps = ""; expected = ""; actual = ""
                    severity = Severity.BLOCKING
                    store.clearDraft(kind)
                    problems = emptyList()
                    message = "Form cleared."
                },
            ) { Text("Clear form") }

            message?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }

            Spacer(Modifier.height(8.dp))
            Text("Reports you opened", style = MaterialTheme.typography.titleMedium)
            if (sent.isEmpty()) {
                Text("None yet.", style = MaterialTheme.typography.bodySmall)
            } else {
                sent.forEach { r ->
                    Text(
                        "${r.kind.label}: ${r.title}\n${r.sentAt}",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}
