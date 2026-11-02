import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STATUS_COLOR, clampToSite, snap, type Point } from './model';
import { type PlantShape, canopySegments, worldPosition } from './scene';

/**
 * The perspective view. A thin layer over three.js: it draws the plants that
 * scene.ts describes, and turns pointer drags into the same move the 2D plan
 * makes. The application state stays the one source of truth. A drag here only
 * previews the move until the change is saved, then the scene is redrawn from state.
 */

export interface SceneCallbacks {
  onSelect: (id: string) => void;
  onMove: (id: string, to: Point) => void;
}

/** A drag shorter than this is a click, not a move. */
const DRAG_THRESHOLD_M = 0.05;
const STEM_RADIUS_M = 0.02;
const BACKGROUND = 0xeef2ec;
const SITE_FILL = 0xf7f4ec;
const SITE_EDGE = 0x7d8a80;
const STEM_COLOUR = 0x5a4a36;

interface Drag {
  id: string;
  index: number;
  base: Point;
  start: Point;
  latest: Point;
  moved: boolean;
}

export class PlantScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hitPoint = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly rotation = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly colour = new THREE.Color();
  private readonly ground: THREE.Mesh;
  private readonly edge: THREE.LineSegments;
  private readonly ring: THREE.Mesh;
  private readonly resizeObserver: ResizeObserver;
  private site = { widthM: 1, depthM: 1 };
  private framedSite = '';
  private shapes: PlantShape[] = [];
  private canopies: THREE.InstancedMesh | null = null;
  private stems: THREE.InstancedMesh | null = null;
  private capacity = 0;
  private segments = 0;
  private selectedId: string | null = null;
  private drag: Drag | null = null;
  private frameRequested = false;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: SceneCallbacks,
  ) {
    // Throws when WebGL is unavailable. The caller then shows the side elevation instead.
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const canvas = this.renderer.domElement;
    canvas.className = 'scene-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    this.scene.background = new THREE.Color(BACKGROUND);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7f6b, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(6, 14, 8);
    this.scene.add(sun);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ color: SITE_FILL }));
    this.ground.rotation.x = -Math.PI / 2;
    this.scene.add(this.ground);

    this.edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
      new THREE.LineBasicMaterial({ color: SITE_EDGE }),
    );
    this.edge.rotation.x = -Math.PI / 2;
    this.scene.add(this.edge);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 48),
      new THREE.MeshBasicMaterial({ color: 0x1f3a2a, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.addEventListener('change', this.requestRender);

    // Capture phase, so a plant press is seen before the orbit controls, which can then be stopped from starting.
    canvas.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  /** Redraws the site and every plant. Called whenever the design, the site or the verdicts change. */
  setDesign(site: { widthM: number; depthM: number }, shapes: PlantShape[]): void {
    this.site = site;
    this.shapes = shapes;
    const key = `${site.widthM}x${site.depthM}`;
    if (key !== this.framedSite) {
      this.framedSite = key;
      this.frameSite();
    }
    this.ground.scale.set(site.widthM, site.depthM, 1);
    this.edge.scale.set(site.widthM, site.depthM, 1);
    this.redrawPlants();
    this.requestRender();
  }

  /** Compiles the materials of the current scene now, so the first frame the person sees does not wait for shaders. */
  warmUp(): void {
    this.renderer.compile(this.scene, this.camera);
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    this.updateRing();
    this.requestRender();
  }

  dispose(): void {
    this.disposed = true;
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.controls.removeEventListener('change', this.requestRender);
    this.controls.dispose();
    this.removePlantMeshes();
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
    this.edge.geometry.dispose();
    (this.edge.material as THREE.Material).dispose();
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.renderer.dispose();
    canvas.remove();
  }

  private redrawPlants(): void {
    const count = this.shapes.length;
    const segments = canopySegments(count);
    if (!this.canopies || !this.stems || count > this.capacity || segments !== this.segments) {
      this.removePlantMeshes();
      this.segments = segments;
      this.capacity = Math.max(count, 16);
      const crownGeometry = new THREE.SphereGeometry(1, segments, Math.max(4, Math.round(segments * 0.75)));
      this.canopies = new THREE.InstancedMesh(crownGeometry, new THREE.MeshLambertMaterial(), this.capacity);
      this.stems = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(1, 1, 1, 6),
        new THREE.MeshLambertMaterial({ color: STEM_COLOUR }),
        this.capacity,
      );
      this.canopies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.stems.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(this.canopies, this.stems);
    }
    this.canopies.count = count;
    this.stems.count = count;
    this.shapes.forEach((shape, index) => this.writeInstance(index, shape, { x: shape.x, y: shape.y }));
    this.canopies.instanceMatrix.needsUpdate = true;
    this.stems.instanceMatrix.needsUpdate = true;
    if (this.canopies.instanceColor) this.canopies.instanceColor.needsUpdate = true;
    this.updateRing();
  }

  /** One plant: an ellipsoid crown whose top is the mature height, on a stem down to the ground. */
  private writeInstance(index: number, shape: PlantShape, at: Point): void {
    if (!this.canopies || !this.stems) return;
    const { x, z } = worldPosition(at, this.site);
    const height = shape.heightM;
    const crownCentre = height * 0.62;
    const crownRadiusY = height * 0.38;
    this.position.set(x, crownCentre, z);
    this.scale.set(shape.canopyRadiusM, crownRadiusY, shape.canopyRadiusM);
    this.matrix.compose(this.position, this.rotation, this.scale);
    this.canopies.setMatrixAt(index, this.matrix);
    this.canopies.setColorAt(index, this.colour.set(STATUS_COLOR[shape.status]));

    const stemHeight = Math.max(crownCentre - crownRadiusY, 0.001);
    this.position.set(x, stemHeight / 2, z);
    this.scale.set(STEM_RADIUS_M, stemHeight, STEM_RADIUS_M);
    this.matrix.compose(this.position, this.rotation, this.scale);
    this.stems.setMatrixAt(index, this.matrix);
  }

  private updateRing(): void {
    const index = this.shapes.findIndex((shape) => shape.id === this.selectedId);
    if (index === -1) {
      this.ring.visible = false;
      return;
    }
    const shape = this.shapes[index];
    const { x, z } = worldPosition(shape, this.site);
    this.ring.position.set(x, 0.01, z);
    this.ring.scale.setScalar(shape.canopyRadiusM * 1.2);
    this.ring.visible = true;
  }

  private removePlantMeshes(): void {
    for (const mesh of [this.canopies, this.stems]) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
    this.canopies = null;
    this.stems = null;
  }

  /** Looks down on the site from a three-quarter angle, with the whole plot in view. */
  private frameSite(): void {
    const span = Math.max(this.site.widthM, this.site.depthM);
    const distance = ((span / 2) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.25;
    this.camera.position.set(0, distance * 0.75, distance * 0.66);
    this.controls.target.set(0, 0.3, 0);
    this.controls.update();
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  /** Draws on the next animation frame, once, however many changes arrived in between. */
  private readonly requestRender = (): void => {
    if (this.frameRequested || this.disposed) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      if (!this.disposed) this.renderer.render(this.scene, this.camera);
    });
  };

  private setPointer(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  /** The plant under the pointer, as an index into the shapes, or null. */
  private pickPlant(event: PointerEvent): number | null {
    if (!this.canopies || this.shapes.length === 0) return null;
    this.setPointer(event);
    // The instanced mesh caches one bounding sphere. Plants move, so recompute it before each pick.
    this.canopies.computeBoundingSphere();
    const [hit] = this.raycaster.intersectObject(this.canopies, false);
    return hit?.instanceId ?? null;
  }

  /** Where the pointer is on the ground, in site metres (origin at the top-left corner). */
  private groundPoint(event: PointerEvent): Point | null {
    this.setPointer(event);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.hitPoint);
    if (!hit) return null;
    return { x: hit.x + this.site.widthM / 2, y: hit.z + this.site.depthM / 2 };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    const index = this.pickPlant(event);
    if (index === null) return;
    // A press on a plant moves the plant, never the camera.
    event.stopImmediatePropagation();
    const shape = this.shapes[index];
    const start = this.groundPoint(event);
    this.callbacks.onSelect(shape.id);
    if (!start) return;
    const base = { x: shape.x, y: shape.y };
    this.drag = { id: shape.id, index, base, start, latest: base, moved: false };
    this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag) return;
    const now = this.groundPoint(event);
    if (!now) return;
    const candidate = clampToSite(
      { x: drag.base.x + (now.x - drag.start.x), y: drag.base.y + (now.y - drag.start.y) },
      this.site,
    );
    drag.latest = candidate;
    drag.moved ||= Math.hypot(candidate.x - drag.base.x, candidate.y - drag.base.y) > DRAG_THRESHOLD_M;
    if (!drag.moved || !this.canopies || !this.stems) return;
    this.writeInstance(drag.index, this.shapes[drag.index], candidate);
    this.canopies.instanceMatrix.needsUpdate = true;
    this.stems.instanceMatrix.needsUpdate = true;
    this.requestRender();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    this.controls.enabled = true;
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) {
      this.renderer.domElement.releasePointerCapture(event.pointerId);
    }
    // Put every plant back where the state says it is. The saved move, if any, arrives as new props.
    this.redrawPlants();
    this.requestRender();
    if (drag.moved) {
      this.callbacks.onMove(drag.id, clampToSite({ x: snap(drag.latest.x), y: snap(drag.latest.y) }, this.site));
    }
  };
}
