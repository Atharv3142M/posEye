import { initChrome, reducedMotion } from '../lib/chrome.js';

const { gsap, ScrollTrigger } = initChrome();

const STAGES = [
  {
    id: 1,
    phase: 'Phase 1 : Ingest & Pre-processing',
    title: '01 / Video Probing & Validation',
    body: 'FFprobe inspects video duration, frame rate, resolution, container metadata, and pixel format before extraction begins.',
    component: 'apps/pipeline/probe.py',
    io: 'Drone MP4/MOV &rarr; Video Metadata',
    fault: 'Fails immediately if stream is missing or corrupt',
  },
  {
    id: 2,
    phase: 'Phase 1 : Ingest & Pre-processing',
    title: '02 / FFmpeg Frame Extraction',
    body: 'Bundled static FFmpeg extracts stills along a configurable cadence (default 1 to 2 fps) with millisecond-accurate timestamps.',
    component: 'apps/pipeline/extract.py (ffmpeg.exe)',
    io: 'Video File &rarr; Raw JPEG Stills',
    fault: 'Ensures minimum 5 surviving frames for SfM baseline',
  },
  {
    id: 3,
    phase: 'Phase 1 : Ingest & Pre-processing',
    title: '03 / Laplacian Blur Filtering',
    body: 'OpenCV calculates Laplacian focus variance to drop motion-blurred or out-of-focus stills from drone vibration.',
    component: 'apps/pipeline/filters.py',
    io: 'Raw Stills &rarr; Focused Stills',
    fault: 'Threshold auto-adjusts if too few frames pass',
  },
  {
    id: 4,
    phase: 'Phase 1 : Ingest & Pre-processing',
    title: '04 / dHash Deduplication',
    body: 'Perceptual difference hashing drops redundant hovering frames (&le; 10 Hamming distance), slashing compute time by 40%.',
    component: 'apps/pipeline/filters.py',
    io: 'Focused Stills &rarr; Unique Trajectory Frames',
    fault: 'Protects minimum 60% spatial overlap',
  },
  {
    id: 5,
    phase: 'Phase 1 : Ingest & Pre-processing',
    title: '05 / SRT Telemetry Parsing',
    body: 'Parses DJI subtitle blocks, CSV logs, or key-value telemetry, extracting latitude, longitude, and AMSL altitude per frame.',
    component: 'apps/pipeline/srt.py',
    io: '.SRT Telemetry &rarr; WGS 84 GPS Table',
    fault: 'Graceful fallback to uncalibrated photogrammetry if SRT missing',
  },
  {
    id: 6,
    phase: 'Phase 1 : Ingest & Pre-processing',
    title: '06 / EXIF GPS Injection',
    body: 'piexif stamps WGS 84 rational GPS coordinates and UTC timestamps directly into surviving JPEG headers within 1.5s tolerance.',
    component: 'apps/pipeline/exif.py',
    io: 'JPEGs + Telemetry &rarr; Geotagged Survey Stills',
    fault: 'Logs unmatched frame offsets to diagnostics',
  },
  {
    id: 7,
    phase: 'Phase 1 : Ingest & Pre-processing',
    title: '07 / Dynamic Object Masking',
    body: 'Optional YOLOv8n segmentation masks transient vehicles and pedestrians to prevent ghosting artifacts in dense matching.',
    component: 'apps/pipeline/masks.py',
    io: 'Geotagged Stills &rarr; Binary Object Masks',
    fault: 'Bypassed automatically when disabled in presets',
  },
  {
    id: 8,
    phase: 'Phase 2 : Reconstruction',
    title: '08 / Archive Staging & Dispatch',
    body: 'Curated imagery, EXIF tags, and masks are bundled and staged for dispatch to the local reconstruction engine container.',
    component: 'apps/orchestrator/nodeodm.py',
    io: 'Local Staged Files &rarr; Engine Task Zip',
    fault: 'Verifies container health on port 3000 first',
  },
  {
    id: 9,
    phase: 'Phase 2 : Reconstruction',
    title: '09 / posEye Construction Engine',
    body: 'Containerized local photogrammetry executes Structure-from-Motion, dense depth maps, Poisson meshing, and orthophoto tiles.',
    component: 'posEye Engine Container (NodeODM)',
    io: 'Task Zip &rarr; Dense Point Cloud & Mesh all.zip',
    fault: 'NVIDIA CUDA acceleration with CPU fallback',
  },
  {
    id: 10,
    phase: 'Phase 3 : Spatial Outputs',
    title: '10 / Deliverable Extraction & Zip-Slip Guard',
    body: 'Extracts the deliverables bundle with canonical path checking to prevent path traversal attacks during file decompression.',
    component: 'apps/orchestrator/jobs.py',
    io: 'all.zip &rarr; Verified Job Artifacts',
    fault: 'Rejects paths containing illegal directory traversals',
  },
  {
    id: 11,
    phase: 'Phase 3 : Spatial Outputs',
    title: '11 / Origin-Centered GLB Conversion',
    body: 'Trimesh and pygltflib normalize UTM coordinates to origin, pack model.glb for WebGL, and expose LAZ point clouds & GeoTIFFs.',
    component: 'apps/orchestrator/convert.py',
    io: 'OBJ Mesh &rarr; Origin-Centered Draco GLB',
    fault: 'Maintains georeference transformation matrix',
  },
];

const pillsContainer = document.querySelector('#hud-node-pills');
const hudPhase = document.querySelector('#hud-phase');
const hudTitle = document.querySelector('#hud-title');
const hudBody = document.querySelector('#hud-body');
const hudComponent = document.querySelector('#hud-component');
const hudIO = document.querySelector('#hud-io');
const hudFault = document.querySelector('#hud-fault');

function initPills() {
  if (!pillsContainer) return;
  pillsContainer.innerHTML = '';
  STAGES.forEach((stage, idx) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = `pipeline-node-pill ${idx === 0 ? 'active' : ''}`;
    pill.dataset.stageId = String(stage.id);
    pill.textContent = String(stage.id).padStart(2, '0');
    pill.setAttribute('aria-label', `Jump to stage ${stage.id}: ${stage.title}`);
    pill.addEventListener('click', () => {
      const targetCard = document.querySelector(`#stage-card-${stage.id}`);
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
      }
    });
    pillsContainer.appendChild(pill);
  });
}

function updateHUD(stage) {
  if (!stage) return;
  if (hudPhase) hudPhase.textContent = stage.phase;
  if (hudTitle) hudTitle.textContent = stage.title;
  if (hudBody) hudBody.innerHTML = stage.body;
  if (hudComponent) hudComponent.textContent = stage.component;
  if (hudIO) hudIO.innerHTML = stage.io;
  if (hudFault) hudFault.textContent = stage.fault;

  document.querySelectorAll('.pipeline-node-pill').forEach((pill) => {
    const isActive = pill.dataset.stageId === String(stage.id);
    pill.classList.toggle('active', isActive);
  });
}

function initScrollExperience() {
  const cards = document.querySelectorAll('.pipeline-stage-card');
  if (!cards.length) return;

  cards.forEach((card) => {
    const stageId = Number(card.dataset.stage);
    const stageData = STAGES.find((s) => s.id === stageId);

    ScrollTrigger.create({
      trigger: card,
      start: 'top 60%',
      end: 'bottom 40%',
      onEnter: () => {
        cards.forEach((c) => c.classList.remove('is-active'));
        card.classList.add('is-active');
        updateHUD(stageData);
      },
      onEnterBack: () => {
        cards.forEach((c) => c.classList.remove('is-active'));
        card.classList.add('is-active');
        updateHUD(stageData);
      },
    });
  });
}

function initEstimator() {
  const durInput = document.querySelector('#est-duration');
  const rateInput = document.querySelector('#est-rate');
  const keepInput = document.querySelector('#est-keep');
  const rawOut = document.querySelector('#est-raw');
  const keptOut = document.querySelector('#est-kept');

  if (!durInput || !rateInput || !keepInput) return;

  const update = () => {
    const seconds = Math.max(5, Number(durInput.value) || 60);
    const fpsSample = Math.max(0.2, Number(rateInput.value) || 1);
    const keepPct = Math.min(100, Math.max(10, Number(keepInput.value) || 65));
    const raw = Math.round(seconds * fpsSample);
    const kept = Math.max(1, Math.round(raw * (keepPct / 100)));
    if (rawOut) rawOut.textContent = `${raw} frames`;
    if (keptOut) keptOut.textContent = `${kept} geotagged frames`;
  };

  [durInput, rateInput, keepInput].forEach((el) => el.addEventListener('input', update));
  update();
}

initPills();
initScrollExperience();
initEstimator();
