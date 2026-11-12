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

export function initChrome() {
  const reduced = isReducedMotion();
  const loader = document.querySelector('.loader');
  const curtain = document.querySelector('.page-curtain');

  // Lenis + GSAP ScrollTrigger sync
  let lenis = null;
  if (!reduced) {
    lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // Dismiss initial loader cleanly
  const finishLoad = () => {
    if (loader) loader.classList.add('done');
    document.body.classList.remove('loading');
    runRevealPass(reduced);
  };

  if (document.readyState === 'complete') {
    setTimeout(finishLoad, reduced ? 0 : 280);
  } else {
    window.addEventListener('load', () => setTimeout(finishLoad, reduced ? 0 : 280), {
      once: true,
    });
  }

  // Mobile nav drawer
  const menu = document.querySelector('.menu');
  const nav = document.querySelector('.navlinks');
  if (menu && nav) {
    menu.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      menu.setAttribute('aria-expanded', String(open));
    });
    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        nav.classList.remove('open');
        menu.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Page curtain transition on internal multi-page links
  if (curtain && !reduced) {
    document.querySelectorAll('a[data-nav]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const href = a.getAttribute('href');
        if (!href || href.startsWith('#') || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        curtain.classList.add('active');
        setTimeout(() => {
          window.location.href = href;
        }, 320);
      });
    });
  }

  // Antigravity 3D card tilt
  if (!reduced && window.matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('[data-tilt]').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty('--rx', `${(-py * 6).toFixed(2)}deg`);
        card.style.setProperty('--ry', `${(px * 7).toFixed(2)}deg`);
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  // Footer year
  const yr = document.querySelector('#year');
  if (yr) yr.textContent = String(new Date().getFullYear());

  return { lenis, reduced, gsap, ScrollTrigger };
}

function runRevealPass(reduced) {
  if (reduced) return;

  // Hero entrance: long-tailed expo.out with blur sharpen
  const heroTargets = document.querySelectorAll('.hero-reveal');
  if (heroTargets.length) {
    gsap.fromTo(
      heroTargets,
      { opacity: 0, y: 26, filter: 'blur(8px)' },
      {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.9,
        stagger: 0.09,
        ease: 'expo.out',
        clearProps: 'filter,transform',
      }
    );
  }

  // Scroll-triggered staggered grids (domino cadence)
  document.querySelectorAll('[data-stagger-grid]').forEach((grid) => {
    const items = grid.children;
    if (!items.length) return;
    gsap.fromTo(
      items,
      { opacity: 0, y: 28, scale: 0.98 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.75,
        stagger: 0.08,
        ease: 'power3.out',
        clearProps: 'transform',
        scrollTrigger: {
          trigger: grid,
          start: 'top 84%',
          once: true,
        },
      }
    );
  });

  // Individual reveal sections
  gsap.utils.toArray('[data-reveal]').forEach((el) => {
    gsap.fromTo(
      el,
      { opacity: 0, y: 22 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'expo.out',
        clearProps: 'transform',
        scrollTrigger: { trigger: el, start: 'top 86%', once: true },
      }
    );
  });
}

export function showWebGLFallback(canvas) {
  const wrap = canvas?.parentElement;
  const fb = wrap?.querySelector('.webgl-fallback');
  if (fb) fb.classList.add('visible');
}
