import { PhotogrammetryScene } from '../scene/photogrammetry-scene.js';
import { initNav } from '../components/nav.js';
import { initSearch } from '../components/search.js';

document.addEventListener('DOMContentLoaded', () => {
  initNav('reconstruction');
  initSearch();

  const canvas = document.getElementById('workstation-canvas');
  if (!canvas) return;

  const measureReadout = document.getElementById('measure-readout');
  const measureDistText = document.getElementById('measure-dist-text');
  const clearMeasureBtn = document.getElementById('clear-measure-btn');

  const scene = new PhotogrammetryScene(canvas, {
    interactive: true,
    isStory: false,
    onMeasure: (dist) => {
      if (dist !== null) {
        // The procedural scene has no survey scale; distances are unitless scene coordinates.
        const meters = dist.toFixed(2);
        if (measureDistText) measureDistText.textContent = `${meters} scene units`;
        if (measureReadout) measureReadout.style.display = 'flex';
      } else {
        if (measureReadout) measureReadout.style.display = 'none';
      }
    }
  });

  // Display Mode Buttons
  const modeButtons = document.querySelectorAll('[data-mode]');
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.getAttribute('data-mode');
      scene.setDisplayMode(mode);
    });
  });

  // Measure Mode Toggle
  const measureToggle = document.getElementById('toggle-measure-btn');
  let isMeasuring = false;
  if (measureToggle) {
    measureToggle.addEventListener('click', () => {
      isMeasuring = !isMeasuring;
      measureToggle.classList.toggle('active', isMeasuring);
      scene.setMeasuring(isMeasuring);
      if (isMeasuring) {
        measureToggle.textContent = '📐 Measuring (Click 2 points)';
      } else {
        measureToggle.textContent = '📐 Measure Tool';
        scene.clearMeasurement();
      }
    });
  }

  if (clearMeasureBtn) {
    clearMeasureBtn.addEventListener('click', () => {
      scene.clearMeasurement();
    });
  }

  // Camera Presets
  const resetBtn = document.getElementById('btn-reset-view');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => scene.resetCamera());
  }

  const topViewBtn = document.getElementById('btn-top-view');
  if (topViewBtn) {
    topViewBtn.addEventListener('click', () => scene.setTopView());
  }

  // Keyboard shortcut 'R' to reset view
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r') {
      scene.resetCamera();
    }
  });
});
