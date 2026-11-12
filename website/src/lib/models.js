import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

const modelCache = new Map();

export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

export function loadGLB(fileName, onProgress) {
  const url = `${import.meta.env.BASE_URL}models/${fileName}`;
  if (!modelCache.has(fileName)) {
    const promise = new Promise((resolve, reject) => {
      gltfLoader.load(
        url,
        (gltf) => resolve(gltf),
        (evt) => {
          if (onProgress && evt.total > 0) {
            onProgress(Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
          }
        },
        (err) => reject(err)
      );
    });
    modelCache.set(fileName, promise);
  }
  return modelCache.get(fileName);
}

export function measureStats(root) {
  let vertices = 0;
  let triangles = 0;
  let meshes = 0;

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    meshes += 1;
    const pos = obj.geometry.attributes.position;
    if (pos) vertices += pos.count;
    const idx = obj.geometry.index;
    triangles += idx ? Math.floor(idx.count / 3) : pos ? Math.floor(pos.count / 3) : 0;
  });

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  return { vertices, triangles, meshes, size };
}

export function normalizeModel(sourceScene, targetSize = 5.5) {
  const clone = sourceScene.clone(true);
  clone.updateMatrixWorld(true);

  const rawBox = new THREE.Box3().setFromObject(clone);
  const center = rawBox.getCenter(new THREE.Vector3());
  const size = rawBox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const scale = targetSize / maxDim;

  const wrapper = new THREE.Group();
  clone.position.set(-center.x * scale, -rawBox.min.y * scale, -center.z * scale);
  clone.scale.setScalar(scale);

  clone.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        m.side = THREE.DoubleSide;
      });
    }
  });

  wrapper.add(clone);
  wrapper.updateMatrixWorld(true);
  return {
    root: wrapper,
    stats: measureStats(wrapper),
  };
}

export function buildVertexPointCloud(root, maxPoints = 22000) {
  const positions = [];
  const colors = [];
  const tempPos = new THREE.Vector3();
  const lowColor = new THREE.Color('#3B4D59');
  const highColor = new THREE.Color('#9E3816');

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const minY = box.min.y;
  const spanY = Math.max(box.max.y - box.min.y, 0.01);

  const meshNodes = [];
  root.traverse((obj) => {
    if (obj.isMesh && obj.geometry?.attributes?.position) meshNodes.push(obj);
  });

  const totalVerts = meshNodes.reduce((sum, m) => sum + m.geometry.attributes.position.count, 0);
  const step = Math.max(1, Math.floor(totalVerts / maxPoints));

  for (const mesh of meshNodes) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += step) {
      tempPos.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      positions.push(tempPos.x, tempPos.y, tempPos.z);
      const t = THREE.MathUtils.clamp((tempPos.y - minY) / spanY, 0, 1);
      const c = lowColor.clone().lerp(highColor, t);
      colors.push(c.r, c.g, c.b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 0.04,
      vertexColors: true,
      sizeAttenuation: true,
    })
  );
}

export function createRenderer(canvas, { maxPixelRatio = 1.75 } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: window.innerWidth > 720,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

export function addStudioLighting(scene) {
  const hemi = new THREE.HemisphereLight(0xfaf8f3, 0x6f685f, 1.45);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff5ea, 2.2);
  key.position.set(8, 12, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 36;
  const d = 8;
  key.shadow.camera.left = -d;
  key.shadow.camera.right = d;
  key.shadow.camera.top = d;
  key.shadow.camera.bottom = -d;
  key.shadow.bias = -0.0005;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xcddceb, 0.9);
  rim.position.set(-9, 6, -8);
  scene.add(rim);

  const shadowGround = new THREE.Mesh(
    new THREE.CircleGeometry(10, 48),
    new THREE.ShadowMaterial({ opacity: 0.16 })
  );
  shadowGround.rotation.x = -Math.PI / 2;
  shadowGround.position.y = -0.02;
  shadowGround.receiveShadow = true;
  scene.add(shadowGround);

  return { hemi, key, rim, shadowGround };
}

export function showStageFallback(container, message) {
  const existing = container.querySelector('.webgl-fallback');
  if (existing) return;
  const box = document.createElement('div');
  box.className = 'webgl-fallback';
  box.textContent = message;
  container.appendChild(box);
}
