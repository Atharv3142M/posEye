import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initChrome() {
  const yearEl = document.querySelector('#year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  let lenis = null;
  if (!reducedMotion) {
    lenis = new Lenis({ duration: 1.05, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  const menuBtn = document.querySelector('.menu-btn');
  const nav = document.querySelector('.navlinks');

  if (menuBtn && nav) {
    const closeMenu = (returnFocus = false) => {
      nav.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.textContent = 'Menu';
      if (returnFocus) menuBtn.focus();
    };

    menuBtn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.textContent = open ? 'Close' : 'Menu';
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => closeMenu(false));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        closeMenu(true);
      }
    });

    document.addEventListener('click', (e) => {
      if (nav.classList.contains('open') && !nav.contains(e.target) && !menuBtn.contains(e.target)) {
        closeMenu(false);
      }
    });
  }

  if (!reducedMotion) {
    gsap.utils.toArray('.reveal').forEach((el) => {
      gsap.from(el, {
        opacity: 0,
        y: 18,
        duration: 0.65,
        ease: 'power2.out',
        clearProps: 'transform,opacity',
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
          once: true,
        },
      });
    });
  }

  return { gsap, ScrollTrigger, lenis };
}
