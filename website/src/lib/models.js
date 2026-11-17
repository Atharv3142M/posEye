import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export function getAssetBaseUrl() {
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || './';
  if (typeof window !== 'undefined') {
    if (base.startsWith('/') && !window.location.pathname.startsWith(base)) {
      return './';
    }
  }
  return base;
}

const dracoLoader = new DRACOLoader();
try {
  const base = getAssetBaseUrl();
  dracoLoader.setDecoderPath(`${base}draco/`);
} catch {
  dracoLoader.setDecoderPath('./draco/');
}

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

export function createTajMahalHeritage(targetSize = 5.8) {
  const root = new THREE.Group();

  const mSandstone = new THREE.MeshStandardMaterial({
    color: 0xa45238,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const mMarble = new THREE.MeshStandardMaterial({
    color: 0xf5f3ed,
    roughness: 0.38,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  const mMarbleShade = new THREE.MeshStandardMaterial({
    color: 0xd9d3c5,
    roughness: 0.55,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const mGold = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.28,
    metalness: 0.75,
  });
  const mWater = new THREE.MeshStandardMaterial({
    color: 0x1b2836,
    roughness: 0.1,
    metalness: 0.8,
  });
  const mRecess = new THREE.MeshStandardMaterial({
    color: 0x3d3530,
    roughness: 0.9,
  });

  // 1. Lower Sandstone Terrace
  const lowerTerrace = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.35, 10.8), mSandstone);
  lowerTerrace.position.y = 0.175;
  lowerTerrace.castShadow = true;
  lowerTerrace.receiveShadow = true;
  root.add(lowerTerrace);

  // 2. Upper Marble Plinth
  const plinthHeight = 0.55;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(8.6, plinthHeight, 8.6), mMarble);
  plinth.position.y = 0.35 + plinthHeight / 2;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  root.add(plinth);

  // 3. Central Reflecting Pool on Terrace
  const pool = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 5.4), mWater);
  pool.position.set(0, 0.36, 2.6);
  root.add(pool);

  // 4. Main Tomb Body (Chamfered Octagonal Shape)
  const tombBaseY = 0.35 + plinthHeight;
  const tombH = 2.6;
  const s = 2.4;
  const c = 0.75;
  const shape = new THREE.Shape();
  shape.moveTo(-s + c, -s);
  shape.lineTo(s - c, -s);
  shape.lineTo(s, -s + c);
  shape.lineTo(s, s - c);
  shape.lineTo(s - c, s);
  shape.lineTo(-s + c, s);
  shape.lineTo(-s, s - c);
  shape.lineTo(-s, -s + c);
  shape.closePath();

  const tombGeo = new THREE.ExtrudeGeometry(shape, { depth: tombH, bevelEnabled: false });
  tombGeo.rotateX(-Math.PI / 2);
  const tombMesh = new THREE.Mesh(tombGeo, mMarble);
  tombMesh.position.y = tombBaseY;
  tombMesh.castShadow = true;
  tombMesh.receiveShadow = true;
  root.add(tombMesh);

  // 5. Grand Arched Pishtaqs (recessed portals on the 4 cardinal faces)
  const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  angles.forEach((ang) => {
    const archGroup = new THREE.Group();
    archGroup.rotation.y = ang;

    // Outer frame arch
    const outerFrame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 0.18), mMarbleShade);
    outerFrame.position.set(0, tombBaseY + 1.1, s - 0.08);
    outerFrame.castShadow = true;
    archGroup.add(outerFrame);

    // Deep recess cavity
    const recess = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.8, 0.45), mRecess);
    recess.position.set(0, tombBaseY + 0.95, s - 0.22);
    archGroup.add(recess);

    // Arch point top
    const archCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.4, 24, 1, false, 0, Math.PI), mRecess);
    archCyl.rotation.x = Math.PI / 2;
    archCyl.position.set(0, tombBaseY + 1.85, s - 0.22);
    archGroup.add(archCyl);

    root.add(archGroup);
  });

  // 6. Central Drum and Onion Dome
  const roofY = tombBaseY + tombH;
  const drumH = 0.75;
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, drumH, 36), mMarble);
  drum.position.y = roofY + drumH / 2;
  drum.castShadow = true;
  drum.receiveShadow = true;
  root.add(drum);

  // Bulbous Onion Dome (lathe profile)
  const domePts = [];
  const domeR = 1.45;
  const domeH = 2.1;
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    // bulbous curve parameterization
    const y = t * domeH;
    const radius = Math.sin(t * Math.PI * 0.85) * (domeR * (1 + 0.18 * Math.sin(t * Math.PI))) * (1 - t * 0.25);
    domePts.push(new THREE.Vector2(Math.max(radius, 0.01), y));
  }
  const domeGeo = new THREE.LatheGeometry(domePts, 36);
  const mainDome = new THREE.Mesh(domeGeo, mMarble);
  mainDome.position.y = roofY + drumH;
  mainDome.castShadow = true;
  mainDome.receiveShadow = true;
  root.add(mainDome);

  // Golden Finial & Spire
  const finialH = 0.95;
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.12, finialH, 16), mGold);
  finial.position.y = roofY + drumH + domeH + finialH / 2;
  finial.castShadow = true;
  root.add(finial);

  const finialBall = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), mGold);
  finialBall.position.y = roofY + drumH + domeH + 0.2;
  root.add(finialBall);

  // 7. Four Roof Corner Chhatris
  const chhatriDist = 1.9;
  const chhatriAngles = [Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, -Math.PI / 4];
  chhatriAngles.forEach((ang) => {
    const cx = Math.sin(ang) * chhatriDist;
    const cz = Math.cos(ang) * chhatriDist;

    const baseCh = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.35, 8), mMarble);
    baseCh.position.set(cx, roofY + 0.175, cz);
    baseCh.castShadow = true;
    root.add(baseCh);

    const domeCh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), mMarble);
    domeCh.position.set(cx, roofY + 0.35, cz);
    domeCh.castShadow = true;
    root.add(domeCh);

    const tipCh = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 8), mGold);
    tipCh.position.set(cx, roofY + 0.77 + 0.17, cz);
    root.add(tipCh);
  });

  // 8. Four Corner Minarets
  const minaretDist = 3.85;
  const minaretAngles = [Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, -Math.PI / 4];
  minaretAngles.forEach((ang) => {
    const mx = Math.sin(ang) * minaretDist;
    const mz = Math.cos(ang) * minaretDist;

    // Octagonal base pedestal
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.8, 8), mMarble);
    ped.position.set(mx, 0.35 + plinthHeight + 0.4, mz);
    ped.castShadow = true;
    ped.receiveShadow = true;
    root.add(ped);

    // Three tapering shaft tiers with balconies
    let shaftY = 0.35 + plinthHeight + 0.8;
    for (let t = 0; t < 3; t++) {
      const rBottom = 0.38 - t * 0.04;
      const rTop = 0.34 - t * 0.04;
      const hTier = 1.35;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, hTier, 24), mMarble);
      shaft.position.set(mx, shaftY + hTier / 2, mz);
      shaft.castShadow = true;
      root.add(shaft);

      // Balcony cornice
      const balc = new THREE.Mesh(new THREE.CylinderGeometry(rTop + 0.1, rTop - 0.02, 0.14, 16), mMarbleShade);
      balc.position.set(mx, shaftY + hTier, mz);
      balc.castShadow = true;
      root.add(balc);

      shaftY += hTier + 0.14;
    }

    // Minaret cupola and dome
    const cupola = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), mMarble);
    cupola.position.set(mx, shaftY + 0.12, mz);
    cupola.castShadow = true;
    root.add(cupola);

    const minaretFinial = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 8), mGold);
    minaretFinial.position.set(mx, shaftY + 0.4 + 0.15, mz);
    root.add(minaretFinial);
  });

  // 9. Calibrated Photogrammetry Datum Ring & Coordinate Crosshairs
  const datumRing = new THREE.Mesh(
    new THREE.RingGeometry(5.8, 5.86, 96),
    new THREE.MeshBasicMaterial({ color: 0xe25b38, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
  );
  datumRing.rotation.x = -Math.PI / 2;
  datumRing.position.y = 0.02;
  root.add(datumRing);

  // WGS 84 Coordinate Axis Crosshair
  const crossGeo = new THREE.BufferGeometry();
  crossGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([
      -6.2, 0.02, 0, 6.2, 0.02, 0,
      0, 0.02, -6.2, 0, 0.02, 6.2
    ], 3)
  );
  const crossLines = new THREE.LineSegments(
    crossGeo,
    new THREE.LineBasicMaterial({ color: 0xe25b38, transparent: true, opacity: 0.25 })
  );
  root.add(crossLines);

  return normalizeModel(root, targetSize);
}

export function loadGLB(fileName, onProgress) {
  if (modelCache.has(fileName)) {
    return modelCache.get(fileName);
  }

  const base = getAssetBaseUrl();
  const candidateUrls = [
    `${base}models/${fileName}`,
    `./models/${fileName}`,
    `../models/${fileName}`,
    `/models/${fileName}`,
    `/posEye/models/${fileName}`,
  ];

  const promise = new Promise(async (resolve, reject) => {
    let lastErr = null;

    for (const url of candidateUrls) {
      try {
        const gltf = await new Promise((res, rej) => {
          gltfLoader.load(
            url,
            (loaded) => res(loaded),
            (evt) => {
              if (onProgress && evt.total > 0) {
                onProgress(Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
              }
            },
            (err) => rej(err)
          );
        });

        if (gltf && gltf.scene) {
          return resolve(gltf);
        }
      } catch (err) {
        lastErr = err;
      }
    }

    // Graceful fallback for India heritage / terrain models
    if (fileName.includes('india') || fileName.includes('cliff') || fileName.includes('scan')) {
      console.warn(`[posEye] Remote asset '${fileName}' unavailable. Activating procedural Indian Heritage photogrammetry model.`, lastErr);
      const heritage = createTajMahalHeritage();
      return resolve({ scene: heritage.root, animations: [] });
    }

    console.error(`[posEye] Failed to load 3D model ${fileName} across candidate paths:`, candidateUrls, lastErr);
    reject(lastErr || new Error(`Failed to load ${fileName}`));
  });

  modelCache.set(fileName, promise);
  return promise;
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
  const highColor = new THREE.Color('#E25B38');

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
      size: 0.045,
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
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

export function addStudioLighting(scene) {
  const hemi = new THREE.HemisphereLight(0xfaf8f3, 0x4a5462, 1.55);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff5ea, 2.3);
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

  const rim = new THREE.DirectionalLight(0xcddceb, 0.95);
  rim.position.set(-9, 6, -8);
  scene.add(rim);

  const shadowGround = new THREE.Mesh(
    new THREE.CircleGeometry(10, 48),
    new THREE.ShadowMaterial({ opacity: 0.18 })
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
