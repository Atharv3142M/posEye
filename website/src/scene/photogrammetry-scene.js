import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class PhotogrammetryScene {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.interactive = options.interactive ?? true;
    this.isStory = options.isStory ?? false;
    this.onMeasure = options.onMeasure ?? null;
    this.onHover = options.onHover ?? null;

    this.measurePoints = [];
    this.measuring = false;

    this.init();
  }

  init() {
    // 1. Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: window.innerWidth > 768,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 2. Scene & Fog
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x080b0d, 0.025);

    // 3. Camera
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 150);
    this.camera.position.set(0, 7.5, 14.5);

    // 4. Controls
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Do not go below ground
    this.controls.minDistance = 3;
    this.controls.maxDistance = 35;
    this.controls.enabled = this.interactive && !this.isStory;

    // 5. Lighting
    this.setupLighting();

    // 6. Terrain & Photogrammetry Assets
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.buildTerrain();
    this.buildWireframe();
    this.buildPointCloud();
    this.buildFlightTrajectory();
    this.buildGCPs();
    this.buildGrid();

    // 7. Raycasting for Measurement
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.measureGroup = new THREE.Group();
    this.scene.add(this.measureGroup);

    this.setupEvents();
    this.animate();
  }

  setupLighting() {
    // Hemisphere ambient light
    const hemiLight = new THREE.HemisphereLight(0xb9d8ff, 0x121720, 1.6);
    this.scene.add(hemiLight);

    // Primary directional sun light (simulating drone survey flight conditions)
    const sunLight = new THREE.DirectionalLight(0xffecd6, 2.8);
    sunLight.position.set(-6, 12, 8);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.bias = -0.0005;
    this.scene.add(sunLight);

    // Drone sensor fill light
    const fillLight = new THREE.DirectionalLight(0x8bd8c5, 1.2);
    fillLight.position.set(8, 6, -6);
    this.scene.add(fillLight);
  }

  // Realistic topography function (drone photogrammetry quarry / earthworks site)
  getElevation(x, z) {
    const r2 = x * x + z * z;
    const pit = -Math.exp(-r2 / 12) * 2.1;
    const benchDist = Math.sqrt(r2);
    const bench = Math.floor(benchDist * 1.6) * 0.16;
    const ridge = Math.sin(x * 0.45 + z * 0.3) * 0.7 + Math.cos(z * 0.55 - x * 0.25) * 0.45;
    const stockpileDist = Math.hypot(x - 3.2, z - 2.8);
    const stockpile = Math.exp(-Math.pow(stockpileDist / 1.5, 2)) * 1.5;
    const road = -Math.exp(-Math.pow((z - 0.35 * x + 1.1) / 0.75, 2)) * 0.3;
    const noise = (Math.sin(x * 3.8) * Math.cos(z * 3.2) + Math.sin((x + z) * 4.5)) * 0.04;
    return pit + bench * 0.55 + ridge * 0.8 + stockpile + road + noise;
  }

  generateOrthophotoTexture() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Base background earth tone
    ctx.fillStyle = '#222831';
    ctx.fillRect(0, 0, size, size);

    // Concentric quarry bench gradient
    const grad = ctx.createRadialGradient(size / 2, size / 2, 40, size / 2, size / 2, size * 0.45);
    grad.addColorStop(0, '#1c1f24'); // Deep pit floor
    grad.addColorStop(0.3, '#393e46'); // Rock strata
    grad.addColorStop(0.65, '#4f555e'); // Haul benches
    grad.addColorStop(1, '#2f3542'); // Natural scrub/vegetation
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Drone survey haul road stripe
    ctx.strokeStyle = '#5a5448';
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.moveTo(size * 0.1, size * 0.7);
    ctx.bezierCurveTo(size * 0.35, size * 0.6, size * 0.6, size * 0.4, size * 0.85, size * 0.25);
    ctx.stroke();

    // Topographic contour lines
    ctx.strokeStyle = 'rgba(255, 87, 40, 0.25)';
    ctx.lineWidth = 1.5;
    for (let r = 80; r < size * 0.48; r += 45) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Grid coordinates
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < size; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    for (let y = 0; y < size; y += 128) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }

    // GCP Survey Target Markers on the ground
    const gcps = [
      { x: size * 0.25, y: size * 0.3 },
      { x: size * 0.75, y: size * 0.25 },
      { x: size * 0.3, y: size * 0.75 },
      { x: size * 0.7, y: size * 0.7 }
    ];
    gcps.forEach((g, idx) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(g.x - 10, g.y - 10, 20, 20);
      ctx.fillStyle = '#ff5728';
      ctx.fillRect(g.x - 10, g.y - 10, 10, 10);
      ctx.fillRect(g.x, g.y, 10, 10);
      ctx.fillStyle = '#ff5728';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`GCP-0${idx + 1}`, g.x + 14, g.y + 4);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  buildTerrain() {
    const W = 16;
    const H = 16;
    const RES = 130;
    this.terrainGeo = new THREE.PlaneGeometry(W, H, RES, RES);
    this.terrainGeo.rotateX(-Math.PI / 2);

    const pos = this.terrainGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.getElevation(x, z));
    }
    this.terrainGeo.computeVertexNormals();

    const orthoTexture = this.generateOrthophotoTexture();
    this.terrainMat = new THREE.MeshStandardMaterial({
      map: orthoTexture,
      roughness: 0.78,
      metalness: 0.15,
      side: THREE.DoubleSide
    });

    this.terrainMesh = new THREE.Mesh(this.terrainGeo, this.terrainMat);
    this.terrainMesh.name = 'TerrainMesh';
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.castShadow = true;
    this.root.add(this.terrainMesh);
  }

  buildWireframe() {
    this.wireMat = new THREE.MeshBasicMaterial({
      color: 0xc6e86b,
      wireframe: true,
      transparent: true,
      opacity: 0.0 // starts invisible, fades in during chapter 2
    });
    this.wireMesh = new THREE.Mesh(this.terrainGeo, this.wireMat);
    this.wireMesh.position.y = 0.005;
    this.root.add(this.wireMesh);
  }

  buildPointCloud() {
    const pointsGeo = new THREE.BufferGeometry();
    const count = 18000;
    const positions = [];
    const colors = [];
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 15.6;
      const z = (Math.random() - 0.5) * 15.6;
      const y = this.getElevation(x, z) + (Math.random() - 0.5) * 0.02;
      positions.push(x, y, z);

      // ASPRS Elevation color ramp
      if (y > 1.0) color.setHex(0xffffff); // High ridge
      else if (y > 0.4) color.setHex(0x8bd8c5); // Upper slope
      else if (y > -0.4) color.setHex(0xc6e86b); // Mid benches
      else color.setHex(0x8bd8c5); // Quarry pit floor

      colors.push(color.r, color.g, color.b);
    }

    pointsGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    pointsGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    this.pointsMat = new THREE.PointsMaterial({
      size: 0.035,
      vertexColors: true,
      transparent: true,
      opacity: 0.0 // starts invisible, fades in during chapter 3
    });

    this.pointCloud = new THREE.Points(pointsGeo, this.pointsMat);
    this.root.add(this.pointCloud);
  }

  buildFlightTrajectory() {
    this.flightGroup = new THREE.Group();
    const flightPoints = [];
    this.waypoints = [];
    const gridX = [-5, -2.5, 0, 2.5, 5];
    const flightAlt = 3.6;

    for (let row = 0; row < gridX.length; row++) {
      const x = gridX[row];
      const zStart = row % 2 === 0 ? -5.5 : 5.5;
      const zEnd = row % 2 === 0 ? 5.5 : -5.5;
      const steps = 5;

      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const z = zStart + (zEnd - zStart) * t;
        const pt = new THREE.Vector3(x, flightAlt + Math.sin(t * Math.PI) * 0.15, z);
        flightPoints.push(pt);
        if (s % 2 === 0) {
          this.waypoints.push(pt);
        }
      }
    }

    const curve = new THREE.CatmullRomCurve3(flightPoints);
    const curvePts = curve.getPoints(140);
    const curveGeo = new THREE.BufferGeometry().setFromPoints(curvePts);

    this.flightLineMat = new THREE.LineBasicMaterial({
      color: 0xc6e86b,
      transparent: true,
      opacity: 0.0 // starts invisible, fades in during chapter 4
    });
    this.flightLine = new THREE.Line(curveGeo, this.flightLineMat);
    this.flightGroup.add(this.flightLine);

    // Camera Frustum Pyramids
    this.frustums = [];
    this.waypoints.forEach(wp => {
      const pyrGeo = new THREE.ConeGeometry(0.28, 0.55, 4, 1, true);
      pyrGeo.rotateX(Math.PI / 2);
      const pyrMat = new THREE.MeshBasicMaterial({
        color: 0x8bd8c5,
        wireframe: true,
        transparent: true,
        opacity: 0.0
      });
      const frustum = new THREE.Mesh(pyrGeo, pyrMat);
      frustum.position.copy(wp);
      frustum.lookAt(wp.x * 0.25, 0, wp.z * 0.25);
      this.flightGroup.add(frustum);
      this.frustums.push(frustum);
    });

    this.root.add(this.flightGroup);
  }

  buildGCPs() {
    this.gcpGroup = new THREE.Group();
    const gcpCoords = [
      { x: -4, z: -3.5, label: 'GCP-01' },
      { x: 4, z: -3.8, label: 'GCP-02' },
      { x: -3.2, z: 3.5, label: 'GCP-03' },
      { x: 3.5, z: 3.2, label: 'GCP-04' }
    ];

    gcpCoords.forEach(g => {
      const y = this.getElevation(g.x, g.z) + 0.02;
      const markerGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0xc6e86b });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.set(g.x, y, g.z);
      this.gcpGroup.add(marker);
    });

    this.root.add(this.gcpGroup);
  }

  buildGrid() {
    const grid = new THREE.GridHelper(24, 48, 0xc6e86b, 0x1b2028);
    grid.position.y = -2.2;
    grid.material.transparent = true;
    grid.material.opacity = 0.2;
    this.scene.add(grid);
  }

  setupEvents() {
    this.resize = () => {
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };

    this.ro = new ResizeObserver(this.resize);
    this.ro.observe(this.canvas);

    // Pointer events for measurement raycast
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
  }

  onPointerMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (this.measuring && this.onHover) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObject(this.terrainMesh);
      if (hits.length > 0) {
        this.onHover(hits[0].point);
      }
    }
  }

  onPointerDown(e) {
    if (!this.measuring) return;

    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.terrainMesh);

    if (hits.length > 0) {
      const pt = hits[0].point;
      this.addMeasurePoint(pt);
    }
  }

  setMeasuring(active) {
    this.measuring = active;
    if (!active) {
      this.clearMeasurement();
    }
  }

  addMeasurePoint(pt) {
    if (this.measurePoints.length >= 2) {
      this.clearMeasurement();
    }

    this.measurePoints.push(pt);

    // Add marker sphere
    const sphereGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xc6e86b });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.copy(pt);
    this.measureGroup.add(sphere);

    if (this.measurePoints.length === 2) {
      // Connect line
      const lineGeo = new THREE.BufferGeometry().setFromPoints(this.measurePoints);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
      const line = new THREE.Line(lineGeo, lineMat);
      this.measureGroup.add(line);

      const distance = this.measurePoints[0].distanceTo(this.measurePoints[1]);
      if (this.onMeasure) {
        this.onMeasure(distance);
      }
    }
  }

  clearMeasurement() {
    this.measurePoints = [];
    while (this.measureGroup.children.length > 0) {
      const obj = this.measureGroup.children[0];
      this.measureGroup.remove(obj);
    }
    if (this.onMeasure) {
      this.onMeasure(null);
    }
  }

  // Display Mode Switcher (reconstruction.html workstation)
  setDisplayMode(mode) {
    // Reset all opacities
    if (mode === 'textured') {
      this.terrainMat.opacity = 1.0;
      this.terrainMat.transparent = false;
      this.wireMat.opacity = 0.0;
      this.pointsMat.opacity = 0.0;
      this.flightLineMat.opacity = 0.0;
      this.frustums.forEach(f => f.material.opacity = 0.0);
    } else if (mode === 'wireframe') {
      this.terrainMat.opacity = 0.2;
      this.terrainMat.transparent = true;
      this.wireMat.opacity = 0.85;
      this.pointsMat.opacity = 0.0;
      this.flightLineMat.opacity = 0.0;
      this.frustums.forEach(f => f.material.opacity = 0.0);
    } else if (mode === 'points') {
      this.terrainMat.opacity = 0.0;
      this.terrainMat.transparent = true;
      this.wireMat.opacity = 0.0;
      this.pointsMat.opacity = 0.95;
      this.flightLineMat.opacity = 0.0;
      this.frustums.forEach(f => f.material.opacity = 0.0);
    } else if (mode === 'flight') {
      this.terrainMat.opacity = 0.6;
      this.terrainMat.transparent = true;
      this.wireMat.opacity = 0.15;
      this.pointsMat.opacity = 0.0;
      this.flightLineMat.opacity = 0.95;
      this.frustums.forEach(f => f.material.opacity = 0.85);
    } else { // 'all'
      this.terrainMat.opacity = 0.85;
      this.terrainMat.transparent = true;
      this.wireMat.opacity = 0.25;
      this.pointsMat.opacity = 0.45;
      this.flightLineMat.opacity = 0.9;
      this.frustums.forEach(f => f.material.opacity = 0.75);
    }
  }

  // Cinematic 6-Stage Narrative Controller for GSAP ScrollTrigger
  setStoryProgress(t) {
    // t ranges from 0.0 to 1.0
    // Chapter 1: Approaching terrain (0.0 -> 0.20)
    // Chapter 2: Wireframe transition (0.20 -> 0.40)
    // Chapter 3: Point cloud separation (0.40 -> 0.60)
    // Chapter 4: Flight trajectory & camera frustums (0.60 -> 0.80)
    // Chapter 5: Calibrated georeferencing / Return to textured (0.80 -> 0.94)
    // Chapter 6: User Orbit Inspection (0.94 -> 1.0)

    if (t < 0.2) {
      const p = t / 0.2;
      this.camera.position.set(0, 11 - p * 4.5, 16 - p * 5);
      this.camera.lookAt(0, 0, 0);
      this.terrainMat.opacity = 1.0;
      this.terrainMat.transparent = false;
      this.wireMat.opacity = 0.0;
      this.pointsMat.opacity = 0.0;
      this.flightLineMat.opacity = 0.0;
      this.frustums.forEach(f => f.material.opacity = 0.0);
      this.controls.enabled = false;
    } else if (t < 0.4) {
      const p = (t - 0.2) / 0.2;
      this.camera.position.set(Math.sin(p * 0.8) * 4, 6.5 - p * 1.5, 11 - p * 2);
      this.camera.lookAt(0, -0.2, 0);
      this.terrainMat.transparent = true;
      this.terrainMat.opacity = 1.0 - p * 0.75;
      this.wireMat.opacity = p * 0.85;
      this.pointsMat.opacity = 0.0;
      this.flightLineMat.opacity = 0.0;
      this.frustums.forEach(f => f.material.opacity = 0.0);
      this.controls.enabled = false;
    } else if (t < 0.6) {
      const p = (t - 0.4) / 0.2;
      this.camera.position.set(4 - p * 8, 5.0 + Math.sin(p * Math.PI) * 1.2, 9 - p * 1);
      this.camera.lookAt(0, 0, 0);
      this.wireMat.opacity = 0.85 * (1.0 - p);
      this.terrainMat.opacity = 0.15 * (1.0 - p);
      this.pointsMat.opacity = p * 0.95;
      this.flightLineMat.opacity = 0.0;
      this.frustums.forEach(f => f.material.opacity = 0.0);
      this.controls.enabled = false;
    } else if (t < 0.8) {
      const p = (t - 0.6) / 0.2;
      this.camera.position.set(-4 + p * 4, 6.2 + p * 2.2, 8 + p * 2);
      this.camera.lookAt(0, 1.2, 0);
      this.pointsMat.opacity = 0.95 * (1.0 - p * 0.5);
      this.flightLineMat.opacity = p * 0.95;
      this.frustums.forEach(f => f.material.opacity = p * 0.85);
      this.terrainMat.opacity = p * 0.4;
      this.wireMat.opacity = 0.0;
      this.controls.enabled = false;
    } else if (t < 0.94) {
      const p = (t - 0.8) / 0.14;
      this.camera.position.set(Math.sin(p * Math.PI * 0.6) * 6, 8.4 - p * 1.8, 10 + p * 1.5);
      this.camera.lookAt(0, 0, 0);
      this.flightLineMat.opacity = (1.0 - p) * 0.95;
      this.frustums.forEach(f => f.material.opacity = (1.0 - p) * 0.85);
      this.pointsMat.opacity = (1.0 - p) * 0.45;
      this.terrainMat.opacity = 0.4 + p * 0.6;
      this.wireMat.opacity = 0.0;
      this.controls.enabled = false;
    } else {
      // Step 6: User orbit enabled
      this.terrainMat.opacity = 1.0;
      this.terrainMat.transparent = false;
      this.controls.enabled = true;
    }
  }

  resetCamera() {
    this.camera.position.set(0, 7.5, 14.5);
    this.camera.lookAt(0, 0, 0);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  setTopView() {
    this.camera.position.set(0, 18, 0.001);
    this.camera.lookAt(0, 0, 0);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  animate() {
    this.raf = requestAnimationFrame(() => this.animate());
    if (this.controls.enabled) {
      this.controls.update();
    } else if (!this.isStory) {
      // Slow ambient idle rotation when not pinned in story
      this.root.rotation.y += 0.0006;
    }
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.ro) this.ro.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
