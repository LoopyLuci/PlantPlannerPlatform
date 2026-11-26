package org.plantplanner.survey.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import org.plantplanner.survey.model.SurveyPoint

/**
 * The side view: each point's height against how far along the survey it is. The ground line is
 * drawn at the bottom. A point with no height sits on the ground as a hollow marker.
 */
@Composable
fun ElevationView(points: List<SurveyPoint>, modifier: Modifier = Modifier) {
    val lineColor = MaterialTheme.colorScheme.primary
    val dotColor = MaterialTheme.colorScheme.tertiary
    val groundColor = MaterialTheme.colorScheme.outline
    val paper = MaterialTheme.colorScheme.surfaceVariant
    val profile = remember(points) { ElevationGeometry.profile(points) }

    Canvas(modifier.fillMaxWidth().height(160.dp).background(paper)) {
        if (profile.isEmpty()) return@Canvas
        val w = size.width.toDouble()
        val h = size.height.toDouble()
        val length = ElevationGeometry.totalLengthM(profile)
        val maxH = ElevationGeometry.maxHeightM(profile)

        // Ground line.
        val groundY = ElevationGeometry.toY(0.0, maxH, h).toFloat()
        drawLine(groundColor, Offset(0f, groundY), Offset(size.width, groundY), strokeWidth = 2.dp.toPx())

        val screen = profile.map { p ->
            Offset(
                ElevationGeometry.toX(p.distanceM, length, w).toFloat(),
                ElevationGeometry.toY(p.heightM ?: 0.0, maxH, h).toFloat(),
            )
        }
        val path = Path()
        screen.forEachIndexed { i, o -> if (i == 0) path.moveTo(o.x, o.y) else path.lineTo(o.x, o.y) }
        drawPath(path, color = lineColor, style = Stroke(width = 3.dp.toPx()))

        profile.forEachIndexed { i, p ->
            val o = screen[i]
            if (p.heightM != null) {
                drawCircle(color = dotColor, radius = 7.dp.toPx(), center = o)
            } else {
                drawCircle(color = dotColor, radius = 7.dp.toPx(), center = o, style = Stroke(2.dp.toPx()))
            }
        }
    }
}
