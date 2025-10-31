// DSI content script: real scan + highlight
(() => {
  const NS = 'DSI';
  const state = { groups: new Map(), highlights: [] };

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.ns !== NS) return;
    if (msg.type === 'SCAN'){
      const attr = (msg.attr||'data-component').trim() || 'data-component';
      const res = scanByAttr(attr);
      sendResponse(res);
      return true;
    }
    if (msg.type === 'HILITE'){
      clearHighlights();
      const group = state.groups.get(msg.key);
      if (group){ highlight(group.nodes); sendResponse({ ok:true }); }
      else { sendResponse({ ok:false }); }
      return true;
    }
  });

  function scanByAttr(attr){
    state.groups.clear();
    const all = Array.from(document.querySelectorAll(`[${cssEscapeAttr(attr)}]`)).slice(0, 5000);
    for (const el of all){
      const val = (el.getAttribute(attr)||'').trim();
      const name = val || '(empty)';
      const key = `attr:${attr}=${name}`;
      if (!state.groups.has(key)) state.groups.set(key, { key, name, nodes: [] });
      state.groups.get(key).nodes.push(el);
    }
    const components = Array.from(state.groups.values())
      .filter(g => g.nodes.length >= 1)
      .slice(0, 2000)
      .map(g => ({ key: g.key, name: g.name, count: g.nodes.length }));
    return { components, summary: `Found ${components.length} component types for ${attr}` };
  }

  function highlight(nodes){
    for (const n of nodes){
      try{
        if (!n.hasAttribute('data-dsi-outline')){
          n.setAttribute('data-dsi-outline','1');
          n.style.outline = '2px solid #DF00A8';
          n.style.outlineOffset = '1px';
          state.highlights.push(n);
        }
      }catch(e){}
    }
  }
  function clearHighlights(){
    for (const n of state.highlights){
      try{ n.style.outline=''; n.style.outlineOffset=''; n.removeAttribute('data-dsi-outline'); }catch(e){}
    }
    state.highlights = [];
  }
  function cssEscapeAttr(name){
    return name.replace(/(["'\\\]\[])/g, '\\$1');
  }
})();