package org.plantplanner.survey.ui

import android.view.MotionEvent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.TrackingState
import io.github.sceneview.ar.ARSceneView
import org.plantplanner.survey.model.ArCapture
import org.plantplanner.survey.model.Site
import org.plantplanner.survey.model.SurveyException
import java.util.concurrent.atomic.AtomicReference

/**
 * Places survey points by tapping the floor in AR. The first tap is the origin. Each later tap is
 * measured from the previous point, as with the manual flow. Heights are measured up from the
 * origin's ground. North is the heading the phone had when the session started, not a compass
 * bearing.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArCaptureScreen(site: Site, onSave: (Site) -> Unit, onBack: () -> Unit) {
    val latestFrame = remember { AtomicReference<Frame?>(null) }
    // The world position of this session's origin. Set by the first tap, lost when the screen closes.
    var origin by remember(site.id) { mutableStateOf<ArCapture.WorldPoint?>(null) }
    var message by remember(site.id) {
        mutableStateOf(
            "Move the phone slowly over the floor until it shows dots. Tap the floor to place the origin, then tap again for each next point.",
        )
    }
    val siteNow = rememberUpdatedState(site)
    val originNow = rememberUpdatedState(origin)

    fun placeAt(event: MotionEvent) {
        val frame = latestFrame.get()
        if (frame == null || frame.camera.trackingState != TrackingState.TRACKING) {
            message = "AR is still finding the floor. Move the phone a little, then tap again."
            return
        }
        val hit = frame.hitTest(event).firstOrNull { result ->
            val trackable = result.trackable
            trackable is Plane &&
                trackable.type == Plane.Type.HORIZONTAL_UPWARD_FACING &&
                trackable.isPoseInPolygon(result.hitPose)
        }
        if (hit == null) {
            message = "No floor under that point. Tap a flat part of the floor."
            return
        }
        val pose = hit.hitPose
        val world = ArCapture.WorldPoint(pose.tx().toDouble(), pose.ty().toDouble(), pose.tz().toDouble())
        val current = siteNow.value
        try {
            if (current.points.isEmpty()) {
                origin = world
                onSave(ArCapture.addPoint(current, ArCapture.SitePosition(0.0, 0.0, 0.0)))
                message = "Origin placed. Tap the next point on the floor."
                return
            }
            val originWorld = originNow.value
                ?: throw SurveyException(
                    "This site already has points, and the origin was set in an earlier session. Start a new site to capture with AR.",
                )
            val position = ArCapture.toSitePosition(originWorld, world)
            onSave(ArCapture.addPoint(current, position))
            message = "Point ${current.points.size + 1} placed, " +
                "${"%.2f".format(position.north)} m north, ${"%.2f".format(position.east)} m east, " +
                "${"%.2f".format(position.up)} m above the origin ground."
        } catch (e: SurveyException) {
            message = e.message ?: "Could not place that point."
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("AR capture: ${site.name}", maxLines = 1) },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
            )
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            ARSceneView(
                modifier = Modifier.fillMaxSize(),
                planeRenderer = true,
                onSessionUpdated = { _, frame -> latestFrame.set(frame) },
                onSessionFailed = { e -> message = "AR could not start on this phone: ${e.message ?: "unknown error"}" },
                onTouchEvent = { event, _ ->
                    if (event.actionMasked == MotionEvent.ACTION_UP) placeAt(event)
                    true
                },
            )
            Surface(
                modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(12.dp),
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
                shape = MaterialTheme.shapes.medium,
            ) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${site.points.size} points captured", style = MaterialTheme.typography.titleSmall)
                    Text(message, style = MaterialTheme.typography.bodySmall)
                    Text(
                        "North here is the direction the phone faced when AR started, not a compass bearing.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    OutlinedButton(
                        onClick = {
                            val remaining = site.points.dropLast(1)
                            if (remaining.isEmpty()) origin = null
                            onSave(site.copy(points = remaining))
                            message = "Removed the last point."
                        },
                        enabled = site.points.isNotEmpty(),
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Undo last point") }
                }
            }
        }
    }
}
