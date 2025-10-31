export function init(mount){
  const attrInput = mount.querySelector('#dsi-attr');
  const counters = mount.querySelector('#dsi-counters');
  const summary = mount.querySelector('#dsi-summary');
  const sel = mount.querySelector('#dsi-components');

  // Restore last used attribute
  chrome.storage.sync.get(['tdt.pref.dsi.attr'], (res)=>{
    const v = (res['tdt.pref.dsi.attr']||'').trim();
    attrInput.value = v || 'data-component';
    runScan();
  });

  async function runScan(){
    const attr = (attrInput.value || 'data-component').trim() || 'data-component';
    const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
    chrome.tabs.sendMessage(tab.id, { ns:'DSI', type:'SCAN', attr }, res => {
      sel.innerHTML='';
      (res?.components||[]).forEach(c=>{
        const o=document.createElement('option'); o.value=c.key; o.textContent=`${c.name} (${c.count})`; sel.appendChild(o);
      });
      summary.textContent = res?.summary || '';
      const comps = res?.components || [];
      const unique = comps.length;
      const instances = comps.reduce((a,c)=> a + (c.count||0), 0);
      counters.textContent = `Unique components: ${unique} · Component instances: ${instances}`;
    });
  }

  // Rescan on blur and persist
  attrInput.addEventListener('blur', async ()=>{
    await chrome.storage.sync.set({ 'tdt.pref.dsi.attr': (attrInput.value||'data-component').trim() });
    runScan();
  });

  sel.addEventListener('change', async (e)=>{
    const key = e.target.value;
    const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
    if (key) chrome.tabs.sendMessage(tab.id, { ns:'DSI', type:'HILITE', key }, ()=>{});
  });

  // Exports
  mount.querySelector('#dsi-export-json').addEventListener('click', async ()=>{
    const data = await getCurrentData();
    const blob = new Blob([JSON.stringify(data,null,2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: 'design-system-inspector.json', saveAs: true });
    setTimeout(()=> URL.revokeObjectURL(url), 2000);
  });
  mount.querySelector('#dsi-export-docx').addEventListener('click', async ()=>{
    const data = await getCurrentData();
    const html = `<!doctype html><html><body><pre>${escapeHTML(JSON.stringify(data,null,2))}</pre></body></html>`;
    const blob = new Blob([html], { type:'application/msword' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: 'design-system-inspector.docx', saveAs: true });
    setTimeout(()=> URL.revokeObjectURL(url), 2000);
  });

  async function getCurrentData(){
    const attr = (attrInput.value || 'data-component').trim();
    const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
    return new Promise((resolve)=>{
      chrome.tabs.sendMessage(tab.id, { ns:'DSI', type:'SCAN', attr }, res => {
        resolve({ url: tab.url, attr, components: (res?.components||[]).map(c=>({ name:c.name, count:c.count })) });
      });
    });
  }
  function escapeHTML(s){ return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
}
