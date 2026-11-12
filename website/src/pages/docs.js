import { initSiteChrome } from '../lib/core.js';

initSiteChrome();

// Interactive SRT telemetry format switcher
const srtBtns = [...document.querySelectorAll('[data-srt-fmt]')];
const srtOut = document.querySelector('#srt-sample');
const samples = {
  parenthesized: `1
00:00:00,000 --> 00:00:01,000
GPS(19.076090, 72.877426, 118.4)`,
  csv: `1
00:00:00,000 --> 00:00:00,500
19.076090,72.877426,118.4,45,30,0,5.0,0.0,0.0,0,0,0,1,0`,
  kv: `1
00:00:00,000 --> 00:00:01,000
latitude: 19.076090 longitude: 72.877426 altitude: 118.4`,
};

srtBtns.forEach((b) => {
  b.addEventListener('click', () => {
    srtBtns.forEach((btn) => btn.classList.toggle('active', btn === b));
    if (srtOut) srtOut.textContent = samples[b.dataset.srtFmt] || samples.parenthesized;
  });
});

// FAQ accordion
document.querySelectorAll('.faq-q').forEach((btn) => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    if (!item) return;
    const isOpen = item.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(isOpen));
    const icon = btn.querySelector('.faq-plus');
    if (icon) icon.textContent = isOpen ? '−' : '+';
  });
});
