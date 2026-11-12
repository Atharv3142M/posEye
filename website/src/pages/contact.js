import * as THREE from 'three';
import { initSiteChrome, isWebGLAvailable, showWebGLFallback } from '../lib/core.js';
import { addTacticalLights, createRenderer } from '../lib/scene3d.js';

const { reduced } = initSiteChrome();

function initTelemetryBeacon3D() {
  const canvas = document.querySelector('#contact-canvas');
  if (!canvas) return;
  if (!isWebGLAvailable()) {
    showWebGLFallback(canvas);
    return;
  }

  const renderer = createRenderer(canvas, 1.6);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    42,
    (canvas.clientWidth || 1) / (canvas.clientHeight || 1),
    0.1,
    60
  );
  camera.position.set(0, 2.2, 6.4);
  camera.lookAt(0, 0, 0);

  addTacticalLights(scene);

  const group = new THREE.Group();
  scene.add(group);

  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(1.75, 28, 18),
    new THREE.MeshBasicMaterial({ color: 0x303a4b, wireframe: true, transparent: true, opacity: 0.48 })
  );
  group.add(globe);

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.9, 1),
    new THREE.MeshStandardMaterial({ color: 0x151922, metalness: 0.6, roughness: 0.45 })
  );
  group.add(core);

  const orbit = new THREE.Mesh(
    new THREE.TorusGeometry(2.35, 0.015, 10, 80),
    new THREE.MeshBasicMaterial({ color: 0xff4b0b, transparent: true, opacity: 0.65 })
  );
  orbit.rotation.x = Math.PI / 2.8;
  group.add(orbit);

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  const clock = new THREE.Clock();
  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const t = clock.getElapsedTime();
    if (!reduced) {
      group.rotation.y = t * 0.22;
      orbit.rotation.z = t * 0.35;
    }
    renderer.render(scene, camera);
  };
  tick();

  window.addEventListener('beforeunload', () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    renderer.dispose();
  });
}

function initContactForm() {
  const form = document.querySelector('#contact-form');
  const statusEl = document.querySelector('#contact-status');
  const ghLink = document.querySelector('#contact-gh-link');
  if (!form || !statusEl) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    const email = String(data.get('email') || '').trim();
    const topic = String(data.get('topic') || 'Field Deployment').trim();
    const message = String(data.get('message') || '').trim();

    if (!name || !email || !message) {
      statusEl.className = 'form-status visible';
      statusEl.innerHTML = '<span class="signal">ERROR //</span> Please complete your name, contact email, and mission details.';
      return;
    }

    const title = encodeURIComponent(`[Website Inquiry] ${topic} — ${name}`);
    const body = encodeURIComponent(`**From:** ${name} (${email})\n**Category:** ${topic}\n\n${message}`);
    const issueUrl = `https://github.com/Atharv3142M/posEye/issues/new?title=${title}&body=${body}`;

    if (ghLink) {
      ghLink.href = issueUrl;
      ghLink.style.display = 'inline-flex';
    }

    statusEl.className = 'form-status visible';
    statusEl.innerHTML = `<span class="cyan">DISPATCH READY //</span> Structured brief prepared for <strong>${name}</strong> (${topic}). Submit directly via GitHub Issues using the button below, or copy your brief for direct maintainer outreach.`;
  });
}

initTelemetryBeacon3D();
initContactForm();
