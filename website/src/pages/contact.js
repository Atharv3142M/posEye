import { initChrome } from '../lib/chrome.js';

initChrome();

const form = document.querySelector('#contact-form');
const topicInput = document.querySelector('#contact-topic');
const nameInput = document.querySelector('#contact-name');
const emailInput = document.querySelector('#contact-email');
const messageInput = document.querySelector('#contact-message');
const statusBox = document.querySelector('#contact-status');
const githubBtn = document.querySelector('#btn-open-github');
const copyBtn = document.querySelector('#btn-copy-summary');

let selectedTopic = 'Bug Report';

document.querySelectorAll('[data-topic]').forEach((btn) => {
  btn.addEventListener('click', () => {
    selectedTopic = btn.dataset.topic;
    if (topicInput) topicInput.value = selectedTopic;
    document.querySelectorAll('[data-topic]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  });
});

function clearErrors() {
  document.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
  [nameInput, emailInput, messageInput].forEach((el) => el?.setAttribute('aria-invalid', 'false'));
}

function validateForm() {
  clearErrors();
  let valid = true;

  if (!nameInput.value.trim()) {
    nameInput.setAttribute('aria-invalid', 'true');
    document.querySelector('#err-name').textContent = 'Please enter your name.';
    valid = false;
  }

  const emailVal = emailInput.value.trim();
  if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
    emailInput.setAttribute('aria-invalid', 'true');
    document.querySelector('#err-email').textContent = 'Please enter a valid email address for follow-up.';
    valid = false;
  }

  if (messageInput.value.trim().length < 15) {
    messageInput.setAttribute('aria-invalid', 'true');
    document.querySelector('#err-message').textContent = 'Please provide at least 15 characters describing your inquiry or flight dataset details.';
    valid = false;
  }

  return valid;
}

function buildPayload() {
  const title = `[${selectedTopic}] Inquiry from ${nameInput.value.trim()}`;
  const body = [
    `Topic: ${selectedTopic}`,
    `From: ${nameInput.value.trim()} (${emailInput.value.trim()})`,
    '',
    'Details:',
    messageInput.value.trim(),
  ].join('\n');
  return { title, body };
}

form?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const { title, body } = buildPayload();
  const issueUrl = `https://github.com/Atharv3142M/posEye/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;

  githubBtn.href = issueUrl;
  githubBtn.hidden = false;
  copyBtn.hidden = false;

  statusBox.hidden = false;
  statusBox.innerHTML = '<strong>Summary prepared locally.</strong> Because this documentation site is hosted as static files on GitHub Pages with no backend form server, click <strong>Open Pre-Filled GitHub Issue</strong> below or copy the formatted message directly.';
});

copyBtn?.addEventListener('click', async () => {
  if (!validateForm()) return;
  const { title, body } = buildPayload();
  try {
    await navigator.clipboard.writeText(`${title}\n\n${body}`);
    statusBox.hidden = false;
    statusBox.textContent = 'Formatted inquiry copied to your clipboard.';
  } catch {
    statusBox.hidden = false;
    statusBox.textContent = 'Clipboard permission was declined. Use Open Pre-Filled GitHub Issue instead.';
  }
});
