export function init(mount){
  const status = mount.querySelector('#copy-status');
  async function send(type, cb){ const [tab] = await chrome.tabs.query({active:true, currentWindow:true}); chrome.tabs.sendMessage(tab.id, { ns:'COPY', type }, cb); }
  // Enable editing immediately on tool load
  send('START', ()=> status.textContent='Editing is active. Click any text to edit; blur to finish.');

  mount.querySelector('#copy-export-json').addEventListener('click', ()=> send('EXPORT_JSON', (res)=>{
    const blob = new Blob([JSON.stringify(res?.data||{}, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob); chrome.downloads.download({ url, filename: 'copy-deck.json', saveAs: true }); setTimeout(()=> URL.revokeObjectURL(url), 2000);
  }));
  mount.querySelector('#copy-export-docx').addEventListener('click', ()=> send('EXPORT_DOCX', ()=>{
    status.textContent='Exported .docx (download initiated)';
  }));
}
