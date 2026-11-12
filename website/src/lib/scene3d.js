import * as THREE from 'three';

export function createSeededRng(seed = 2026) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleElevation(x, z, site = 'coastal') {
  if (site === 'substation') {
    const padA = Math.exp(-((x - 1.6) ** 2 + (z + 1.1) ** 2) * 0.3) * 1.45;
    const padB = Math.exp(-((x + 2.2) ** 2 + (z - 1.6) ** 2) * 0.4) * 1.15;
    const plinth = Math.abs(x) < 4.2 && Math.abs(z) < 4.2 ? 0.25 : 0;
    const detail = Math.sin(x * 0.5) * Math.cos(z * 0.45) * 0.25;
    return plinth + padA + padB + detail;
  }
  if (site === 'canyon') {
    const gorge = Math.exp(-(x * x) * 0.18) * -1.65;
    const walls = Math.abs(x) * 0.26 + Math.sin(z * 0.42) * 0.34;
    const strata = Math.cos(x * 1.15 + z * 0.7) * 0.16;
    return gorge + walls * 0.7 + strata;
  }
  return (
    Math.sin(x * 0.45) * Math.cos(z * 0.35) * 0.78 +
    Math.sin((x + z) * 0.22) * 0.48 +
    Math.cos(z * 0.85 + x * 0.18) * 0.22 +
    Math.exp(-((x - 1.4) ** 2 + (z - 0.5) ** 2) * 0.12) * 1.05
  );
}

export function buildTerrainGeometry(size = 20, segments = 100, site = 'coastal') {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = sampleElevation(pos.getX(i), pos.getZ(i), site);
    pos.setY(i, y);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  geo.computeVertexNormals();
  return { geo, minY, maxY };
}

export function buildPointCloudFromTerrain(size = 20, count = 4200, site = 'coastal', seed = 404) {
  const rng = createSeededRng(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const cLow = new THREE.Color(0x5cc4ff);
  const cMid = new THREE.Color(0xe2e8f0);
  const cHigh = new THREE.Color(0xff4b0b);

  for (let i = 0; i < count; i++) {
    const x = (rng() - 0.5) * size;
    const z = (rng() - 0.5) * size;
    const y = sampleElevation(x, z, site) + 0.035;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const h = THREE.MathUtils.clamp((y + 1.3) / 3.0, 0, 1);
    const col = h < 0.5
      ? cLow.clone().lerp(cMid, h * 2)
      : cMid.clone().lerp(cHigh, (h - 0.5) * 2);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function createTopoShaderMaterial(minY = -1.4, maxY = 2.0) {
  const span = Math.max(0.001, maxY - minY);
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uScanPos: { value: new THREE.Vector2(0, 0) },
      uMinY: { value: minY },
      uSpan: { value: span },
      uHeatmap: { value: 0 },
      uSliceY: { value: 99.0 },
    },
    vertexShader: `
      varying vec3 vWorld;
      varying vec3 vNorm;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNorm = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec2 uScanPos;
      uniform float uMinY;
      uniform float uSpan;
      uniform float uHeatmap;
      uniform float uSliceY;
      varying vec3 vWorld;
      varying vec3 vNorm;

      void main() {
        if (vWorld.y > uSliceY) discard;

        float h = clamp((vWorld.y - uMinY) / uSpan, 0.0, 1.0);
        vec3 baseDark = vec3(0.055, 0.07, 0.095);
        vec3 midSlate = vec3(0.15, 0.19, 0.25);
        vec3 peakWarm = vec3(1.0, 0.294, 0.043);
        vec3 cyanRim = vec3(0.36, 0.77, 1.0);

        vec3 lightDir = normalize(vec3(-0.5, 0.85, 0.4));
        float diff = max(dot(normalize(vNorm), lightDir), 0.0);

        vec3 albedo = mix(baseDark, midSlate, h);
        if (uHeatmap > 0.5) {
          albedo = mix(cyanRim * 0.45, peakWarm, smoothstep(0.12, 0.92, h));
        }
        albedo *= (0.58 + diff * 0.78);

        // Topographic isolines
        float contour = abs(fract(vWorld.y * 4.5) - 0.5);
        float line = 1.0 - smoothstep(0.02, 0.055, contour);
        albedo = mix(albedo, peakWarm, line * (uHeatmap > 0.5 ? 0.5 : 0.34));

        // Cross-section slice glow rim
        float sliceEdge = smoothstep(0.08, 0.0, abs(vWorld.y - uSliceY));
        albedo += cyanRim * sliceEdge * 0.9;

        // Drone scanner pulse ring
        float d = length(vWorld.xz - uScanPos);
        float pulse = smoothstep(2.4, 0.0, abs(d - mod(uTime * 2.1, 6.2))) * 0.45;
        float spot = exp(-d * d * 0.2) * 0.38;
        albedo += peakWarm * (pulse + spot);

        gl_FragColor = vec4(albedo, 0.95);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  });
}

export function createDroneRig() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1a202c,
    metalness: 0.65,
    roughness: 0.45,
  });
  const accentMat = new THREE.MeshBasicMaterial({ color: 0xff4b0b });
  const rotorMat = new THREE.MeshBasicMaterial({
    color: 0x5cc4ff,
    transparent: true,
    opacity: 0.58,
  });

  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.13, 0.62), bodyMat));

  const arms = [
    [-0.4, 0.04, -0.4],
    [0.4, 0.04, -0.4],
    [-0.4, 0.04, 0.4],
    [0.4, 0.04, 0.4],
  ];
  for (const [ax, ay, az] of arms) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.52), bodyMat);
    arm.position.set(ax * 0.5, ay * 0.5, az * 0.5);
    arm.lookAt(ax, ay, az);
    group.add(arm);

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.2, 24), rotorMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(ax, ay + 0.03, az);
    group.add(ring);
  }

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), accentMat);
  beacon.position.set(0, 0.1, 0.18);
  group.add(beacon);

  const frustumGeo = new THREE.ConeGeometry(1.5, 3.1, 4, 1, true);
  frustumGeo.rotateY(Math.PI / 4);
  const frustum = new THREE.LineSegments(
    new THREE.EdgesGeometry(frustumGeo),
    new THREE.LineBasicMaterial({ color: 0xff4b0b, transparent: true, opacity: 0.45 })
  );
  frustum.position.y = -1.6;
  group.add(frustum);

  return group;
}

export function addTacticalLights(scene) {
  const hemi = new THREE.HemisphereLight(0x88b8e6, 0x0f0c14, 1.35);
  const key = new THREE.DirectionalLight(0xff6b35, 2.2);
  key.position.set(-6, 10, 5);
  const rim = new THREE.DirectionalLight(0x5cc4ff, 1.35);
  rim.position.set(7, 4, -6);
  scene.add(hemi, key, rim);
}

export function createRenderer(canvas, maxDpr = 1.75) {
  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !isMobile,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.15 : maxDpr));
  renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}
