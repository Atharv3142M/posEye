import { initChrome } from '../lib/chrome.js';

initChrome();

const copyBtn = document.querySelector('#copy-build-cmds');
const cmdBlock = document.querySelector('#build-cmds');
const copyStatus = document.querySelector('#copy-status');

if (copyBtn && cmdBlock) {
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(cmdBlock.textContent.trim());
      copyStatus.textContent = 'Build commands copied to clipboard.';
    } catch {
      copyStatus.textContent = 'Clipboard blocked by browser. Copy the commands manually above.';
    }
  });
}
