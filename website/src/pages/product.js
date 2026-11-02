import { initNav } from '../components/nav.js';
import { initSearch } from '../components/search.js';

document.addEventListener('DOMContentLoaded', () => {
  initNav('product');
  initSearch();

  // Tab switching for product features
  const tabBtns = document.querySelectorAll('[data-feature-tab]');
  const tabPanels = document.querySelectorAll('.feature-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-feature-tab');
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.style.display = 'none');

      btn.classList.add('active');
      const activePanel = document.getElementById(`panel-${target}`);
      if (activePanel) activePanel.style.display = 'block';
    });
  });
});
