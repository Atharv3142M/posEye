import * as THREE from 'three';
import { initChrome, isWebGLAvailable, showWebGLFallback } from '../lib/ui.js';
import {
  addTacticalLights,
  buildPointCloudFromTerrain,
  buildTerrainGeometry,
  createDroneRig,
  createRenderer,
  createTopoShaderMaterial,
} from '../lib/terrain.js';

const { reduced, gsap, ScrollTrigger } = initChrome();

function initHero3D() {
  const canvas = document.querySelector('#hero-canvas');
  if (!canvas) return;
  if (!isWebGLAvailable()) {
    showWebGLFallback(canvas);
    return;
  }

  const renderer = createRenderer(canvas, 1.75);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07080b, 0.036);

  const camera = new THREE.PerspectiveCamera(
    44,
    (canvas.clientWidth || 1) / (canvas.clientHeight || 1),
    0.1,
    120
  );
  camera.position.set(0, 6.2, 13.5);

  addTacticalLights(scene);

  const world = new THREE.Group();
  scene.add(world);

  const { geo, minY, maxY } = buildTerrainGeometry(22, 100, 'coastal');
  const topoMat = createTopoShaderMaterial(minY, maxY);
  const topoMesh = new THREE.Mesh(geo, topoMat);
  world.add(topoMesh);

  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x3b4252,
    wireframe: true,
    transparent: true,
    opacity: 0.28,
  });
  const wireMesh = new THREE.Mesh(geo, wireMat);
  wireMesh.position.y = 0.015;
  world.add(wireMesh);

  const cloudGeo = buildPointCloudFromTerrain(22, 3600, 'coastal', 701);
  const cloudMat = new THREE.PointsMaterial({
    size: 0.055,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
  });
  const cloud = new THREE.Points(cloudGeo, cloudMat);
  world.add(cloud);

  // Drone flight spline
  const flightCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-7, 3.6, -4),
      new THREE.Vector3(-2.5, 4.1, -1.5),
      new THREE.Vector3(2.8, 3.9, 1.8),
      new THREE.Vector3(7, 3.7, -2.5),
      new THREE.Vector3(3.5, 4.3, -6),
      new THREE.Vector3(-4, 3.8, -5.5),
    ],
    true
  );
  const pathGeo = new THREE.BufferGeometry().setFromPoints(flightCurve.getPoints(120));
  const pathLine = new THREE.Line(
    pathGeo,
    new THREE.LineBasicMaterial({ color: 0x5cc4ff, transparent: true, opacity: 0.48 })
  );
  world.add(pathLine);

  const drone = createDroneRig();
  world.add(drone);

  const grid = new THREE.GridHelper(30, 46, 0xff4b0b, 0x1c202a);
  grid.position.y = -1.5;
  grid.material.transparent = true;
  grid.material.opacity = 0.22;
  world.add(grid);

  // Mode toggle buttons
  let mode = 'surface';
  const modeButtons = document.querySelectorAll('[data-hero-mode]');
  const setMode = (next) => {
    mode = next;
    modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.heroMode === next));
    topoMesh.visible = next === 'surface';
    wireMesh.visible = next === 'surface' || next === 'wireframe';
    wireMat.opacity = next === 'wireframe' ? 0.65 : 0.22;
    wireMat.color.setHex(next === 'wireframe' ? 0xff4b0b : 0x3b4252);
    cloud.visible = next === 'pointcloud' || next === 'surface';
    cloudMat.size = next === 'pointcloud' ? 0.085 : 0.045;
    cloudMat.opacity = next === 'pointcloud' ? 0.98 : 0.65;
  };
  modeButtons.forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.heroMode)));
  setMode('surface');

  // Pointer parallax
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
  const io = new IntersectionObserver(
    (entries) => {
      visible = entries[0]?.isIntersecting ?? true;
    },
    { threshold: 0.02 }
  );
  io.observe(canvas);

  const altHud = document.querySelector('#hud-alt');
  const clock = new THREE.Clock();
  const posTmp = new THREE.Vector3();
  const nextTmp = new THREE.Vector3();

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (!visible) return;

    const t = clock.getElapsedTime();
    topoMat.uniforms.uTime.value = t;

    const u = reduced ? 0.2 : (t * 0.045) % 1;
    flightCurve.getPointAt(u, posTmp);
    flightCurve.getPointAt((u + 0.01) % 1, nextTmp);
    drone.position.copy(posTmp);
    drone.lookAt(nextTmp.x, posTmp.y, nextTmp.z);
    topoMat.uniforms.uScanPos.value.set(posTmp.x, posTmp.z);

    if (altHud && Math.floor(t * 4) !== Math.floor((t - 0.016) * 4)) {
      const m = (112 + posTmp.y * 6.5).toFixed(1);
      altHud.textContent = `${m} m AMSL`;
    }

    if (!reduced) {
      world.rotation.y += (mx * 0.18 - world.rotation.y) * 0.03 + 0.0004;
      world.rotation.x += (-my * 0.06 - world.rotation.x) * 0.03;
    }
    camera.lookAt(0, 0.2, 0);
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

function initScrollStory3D() {
  const story = document.querySelector('.scroll-story');
  const canvas = document.querySelector('#story-canvas');
  if (!story || !canvas) return;
  if (!isWebGLAvailable()) {
    showWebGLFallback(canvas);
    return;
  }

  const renderer = createRenderer(canvas, 1.6);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x08090d, 0.032);

  const camera = new THREE.PerspectiveCamera(
    45,
    (canvas.clientWidth || 1) / (canvas.clientHeight || 1),
    0.1,
    100
  );
  camera.position.set(0, 5.2, 12);

  addTacticalLights(scene);

  const stage = new THREE.Group();
  scene.add(stage);

  // Terrain & Point cloud layers
  const { geo, minY, maxY } = buildTerrainGeometry(18, 84, 'canyon');
  const topoMat = createTopoShaderMaterial(minY, maxY);
  const terrain = new THREE.Mesh(geo, topoMat);
  stage.add(terrain);

  const cloudGeo = buildPointCloudFromTerrain(18, 4200, 'canyon', 919);
  const cloudMat = new THREE.PointsMaterial({
    size: 0.055,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
  });
  const points = new THREE.Points(cloudGeo, cloudMat);
  stage.add(points);

  // Floating frame stack (Chapter 2: Filter & Geotag)
  const frameGroup = new THREE.Group();
  const frameMeshes = [];
  for (let i = 0; i < 8; i++) {
    const isBlurry = i === 2 || i === 5;
    const fGeo = new THREE.PlaneGeometry(1.4, 0.9);
    const fMat = new THREE.MeshBasicMaterial({
      color: isBlurry ? 0x2e313a : 0xff4b0b,
      transparent: true,
      opacity: isBlurry ? 0.25 : 0.72,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(fGeo, fMat);
    m.position.set((i - 3.5) * 1.15, 2.3 + Math.sin(i * 0.9) * 0.35, -1.2 + (i % 2) * 0.8);
    m.rotation.y = -0.3;
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(fGeo),
      new THREE.LineBasicMaterial({ color: isBlurry ? 0x5c5f66 : 0xf1f0ed, transparent: true, opacity: 0.8 })
    );
    m.add(edge);
    frameGroup.add(m);
    frameMeshes.push({ mesh: m, isBlurry });
  }
  stage.add(frameGroup);

  // Origin bounding box (Chapter 4: Centering & GLB conversion)
  const bboxHelper = new THREE.Box3Helper(
    new THREE.Box3(new THREE.Vector3(-4.5, -1.3, -4.5), new THREE.Vector3(4.5, 2.1, 4.5)),
    0x5cc4ff
  );
  stage.add(bboxHelper);

  // Measurement laser arc (Chapter 5: Inspect & Measure)
  const laserGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-2.6, 0.35, 1.2),
    new THREE.Vector3(2.4, 0.72, -1.4),
  ]);
  const laserLine = new THREE.Line(
    laserGeo,
    new THREE.LineBasicMaterial({ color: 0xff4b0b, transparent: true, opacity: 0 })
  );
  stage.add(laserLine);

  const drone = createDroneRig();
  drone.position.set(-4, 4.2, 0);
  stage.add(drone);

  // Scroll synchronization
  const chapters = [...document.querySelectorAll('.story-copy')];
  const railBar = document.querySelector('.story-rail-bar span');
  const stepNum = document.querySelector('.story-step-num');

  let progress = 0;
  let activeStep = 0;

  ScrollTrigger.create({
    trigger: story,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      progress = self.progress;
      const idx = Math.min(4, Math.floor(progress * 5));
      if (idx !== activeStep) {
        activeStep = idx;
        chapters.forEach((c, i) => c.classList.toggle('active', i === idx));
        if (railBar) railBar.style.height = `${((idx + 1) / 5) * 100}%`;
        if (stepNum) stepNum.textContent = `0${idx + 1} / 05`;
      }
    },
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
  const io = new IntersectionObserver(
    (entries) => {
      visible = entries[0]?.isIntersecting ?? true;
    },
    { threshold: 0.02 }
  );
  io.observe(canvas);

  const clock = new THREE.Clock();
  let raf = 0;
  const renderFrame = () => {
    raf = requestAnimationFrame(renderFrame);
    if (!visible) return;

    const t = clock.getElapsedTime();
    topoMat.uniforms.uTime.value = t;
    topoMat.uniforms.uHeatmap.value = progress > 0.58 && progress < 0.82 ? 1.0 : 0.0;

    // Camera fly-through driven by scroll progress
    const angle = progress * Math.PI * 1.15;
    camera.position.set(
      Math.sin(angle) * (10.5 - progress * 3.5),
      5.4 - progress * 2.2,
      Math.cos(angle) * (11.5 - progress * 3.8)
    );
    camera.lookAt(0, 0.4, 0);

    // Chapter transitions inside 3D stage
    drone.visible = progress < 0.45;
    drone.position.x = -5 + progress * 22;
    drone.position.y = 4.2 + Math.sin(t * 1.8) * 0.15;
    topoMat.uniforms.uScanPos.value.set(drone.position.x, 0);

    // Frame cards appear in Chapter 2 (0.18 -> 0.45)
    const frameAlpha = THREE.MathUtils.clamp(
      1 - Math.abs(progress - 0.3) / 0.18,
      0,
      1
    );
    frameGroup.visible = frameAlpha > 0.02;
    frameMeshes.forEach(({ mesh, isBlurry }, idx) => {
      mesh.material.opacity = frameAlpha * (isBlurry ? 0.16 : 0.72);
      mesh.position.y = 2.1 + Math.sin(t * 1.5 + idx) * 0.12 - (isBlurry ? 0.45 : 0);
    });

    // Point cloud peaks in Chapter 3 (0.38 -> 0.7)
    cloudMat.opacity = THREE.MathUtils.clamp(
      progress < 0.7 ? progress * 1.4 : 1.4 - progress,
      0.22,
      0.95
    );
    cloudMat.size = 0.045 + Math.sin(progress * Math.PI) * 0.04;

    // Terrain solid mesh emerges from 0.48 onward
    terrain.visible = progress > 0.42 || progress < 0.18;
    bboxHelper.visible = progress > 0.56 && progress < 0.86;
    laserLine.material.opacity = progress > 0.78 ? 0.95 : 0;

    stage.rotation.y = reduced ? 0 : t * 0.04;
    renderer.render(scene, camera);
  };
  renderFrame();

  window.addEventListener('beforeunload', () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    renderer.dispose();
  });
}

/** Deterministic HyperFrames-inspired master timeline reel */
function initHyperFramesReel() {
  const stage = document.querySelector('#hf-reel');
  if (!stage) return;

  const badge = stage.querySelector('.reel-badge');
  const title = stage.querySelector('.reel-title');
  const sub = stage.querySelector('.reel-sub');
  const nodes = [...stage.querySelectorAll('.reel-node')];
  const playBtn = document.querySelector('#reel-play');
  const scrubber = document.querySelector('#reel-scrubber');
  const timeEl = document.querySelector('#reel-time');
  const beatBtns = [...document.querySelectorAll('[data-reel-beat]')];

  const beats = [
    {
      at: 0,
      badge: 'BEAT 01 // INGEST & PROBE',
      title: 'Single flight video. Zero cloud upload.',
      sub: 'FFmpeg probes codec, resolution & framerate locally while DJI/Autel SRT telemetry aligns to sub-second precision.',
      cells: ['01 / INPUT', 'MP4 / MOV + SRT', '02 / PROBE', '60 FPS VERIFIED', '03 / CLOCK', 'REAL CAPTURE TIME', '04 / SCOPE', '100% LOCAL DISK'],
    },
    {
      at: 3,
      badge: 'BEAT 02 // FILTER, GEOTAG & MASK',
      title: 'Drop blur. Mask motion. Lock WGS 84.',
      sub: 'Laplacian sharpness + dHash deduplication retain 70–80% overlap frames; optional YOLOv8n masks strip vehicles & people.',
      cells: ['01 / BLUR', 'LAPLACIAN PASS', '02 / OVERLAP', 'DHASH DEDUP', '03 / EXIF', 'EPSG:4326 AMSL', '04 / MASK', 'STATIC SCENE ONLY'],
    },
    {
      at: 6,
      badge: 'BEAT 03 // posEye CONSTRUCTION ENGINE',
      title: 'Pixels triangulate into metric geometry.',
      sub: 'Authenticated handoff to the local posEye Construction Engine with CUDA GPU feature extraction & seamless CPU fallback.',
      cells: ['01 / DISPATCH', '127.0.0.1 TOKEN', '02 / SOLVER', 'SPARSE -> DENSE', '03 / MESH', 'POISSON SURFACE', '04 / SECURITY', 'ZIP-SLIP GUARDED'],
    },
    {
      at: 9,
      badge: 'BEAT 04 // DRACO GLB & 3D VIEWPORT',
      title: 'Origin-centered. Ready to measure.',
      sub: 'Draco WebAssembly decoding, demand-driven rendering & Euclidean measurement with honest metric vs. model-unit scale.',
      cells: ['01 / FORMAT', 'DRACO MODEL.GLB', '02 / CLOUD', 'ASPRS LAZ 1.4', '03 / RASTER', 'GEOTIFF + DSM', '04 / VIEWER', 'DEMAND-DRIVEN 60FPS'],
    },
  ];

  let activeBeat = -1;
  const applyBeat = (idx) => {
    if (idx === activeBeat) return;
    activeBeat = idx;
    const b = beats[idx];
    badge.textContent = b.badge;
    title.textContent = b.title;
    sub.textContent = b.sub;
    nodes.forEach((n, i) => {
      const lbl = n.querySelector('span');
      const val = n.querySelector('strong');
      if (lbl) lbl.textContent = b.cells[i * 2];
      if (val) val.textContent = b.cells[i * 2 + 1];
    });
    beatBtns.forEach((btn, i) => btn.classList.toggle('active', i === idx));

    if (!reduced) {
      gsap.fromTo(
        [badge, title, sub],
        { opacity: 0, filter: 'blur(7px)', y: 12 },
        { opacity: 1, filter: 'blur(0px)', y: 0, duration: 0.42, stagger: 0.05, ease: 'expo.out', overwrite: true }
      );
      gsap.fromTo(
        nodes,
        { opacity: 0.25, y: 10 },
        { opacity: 1, y: 0, duration: 0.35, stagger: 0.04, ease: 'power3.out', overwrite: true }
      );
    }
  };

  // Build deterministic paused master timeline (12s loop)
  const state = { t: 0 };
  const tl = gsap.timeline({
    paused: true,
    repeat: -1,
    onUpdate: () => {
      const sec = state.t;
      const beatIdx = Math.min(3, Math.floor(sec / 3));
      applyBeat(beatIdx);
      if (scrubber) scrubber.value = String((sec / 12) * 100);
      if (timeEl) timeEl.textContent = `${sec.toFixed(1)}s / 12.0s`;
    },
  });
  tl.to(state, { t: 12, duration: 12, ease: 'none' });
  applyBeat(0);

  let playing = !reduced;
  const syncPlayBtn = () => {
    if (playBtn) playBtn.textContent = playing ? 'PAUSE REEL' : 'PLAY REEL';
  };
  if (playing) tl.play();
  syncPlayBtn();

  playBtn?.addEventListener('click', () => {
    playing = !playing;
    if (playing) tl.play();
    else tl.pause();
    syncPlayBtn();
  });

  scrubber?.addEventListener('input', () => {
    playing = false;
    tl.pause();
    syncPlayBtn();
    const ratio = Number(scrubber.value) / 100;
    tl.progress(ratio);
  });

  beatBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.reelBeat);
      tl.seek(idx * 3 + 0.01);
      if (!playing) {
        applyBeat(idx);
      }
    });
  });
}

initHero3D();
initScrollStory3D();
initHyperFramesReel();
