import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { initChrome, isWebGLAvailable, showWebGLFallback } from '../lib/ui.js';
import {
  addTacticalLights,
  buildPointCloudFromTerrain,
  buildTerrainGeometry,
  createRenderer,
  createTopoShaderMaterial,
} from '../lib/terrain.js';

initChrome();

const SITE_META = {
  coastal: {
    label: 'COASTAL CLIFF SURVEY',
    utmOffset: [314820.4, 2108450.2, 42.0],
    scaleMeters: 14.5,
  },
  substation: {
    label: 'INFRASTRUCTURE SUBSTATION',
    utmOffset: [542190.8, 4189320.6, 118.4],
    scaleMeters: 12.0,
  },
  canyon: {
    label: 'DISASTER CORRIDOR CANYON',
    utmOffset: [428710.1, 3621090.9, 284.7],
    scaleMeters: 18.0,
  },
};

function initSandbox() {
  const canvas = document.querySelector('#sandbox-canvas');
  if (!canvas) return;
  if (!isWebGLAvailable()) {
    showWebGLFallback(canvas);
    return;
  }

  const renderer = createRenderer(canvas, 2.0);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x06070a, 0.025);

  const camera = new THREE.PerspectiveCamera(
    45,
    (canvas.clientWidth || 1) / (canvas.clientHeight || 1),
    0.1,
    120
  );

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 4;
  controls.maxDistance = 32;

  addTacticalLights(scene);

  const grid = new THREE.GridHelper(24, 36, 0xff4b0b, 0x1b2029);
  grid.position.y = -1.6;
  grid.material.transparent = true;
  grid.material.opacity = 0.25;
  scene.add(grid);

  const modelGroup = new THREE.Group();
  scene.add(modelGroup);

  // Measurement visuals
  const measureGroup = new THREE.Group();
  scene.add(measureGroup);
  const markerGeo = new THREE.SphereGeometry(0.14, 16, 16);
  const markerMatA = new THREE.MeshBasicMaterial({ color: 0xff4b0b });
  const markerMatB = new THREE.MeshBasicMaterial({ color: 0x5cc4ff });
  const markerA = new THREE.Mesh(markerGeo, markerMatA);
  const markerB = new THREE.Mesh(markerGeo, markerMatB);
  markerA.visible = false;
  markerB.visible = false;
  const lineMat = new THREE.LineBasicMaterial({ color: 0xff4b0b });
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  const measureLine = new THREE.Line(lineGeo, lineMat);
  measureLine.visible = false;
  measureGroup.add(markerA, markerB, measureLine);

  let currentSite = 'coastal';
  let currentMode = 'topo';
  let measureEnabled = false;
  let georeferenced = true;
  let pointA = null;
  let pointB = null;
  let solidMesh = null;
  let wireMesh = null;
  let cloudPoints = null;
  let topoMat = null;

  const vertsEl = document.querySelector('#stat-verts');
  const trisEl = document.querySelector('#stat-tris');
  const lifecycleEl = document.querySelector('#stat-lifecycle');
  const coordEl = document.querySelector('#hud-coords');
  const distOut = document.querySelector('#measure-distance');
  const unitNote = document.querySelector('#measure-unit-note');

  const clearMeasure = () => {
    pointA = null;
    pointB = null;
    markerA.visible = false;
    markerB.visible = false;
    measureLine.visible = false;
    if (distOut) distOut.textContent = '--';
    if (unitNote) {
      unitNote.textContent = georeferenced
        ? 'WGS 84 / UTM METRIC SCALE (NOMINAL GNSS ±2–5m)'
        : 'UNCALIBRATED RELATIVE MODE (MODEL UNITS ONLY)';
    }
  };

  const updateDistanceDisplay = () => {
    if (!pointA || !pointB || !distOut) return;
    const raw = pointA.distanceTo(pointB);
    if (georeferenced) {
      const meters = raw * SITE_META[currentSite].scaleMeters;
      distOut.textContent = `${meters.toFixed(2)} m`;
    } else {
      distOut.textContent = `${raw.toFixed(3)} units`;
    }
  };

  const resetView = () => {
    camera.position.set(8.5, 7.2, 11.2);
    controls.target.set(0, 0.2, 0);
    controls.update();
  };

  const applyViewMode = (mode) => {
    currentMode = mode;
    document.querySelectorAll('[data-view-mode]').forEach((b) =>
      b.classList.toggle('active', b.dataset.viewMode === mode)
    );
    if (!solidMesh || !wireMesh || !cloudPoints || !topoMat) return;
    solidMesh.visible = mode === 'topo' || mode === 'heatmap';
    topoMat.uniforms.uHeatmap.value = mode === 'heatmap' ? 1.0 : 0.0;
    wireMesh.visible = mode === 'wireframe';
    cloudPoints.visible = mode === 'pointcloud';
  };

  const loadSite = (site) => {
    currentSite = site;
    document.querySelectorAll('[data-site]').forEach((b) =>
      b.classList.toggle('active', b.dataset.site === site)
    );

    if (lifecycleEl) lifecycleEl.textContent = 'PARSING -> UPLOADING -> LOADED';

    // Dispose old geometry/materials
    if (solidMesh) {
      solidMesh.geometry.dispose();
      solidMesh.material.dispose();
      modelGroup.remove(solidMesh);
    }
    if (wireMesh) {
      wireMesh.material.dispose();
      modelGroup.remove(wireMesh);
    }
    if (cloudPoints) {
      cloudPoints.geometry.dispose();
      cloudPoints.material.dispose();
      modelGroup.remove(cloudPoints);
    }

    const segs = 96;
    const { geo, minY, maxY } = buildTerrainGeometry(14, segs, site);
    topoMat = createTopoShaderMaterial(minY, maxY);
    solidMesh = new THREE.Mesh(geo, topoMat);
    wireMesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0xff4b0b, wireframe: true, transparent: true, opacity: 0.72 })
    );

    const cloudGeo = buildPointCloudFromTerrain(14, 7200, site, site.length * 97);
    cloudPoints = new THREE.Points(
      cloudGeo,
      new THREE.PointsMaterial({ size: 0.075, vertexColors: true })
    );

    modelGroup.add(solidMesh, wireMesh, cloudPoints);

    if (vertsEl) vertsEl.textContent = geo.attributes.position.count.toLocaleString();
    if (trisEl) trisEl.textContent = (segs * segs * 2).toLocaleString();

    clearMeasure();
    applyViewMode(currentMode);
  };

  // UI Bindings
  document.querySelectorAll('[data-site]').forEach((b) =>
    b.addEventListener('click', () => loadSite(b.dataset.site))
  );
  document.querySelectorAll('[data-view-mode]').forEach((b) =>
    b.addEventListener('click', () => applyViewMode(b.dataset.viewMode))
  );

  const measureBtn = document.querySelector('#toggle-measure');
  measureBtn?.addEventListener('click', () => {
    measureEnabled = !measureEnabled;
    measureBtn.classList.toggle('active', measureEnabled);
    measureBtn.textContent = measureEnabled ? 'MEASURE: ACTIVE (CLICK A & B)' : 'ENABLE MEASURE TOOL';
    canvas.classList.toggle('measuring', measureEnabled);
  });

  document.querySelector('#clear-measure')?.addEventListener('click', clearMeasure);
  document.querySelector('#reset-camera')?.addEventListener('click', resetView);

  const georefBtn = document.querySelector('#toggle-georef');
  georefBtn?.addEventListener('click', () => {
    georeferenced = !georeferenced;
    georefBtn.textContent = georeferenced ? 'MODE: GEOREFERENCED (SRT)' : 'MODE: UNCALIBRATED (NO SRT)';
    georefBtn.classList.toggle('active', georeferenced);
    if (unitNote) {
      unitNote.textContent = georeferenced
        ? 'WGS 84 / UTM METRIC SCALE (NOMINAL GNSS ±2–5m)'
        : 'UNCALIBRATED RELATIVE MODE (MODEL UNITS ONLY)';
    }
    updateDistanceDisplay();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') resetView();
  });

  // Raycasting for coordinates + point-to-point distance
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let lastRay = 0;

  const getHitPoint = (e) => {
    if (!solidMesh) return null;
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(solidMesh, false);
    return hits[0]?.point ?? null;
  };

  canvas.addEventListener('pointermove', (e) => {
    const now = performance.now();
    if (now - lastRay < 40) return;
    lastRay = now;
    const hit = getHitPoint(e);
    if (!hit || !coordEl) return;
    if (georeferenced) {
      const [ox, oy, oz] = SITE_META[currentSite].utmOffset;
      const s = SITE_META[currentSite].scaleMeters;
      coordEl.textContent = `E ${(ox + hit.x * s).toFixed(1)} · N ${(oy + hit.z * s).toFixed(1)} · Z ${(oz + hit.y * s).toFixed(1)}m`;
    } else {
      coordEl.textContent = `LOCAL X ${hit.x.toFixed(2)} · Y ${hit.y.toFixed(2)} · Z ${hit.z.toFixed(2)} units`;
    }
  });

  canvas.addEventListener('click', (e) => {
    if (!measureEnabled) return;
    const hit = getHitPoint(e);
    if (!hit) return;

    if (!pointA || (pointA && pointB)) {
      pointA = hit.clone();
      pointB = null;
      markerA.position.copy(pointA);
      markerA.visible = true;
      markerB.visible = false;
      measureLine.visible = false;
      if (distOut) distOut.textContent = 'SELECT POINT B...';
    } else {
      pointB = hit.clone();
      markerB.position.copy(pointB);
      markerB.visible = true;
      lineGeo.setFromPoints([pointA, pointB]);
      measureLine.visible = true;
      updateDistanceDisplay();
    }
  });

  // WebGL context resilience
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (lifecycleEl) lifecycleEl.textContent = 'CONTEXT LOST — RECOVERING';
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (lifecycleEl) lifecycleEl.textContent = 'LOADED';
  });

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  loadSite('coastal');
  resetView();

  const clock = new THREE.Clock();
  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const t = clock.getElapsedTime();
    if (topoMat) {
      topoMat.uniforms.uTime.value = t;
    }
    controls.update();
    renderer.render(scene, camera);
  };
  tick();

  window.addEventListener('beforeunload', () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    controls.dispose();
    renderer.dispose();
  });
}

initSandbox();
