import * as THREE from 'three';
import { initChrome, reducedMotion } from '../lib/chrome.js';
import {
  addStudioLighting,
  buildVertexPointCloud,
  createRenderer,
  createTajMahalHeritage,
  hasWebGL,
  loadGLB,
  normalizeModel,
  showStageFallback,
} from '../lib/models.js';

const { ScrollTrigger } = initChrome();

function setProgress(selector, pct, done = false) {
  const el = document.querySelector(selector);
  if (!el) return;
  const bar = el.querySelector('.stage-bar i');
  const text = el.querySelector('.loader-text');
  if (bar && Number.isFinite(pct)) bar.style.width = `${pct}%`;
  if (text && Number.isFinite(pct)) text.textContent = `Calibrating 3D Survey (${pct}%)`;
  if (done) el.classList.add('done');
}

function createScannerCone() {
  const geo = new THREE.ConeGeometry(0.95, 1.85, 4, 1, true);
  geo.rotateY(Math.PI / 4);
  geo.translate(0, -0.92, 0);
  const edges = new THREE.EdgesGeometry(geo);
  return new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0xe25b38, transparent: true, opacity: 0.55 })
  );
}

async function initHeroScene() {
  const canvas = document.querySelector('#world');
  if (!canvas) return;
  const frame = canvas.parentElement;

  if (!hasWebGL()) {
    setProgress('#hero-loader', 100, true);
    showStageFallback(frame, 'WebGL is unavailable in this browser. View pipeline architecture or download the desktop app.');
    return;
  }

  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(5.8, 3.8, 7.0);
  addStudioLighting(scene);

  const stageGroup = new THREE.Group();
  scene.add(stageGroup);

  // Calibrated datum ring beneath the monument
  const datumRing = new THREE.Mesh(
    new THREE.RingGeometry(3.1, 3.14, 96),
    new THREE.MeshBasicMaterial({ color: 0xe25b38, side: THREE.DoubleSide, transparent: true, opacity: 0.4 })
  );
  datumRing.rotation.x = -Math.PI / 2;
  datumRing.position.y = 0.01;
  stageGroup.add(datumRing);

  const resize = () => {
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(frame);
  resize();

  let dronePivot = null;
  let droneMeshRoot = null;
  let pointerX = 0;
  let pointerY = 0;
  frame.addEventListener('pointermove', (e) => {
    const r = frame.getBoundingClientRect();
    pointerX = (e.clientX - r.left) / r.width - 0.5;
    pointerY = (e.clientY - r.top) / r.height - 0.5;
  });

  try {
    const [heritageGltf, droneGltf] = await Promise.all([
      loadGLB('india-heritage.glb', (p) => setProgress('#hero-loader', Math.round(p * 0.65))),
      loadGLB('drone.glb', (p) => setProgress('#hero-loader', Math.round(65 + p * 0.35))),
    ]);

    let monument = null;
    if (heritageGltf && heritageGltf.scene) {
      monument = normalizeModel(heritageGltf.scene, 5.8);
    } else {
      monument = createTajMahalHeritage(5.8);
    }
    stageGroup.add(monument.root);

    // Realistic Survey Quadcopter
    const droneNorm = normalizeModel(droneGltf.scene, 1.2);
    droneMeshRoot = droneNorm.root;
    dronePivot = new THREE.Group();
    dronePivot.position.set(0, 2.45, 0);
    droneMeshRoot.add(createScannerCone());
    dronePivot.add(droneMeshRoot);
    stageGroup.add(dronePivot);

    setProgress('#hero-loader', 100, true);
  } catch (err) {
    console.warn('[posEye] Hero loading fallback triggered:', err);
    // Instant procedural Indian monument fallback ensures zero broken state
    const monument = createTajMahalHeritage(5.8);
    stageGroup.add(monument.root);

    try {
      const droneGltf = await loadGLB('drone.glb');
      const droneNorm = normalizeModel(droneGltf.scene, 1.2);
      dronePivot = new THREE.Group();
      dronePivot.position.set(0, 2.45, 0);
      droneNorm.root.add(createScannerCone());
      dronePivot.add(droneNorm.root);
      stageGroup.add(dronePivot);
    } catch {}

    setProgress('#hero-loader', 100, true);
  }

  const clock = new THREE.Clock();
  let raf = 0;
  let active = true;

  const observer = new IntersectionObserver((entries) => {
    active = entries[0]?.isIntersecting ?? true;
  });
  observer.observe(frame);

  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (!active) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (dronePivot && !reducedMotion) {
      const droneSpeed = 0.48;
      const radiusX = 2.1;
      const radiusZ = 1.6;
      const nx = Math.cos(t * droneSpeed) * radiusX;
      const nz = Math.sin(t * droneSpeed) * radiusZ;
      dronePivot.position.x = nx;
      dronePivot.position.z = nz;
      dronePivot.position.y = 2.35 + Math.sin(t * 1.5) * 0.08;
      // Heading tangent to flight path
      dronePivot.rotation.y = -t * droneSpeed + Math.PI / 2;
      // Slight bank into turns
      if (droneMeshRoot) {
        droneMeshRoot.rotation.z = Math.sin(t * droneSpeed) * 0.08;
        droneMeshRoot.rotation.x = 0.06;
      }
    }

    const targetRotY = pointerX * 0.28 + (reducedMotion ? 0 : Math.sin(t * 0.12) * 0.14);
    const targetRotX = pointerY * 0.08;
    stageGroup.rotation.y += (targetRotY - stageGroup.rotation.y) * 0.05;
    stageGroup.rotation.x += (targetRotX - stageGroup.rotation.x) * 0.05;

    camera.lookAt(0, 0.65, 0);
    renderer.render(scene, camera);
  };
  tick();

  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
    ro.disconnect();
    renderer.dispose();
  });
}

async function initStoryScene() {
  const canvas = document.querySelector('#story-canvas');
  if (!canvas) return;
  const frame = canvas.parentElement;

  const storyEl = document.querySelector('.scroll-story');
  const chapters = [...document.querySelectorAll('.story-copy')];
  const stepBtns = [...document.querySelectorAll('.story-step-btn')];
  const stepCenters = [0.08, 0.36, 0.64, 0.92];
  let progress = 0;

  const updateStoryChapters = (prog) => {
    // Silky smooth cross-fade and vertical translate based on continuous progress
    chapters.forEach((c, i) => {
      const center = stepCenters[i];
      const dist = Math.abs(prog - center);
      const span = 0.26;
      const weight = Math.max(0, 1 - dist / span);
      // Cubic easing for natural fade
      const opacity = weight * weight * (3 - 2 * weight);

      c.style.opacity = opacity.toFixed(3);
      c.style.transform = `translate3d(0, ${(1 - opacity) * 14}px, 0)`;
      c.style.visibility = opacity > 0.01 ? 'visible' : 'hidden';
      c.style.pointerEvents = opacity > 0.4 ? 'auto' : 'none';
    });

    // Determine closest active chapter for tab index & buttons
    let closestIdx = 0;
    let minD = 999;
    stepCenters.forEach((c, idx) => {
      const d = Math.abs(prog - c);
      if (d < minD) {
        minD = d;
        closestIdx = idx;
      }
    });

    stepBtns.forEach((btn, idx) => {
      const isAct = idx === closestIdx;
      btn.classList.toggle('active', isAct);
      btn.setAttribute('aria-pressed', String(isAct));
    });
  };

  if (storyEl) {
    ScrollTrigger.create({
      trigger: storyEl,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.5,
      onUpdate: (self) => {
        progress = self.progress;
        updateStoryChapters(progress);
      },
    });
  }

  stepBtns.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      if (!storyEl) return;
      const top = storyEl.offsetTop;
      const maxScroll = Math.max(storyEl.offsetHeight - window.innerHeight, 1);
      const targetP = stepCenters[idx];
      window.scrollTo({
        top: top + maxScroll * targetP,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    });
  });

  if (!hasWebGL()) {
    setProgress('#story-loader', 100, true);
    showStageFallback(frame, 'Interactive 3D reconstruction view requires WebGL.');
    return;
  }

  const renderer = createRenderer(canvas, { maxPixelRatio: 1.5 });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 4.6, 7.2);

  const hemi = new THREE.HemisphereLight(0xf3f6fa, 0x2c3440, 1.6);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1e0, 2.2);
  key.position.set(6, 10, 7);
  scene.add(key);

  const scanGroup = new THREE.Group();
  scene.add(scanGroup);

  let solidMeshGroup = null;
  let wireGroup = null;
  let cloudPoints = null;
  let droneGroup = null;

  const resize = () => {
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(frame);
  resize();

  try {
    const [heritageGltf, droneGltf] = await Promise.all([
      loadGLB('india-heritage.glb', (p) => setProgress('#story-loader', Math.round(p * 0.7))),
      loadGLB('drone.glb'),
    ]);

    let monument = null;
    if (heritageGltf && heritageGltf.scene) {
      monument = normalizeModel(heritageGltf.scene, 6.0);
    } else {
      monument = createTajMahalHeritage(6.0);
    }

    solidMeshGroup = monument.root;
    scanGroup.add(solidMeshGroup);

    // Wireframe overlay representing edge detection and SfM feature matches
    wireGroup = solidMeshGroup.clone(true);
    wireGroup.traverse((c) => {
      if (!c.isMesh) return;
      c.material = new THREE.MeshBasicMaterial({
        color: 0xe25b38,
        wireframe: true,
        transparent: true,
        opacity: 0.24,
      });
    });
    wireGroup.position.y += 0.008;
    scanGroup.add(wireGroup);

    // Dense point cloud representing photogrammetry depth samples
    cloudPoints = buildVertexPointCloud(solidMeshGroup, 22000);
    cloudPoints.material.opacity = 0.0;
    cloudPoints.material.transparent = true;
    scanGroup.add(cloudPoints);

    // Clean survey drone
    const droneNorm = normalizeModel(droneGltf.scene, 1.1);
    droneGroup = new THREE.Group();
    droneGroup.add(droneNorm.root);
    droneGroup.add(createScannerCone());
    scene.add(droneGroup);

    setProgress('#story-loader', 100, true);
    renderOutputThumbnails(monument.root);
  } catch (err) {
    console.warn('[posEye] Story model fallback activated:', err);
    const monument = createTajMahalHeritage(6.0);
    solidMeshGroup = monument.root;
    scanGroup.add(solidMeshGroup);

    wireGroup = solidMeshGroup.clone(true);
    wireGroup.traverse((c) => {
      if (!c.isMesh) return;
      c.material = new THREE.MeshBasicMaterial({
        color: 0xe25b38,
        wireframe: true,
        transparent: true,
        opacity: 0.24,
      });
    });
    wireGroup.position.y += 0.008;
    scanGroup.add(wireGroup);

    cloudPoints = buildVertexPointCloud(solidMeshGroup, 22000);
    cloudPoints.material.opacity = 0.0;
    cloudPoints.material.transparent = true;
    scanGroup.add(cloudPoints);

    setProgress('#story-loader', 100, true);
    renderOutputThumbnails(monument.root);
  }

  const clock = new THREE.Clock();
  let raf = 0;
  let active = false;

  const observer = new IntersectionObserver((entries) => {
    active = entries[0]?.isIntersecting ?? true;
  });
  observer.observe(frame);

  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (!active) return;

    // Cinematic continuous orbital trajectory linked to scroll progress (0 -> 1)
    const angle = progress * Math.PI * 1.5 - 0.45;
    const radius = THREE.MathUtils.lerp(7.2, 4.3, Math.sin(progress * Math.PI));
    const height = THREE.MathUtils.lerp(4.4, 2.1, progress);

    camera.position.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
    camera.lookAt(0, 0.4, 0);

    if (droneGroup) {
      // Drone patrols actively in early capture stage, then pulls back
      const droneVisibility = 1 - THREE.MathUtils.smoothstep(progress, 0.42, 0.72);
      droneGroup.visible = droneVisibility > 0.02;
      const droneAngle = progress * Math.PI * 2.8;
      droneGroup.position.set(
        Math.cos(droneAngle) * 2.1,
        2.2 - progress * 0.45,
        Math.sin(droneAngle) * 1.4
      );
      droneGroup.rotation.y = -droneAngle + Math.PI / 2;
    }

    // Dynamic reconstruction cross-fade
    const preparePeak = Math.sin(THREE.MathUtils.clamp((progress - 0.12) / 0.52, 0, 1) * Math.PI);
    if (wireGroup) {
      wireGroup.traverse((c) => {
        if (c.isMesh) c.material.opacity = 0.05 + preparePeak * 0.45;
      });
    }
    if (cloudPoints) {
      cloudPoints.material.opacity = preparePeak * 0.9;
    }

    renderer.render(scene, camera);
  };
  tick();

  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
    ro.disconnect();
    renderer.dispose();
  });
}

function renderOutputThumbnails(monumentScene) {
  const targets = [
    { id: '#thumb-mesh', mode: 'mesh' },
    { id: '#thumb-cloud', mode: 'cloud' },
    { id: '#thumb-ortho', mode: 'ortho' },
  ];
  const canvases = targets.map((t) => ({ ...t, el: document.querySelector(t.id) })).filter((t) => t.el);
  if (!canvases.length || !hasWebGL()) return;

  const width = 640;
  const height = 420;
  const offRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  offRenderer.setSize(width, height, false);
  offRenderer.outputColorSpace = THREE.SRGBColorSpace;
  offRenderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f141c);
  addStudioLighting(scene);

  const monument = normalizeModel(monumentScene, 5.8);
  const cloud = buildVertexPointCloud(monument.root, 24000);
  cloud.material.size = 0.05;

  for (const item of canvases) {
    scene.remove(monument.root, cloud);
    const cam = new THREE.PerspectiveCamera(38, width / height, 0.1, 60);

    if (item.mode === 'mesh') {
      scene.add(monument.root);
      cam.position.set(4.0, 2.6, 4.4);
      cam.lookAt(0, 0.35, 0);
    } else if (item.mode === 'cloud') {
      scene.add(cloud);
      cam.position.set(4.2, 2.4, 4.4);
      cam.lookAt(0, 0.5, 0);
    } else {
      scene.add(monument.root);
      cam.position.set(0.01, 7.2, 0.01);
      cam.lookAt(0, 0, 0);
    }

    offRenderer.render(scene, cam);
    item.el.width = width;
    item.el.height = height;
    const ctx = item.el.getContext('2d');
    if (ctx) ctx.drawImage(offRenderer.domElement, 0, 0);
  }

  offRenderer.dispose();
}

initHeroScene();
initStoryScene();
