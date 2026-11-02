import { initNav } from '../components/nav.js';
import { initSearch } from '../components/search.js';

document.addEventListener('DOMContentLoaded', () => {
  initNav('research');
  initSearch();

  // Interactive GSD Calculator
  // GSD = (H * Sw) / (f * Iw) * 100 (in cm/pixel)
  const altitudeInput = document.getElementById('calc-altitude');
  const focalInput = document.getElementById('calc-focal');
  const sensorInput = document.getElementById('calc-sensor');
  const widthInput = document.getElementById('calc-width');
  const gsdResult = document.getElementById('calc-gsd-result');
  const coverageResult = document.getElementById('calc-coverage-result');

  function calculateGSD() {
    if (!altitudeInput || !focalInput || !sensorInput || !widthInput || !gsdResult) return;

    const H = parseFloat(altitudeInput.value) || 50; // meters
    const f = parseFloat(focalInput.value) || 8.8; // mm
    const Sw = parseFloat(sensorInput.value) || 13.2; // mm
    const Iw = parseFloat(widthInput.value) || 4000; // pixels

    // GSD in cm/pixel
    const gsd = ((H * Sw) / (f * Iw)) * 100;
    gsdResult.textContent = `${gsd.toFixed(2)} cm/px`;

    // Single photo footprint width and height in meters
    const footprintW = (H * Sw) / f;
    const footprintH = footprintW * (3 / 4);
    if (coverageResult) {
      coverageResult.textContent = `${footprintW.toFixed(1)} × ${footprintH.toFixed(1)} m`;
    }
  }

  [altitudeInput, focalInput, sensorInput, widthInput].forEach(el => {
    if (el) el.addEventListener('input', calculateGSD);
  });

  calculateGSD();
});
