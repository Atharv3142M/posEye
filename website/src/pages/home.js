import * as THREE from 'three';
import { initSiteChrome, isWebGLAvailable, showWebGLFallback } from '../lib/core.js';
import {
  addTacticalLights,
  buildPointCloudFromTerrain,
  buildTerrainGeometry,
  createDroneRig,
  createRenderer,
  createTopoShaderMaterial,
  sampleElevation,
} from '../lib/scene3d.js';

const { reduced, gsap, ScrollTrigger } = initSiteChrome();

function initHeroProductStage() {
  const canvas = document.querySelector('#hero-canvas');
  if (!canvas) return;
  if (!isWebGLAvailable()) {
    showWebGLFallback(canvas);
    return;
  }

  const renderer = createRenderer(canvas, 1.75);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060709, 0.032);

  const camera = new THREE.PerspectiveCamera(
    44,
    (canvas.clientWidth || 1) / (canvas.clientHeight || 1),
    0.1,
    120
  );
  camera.position.set(-1.2, 6.2, 13.6);

  addTacticalLights(scene);

  const world = new THREE.Group();
  scene.add(world);

  const { geo, minY, maxY } = buildTerrainGeometry(22, 108, 'coastal');
  const topoMat = createTopoShaderMaterial(minY, maxY);
  const topoMesh = new THREE.Mesh(geo, topoMat);
  world.add(topoMesh);

  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x3b4454,
    wireframe: true,
    transparent: true,
    opacity: 0.24,
  });
  const wireMesh = new THREE.Mesh(geo, wireMat);
  wireMesh.position.y = 0.015;
  world.add(wireMesh);

  const cloudGeo = buildPointCloudFromTerrain(22, 4200, 'coastal', 701);
  const cloudMat = new THREE.PointsMaterial({
    size: 0.055,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
  });
  const cloud = new THREE.Points(cloudGeo, cloudMat);
  world.add(cloud);

  const flightCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-6.5, 3.8, -3.5),
      new THREE.Vector3(-2.0, 4.3, -1.2),
      new THREE.Vector3(2.8, 4.0, 2.0),
      new THREE.Vector3(6.8, 3.9, -2.0),
      new THREE.Vector3(3.2, 4.5, -5.8),
      new THREE.Vector3(-4.0, 4.0, -5.0),
    ],
    true
  );
  const pathLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(flightCurve.getPoints(120)),
    new THREE.LineBasicMaterial({ color: 0x5cc4ff, transparent: true, opacity: 0.5 })
  );
  world.add(pathLine);

  const drone = createDroneRig();
  world.add(drone);

  // Live photogrammetry projection rays from drone to terrain footprint
  const rayCount = 8;
  const rayPositions = new Float32Array(rayCount * 2 * 3);
  const rayGeo = new THREE.BufferGeometry();
  rayGeo.setAttribute('position', new THREE.BufferAttribute(rayPositions, 3));
  const rayLines = new THREE.LineSegments(
    rayGeo,
    new THREE.LineBasicMaterial({ color: 0xff4b0b, transparent: true, opacity: 0.42 })
  );
  world.add(rayLines);

  const grid = new THREE.GridHelper(30, 48, 0xff4b0b, 0x1a202c);
  grid.position.y = -1.55;
  grid.material.transparent = true;
  grid.material.opacity = 0.22;
  world.add(grid);

  // Render mode switcher
  const modeButtons = [...document.querySelectorAll('[data-hero-mode]')];
  const modeReadout = document.querySelector('#win-mode-readout');
  const setMode = (next) => {
    modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.heroMode === next));
    topoMesh.visible = next === 'surface';
    wireMesh.visible = next === 'surface' || next === 'wireframe';
    wireMat.opacity = next === 'wireframe' ? 0.68 : 0.22;
    wireMat.color.setHex(next === 'wireframe' ? 0xff4b0b : 0x3b4454);
    cloud.visible = next === 'pointcloud' || next === 'surface';
    cloudMat.size = next === 'pointcloud' ? 0.088 : 0.045;
    cloudMat.opacity = next === 'pointcloud' ? 0.98 : 0.6;
    if (modeReadout) {
      modeReadout.textContent =
        next === 'pointcloud' ? 'DENSE POINT FIELD' : next === 'wireframe' ? 'TRIANGULATED MESH' : 'CONTOUR SURFACE';
    }
  };
  modeButtons.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.heroMode)));
  setMode('surface');

  let mx = 0;
  let my = 0;
  window.addEventListener('pointermove', (e) => {
    mx = e.clientX / window.innerWidth - 0.5;
    my = e.clientY / window.innerHeight - 0.5;
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

  let visible = true;
  const io = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
  }, { threshold: 0.02 });
  io.observe(canvas);

  const altHud = document.querySelector('#win-alt');
  const clock = new THREE.Clock();
  const posTmp = new THREE.Vector3();
  const nextTmp = new THREE.Vector3();

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (!visible) return;

    const t = clock.getElapsedTime();
    topoMat.uniforms.uTime.value = t;

    const u = reduced ? 0.25 : (t * 0.042) % 1;
    flightCurve.getPointAt(u, posTmp);
    flightCurve.getPointAt((u + 0.01) % 1, nextTmp);
    drone.position.copy(posTmp);
    drone.lookAt(nextTmp.x, posTmp.y, nextTmp.z);
    topoMat.uniforms.uScanPos.value.set(posTmp.x, posTmp.z);

    // Update projection rays
    const attr = rayGeo.attributes.position;
    for (let i = 0; i < rayCount; i++) {
      const theta = (i / rayCount) * Math.PI * 2 + t * 0.35;
      const rx = posTmp.x + Math.cos(theta) * 1.45;
      const rz = posTmp.z + Math.sin(theta) * 1.45;
      const ry = sampleElevation(rx, rz, 'coastal');
      attr.setXYZ(i * 2, posTmp.x, posTmp.y - 0.2, posTmp.z);
      attr.setXYZ(i * 2 + 1, rx, ry, rz);
    }
    attr.needsUpdate = true;

    if (altHud && Math.floor(t * 4) !== Math.floor((t - 0.016) * 4)) {
      altHud.textContent = `${(110 + posTmp.y * 6.5).toFixed(1)} m`;
    }

    if (!reduced) {
      world.rotation.y += (mx * 0.16 - world.rotation.y) * 0.03 + 0.00035;
      world.rotation.x += (-my * 0.05 - world.rotation.x) * 0.03;
    }
    camera.lookAt(0.4, 0.2, 0);
    renderer.render(scene, camera);
  };
  tick();

  window.addEventListener('beforeunload', () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    renderer.dispose();
  });
}

function initInteractiveMorphStage() {
  const section = document.querySelector('.morph-section');
  const canvas = document.querySelector('#morph-canvas');
  if (!section || !canvas) return;
  if (!isWebGLAvailable()) {
    showWebGLFallback(canvas);
    return;
  }

  const renderer = createRenderer(canvas, 1.6);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07080b, 0.03);

  const camera = new THREE.PerspectiveCamera(
    44,
    (canvas.clientWidth || 1) / (canvas.clientHeight || 1),
    0.1,
    100
  );
  camera.position.set(0, 5.4, 12);

  addTacticalLights(scene);

  const stage = new THREE.Group();
  scene.add(stage);

  const { geo, minY, maxY } = buildTerrainGeometry(18, 92, 'canyon');
  const topoMat = createTopoShaderMaterial(minY, maxY);
  const terrain = new THREE.Mesh(geo, topoMat);
  stage.add(terrain);

  const cloudGeo = buildPointCloudFromTerrain(18, 5000, 'canyon', 919);
  const cloudMat = new THREE.PointsMaterial({
    size: 0.058,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
  });
  const points = new THREE.Points(cloudGeo, cloudMat);
  stage.add(points);

  // Floating frame stack (Video -> Filter)
  const frameGroup = new THREE.Group();
  const frames = [];
  for (let i = 0; i < 8; i++) {
    const blurry = i === 2 || i === 5;
    const fg = new THREE.PlaneGeometry(1.45, 0.92);
    const fm = new THREE.MeshBasicMaterial({
      color: blurry ? 0x2c313b : 0xff4b0b,
      transparent: true,
      opacity: blurry ? 0.22 : 0.72,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(fg, fm);
    m.position.set((i - 3.5) * 1.18, 2.3 + Math.sin(i * 0.9) * 0.3, -1 + (i % 2) * 0.75);
    m.rotation.y = -0.25;
    m.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(fg),
        new THREE.LineBasicMaterial({ color: blurry ? 0x5f6773 : 0xf0f6fc, transparent: true, opacity: 0.8 })
      )
    );
    frameGroup.add(m);
    frames.push({ mesh: m, blurry });
  }
  stage.add(frameGroup);

  const bbox = new THREE.Box3Helper(
    new THREE.Box3(new THREE.Vector3(-4.5, -1.4, -4.5), new THREE.Vector3(4.5, 2.2, 4.5)),
    0x5cc4ff
  );
  stage.add(bbox);

  const laser = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-2.6, 0.35, 1.2),
      new THREE.Vector3(2.5, 0.75, -1.3),
    ]),
    new THREE.LineBasicMaterial({ color: 0xff4b0b, transparent: true, opacity: 0 })
  );
  stage.add(laser);

  const drone = createDroneRig();
  drone.position.set(-4, 4.2, 0);
  stage.add(drone);

  const slider = document.querySelector('#morph-slider');
  const pctEl = document.querySelector('#morph-pct');
  const stepTag = document.querySelector('#morph-step-tag');
  const stepTitle = document.querySelector('#morph-step-title');
  const stepDesc = document.querySelector('#morph-step-desc');
  const stageBtns = [...document.querySelectorAll('[data-morph-jump]')];

  const stages = [
    {
      tag: '01 / VIDEO & TELEMETRY INGEST',
      title: 'Extract sharp frames with real GPS.',
      desc: 'Static FFmpeg probes codecs locally while companion SRT telemetry aligns WGS 84 coordinates and AMSL altitude to each retained frame.',
    },
    {
      tag: '02 / BLUR REJECTION & YOLOV8N MASKING',
      title: 'Discard blur. Mask moving vehicles.',
      desc: 'Laplacian sharpness and 64-bit dHash drop redundant frames; optional YOLOv8n masks strip transient vehicles so static geometry never ghosts.',
    },
    {
      tag: '03 / posEye CONSTRUCTION ENGINE',
      title: 'Triangulate pixels into dense geometry.',
      desc: 'Authenticated local dispatch feeds the posEye Construction Engine for sparse tie-points, dense point clouds, and Poisson meshing.',
    },
    {
      tag: '04 / ORIGIN-CENTERED DRACO GLB',
      title: 'Inspect & measure with metric honesty.',
      desc: 'Models center cleanly to (0,0,0) for jitter-free WebGL inspection, Draco WebAssembly decoding, and Euclidean distance measurement.',
    },
  ];

  let progress = 0;
  let activeIdx = -1;
  let manualOverride = false;

  const updateCopy = (p) => {
    progress = THREE.MathUtils.clamp(p, 0, 1);
    const idx = Math.min(3, Math.floor(progress * 4));
    if (pctEl) pctEl.textContent = `${Math.round(progress * 100)}% COMPLETE`;
    if (slider && !manualOverride) slider.value = String(Math.round(progress * 100));
    if (idx !== activeIdx) {
      activeIdx = idx;
      const s = stages[idx];
      if (stepTag) stepTag.textContent = s.tag;
      if (stepTitle) stepTitle.textContent = s.title;
      if (stepDesc) stepDesc.textContent = s.desc;
      stageBtns.forEach((b, i) => b.classList.toggle('active', i === idx));
    }
  };

  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      manualOverride = false;
      updateCopy(self.progress);
    },
  });

  slider?.addEventListener('input', () => {
    manualOverride = true;
    updateCopy(Number(slider.value) / 100);
  });

  stageBtns.forEach((b) => {
    b.addEventListener('click', () => {
      const idx = Number(b.dataset.morphJump);
      manualOverride = true;
      updateCopy(idx * 0.28 + 0.05);
      if (slider) slider.value = String(Math.round(progress * 100));
    });
  });

  updateCopy(0);

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

  let visible = true;
  const io = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
  }, { threshold: 0.02 });
  io.observe(canvas);

  const clock = new THREE.Clock();
  let raf = 0;
  const renderLoop = () => {
    raf = requestAnimationFrame(renderLoop);
    if (!visible) return;

    const t = clock.getElapsedTime();
    topoMat.uniforms.uTime.value = t;
    topoMat.uniforms.uHeatmap.value = progress > 0.55 && progress < 0.78 ? 1.0 : 0.0;

    const angle = progress * Math.PI * 1.1;
    camera.position.set(
      Math.sin(angle) * (10.5 - progress * 3.4),
      5.5 - progress * 2.1,
      Math.cos(angle) * (11.2 - progress * 3.5)
    );
    camera.lookAt(0, 0.3, 0);

    drone.visible = progress < 0.45;
    drone.position.x = -5 + progress * 22;
    drone.position.y = 4.2 + Math.sin(t * 1.8) * 0.14;
    topoMat.uniforms.uScanPos.value.set(drone.position.x, 0);

    const frameAlpha = THREE.MathUtils.clamp(1 - Math.abs(progress - 0.28) / 0.18, 0, 1);
    frameGroup.visible = frameAlpha > 0.02;
    frames.forEach(({ mesh, blurry }, idx) => {
      mesh.material.opacity = frameAlpha * (blurry ? 0.14 : 0.75);
      mesh.position.y = 2.1 + Math.sin(t * 1.4 + idx) * 0.12 - (blurry ? 0.45 : 0);
    });

    cloudMat.opacity = THREE.MathUtils.clamp(progress < 0.7 ? progress * 1.45 : 1.4 - progress, 0.22, 0.96);
    terrain.visible = progress > 0.44 || progress < 0.18;
    bbox.visible = progress > 0.58 && progress < 0.86;
    laser.material.opacity = progress > 0.76 ? 0.96 : 0;

    stage.rotation.y = reduced ? 0 : t * 0.035;
    renderer.render(scene, camera);
  };
  renderLoop();

  window.addEventListener('beforeunload', () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    renderer.dispose();
  });
}

function initDesktopShowcase() {
  const tabs = [...document.querySelectorAll('[data-app-tab]')];
  const paneTitle = document.querySelector('#app-pane-title');
  const paneCopy = document.querySelector('#app-pane-copy');
  const paneConsole = document.querySelector('#app-pane-console');
  if (!tabs.length) return;

  const views = {
    probe: {
      title: 'Instant Media & Telemetry Probe',
      copy: 'Select a drone video (.MP4/.MOV) and companion .SRT log. posEye immediately resolves codec, framerate, duration, extractable frame count, and real capture timestamps without uploading a single byte.',
      console: `$ posEye.probe("DJI_1001.MP4", "DJI_1001.SRT")
> video_stream:    3840x2160 @ 59.94 fps (142.4 s)
> srt_cues:        41,075 telemetry samples parsed
> datum:           WGS 84 (EPSG:4326) · AMSL altitude
> overlap_target:  ~75% via Laplacian + dHash
> preflight_guard: active (0 fabricated timestamps)`,
    },
    hud: {
      title: '11-Stage Execution & GPU Telemetry',
      copy: 'Watch every stage advance deterministically—from FFmpeg extraction and YOLOv8n dynamic masking to the posEye Construction Engine with verified CUDA SIFT detection or automatic CPU fallback.',
      console: `[01/11] validating      OK   (container + SRT bounds)
[03/11] filtering       OK   (248 sharp frames kept)
[05/11] masking         OK   (YOLOv8n vehicle masks written)
[07/11] reconstructing  RUN  (posEye Construction Engine · CUDA SIFT)
[09/11] converting      WAIT (Draco GLB + origin centering)`,
    },
    viewer: {
      title: 'Demand-Driven 3D Measurement Viewport',
      copy: 'Bundled Draco WebAssembly decoders unpack 350K+ triangle aerial meshes instantaneously. Demand-driven rendering keeps idle GPU load near zero while throttled raycasting provides lag-free Euclidean distance measurement.',
      console: `viewport.lifecycle:  LOADED (draco_decoder.wasm)
mesh.vertices:       247,655  |  triangles: 367,444
origin_centering:    (0, 0, 0) [UTM offset preserved]
measure.segment_AB:  42.18 m  (WGS 84 / UTM metric scale)
disclaimer:          Consumer GNSS ±2–5m; not cadastral survey`,
    },
    exports: {
      title: 'Standard GIS & 3D Deliverables',
      copy: 'Export textured binary glTF meshes, ASPRS LiDAR 1.4 dense point clouds, georeferenced GeoTIFF orthomosaics, elevation rasters, and full RMS accuracy provenance reports directly to disk.',
      console: `export/model.glb         23.44 MB  [Draco Binary glTF]
export/point_cloud.laz   118.2 MB  [ASPRS LAZ 1.4]
export/orthophoto.tif    246.0 MB  [GeoTIFF · UTM]
export/dsm.tif           64.8 MB   [Digital Surface Model]
export/report.pdf        3.1 MB    [RMS_3D & Provenance]`,
    },
  };

  const select = (key) => {
    const v = views[key];
    if (!v) return;
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.appTab === key));
    if (paneTitle) paneTitle.textContent = v.title;
    if (paneCopy) paneCopy.textContent = v.copy;
    if (paneConsole) paneConsole.textContent = v.console;
    if (!reduced && paneConsole) {
      gsap.fromTo(
        [paneTitle, paneCopy, paneConsole],
        { opacity: 0.3, filter: 'blur(4px)' },
        { opacity: 1, filter: 'blur(0px)', duration: 0.35, ease: 'expo.out' }
      );
    }
  };

  tabs.forEach((t) => t.addEventListener('click', () => select(t.dataset.appTab)));
  select('probe');
}

initHeroProductStage();
initInteractiveMorphStage();
initDesktopShowcase();
