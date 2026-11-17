import { initChrome } from '../lib/chrome.js';

initChrome();

const copyBtn = document.querySelector('#copy-build-cmds');
const cmdBlock = document.querySelector('#build-cmds');
const copyStatus = document.querySelector('#copy-status');

if (copyBtn && cmdBlock) {
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(cmdBlock.textContent.trim());
      if (copyStatus) copyStatus.textContent = 'Build commands copied to clipboard.';
    } catch {
      if (copyStatus) copyStatus.textContent = 'Clipboard blocked by browser. Copy commands manually above.';
    }
  });
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function renderReleaseMarkdown(bodyText) {
  if (!bodyText) return 'No changelog description provided for this release.';
  const lines = bodyText.split('\n');
  const htmlParts = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      continue;
    }

    if (line.startsWith('### ')) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push(`<h4 style="margin:14px 0 6px;color:var(--ink);">${line.slice(4)}</h4>`);
    } else if (line.startsWith('## ')) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push(`<h4 style="margin:16px 0 8px;color:var(--accent);">${line.slice(3)}</h4>`);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) {
        htmlParts.push('<ul style="margin:6px 0;padding-left:18px;">');
        inList = true;
      }
      const itemText = line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      htmlParts.push(`<li>${itemText}</li>`);
    } else {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      const pText = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      htmlParts.push(`<p style="margin:6px 0;">${pText}</p>`);
    }
  }

  if (inList) htmlParts.push('</ul>');
  return htmlParts.join('');
}

async function fetchLatestRelease() {
  const badgeEl = document.querySelector('#release-badge');
  const titleEl = document.querySelector('#release-title');
  const tagEl = document.querySelector('#release-tag');
  const dateEl = document.querySelector('#release-date');
  const btnExe = document.querySelector('#btn-download-exe');
  const downloadsContainer = document.querySelector('#release-downloads');
  const notesContent = document.querySelector('#release-notes-content');

  try {
    const res = await fetch('https://api.github.com/repos/Atharv3142M/posEye/releases/latest');
    if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
    const data = await res.json();

    if (titleEl) titleEl.textContent = data.name || data.tag_name || 'posEye Release';
    if (tagEl) tagEl.textContent = data.tag_name || 'Latest';
    if (badgeEl) {
      badgeEl.textContent = 'LIVE GITHUB RELEASE';
      badgeEl.style.color = '#2DA44E';
      badgeEl.style.borderColor = 'rgba(45, 164, 78, 0.4)';
    }

    if (dateEl && data.published_at) {
      const pubDate = new Date(data.published_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      dateEl.textContent = `Published on ${pubDate} via GitHub Releases`;
    }

    // Inspect downloadable release assets
    if (data.assets && Array.isArray(data.assets) && data.assets.length > 0) {
      const exeAsset = data.assets.find((a) => a.name.endsWith('.exe'));
      const zipAsset = data.assets.find((a) => a.name.endsWith('.zip'));

      if (exeAsset && btnExe) {
        btnExe.href = exeAsset.browser_download_url;
        const sizeStr = formatBytes(exeAsset.size);
        btnExe.innerHTML = `Download ${exeAsset.name} ${sizeStr ? `(${sizeStr})` : ''}`;
      }

      if (zipAsset && downloadsContainer && !document.querySelector('#btn-download-zip')) {
        const zipBtn = document.createElement('a');
        zipBtn.id = 'btn-download-zip';
        zipBtn.className = 'button quiet';
        zipBtn.href = zipAsset.browser_download_url;
        zipBtn.target = '_blank';
        zipBtn.rel = 'noreferrer';
        const zipSize = formatBytes(zipAsset.size);
        zipBtn.innerHTML = `Download Portable ${zipAsset.name} ${zipSize ? `(${zipSize})` : ''}`;
        downloadsContainer.appendChild(zipBtn);
      }
    }

    if (notesContent && data.body) {
      notesContent.innerHTML = renderReleaseMarkdown(data.body);
    }
  } catch (err) {
    console.warn('[posEye Releases] GitHub API rate limit or offline fallback:', err);
    // Graceful verified local release fallback
    if (badgeEl) {
      badgeEl.textContent = 'VERIFIED RELEASE (v0.1.9)';
      badgeEl.style.color = 'var(--accent)';
    }
    if (titleEl) titleEl.textContent = 'posEye v0.1.9 (Windows Desktop Release)';
    if (tagEl) tagEl.textContent = 'v0.1.9';
    if (dateEl) dateEl.textContent = 'Offline Photogrammetry Pipeline & 3D Viewer';
    if (notesContent) {
      notesContent.innerHTML = `
        <ul style="margin:4px 0;padding-left:18px;">
          <li><strong>Zero manual steps:</strong> Raw drone MP4/MOV in &rarr; georeferenced 3D model out.</li>
          <li><strong>Integrated toolchain:</strong> Static FFmpeg + OpenCV Laplacian filter + dHash deduplication.</li>
          <li><strong>SRT Geotagging:</strong> Extracts DJI &amp; CSV flight logs and embeds WGS 84 GPS tags into EXIF.</li>
          <li><strong>Engine Container:</strong> Local photogrammetry engine with automatic NVIDIA CUDA acceleration.</li>
          <li><strong>3D Viewer:</strong> Three.js WebGL orbit/pan/zoom, DoubleSide shaders, and surface distance measurement.</li>
        </ul>
      `;
    }
  }
}

fetchLatestRelease();
