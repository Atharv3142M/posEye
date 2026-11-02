export const SEARCH_INDEX = [
  // Pages
  { title: 'Home — Reality, Reconstructed', url: 'index.html', group: 'Pages', tag: '01 / Overview' },
  { title: 'Technology — 11-Stage Pipeline Architecture', url: 'technology.html', group: 'Pages', tag: '02 / Engine' },
  { title: 'Reconstruction — Interactive 3D Workstation', url: 'reconstruction.html', group: 'Pages', tag: '03 / 3D Viewer' },
  { title: 'Product — Desktop Application & Offline Architecture', url: 'product.html', group: 'Pages', tag: '04 / App' },
  { title: 'Research — Accuracy, Georeferencing & Roadmap', url: 'research.html', group: 'Pages', tag: '05 / Science' },
  { title: 'Releases — GitHub Builds, Changelogs & Assets', url: 'releases.html', group: 'Pages', tag: '06 / Downloads' },

  // Pipeline Stages
  { title: 'Stage 01: Video & SRT Telemetry Ingestion', url: 'technology.html#stage-1', group: 'Pipeline Stages', tag: 'Extract' },
  { title: 'Stage 02: Telemetry Synchronization & Timestamp Parsing', url: 'technology.html#stage-2', group: 'Pipeline Stages', tag: 'SRT' },
  { title: 'Stage 03: Laplacian Variance Blur Screening', url: 'technology.html#stage-3', group: 'Pipeline Stages', tag: 'OpenCV' },
  { title: 'Stage 04: Perceptual dHash Deduplication', url: 'technology.html#stage-4', group: 'Pipeline Stages', tag: 'Filter' },
  { title: 'Stage 05: EXIF GPS Geotagging & Metadata Injection', url: 'technology.html#stage-5', group: 'Pipeline Stages', tag: 'piexif' },
  { title: 'Stage 06: YOLOv8 Dynamic Moving Object Masking', url: 'technology.html#stage-6', group: 'Pipeline Stages', tag: 'AI Mask' },
  { title: 'Stage 07: Structure-from-Motion (SfM Sparse Cloud)', url: 'technology.html#stage-7', group: 'Pipeline Stages', tag: 'NodeODM' },
  { title: 'Stage 08: Multi-View Stereo (MVS Dense Reconstruction)', url: 'technology.html#stage-8', group: 'Pipeline Stages', tag: 'NodeODM' },
  { title: 'Stage 09: 2.5D Mesh Generation & Poisson Surface', url: 'technology.html#stage-9', group: 'Pipeline Stages', tag: 'trimesh' },
  { title: 'Stage 10: Photorealistic Texture Mapping & UV Packing', url: 'technology.html#stage-10', group: 'Pipeline Stages', tag: 'Mesh' },
  { title: 'Stage 11: Multi-Format Export (GLB, LAZ Point Cloud, GeoTIFF)', url: 'technology.html#stage-11', group: 'Pipeline Stages', tag: 'Export' },

  // Technical & Research Concepts
  { title: 'GSD (Ground Sampling Distance) Math & Calculation', url: 'research.html#gsd', group: 'Research', tag: 'Resolution' },
  { title: 'GCP (Ground Control Points) vs Drone RTK/PPK Telemetry', url: 'research.html#gcps', group: 'Research', tag: 'Accuracy' },
  { title: 'Reprojection Error (RMSE) & Bundle Adjustment', url: 'research.html#rmse', group: 'Research', tag: 'Validation' },
  { title: 'Coordinate Systems: WGS84 vs UTM Projections', url: 'research.html#crs', group: 'Research', tag: 'Geodesy' },
  { title: 'posEye Native Engine Roadmap (GPU-Accelerated SfM)', url: 'research.html#roadmap', group: 'Research', tag: 'R&D' },

  // Product & Downloads
  { title: 'Windows Installer (posEye.Setup.exe)', url: 'releases.html#installer', group: 'Downloads', tag: 'Binary' },
  { title: 'Standalone Orchestrator API (FastAPI Backend)', url: 'releases.html#orchestrator', group: 'Downloads', tag: 'Backend' },
  { title: 'Offline-First Security & Zero Cloud Architecture', url: 'product.html#offline', group: 'Product', tag: 'Security' },
  { title: 'System Requirements (Docker, WSL2, 16GB RAM)', url: 'product.html#specs', group: 'Product', tag: 'Hardware' }
];

export function initSearch() {
  const backdrop = document.getElementById('search-modal-backdrop');
  const input = document.getElementById('search-modal-input');
  const resultsContainer = document.getElementById('search-modal-results');
  const searchTriggers = document.querySelectorAll('[data-search-trigger]');

  if (!backdrop || !input || !resultsContainer) return;

  let selectedIdx = 0;
  let currentResults = [];

  function openSearch() {
    backdrop.classList.add('open');
    input.value = '';
    renderResults('');
    input.focus();
  }

  function closeSearch() {
    backdrop.classList.remove('open');
  }

  function renderResults(query) {
    const q = query.trim().toLowerCase();
    currentResults = q
      ? SEARCH_INDEX.filter(item =>
          item.title.toLowerCase().includes(q) ||
          item.group.toLowerCase().includes(q) ||
          item.tag.toLowerCase().includes(q)
        )
      : SEARCH_INDEX.slice(0, 8); // show popular shortcuts if empty

    selectedIdx = 0;
    if (currentResults.length === 0) {
      resultsContainer.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-dim); font-size: 0.9rem;">
          No matching topics or documentation found for "${query}"
        </div>`;
      return;
    }

    // Group items by category
    const groups = {};
    currentResults.forEach((item, idx) => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push({ item, idx });
    });

    let html = '';
    for (const [groupName, items] of Object.entries(groups)) {
      html += `<div class="palette-group-title">${groupName}</div>`;
      items.forEach(({ item, idx }) => {
        const isSel = idx === selectedIdx ? 'selected' : '';
        html += `
          <div class="palette-item ${isSel}" data-idx="${idx}" data-url="${item.url}">
            <span>${item.title}</span>
            <span class="palette-item-tag">${item.tag}</span>
          </div>`;
      });
    }

    resultsContainer.innerHTML = html;

    resultsContainer.querySelectorAll('.palette-item').forEach(el => {
      el.addEventListener('click', () => {
        const url = el.getAttribute('data-url');
        if (url) window.location.href = url;
      });
    });
  }

  // Keyboard events
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (backdrop.classList.contains('open')) {
        closeSearch();
      } else {
        openSearch();
      }
    } else if (e.key === 'Escape' && backdrop.classList.contains('open')) {
      closeSearch();
    }
  });

  input.addEventListener('input', (e) => {
    renderResults(e.target.value);
  });

  input.addEventListener('keydown', (e) => {
    if (currentResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIdx = (selectedIdx + 1) % currentResults.length;
      updateSelected();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIdx = (selectedIdx - 1 + currentResults.length) % currentResults.length;
      updateSelected();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentResults[selectedIdx]) {
        window.location.href = currentResults[selectedIdx].url;
      }
    }
  });

  function updateSelected() {
    resultsContainer.querySelectorAll('.palette-item').forEach((el, idx) => {
      el.classList.toggle('selected', idx === selectedIdx);
      if (idx === selectedIdx) {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  searchTriggers.forEach(btn => btn.addEventListener('click', openSearch));
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeSearch();
  });
}
