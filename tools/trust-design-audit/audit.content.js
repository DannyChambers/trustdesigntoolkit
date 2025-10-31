(() => {
  const NS = "TDA";
  let lastResult=null;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.ns !== NS) return;
    if (msg.type === "RUN_AUDIT") {
      runAudit().then(result => { lastResult=result; sendResponse({ ok:true, result }); }).catch(err=>{ console.error(err); sendResponse({ ok:false, error:String(err) }); });
      return true;
    }
    if (msg.type === "STOP_AUDIT") { sendResponse({ ok:true }); return true; }
    if (msg.type === "GET_LAST") { sendResponse({ ok:true, result: lastResult }); return true; }
  });

  async function runAudit(){
    const rulesURL = chrome.runtime.getURL('tools/trust-design-audit/audit.rules.json');
    const rules = await fetch(rulesURL).then(r=>r.json());
    const ctx = buildContext();
    const findings = [];
    for (const r of rules.rules){
      try{
        const fs = await evaluateRule(r, ctx);
        findings.push(...fs);
      }catch(e){/* ignore */}
    }
    // Scoring
    const catWeights = {}; const labels = {};
    for (const c of rules.categories){ catWeights[c.key]=c.weight; labels[c.key]=c.id; }
    const catScores = {}; Object.keys(catWeights).forEach(k => catScores[k]=1.0);
    for (const f of findings){
      const k = f.category;
      const penalty = Math.min(1, Math.max(0, (f.penalty||0) * (f.confidence||1)));
      catScores[k] = Math.max(0, catScores[k] - penalty);
    }
    const trustScore = Math.round(Object.keys(catWeights).reduce((acc,k)=> acc + (catScores[k] * catWeights[k]), 0) * 100);
    const labeledCatScores = {}; Object.keys(catScores).forEach(k => labeledCatScores[labels[k]] = catScores[k]);
    return {
      meta:{ url: location.href, scannedAt: new Date().toISOString() },
      trustScore,
      categoryScores: labeledCatScores,
      findings,
      summary: "Deterministic local audit"
    };
  }

  function buildContext(){
    return {
      text: getVisibleText(),
      links: Array.from(document.querySelectorAll('a, [role="link"]')).map(a=>({text: (a.textContent||'').toLowerCase(), href:(a.getAttribute('href')||'').toLowerCase()})),
      hasBeforeUnload: !!window.onbeforeunload || hasEventListener(window, 'beforeunload'),
      overlays: getOverlays()
    };
  }
  function getVisibleText(){
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node){
        const str = (node.nodeValue||'').trim();
        if (!str) return NodeFilter.FILTER_REJECT;
        const el = node.parentElement; if (!el) return NodeFilter.FILTER_REJECT;
        const cs = getComputedStyle(el);
        if (cs.visibility==='hidden' || cs.display==='none' || parseFloat(cs.opacity||'1')<0.05) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const parts=[]; let n;
    while(n=walker.nextNode()){ parts.push(n.nodeValue.trim()); if (parts.length>5000) break; }
    return parts.join(' ').toLowerCase();
  }
  function hasEventListener(target, type){
    // Best-effort; cannot introspect addEventListener; rely on onbeforeunload
    return false;
  }
  function getOverlays(){
    const els = Array.from(document.querySelectorAll('body *'));
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth||0);
    const vh = Math.max(document.documentElement.clientHeight, window.innerHeight||0);
    const overlays=[];
    for (const el of els){
      const cs = getComputedStyle(el);
      if (cs.position==='fixed' && parseInt(cs.zIndex||'0')>=1000){
        const rect = el.getBoundingClientRect();
        if (rect.width > vw*0.9 && rect.height > vh*0.9){
          overlays.push({selector: cssPath(el), rect: {w:rect.width,h:rect.height}});
        }
      }
      if (overlays.length>10) break;
    }
    return overlays;
  }
  async function evaluateRule(rule, ctx){
    const out=[];
    if (rule.type==='text_regex'){
      const re = new RegExp(rule.pattern, rule.flags||'i');
      if (re.test(ctx.text)){
        out.push({ id:rule.id, category:rule.category, severity:rule.severity, selector:'(page text)', reason:'Text pattern matched', penalty:rule.penalty||0.1, confidence:0.9 });
      }
    } else if (rule.type==='dom_selector'){
      const nodes = Array.from(document.querySelectorAll(rule.selector||'')).slice(0,1000);
      for (const el of nodes){
        let ok=true;
        if (rule.nameMatch){
          const nm = (el.getAttribute('name')||el.getAttribute('id')||el.getAttribute('aria-label')||'').toLowerCase();
          if (!new RegExp(rule.nameMatch, rule.flags||'i').test(nm)) ok=false;
        }
        if (ok){
          out.push({ id:rule.id, category:rule.category, severity:rule.severity, selector: cssPath(el), reason:'Selector matched', penalty:rule.penalty||0.1, confidence:0.8 });
        }
      }
    } else if (rule.type==='layout_overlay'){
      if (ctx.overlays.length){
        out.push({ id:rule.id, category:rule.category, severity:rule.severity, selector: ctx.overlays[0] ? ctx.overlays[0].selector : '(overlay)', reason:'Large fixed overlay detected', penalty:rule.penalty||0.12, confidence:0.9 });
      }
    } else if (rule.type==='event_presence'){
      if (rule.event==='beforeunload' && ctx.hasBeforeUnload){
        out.push({ id:rule.id, category:rule.category, severity:rule.severity, selector: '(window)', reason:'beforeunload handler present', penalty:rule.penalty||0.18, confidence:0.7 });
      }
    } else if (rule.type==='link_presence'){
      const re = new RegExp(rule.text, 'i');
      const exists = ctx.links.some(l => re.test(l.text) || re.test(l.href));
      const should = !!rule.shouldExist;
      if (should && !exists){
        out.push({ id:rule.id, category:rule.category, severity:rule.severity, selector: '(links)', reason:'Expected link not found', penalty:rule.penalty||0.08, confidence:0.9 });
      }
    }
    return out;
  }
  function cssPath(el){
    if (!el||el===document||el===document.documentElement) return 'html';
    if (el===document.body) return 'body';
    let path=[];
    while(el&&el.nodeType===1&&el!==document){
      let sel=el.nodeName.toLowerCase();
      if (el.id){ sel+=`#${CSS.escape(el.id)}`; path.unshift(sel); break; }
      let sib=el,nth=1; while(sib=sib.previousElementSibling){ if (sib.nodeName===el.nodeName) nth++; }
      sel+=`:nth-of-type(${nth})`; path.unshift(sel); el=el.parentElement;
    }
    return path.join('>');
  }
})();