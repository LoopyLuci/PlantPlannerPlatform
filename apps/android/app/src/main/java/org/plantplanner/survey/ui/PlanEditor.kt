package org.plantplanner.survey.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import org.plantplanner.survey.model.SurveyPoint
import kotlin.math.hypot

/**
 * The plan, drawn north up and editable by touch:
 *  - tap a point to select it;
 *  - drag a point (not the origin) to move it; it is saved when the finger lifts;
 *  - drag the background to pan, pinch to zoom, and use Fit to reset the view.
 */
@Composable
fun PlanEditor(
    points: List<SurveyPoint>,
    selectedIndex: Int?,
    onSelect: (Int?) -> Unit,
    onMoveEnd: (index: Int, x: Double, y: Double) -> Unit,
    modifier: Modifier = Modifier,
) {
    val lineColor = MaterialTheme.colorScheme.primary
    val dotColor = MaterialTheme.colorScheme.tertiary
    val selectedColor = MaterialTheme.colorScheme.error
    val paper = MaterialTheme.colorScheme.surfaceVariant

    var view by remember { mutableStateOf(PlanView()) }
    var canvasSize by remember { mutableStateOf(IntSize.Zero) }
    // The point being dragged shows here until the finger lifts, so the survey is saved once per move.
    var dragIndex by remember { mutableStateOf<Int?>(null) }
    var dragX by remember { mutableStateOf(0.0) }
    var dragY by remember { mutableStateOf(0.0) }

    val latestPoints by rememberUpdatedState(points)
    val latestOnSelect by rememberUpdatedState(onSelect)
    val latestOnMoveEnd by rememberUpdatedState(onMoveEnd)

    Box(modifier.fillMaxWidth().height(320.dp).background(paper)) {
        Canvas(
            Modifier
                .fillMaxSize()
                .onSizeChanged { canvasSize = it }
                .pointerInput(Unit) {
                    awaitEachGesture {
                        val w = canvasSize.width.toDouble()
                        val h = canvasSize.height.toDouble()
                        if (w <= 0.0 || h <= 0.0) return@awaitEachGesture
                        val down = awaitFirstDown(requireUnconsumed = false)
                        val startPoints = latestPoints
                        val frame = PlanGeometry.frame(startPoints, w, h)
                        val hit = PlanGeometry.hitIndex(
                            startPoints, frame, view, w, h,
                            down.position.x.toDouble(), down.position.y.toDouble(), 40.0,
                        )
                        // The origin is fixed, so only the other points can be dragged.
                        val dragTarget = hit?.takeIf { it >= 1 }
                        var allowDrag = dragTarget != null
                        var totalX = 0.0
                        var totalY = 0.0
                        var moved = false
                        var pinching = false
                        var lastSpan = 0.0
                        var lastCx = 0.0
                        var lastCy = 0.0

                        while (true) {
                            val event = awaitPointerEvent()
                            val pressed = event.changes.filter { it.pressed }
                            if (pressed.isEmpty()) break

                            if (pressed.size >= 2) {
                                // Two fingers: pinch to zoom about the midpoint, and pan with it.
                                val n = pressed.size.toDouble()
                                val cx = pressed.sumOf { it.position.x.toDouble() } / n
                                val cy = pressed.sumOf { it.position.y.toDouble() } / n
                                val span = pressed.sumOf {
                                    hypot(it.position.x.toDouble() - cx, it.position.y.toDouble() - cy)
                                } / n
                                if (pinching && lastSpan > 1e-3 && span > 1e-3) {
                                    val zoomed = PlanGeometry.zoomAbout(view, span / lastSpan, cx, cy, w, h)
                                    view = zoomed.copy(
                                        panX = zoomed.panX + (cx - lastCx),
                                        panY = zoomed.panY + (cy - lastCy),
                                    )
                                }
                                pinching = true
                                allowDrag = false
                                moved = true
                                lastSpan = span
                                lastCx = cx
                                lastCy = cy
                                dragIndex = null
                                pressed.forEach { it.consume() }
                            } else {
                                val change = pressed.first()
                                if (pinching) {
                                    // One finger left after a pinch: start again from where it is now.
                                    pinching = false
                                    change.consume()
                                    continue
                                }
                                val dx = (change.position.x - change.previousPosition.x).toDouble()
                                val dy = (change.position.y - change.previousPosition.y).toDouble()
                                totalX += dx
                                totalY += dy
                                if (!moved && hypot(totalX, totalY) > 8.0) moved = true
                                if (allowDrag && dragTarget != null) {
                                    if (moved) {
                                        val s = PlanGeometry.pxPerM(frame, view)
                                        val start = startPoints[dragTarget]
                                        dragIndex = dragTarget
                                        dragX = start.x + totalX / s
                                        dragY = start.y - totalY / s
                                    }
                                } else {
                                    view = view.copy(panX = view.panX + dx, panY = view.panY + dy)
                                }
                                change.consume()
                            }
                        }

                        val finishedDrag = dragIndex
                        if (finishedDrag != null) {
                            latestOnMoveEnd(finishedDrag, dragX, dragY)
                            dragIndex = null
                        } else if (!moved) {
                            latestOnSelect(hit)
                        }
                    }
                },
        ) {
            if (points.isEmpty()) return@Canvas
            val w = size.width.toDouble()
            val h = size.height.toDouble()
            val frame = PlanGeometry.frame(points, w, h)
            val shown = points.mapIndexed { i, p -> if (i == dragIndex) p.copy(x = dragX, y = dragY) else p }
            val screen = shown.map { p ->
                val (sx, sy) = PlanGeometry.toScreen(p.x, p.y, frame, view, w, h)
                Offset(sx.toFloat(), sy.toFloat())
            }

            val path = Path()
            screen.forEachIndexed { i, o -> if (i == 0) path.moveTo(o.x, o.y) else path.lineTo(o.x, o.y) }
            if (screen.size >= 3) {
                path.close()
                drawPath(path, color = lineColor.copy(alpha = 0.15f))
            }
            drawPath(path, color = lineColor, style = Stroke(width = 4.dp.toPx()))

            screen.forEachIndexed { i, o ->
                val selected = i == selectedIndex
                drawCircle(
                    color = if (selected) selectedColor else dotColor,
                    radius = (if (selected) 12.dp else 8.dp).toPx(),
                    center = o,
                )
            }
            // A ring marks the origin, which cannot be moved.
            drawCircle(color = lineColor, radius = 14.dp.toPx(), center = screen.first(), style = Stroke(2.dp.toPx()))

            // North arrow, top right.
            val nx = w.toFloat() - 24.dp.toPx()
            // Below the Fit button, which sits in the top right corner.
            val ny = 72.dp.toPx()
            drawLine(lineColor, Offset(nx, ny + 18.dp.toPx()), Offset(nx, ny - 10.dp.toPx()), strokeWidth = 2.dp.toPx())
            drawLine(lineColor, Offset(nx, ny - 10.dp.toPx()), Offset(nx - 5.dp.toPx(), ny - 2.dp.toPx()), strokeWidth = 2.dp.toPx())
            drawLine(lineColor, Offset(nx, ny - 10.dp.toPx()), Offset(nx + 5.dp.toPx(), ny - 2.dp.toPx()), strokeWidth = 2.dp.toPx())

            // Scale bar, bottom left.
            val pxPerM = PlanGeometry.pxPerM(frame, view)
            val barPx = (PlanGeometry.scaleBarM(pxPerM) * pxPerM).toFloat()
            val bx = 16.dp.toPx()
            val by = h.toFloat() - 20.dp.toPx()
            drawLine(lineColor, Offset(bx, by), Offset(bx + barPx, by), strokeWidth = 3.dp.toPx())
            drawLine(lineColor, Offset(bx, by - 5.dp.toPx()), Offset(bx, by + 5.dp.toPx()), strokeWidth = 3.dp.toPx())
            drawLine(lineColor, Offset(bx + barPx, by - 5.dp.toPx()), Offset(bx + barPx, by + 5.dp.toPx()), strokeWidth = 3.dp.toPx())
        }

        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopEnd) {
            TextButton(onClick = { view = PlanView() }) { Text("Fit") }
        }
    }
}
