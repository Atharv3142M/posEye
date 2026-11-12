import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

export const isReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function isWebGLAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

export function showWebGLFallback(canvas) {
  const fb = canvas?.parentElement?.querySelector('.webgl-fallback');
  if (fb) fb.classList.add('visible');
}

export function initSiteChrome() {
  const reduced = isReducedMotion();
  const loader = document.querySelector('.loader');
  const curtain = document.querySelector('.route-curtain');

  let lenis = null;
  if (!reduced) {
    lenis = new Lenis({ duration: 1.05, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  const finishBoot = () => {
    if (loader) loader.classList.add('done');
    document.body.classList.remove('loading');
    if (!reduced) {
      const heroItems = document.querySelectorAll('.hero-reveal');
      if (heroItems.length) {
        gsap.fromTo(
          heroItems,
          { opacity: 0, y: 20, filter: 'blur(7px)' },
          {
            opacity: 1,
            y: 0,
            filter: 'blur(0px)',
            duration: 0.78,
            stagger: 0.08,
            ease: 'expo.out',
            clearProps: 'filter,transform',
          }
        );
      }
      gsap.utils.toArray('[data-reveal]').forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 18 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            ease: 'expo.out',
            clearProps: 'transform',
            scrollTrigger: { trigger: el, start: 'top 86%', once: true },
          }
        );
      });
    }
  };

  if (document.readyState === 'complete') {
    setTimeout(finishBoot, reduced ? 0 : 200);
  } else {
    window.addEventListener('load', () => setTimeout(finishBoot, reduced ? 0 : 200), { once: true });
  }

  // Mobile nav toggle
  const menuBtn = document.querySelector('.menu-btn');
  const navlinks = document.querySelector('.navlinks');
  if (menuBtn && navlinks) {
    menuBtn.addEventListener('click', () => {
      const open = navlinks.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    navlinks.querySelectorAll('a').forEach((a) =>
      a.addEventListener('click', () => {
        navlinks.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      })
    );
  }

  // Page transition curtain
  if (curtain && !reduced) {
    document.querySelectorAll('a[data-nav]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const href = a.getAttribute('href');
        if (!href || href.startsWith('#') || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        curtain.classList.add('active');
        setTimeout(() => {
          window.location.href = href;
        }, 260);
      });
    });
  }

  // Subtle Antigravity tilt
  if (!reduced && window.matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('[data-tilt]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty('--rx', `${(-py * 5).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${(px * 6).toFixed(2)}deg`);
      });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      });
    });
  }

  // Clipboard helpers
  document.querySelectorAll('[data-copy-target]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = document.querySelector(btn.dataset.copyTarget);
      if (!target) return;
      try {
        await navigator.clipboard.writeText(target.textContent.trim());
        const prev = btn.textContent;
        btn.textContent = 'COPIED';
        setTimeout(() => { btn.textContent = prev; }, 1500);
      } catch {
        // ignore clipboard denial
      }
    });
  });

  const yr = document.querySelector('#year');
  if (yr) yr.textContent = String(new Date().getFullYear());

  return { lenis, reduced, gsap, ScrollTrigger };
}
