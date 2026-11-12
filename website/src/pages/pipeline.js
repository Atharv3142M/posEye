import * as THREE from 'three';
import { initChrome, isWebGLAvailable, showWebGLFallback } from '../lib/ui.js';
import {
  addTacticalLights,
  buildTerrainGeometry,
  createRenderer,
  createTopoShaderMaterial,
} from '../lib/terrain.js';

const { reduced, gsap, ScrollTrigger } = initChrome();

function initPipelineStack3D() {
  const canvas = document.querySelector('#pipeline-canvas');
  if (!canvas) return;
  if (!isWebGLAvailable()) {
    showWebGLFallback(canvas);
    return;
  }

  const renderer = createRenderer(canvas, 1.6);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    42,
    (canvas.clientWidth || 1) / (canvas.clientHeight || 1),
    0.1,
    80
  );
  camera.position.set(5.4, 4.4, 7.6);
  camera.lookAt(0, 0.2, 0);

  addTacticalLights(scene);

  const stack = new THREE.Group();
  scene.add(stack);

  const layerDefs = [
    { name: 'STAGE 01–02 // FFMPEG INGEST', color: 0x5cc4ff, y: 2.0 },
    { name: 'STAGE 03–04 // FILTER & WGS84 EXIF', color: 0x9aa4b2, y: 1.0 },
    { name: 'STAGE 05 // YOLOV8N MASKING', color: 0x3cd070, y: 0.0 },
    { name: 'STAGE 06–07 // posEye CONSTRUCTION ENGINE', color: 0xff4b0b, y: -1.0 },
    { name: 'STAGE 08–10 // DRACO GLB & READY', color: 0xf1f0ed, y: -2.0 },
  ];

  const layers = layerDefs.map((def, idx) => {
    const group = new THREE.Group();
    group.position.y = def.y;

    const plateGeo = new THREE.BoxGeometry(3.8, 0.14, 3.8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x121620,
      metalness: 0.45,
      roughness: 0.48,
      transparent: true,
      opacity: 0.88,
    });
    const plate = new THREE.Mesh(plateGeo, mat);
    group.add(plate);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(plateGeo),
      new THREE.LineBasicMaterial({ color: def.color, transparent: true, opacity: 0.75 })
    );
    group.add(edges);

    // Inner grid detail
    const grid = new THREE.GridHelper(3.4, 8, def.color, 0x1e2430);
    grid.position.y = 0.08;
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    group.add(grid);

    stack.add(group);
    return { group, plate, edges, baseY: def.y, idx, name: def.name };
  });

  // Vertical telemetry bus line connecting all layers
  const busGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-1.95, 2.4, -1.95),
    new THREE.Vector3(-1.95, -2.4, -1.95),
  ]);
  stack.add(
    new THREE.Line(busGeo, new THREE.LineBasicMaterial({ color: 0xff4b0b, transparent: true, opacity: 0.65 }))
  );

  const stageItems = [...document.querySelectorAll('.stage-item')];
  const hudTitle = document.querySelector('#pipeline-hud-title');
  const hudState = document.querySelector('#pipeline-hud-state');

  let activeTier = 0;
  const setActiveStage = (stageIdx) => {
    const tier = Math.min(4, Math.floor(stageIdx / 2.2));
    activeTier = tier;
    stageItems.forEach((el, i) => el.classList.toggle('active', i === stageIdx));
    const el = stageItems[stageIdx];
    if (el && hudTitle && hudState) {
      hudTitle.textContent = el.dataset.stateLabel || 'validating';
      hudState.textContent = el.dataset.tierLabel || layerDefs[tier].name;
    }

    layers.forEach((l, i) => {
      const isFocused = i === tier;
      if (!reduced) {
        gsap.to(l.group.position, {
          y: l.baseY + (isFocused ? 0.25 : 0) + (i - tier) * 0.12,
          x: isFocused ? 0.35 : 0,
          duration: 0.55,
          ease: 'expo.out',
        });
      }
      l.plate.material.emissive.setHex(isFocused ? layerDefs[i].color : 0x000000);
      l.plate.material.emissiveIntensity = isFocused ? 0.22 : 0;
      l.edges.material.opacity = isFocused ? 1.0 : 0.32;
    });
  };

  stageItems.forEach((item, idx) => {
    item.addEventListener('click', () => setActiveStage(idx));
    ScrollTrigger.create({
      trigger: item,
      start: 'top 56%',
      end: 'bottom 44%',
      onEnter: () => setActiveStage(idx),
      onEnterBack: () => setActiveStage(idx),
    });
  });

  setActiveStage(0);

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

  const clock = new THREE.Clock();
  let raf = 0;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    if (!reduced) {
      stack.rotation.y = Math.sin(t * 0.35) * 0.22 - 0.35;
    }
    camera.position.y += ((2.2 - activeTier * 0.65) - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  };
  animate();

  window.addEventListener('beforeunload', () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    renderer.dispose();
  });
}

function initPresetComparator() {
  const canvas = document.querySelector('#preset-canvas');
  if (!canvas) return;
  if (!isWebGLAvailable()) {
    showWebGLFallback(canvas);
    return;
  }

  const renderer = createRenderer(canvas, 1.5);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    42,
    (canvas.clientWidth || 1) / (canvas.clientHeight || 1),
    0.1,
    60
  );
  camera.position.set(0, 5.2, 8.6);
  camera.lookAt(0, 0.2, 0);

  addTacticalLights(scene);

  let mesh = null;
  let wire = null;
  const statsOut = document.querySelector('#preset-stats');

  const setPreset = (segments, label) => {
    if (mesh) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      scene.remove(mesh);
    }
    if (wire) {
      wire.material.dispose();
      scene.remove(wire);
    }
    const { geo, minY, maxY } = buildTerrainGeometry(11, segments, 'coastal');
    const topo = createTopoShaderMaterial(minY, maxY);
    mesh = new THREE.Mesh(geo, topo);
    wire = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0xff4b0b, wireframe: true, transparent: true, opacity: 0.45 })
    );
    wire.position.y = 0.015;
    scene.add(mesh, wire);

    const tris = segments * segments * 2;
    if (statsOut) {
      statsOut.textContent = `${label} · ${tris.toLocaleString()} TRIANGLES`;
    }
  };

  const buttons = [...document.querySelectorAll('[data-preset-seg]')];
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.toggle('active', b === btn));
      setPreset(Number(btn.dataset.presetSeg), btn.dataset.presetLabel || 'BALANCED');
    });
  });

  setPreset(48, 'BALANCED · 2048PX');

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

  const clock = new THREE.Clock();
  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const t = clock.getElapsedTime();
    if (mesh && wire) {
      mesh.material.uniforms.uTime.value = t;
      if (!reduced) {
        mesh.rotation.y = t * 0.14;
        wire.rotation.y = t * 0.14;
      }
    }
    renderer.render(scene, camera);
  };
  tick();

  window.addEventListener('beforeunload', () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    renderer.dispose();
  });
}

initPipelineStack3D();
initPresetComparator();
