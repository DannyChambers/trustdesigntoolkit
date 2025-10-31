import { isLicensed } from '../../popup/license.util.js';
export function init(mount){
  const status = mount.querySelector('#tda-status');
  const locked = mount.querySelector('#tda-locked');
  const runBtn = mount.querySelector('#tda-run');
  const stopBtn = mount.querySelector('#tda-stop');
  const exportBtn = mount.querySelector('#tda-export');
  const resultsCard = mount.querySelector('#tda-results');
  const scoreEl = mount.querySelector('#tda-score');
  const catsEl = mount.querySelector('#tda-categories');
  const finEl = mount.querySelector('#tda-findings-body');
  let last=null;

  function gaugeSVG(score){
    const s = Math.max(0, Math.min(100, score||0));
    const R = 22, C = 2*Math.PI*R, filled = C * (s/100), remain = C - filled;
    return `<svg class="gauge" viewBox="0 0 60 60" aria-label="Trust score ${s}">
      <circle cx="30" cy="30" r="${R}" stroke="#234" stroke-width="6" fill="none" />
      <circle cx="30" cy="30" r="${R}" stroke="#DF00A8" stroke-width="6" fill="none"
              stroke-dasharray="${filled} ${remain}" transform="rotate(-90 30 30)" />
      <text x="30" y="34" text-anchor="middle" font-size="14" fill="#fff">${s}</text>
    </svg>`;
  }

  function renderResults(result){
    if (!result) return;
    last = result;
    resultsCard.style.display = 'block';
    scoreEl.innerHTML = gaugeSVG(result.trustScore) + `<div class="muted">${result.summary||''}</div>`;
    catsEl.innerHTML = '';
    Object.entries(result.categoryScores||{}).forEach(([label,val])=>{
      const row=document.createElement('div'); row.className='cat-row';
      row.innerHTML = `<div class="row-top"><span>${label}</span><span>${(val*100).toFixed(0)}%</span></div>
        <div class="bar"><div class="fill" style="width:${Math.max(0,Math.min(100,val*100))}%"></div></div>`;
      catsEl.appendChild(row);
    });
    finEl.innerHTML = '';
    (result.findings||[]).forEach(f=>{
      const item=document.createElement('div'); item.className='muted'; item.style.fontSize='12px';
      item.textContent = `• [${f.category}/${f.severity}] ${f.reason} (${f.selector})`;
      finEl.appendChild(item);
    });
  }

  isLicensed((licensed)=>{
    status.textContent = licensed ? 'Full scan available' : 'Add a license number in the settings screen to unlock premium tools.';
    locked.style.display = licensed ? 'none' : 'block';
    runBtn.disabled = exportBtn.disabled = !licensed;
  });

  runBtn.addEventListener('click', async ()=>{
    status.textContent = 'Running…';
    const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
    chrome.tabs.sendMessage(tab.id, { ns:'TDA', type:'RUN_AUDIT' }, (res)=>{
      status.textContent = res?.ok ? 'Scan complete' : 'Scan failed';
      if (res?.ok) renderResults(res.result);
    });
  });
  stopBtn.addEventListener('click', async ()=>{
    const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
    chrome.tabs.sendMessage(tab.id, { ns:'TDA', type:'STOP_AUDIT' }, ()=>{});
  });
  exportBtn.addEventListener('click', async ()=>{
    if (!last) return;
    const blob = new Blob([JSON.stringify(last, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob); chrome.downloads.download({ url, filename: 'trust-audit.json', saveAs: true }); setTimeout(()=> URL.revokeObjectURL(url), 2000);
  });
}
