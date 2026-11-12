import { initChrome } from '../lib/chrome.js';

initChrome();

const FAQ_ITEMS = [
  {
    cat: 'inputs',
    q: 'Which drone video and subtitle telemetry formats does posEye support?',
    a: 'posEye accepts standard MP4 and MOV aerial video alongside companion .srt telemetry files in DJI parenthesized format, CSV rows, or key-value blocks. Each extracted frame is matched to the closest telemetry timestamp within 1.5 seconds.',
  },
  {
    cat: 'inputs',
    q: 'How are blurred or duplicate hovered frames filtered out?',
    a: 'After static FFmpeg extracts stills, OpenCV computes Laplacian focus variance to drop motion-blurred images, followed by perceptual difference hashing (dHash) so stationary hovering frames do not flood feature matching.',
  },
  {
    cat: 'georeferencing',
    q: 'How does georeferencing work when exporting GLB, LAZ, and GeoTIFF?',
    a: 'Valid SRT coordinates are written into each JPEG using piexif as WGS 84 (EPSG:4326) latitude, longitude, and AMSL altitude tags. Exported LAZ point clouds and GeoTIFF orthophotos preserve geospatial placement, while the Three.js model.glb mesh is origin-centered for smooth 3D orbit rendering.',
  },
  {
    cat: 'georeferencing',
    q: 'Why does the distance measurement tool display a calibration status banner?',
    a: 'If a flight video lacks matching SRT telemetry or GPS EXIF tags, reconstructed geometry only has relative model scale rather than verified metric scale. posEye inspects EXIF provenance per run and flags uncalibrated measurements explicitly.',
  },
  {
    cat: 'runtime',
    q: 'Does posEye send footage or telemetry to external cloud servers?',
    a: 'No. All video probing, frame filtering, container reconstruction in the posEye Construction Engine, and 3D viewing stay strictly inside your local machine over 127.0.0.1.',
  },
  {
    cat: 'runtime',
    q: 'What happens on systems without an NVIDIA CUDA GPU?',
    a: 'When local GPU probing sees an eligible NVIDIA adapter, reconstruction uses CUDA acceleration. Systems without CUDA automatically fall back to CPU execution with clear status indicators inside the app.',
  },
];

const listEl = document.querySelector('#faq-list');
const searchEl = document.querySelector('#doc-search');
const catBtns = document.querySelectorAll('[data-cat]');
let activeCat = 'all';

function renderFaq() {
  if (!listEl) return;
  const query = (searchEl?.value || '').trim().toLowerCase();
  const filtered = FAQ_ITEMS.filter((item) => {
    const catOk = activeCat === 'all' || item.cat === activeCat;
    const textOk = !query || item.q.toLowerCase().includes(query) || item.a.toLowerCase().includes(query);
    return catOk && textOk;
  });

  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state">No documentation entries match "${query.replace(/[<>&"]/g, '')}". Clear search or select All Topics.</div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map(
      (item, i) => `
      <div class="faq-item">
        <button class="faq-trigger" type="button" aria-expanded="${i === 0 ? 'true' : 'false'}">
          <span>${item.q}</span>
          <span class="faq-mark" aria-hidden="true">${i === 0 ? '-' : '+'}</span>
        </button>
        <div class="faq-body" ${i === 0 ? '' : 'hidden'}>
          <p style="margin:0;">${item.a}</p>
        </div>
      </div>`
    )
    .join('');

  listEl.querySelectorAll('.faq-trigger').forEach((btn) => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      const next = !expanded;
      btn.setAttribute('aria-expanded', String(next));
      btn.querySelector('.faq-mark').textContent = next ? '-' : '+';
      const body = btn.nextElementSibling;
      if (body) body.hidden = !next;
    });
  });
}

catBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    activeCat = btn.dataset.cat;
    catBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    renderFaq();
  });
});

searchEl?.addEventListener('input', renderFaq);
renderFaq();
