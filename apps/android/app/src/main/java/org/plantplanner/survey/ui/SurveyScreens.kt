package org.plantplanner.survey.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.plantplanner.survey.export.AndroidExport
import org.plantplanner.survey.export.SiteScanExport
import org.plantplanner.survey.model.Site
import org.plantplanner.survey.model.SurveyException
import org.plantplanner.survey.model.Survey
import org.plantplanner.survey.model.SurveyPoint
import java.util.UUID

/** The list of sites, with a box to start a new one. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SitesScreen(
    sites: List<Site>,
    onOpen: (String) -> Unit,
    onCreate: (String) -> Unit,
    onUpdates: () -> Unit,
    onFeedback: () -> Unit,
) {
    var naming by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Plant Survey") },
                actions = {
                    TextButton(onClick = onFeedback) { Text("Feedback") }
                    TextButton(onClick = onUpdates) { Text("Updates") }
                },
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).padding(16.dp).fillMaxWidth()) {
            Button(onClick = { naming = true }, modifier = Modifier.fillMaxWidth()) {
                Text("New site")
            }
            Spacer(Modifier.height(12.dp))
            if (sites.isEmpty()) {
                Text(
                    "No sites yet. Start one, then add points as you survey. Everything is saved on this phone and works without a connection.",
                    style = MaterialTheme.typography.bodyMedium,
                )
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(sites, key = { it.id }) { site ->
                        Card(Modifier.fillMaxWidth().clickable { onOpen(site.id) }) {
                            Column(Modifier.padding(14.dp)) {
                                Text(site.name, style = MaterialTheme.typography.titleMedium)
                                Text(
                                    "${site.points.size} points · ${"%.1f".format(Survey.areaM2(site.points))} m²",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (naming) {
        AlertDialog(
            onDismissRequest = { naming = false },
            title = { Text("New site") },
            text = {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name, for example Front garden") },
                    singleLine = true,
                )
            },
            confirmButton = {
                TextButton(
                    enabled = name.isNotBlank(),
                    onClick = {
                        onCreate(name.trim())
                        name = ""
                        naming = false
                    },
                ) { Text("Create") }
            },
            dismissButton = { TextButton(onClick = { naming = false }) { Text("Cancel") } },
        )
    }
}

/** One survey: the plan, its measurements, the point list, adding points, and export. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SiteScreen(
    site: Site,
    onSave: (Site) -> Unit,
    onBack: () -> Unit,
    onDelete: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var label by remember(site.id) { mutableStateOf("") }
    var distance by remember(site.id) { mutableStateOf("") }
    var bearing by remember(site.id) { mutableStateOf("") }
    var height by remember(site.id) { mutableStateOf("") }
    var note by remember(site.id) { mutableStateOf("") }
    var error by remember(site.id) { mutableStateOf<String?>(null) }
    var exportMessage by remember(site.id) { mutableStateOf<String?>(null) }
    var confirmDelete by remember(site.id) { mutableStateOf(false) }
    var selectedIndex by remember(site.id) { mutableStateOf<Int?>(null) }
    var moveError by remember(site.id) { mutableStateOf<String?>(null) }
    val selected = selectedIndex?.takeIf { it < site.points.size }

    val isOrigin = site.points.isEmpty()
    val heights = Survey.heightRangeM(site.points)

    fun addPoint() {
        val heightValue = if (height.isBlank()) null else height.toDoubleOrNull()
        if (height.isNotBlank() && heightValue == null) {
            error = "Height must be a number, in metres"
            return
        }
        val distanceValue = if (isOrigin) 0.0 else distance.toDoubleOrNull()
        val bearingValue = if (isOrigin) 0.0 else bearing.toDoubleOrNull()
        if (!isOrigin && distanceValue == null) {
            error = "Enter the distance from the last point, in metres"
            return
        }
        if (!isOrigin && bearingValue == null) {
            error = "Enter the bearing from north, in degrees"
            return
        }
        try {
            val point = Survey.nextPoint(
                site = site,
                id = "p" + UUID.randomUUID().toString().take(8),
                label = label,
                distanceM = distanceValue ?: 0.0,
                bearingDeg = bearingValue ?: 0.0,
                heightM = heightValue,
                note = note,
            )
            onSave(site.copy(points = site.points + point))
            label = ""
            distance = ""
            bearing = ""
            height = ""
            note = ""
            error = null
        } catch (e: SurveyException) {
            error = e.message
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(site.name, maxLines = 1) },
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
                "${site.points.size} points · area ${"%.2f".format(Survey.areaM2(site.points))} m² · " +
                    "perimeter ${"%.2f".format(Survey.perimeterM(site.points))} m",
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                if (heights == null) {
                    "No heights measured yet"
                } else {
                    "Heights ${"%.2f".format(heights.first)} to ${"%.2f".format(heights.second)} m"
                },
                style = MaterialTheme.typography.bodySmall,
            )

            PlanEditor(
                points = site.points,
                selectedIndex = selected,
                onSelect = { selectedIndex = it },
                onMoveEnd = { index, x, y ->
                    val moved = Survey.moveTo(site.points, index, x, y)
                    if (moved == null) {
                        moveError = "That move would put this point on top of its neighbour, or it is the origin."
                    } else {
                        moveError = null
                        onSave(site.copy(points = moved))
                    }
                },
            )
            Text(
                "Tap a point to select it. Drag a point to move it. Drag the background to pan, pinch to zoom. The origin is fixed.",
                style = MaterialTheme.typography.bodySmall,
            )
            selected?.let { i ->
                val p = site.points[i]
                Text(
                    "Selected: ${i + 1}. ${p.label}" + if (i == 0) " (origin, fixed)" else "",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            moveError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

            if (site.points.size >= 2) {
                Text("Side view", style = MaterialTheme.typography.titleSmall)
                ElevationView(points = site.points)
                Text(
                    "Across the survey from the origin, and height above the origin's ground. " +
                        "Hollow points have no height and sit on the ground.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            Text("Add a point", style = MaterialTheme.typography.titleMedium)
            Text(
                if (isOrigin) {
                    "The first point is the origin. Give it a label and, if you measured it, a height."
                } else {
                    "Measure from the last point: how far, and which way from north."
                },
                style = MaterialTheme.typography.bodySmall,
            )
            OutlinedTextField(
                value = label,
                onValueChange = { label = it },
                label = { Text("Label, for example Tree A") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            if (!isOrigin) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedTextField(
                        value = distance,
                        onValueChange = { distance = it },
                        label = { Text("Distance (m)") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        value = bearing,
                        onValueChange = { bearing = it },
                        label = { Text("Bearing (°)") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            OutlinedTextField(
                value = height,
                onValueChange = { height = it },
                label = { Text("Height above origin (m), optional") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = note,
                onValueChange = { note = it },
                label = { Text("Note, optional") },
                modifier = Modifier.fillMaxWidth(),
            )
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(onClick = { addPoint() }, modifier = Modifier.fillMaxWidth()) {
                Text("Add point")
            }

            if (site.points.isNotEmpty()) {
                Text("Points", style = MaterialTheme.typography.titleMedium)
                site.points.forEachIndexed { index, p ->
                    PointRow(index, p, selected = index == selected, onClick = { selectedIndex = index })
                }
                OutlinedButton(
                    onClick = { onSave(site.copy(points = site.points.dropLast(1))) },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Remove last point") }
            }

            Text("Export", style = MaterialTheme.typography.titleMedium)
            Text(
                "A .sitescan file holds the survey, a CSV of the points, and checksums. It opens without this app.",
                style = MaterialTheme.typography.bodySmall,
            )
            Button(
                onClick = {
                    scope.launch {
                        exportMessage = try {
                            val name = SiteScanExport.fileName(site)
                            val uri = withContext(Dispatchers.IO) {
                                AndroidExport.saveToDownloads(context, name, SiteScanExport.MIME_TYPE) { out ->
                                    SiteScanExport.write(site, appVersionName(context), nowIso(), out)
                                }
                            }
                            "Saved $name to Downloads/${AndroidExport.DOWNLOAD_SUBFOLDER}. ($uri)"
                        } catch (e: Exception) {
                            "Could not save: ${e.message ?: "unknown error"}"
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Save to Downloads") }
            OutlinedButton(
                onClick = {
                    scope.launch {
                        exportMessage = try {
                            val name = SiteScanExport.fileName(site)
                            val staged = withContext(Dispatchers.IO) {
                                AndroidExport.stageForShare(context, name) { out ->
                                    SiteScanExport.write(site, appVersionName(context), nowIso(), out)
                                }
                            }
                            AndroidExport.share(context, staged, SiteScanExport.MIME_TYPE, "Share $name")
                            null
                        } catch (e: Exception) {
                            "Could not share: ${e.message ?: "unknown error"}"
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Share .sitescan") }
            exportMessage?.let { Text(it, style = MaterialTheme.typography.bodySmall) }

            Spacer(Modifier.height(8.dp))
            TextButton(onClick = { confirmDelete = true }) {
                Text("Delete this site", color = MaterialTheme.colorScheme.error)
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete ${site.name}?") },
            text = { Text("This removes the survey from this phone. Export it first if you want to keep it.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    onDelete()
                }) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun PointRow(index: Int, p: SurveyPoint, selected: Boolean, onClick: () -> Unit) {
    val details = buildString {
        if (p.distanceM != null && p.bearingDeg != null) {
            append("${"%.2f".format(p.distanceM)} m at ${"%.0f".format(p.bearingDeg)}°")
        } else {
            append("origin")
        }
        p.heightM?.let { append(" · height ${"%.2f".format(it)} m") }
    }
    Column(
        Modifier
            .fillMaxWidth()
            .background(if (selected) MaterialTheme.colorScheme.secondaryContainer else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(6.dp),
    ) {
        Text("${index + 1}. ${p.label}", style = MaterialTheme.typography.bodyMedium)
        Text(
            "$details · x ${"%.2f".format(p.x)}, y ${"%.2f".format(p.y)} m" +
                if (p.note.isNotEmpty()) " · ${p.note}" else "",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

private fun nowIso(): String = java.time.Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS).toString()

internal fun appVersionName(context: android.content.Context): String =
    try {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "unknown"
    } catch (_: Exception) {
        "unknown"
    }
