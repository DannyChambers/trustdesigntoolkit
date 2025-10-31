// settings.popup.js
// Initializes the Settings tab inside the Toolkit popup.
// - Stores and retrieves license keys via chrome.storage.sync
// - Lightweight offline key validation with checksum
// - Does NOT alter other tools or global popup layout

export async function init() {
  const container = document.getElementById('settings-container');
  if (!container) return;

  // Load HTML template
  try {
    const url = chrome.runtime.getURL('popup/settings.popup.html');
    const res = await fetch(url);
    const html = await res.text();
    container.innerHTML = html;
  } catch (e) {
    // Fallback: basic form if file fetch fails
    container.innerHTML = `
      <div class="card">
        <label for="license-global">License (Toolkit)</label>
        <input id="license-global" type="text" placeholder="TDT-ALL-XXXXXXXX-XXXX" />
      </div>
      <div class="card">
        <label for="license-tda">License (Trust Design Audit)</label>
        <input id="license-tda" type="text" placeholder="TDT-TDA-XXXXXXXX-XXXX" />
      </div>
      <div class="actions">
        <button id="license-save">Save</button>
        <span id="license-status" class="muted"></span>
      </div>
    `;
  }

  // Populate existing values
  chrome.storage.sync.get(['tdt.license.global','tdt.license.tda'], (res)=>{
    const g = res['tdt.license.global'] || '';
    const t = res['tdt.license.tda'] || '';
    const gEl = document.getElementById('license-global');
    const tEl = document.getElementById('license-tda');
    if (gEl) gEl.value = g;
    if (tEl) tEl.value = t;
  });

  // Wire save
  const saveBtn = document.getElementById('license-save');
  const status  = document.getElementById('license-status');
  if (saveBtn) {
    saveBtn.addEventListener('click', async ()=>{
      const gEl = document.getElementById('license-global');
      const tEl = document.getElementById('license-tda');
      const g = (gEl?.value || '').trim().toUpperCase();
      const t = (tEl?.value || '').trim().toUpperCase();

      const okG = !g || validateKey(g, 'ALL');
      const okT = !t || validateKey(t, 'TDA');

      if (!okG || !okT) {
        if (status) status.textContent = 'Invalid key format. Please check and try again.';
        return;
      }

      await chrome.storage.sync.set({'tdt.license.global': g, 'tdt.license.tda': t});
      if (status) status.textContent = 'Saved.';
      setTimeout(()=>{ if (status) status.textContent = ''; }, 2000);
    });
  }
}

// Simple offline format + checksum validator
// Format: TDT-<TOOL>-<8 alnum>-<4 hex checksum>
function validateKey(key, tool) {
  const re = /^TDT-(ALL|TDA)-([A-Z0-9]{8})-([A-F0-9]{4})$/;
  const m = key.match(re);
  if (!m) return false;
  const toolPart = m[1];
  const body = m[2];
  const check = m[3];
  if (toolPart !== tool && !(tool === 'TDA' && toolPart === 'ALL')) return false;
  const sum = body.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) & 0xFFFF;
  const hex = sum.toString(16).toUpperCase().padStart(4, '0');
  return hex === check;
}

// Optional utility: tools/content scripts can reuse the same validation rule by copying the function above.
// Tools should read keys directly from chrome.storage.sync.
