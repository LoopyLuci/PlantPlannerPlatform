package org.plantplanner.survey.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import io.github.sceneview.SceneView
import io.github.sceneview.math.Position
import io.github.sceneview.math.Size
import io.github.sceneview.rememberCameraManipulator
import io.github.sceneview.rememberEngine
import io.github.sceneview.rememberMaterialLoader
import org.plantplanner.survey.model.Site
import kotlin.math.max

/** Plants drawn above this count are left out, to keep the scene fast on a phone. */
internal const val MAX_DRAWN_PLANTS = 800

/**
 * The 3D view of a site: a ground plane, a placeholder canopy for each imported plant, and a
 * marker at each survey point. Scene axes: x east, z is minus north, y is up, in metres. Canopies
 * are spheres sized from the planned footprint. The export has no height, so they do not show
 * real heights.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlantScene3D(site: Site, onBack: () -> Unit) {
    val engine = rememberEngine()
    val materials = rememberMaterialLoader(engine)
    val frame = remember(site.id, site.points, site.plants) { SceneFrame.of(site) }
    val canopy = remember(materials) { materials.createColorInstance(Color(0xFF4E8F3A)) }
    val ground = remember(materials) { materials.createColorInstance(Color(0xFFCDBB94)) }
    val marker = remember(materials) { materials.createColorInstance(Color(0xFF2B6CB0)) }
    val cameraManipulator = rememberCameraManipulator(
        orbitHomePosition = Position(x = frame.centerX, y = frame.reach * 1.2f, z = frame.centerZ + frame.reach * 1.6f),
        targetPosition = Position(x = frame.centerX, y = 0f, z = frame.centerZ),
    )
    val drawn = site.plants.take(MAX_DRAWN_PLANTS)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("3D: ${site.name}", maxLines = 1) },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            SceneView(
                modifier = Modifier.fillMaxWidth().fillMaxSize(),
                engine = engine,
                materialLoader = materials,
                cameraManipulator = cameraManipulator,
            ) {
                CubeNode(
                    size = Size(x = frame.groundW, y = 0.02f, z = frame.groundD),
                    center = Position(x = 0f, y = 0f, z = 0f),
                    materialInstance = ground,
                    position = Position(x = frame.centerX, y = -0.01f, z = frame.centerZ),
                )
                drawn.forEach { plant ->
                    val radius = max(plant.footprintM / 2.0, 0.05).toFloat()
                    SphereNode(
                        radius = radius,
                        materialInstance = canopy,
                        position = Position(x = plant.xM.toFloat(), y = radius, z = -plant.yM.toFloat()),
                    )
                }
                site.points.forEach { point ->
                    CubeNode(
                        size = Size(x = 0.12f, y = 0.12f, z = 0.12f),
                        materialInstance = marker,
                        position = Position(
                            x = point.x.toFloat(),
                            y = (point.heightM ?: 0.0).toFloat() + 0.06f,
                            z = -point.y.toFloat(),
                        ),
                    )
                }
            }
        }
    }
}

/** Where the scene's ground and camera sit, from the site's points and plants. */
internal data class SceneFrame(
    val centerX: Float,
    val centerZ: Float,
    val groundW: Float,
    val groundD: Float,
    val reach: Float,
) {
    companion object {
        fun of(site: Site): SceneFrame {
            val xs = site.points.map { it.x } + site.plants.map { it.xM }
            val ys = site.points.map { it.y } + site.plants.map { it.yM }
            if (xs.isEmpty()) return SceneFrame(0f, 0f, 20f, 20f, 10f)
            val minX = xs.min()
            val maxX = xs.max()
            val minY = ys.min()
            val maxY = ys.max()
            val w = max(maxX - minX + 4.0, 4.0)
            val d = max(maxY - minY + 4.0, 4.0)
            val centerX = (minX + maxX) / 2.0
            val centerY = (minY + maxY) / 2.0
            return SceneFrame(
                centerX = centerX.toFloat(),
                centerZ = (-centerY).toFloat(),
                groundW = w.toFloat(),
                groundD = d.toFloat(),
                reach = max(w, d).toFloat().coerceAtLeast(5f),
            )
        }
    }
}
