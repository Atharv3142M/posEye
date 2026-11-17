import { initChrome } from '../lib/chrome.js';

initChrome();

const DEVELOPER_EMAIL = 'atharvpose@gmail.com';

const form = document.querySelector('#contact-form');
const topicInput = document.querySelector('#contact-topic');
const nameInput = document.querySelector('#contact-name');
const emailInput = document.querySelector('#contact-email');
const messageInput = document.querySelector('#contact-message');
const statusBox = document.querySelector('#contact-status');
const emailBtn = document.querySelector('#btn-send-email');
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
    const errEl = document.querySelector('#err-name');
    if (errEl) errEl.textContent = 'Please enter your name.';
    valid = false;
  }

  const emailVal = emailInput.value.trim();
  if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
    emailInput.setAttribute('aria-invalid', 'true');
    const errEl = document.querySelector('#err-email');
    if (errEl) errEl.textContent = 'Please enter a valid email address for follow-up.';
    valid = false;
  }

  if (messageInput.value.trim().length < 10) {
    messageInput.setAttribute('aria-invalid', 'true');
    const errEl = document.querySelector('#err-message');
    if (errEl) errEl.textContent = 'Please provide at least 10 characters describing your inquiry.';
    valid = false;
  }

  return valid;
}

function buildPayload() {
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const details = messageInput.value.trim();
  const title = `[posEye ${selectedTopic}] From ${name}`;
  const body = [
    `Topic: ${selectedTopic}`,
    `Sender: ${name}`,
    `Reply-To: ${email}`,
    `Date: ${new Date().toISOString()}`,
    '',
    'Details:',
    details,
  ].join('\n');
  return { title, body, name, email, details };
}

form?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const { title, body } = buildPayload();
  const mailtoUrl = `mailto:${DEVELOPER_EMAIL}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  const issueUrl = `https://github.com/Atharv3142M/posEye/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;

  if (emailBtn) {
    emailBtn.href = mailtoUrl;
    emailBtn.hidden = false;
  }
  if (githubBtn) {
    githubBtn.href = issueUrl;
    githubBtn.hidden = false;
  }
  if (copyBtn) {
    copyBtn.hidden = false;
  }

  // Attempt to open user's default email client directly
  try {
    window.location.href = mailtoUrl;
  } catch {}

  if (statusBox) {
    statusBox.hidden = false;
    statusBox.innerHTML = `
      <strong>Inquiry prepared.</strong> Your default email client was launched to send directly to <code>${DEVELOPER_EMAIL}</code>.
      If your email client did not open automatically, click <strong>Send via Email Client</strong> below, or click <strong>Open GitHub Issue</strong> to submit a public ticket.
    `;
  }
});

copyBtn?.addEventListener('click', async () => {
  if (!validateForm()) return;
  const { title, body } = buildPayload();
  try {
    await navigator.clipboard.writeText(`${title}\n\n${body}`);
    if (statusBox) {
      statusBox.hidden = false;
      statusBox.textContent = 'Inquiry details copied to clipboard.';
    }
  } catch {
    if (statusBox) {
      statusBox.hidden = false;
      statusBox.textContent = 'Clipboard permission denied. Use the Send via Email Client button above.';
    }
  }
});
