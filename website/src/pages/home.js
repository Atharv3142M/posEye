import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { PhotogrammetryScene } from '../scene/photogrammetry-scene.js';
import { initNav } from '../components/nav.js';
import { initSearch } from '../components/search.js';

gsap.registerPlugin(ScrollTrigger);

document.addEventListener('DOMContentLoaded', () => {
  initNav('home');
  initSearch();

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1. Lenis Smooth Scrolling
  let lenis = null;
  if (!reducedMotion) {
    lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // 2. Initialize 3D Photogrammetry Scene
  const canvas = document.getElementById('story-canvas');
  if (canvas) {
    const scene = new PhotogrammetryScene(canvas, {
      interactive: true,
      isStory: true
    });

    const storyContainer = document.getElementById('story-container');
    const chapterCards = document.querySelectorAll('.story-card');
    const progressDots = document.querySelectorAll('.progress-dot');
    const hudStage = document.getElementById('hud-stage-name');

    const stageNames = [
      'CHAPTER 01 / RECONSTRUCTED SURFACE',
      'CHAPTER 02 / GEOMETRIC WIREFRAME',
      'CHAPTER 03 / DENSE POINT CLOUD',
      'CHAPTER 04 / FLIGHT PATH & SENSOR POSES',
      'CHAPTER 05 / CALIBRATED GEOREFERENCING',
      'CHAPTER 06 / INTERACTIVE WORKSTATION'
    ];

    if (storyContainer && !reducedMotion) {
      ScrollTrigger.create({
        trigger: storyContainer,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.6,
        onUpdate: (self) => {
          const progress = self.progress;
          scene.setStoryProgress(progress);

          // Determine current chapter (0 through 5)
          const chapterIdx = Math.min(5, Math.floor(progress * 6));

          // Update active card
          chapterCards.forEach((card, idx) => {
            const isActive = idx === chapterIdx;
            card.style.display = isActive ? 'block' : 'none';
          });

          // Update progress dots
          progressDots.forEach((dot, idx) => {
            dot.classList.toggle('active', idx === chapterIdx);
          });

          // Update HUD text
          if (hudStage && stageNames[chapterIdx]) {
            hudStage.textContent = stageNames[chapterIdx];
          }
        }
      });

      // Dot click jump navigation
      progressDots.forEach((dot, idx) => {
        dot.addEventListener('click', () => {
          const targetProgress = (idx + 0.1) / 6;
          const totalScroll = storyContainer.offsetHeight - window.innerHeight;
          const scrollTarget = storyContainer.offsetTop + totalScroll * targetProgress;
          if (lenis) {
            lenis.scrollTo(scrollTarget);
          } else {
            window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
          }
        });
      });
    } else {
      // Fallback for reduced motion: show final state
      scene.setStoryProgress(1.0);
    }
  }

  // 3. Entrance Animations for Non-Pinned Sections
  if (!reducedMotion) {
    gsap.utils.toArray('.reveal-up').forEach((el) => {
      gsap.from(el, {
        y: 28,
        opacity: 0,
        duration: 0.85,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
          once: true
        }
      });
    });
  }
});
