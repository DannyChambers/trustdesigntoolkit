// popup.js — tabs, registry, render, mount
function onReady(fn){ if (document.readyState==='complete'||document.readyState==='interactive') setTimeout(fn,0); else document.addEventListener('DOMContentLoaded', fn); }

onReady(()=>{
  const tabs = document.querySelectorAll('.tabs [data-tab]');
  const panels = document.querySelectorAll('.tab');
  tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.remove('is-active'));
    panels.forEach(p => p.classList.remove('is-active'));
    btn.classList.add('is-active');
    document.getElementById('tab-' + btn.dataset.tab)?.classList.add('is-active');
    if (btn.dataset.tab === 'settings') {
      import('./settings.popup.js').then(m => m.init());
    }
  }));

  const TOOL_REGISTRY = [
    { id:"design-system-inspector", label:"Design System Inspector",
      ui:{ html:"tools/design-system-inspector/dsi.ui.html", js:"tools/design-system-inspector/dsi.ui.js" },
      scripts:["tools/design-system-inspector/dsi.content.js"] },
    { id:"copy-designer", label:"Copy Designer",
      ui:{ html:"tools/copy-designer/copy.ui.html", js:"tools/copy-designer/copy.ui.js" },
      scripts:["tools/copy-designer/copy.content.js"] },
    { id:"trust-design-audit", label:"Trust Design Audit",
      ui:{ html:"tools/trust-design-audit/audit.ui.html", js:"tools/trust-design-audit/audit.ui.js" },
      scripts:["tools/trust-design-audit/audit.content.js"], gated:true },
  ];

  const list = document.getElementById('tool-list');
  const panel = document.getElementById('tool-panel');
  list.innerHTML = '';
  TOOL_REGISTRY.forEach(t => {
    const li = document.createElement('li');
    li.className = 'tool-btn';
    li.dataset.tool = t.id;
    li.innerHTML = `<div>${t.label}</div><span class="tool-badge">tool</span>`;
    list.appendChild(li);
  });

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-tool]');
    if (!btn || !list.contains(btn)) return;
    e.preventDefault(); e.stopPropagation();

    list.querySelectorAll('[data-tool].is-active').forEach(el => el.classList.remove('is-active'));
    btn.classList.add('is-active');

    const tool = TOOL_REGISTRY.find(t => t.id === btn.dataset.tool);
    if (!tool) return;

    const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
    await new Promise(res => chrome.runtime.sendMessage({ type:'INJECT_TOOL', tool: tool.id, tabId: tab.id }, res));

    const uiHTML = await fetch(chrome.runtime.getURL(tool.ui.html)).then(r=>r.text());
    panel.innerHTML = uiHTML;
    const init = await import(chrome.runtime.getURL(tool.ui.js)).then(m => m.init);
    init(panel);
  });

  // Auto-select last tool or default to DSI
  chrome.storage.sync.get(['tdt.pref.lastTool'], (res)=>{
    const last = res['tdt.pref.lastTool'] || 'design-system-inspector';
    const target = list.querySelector(`[data-tool="${last}"]`) || list.querySelector('[data-tool]');
    if (target) target.click();
  });
});
