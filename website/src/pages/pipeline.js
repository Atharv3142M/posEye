import { initChrome } from '../lib/chrome.js';

initChrome();

const STAGES = [
  { id: 1, phase: 'Stage 1 : Ingest', name: 'Video Probing', detail: 'FFprobe reads container duration, FPS, frame count, and resolution before extraction begins.' },
  { id: 2, phase: 'Stage 1 : Ingest', name: 'FFmpeg Frame Extraction', detail: 'Bundled static ffmpeg.exe samples candidate stills along configurable time intervals.' },
  { id: 3, phase: 'Stage 1 : Ingest', name: 'Laplacian Blur Filtering', detail: 'OpenCV computes Laplacian focus variance and drops motion-blurred or out-of-focus frames.' },
  { id: 4, phase: 'Stage 1 : Ingest', name: 'dHash Deduplication', detail: 'Perceptual difference hashes prune redundant hovering shots while preserving target baseline overlap.' },
  { id: 5, phase: 'Stage 1 : Ingest', name: 'SRT Telemetry Parsing', detail: 'Parses DJI parenthesized, CSV, and key-value subtitle blocks to extract latitude, longitude, and AMSL altitude.' },
  { id: 6, phase: 'Stage 1 : Ingest', name: 'EXIF GPS Injection', detail: 'piexif embeds WGS 84 (EPSG:4326) GPS tags and provenance timestamps into surviving JPEG files (within 1.5s tolerance).' },
  { id: 7, phase: 'Stage 1 : Ingest', name: 'Optional Dynamic Masking', detail: 'YOLOv8n segmentation optionally masks transient moving vehicles or people prior to feature matching.' },
  { id: 8, phase: 'Stage 2 : Reconstruct', name: 'Archive Staging', detail: 'Geotagged imagery and masks bundle locally for handoff to the local engine container.' },
  { id: 9, phase: 'Stage 2 : Reconstruct', name: 'posEye Construction Engine', detail: 'Containerized local reconstruction builds sparse features, dense depth maps, mesh geometry, and orthophoto tiles using CUDA GPU with CPU fallback.' },
  { id: 10, phase: 'Stage 3 : Output', name: 'Asset Extraction & Validation', detail: 'Zip-Slip path validation extracts all.zip deliverables safely inside the local job folder.' },
  { id: 11, phase: 'Stage 3 : Output', name: 'Origin-Centered GLB Conversion', detail: 'trimesh and pygltflib normalize mesh scale to origin, pack model.glb for the Three.js viewer, and register LAZ, GeoTIFF, and PDF exports.' },
];

const listEl = document.querySelector('#stage-list');
const detailTitle = document.querySelector('#stage-detail-title');
const detailPhase = document.querySelector('#stage-detail-phase');
const detailBody = document.querySelector('#stage-detail-body');

function renderStageButtons() {
  if (!listEl) return;
  listEl.innerHTML = '';
  STAGES.forEach((stage, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ctrl-btn';
    btn.setAttribute('aria-pressed', String(idx === 0));
    btn.innerHTML = `<span class="mono" style="margin-right:10px;opacity:0.75;">${String(stage.id).padStart(2, '0')}</span> ${stage.name}`;
    btn.addEventListener('click', () => {
      listEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      detailPhase.textContent = stage.phase;
      detailTitle.textContent = `${String(stage.id).padStart(2, '0')} / ${stage.name}`;
      detailBody.textContent = stage.detail;
    });
    listEl.appendChild(btn);
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
    rawOut.textContent = `${raw} frames`;
    keptOut.textContent = `${kept} geotagged frames`;
  };

  [durInput, rateInput, keepInput].forEach((el) => el.addEventListener('input', update));
  update();
}

renderStageButtons();
initEstimator();
