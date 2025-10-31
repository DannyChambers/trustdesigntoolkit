import { validateKey, getKey } from './license.util.js';

export async function init() {
  const container = document.getElementById('settings-container');
  if (!container) return;

  const res = await fetch(chrome.runtime.getURL('popup/settings.popup.html'));
  container.innerHTML = await res.text();

  getKey((k) => { document.getElementById('license-global').value = k; });

  document.getElementById('license-save').addEventListener('click', async () => {
    const input = document.getElementById('license-global');
    const key = (input.value || '').trim().toUpperCase();
    const status = document.getElementById('license-status');

    if (!key) {
      await chrome.storage.sync.set({ 'tdt.license.key': '' });
      status.textContent = 'Cleared.';
      setTimeout(()=> status.textContent = '', 1200);
      return;
    }
    if (!validateKey(key)) {
      status.textContent = 'Invalid key format.';
      return;
    }
    await chrome.storage.sync.set({ 'tdt.license.key': key });
    status.textContent = 'Saved.';
    setTimeout(()=> status.textContent = '', 1200);
  });
}
