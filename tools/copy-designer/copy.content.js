(function(){
  let hoverStyleEl = null;
  let cleanupFns = [];
  let editing = false;

  function installHoverCSS() {
    if (hoverStyleEl) return;
    hoverStyleEl = document.createElement('style');
    hoverStyleEl.textContent = `
      .__tdt_hoverable:hover { outline: 2px dashed rgba(223,0,168,0.9); cursor: text !important; }
      .__tdt_hover_target { outline: 2px dashed rgba(223,0,168,0.9) !important; }
      .__tdt_editing { outline: 2px solid #DF00A8 !important; background: rgba(223,0,168,0.08); }
    `;
    document.documentElement.appendChild(hoverStyleEl);
    cleanupFns.push(()=> { try{ if (hoverStyleEl && hoverStyleEl.parentNode) hoverStyleEl.parentNode.removeChild(hoverStyleEl);}catch(e){} hoverStyleEl = null; });
  }
  function isVisible(el){
    try{
      const s = window.getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }catch(e){ return false; }
  }
  function markHoverables(){
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node){
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p || !isVisible(p)) return NodeFilter.FILTER_REJECT;
        if (!/(P|H1|H2|H3|H4|H5|H6|SPAN|LI|A|BUTTON|LABEL|DIV|SMALL|EM|STRONG)/.test(p.tagName)) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n; const seen = new Set();
    while ((n = walker.nextNode())){
      const el = n.parentElement;
      if (el && !seen.has(el)) { el.classList.add('__tdt_hoverable'); seen.add(el); }
    }
    cleanupFns.push(()=> { try{ document.querySelectorAll('.__tdt_hoverable').forEach(el=> el.classList.remove('__tdt_hoverable')); }catch(e){} });
  }
  function addMouseHighlights(){
    const over = (e) => {
      const el = e.target.closest('.__tdt_hoverable');
      if (el) el.classList.add('__tdt_hover_target');
    };
    const out = (e) => {
      const el = e.target.closest('.__tdt_hoverable');
      if (el) el.classList.remove('__tdt_hover_target');
    };
    document.addEventListener('mouseover', over, true);
    document.addEventListener('mouseout', out, true);
    cleanupFns.push(()=> { document.removeEventListener('mouseover', over, true); document.removeEventListener('mouseout', out, true); });
  }
  function enableInlineEdit(){
    const click = (e) => {
      const el = e.target.closest('.__tdt_hoverable');
      if (!el) return;
      e.preventDefault();
      edit(el);
    };
    const esc = (e) => { if (e.key === 'Escape'){ const cur = document.querySelector('.__tdt_editing[contenteditable="true"]'); if (cur) cur.blur(); } };
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', esc, true);
    cleanupFns.push(()=> { document.removeEventListener('click', click, true); document.removeEventListener('keydown', esc, true); });
  }
  function edit(el){
    try{
      if (editing){ const cur = document.querySelector('.__tdt_editing[contenteditable="true"]'); if (cur && cur !== el) cur.blur(); }
      editing = true;
      el.contentEditable = 'true';
      el.classList.add('__tdt_editing');
      const r = document.createRange(); r.selectNodeContents(el);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      el.focus();
      const onBlur = () => { el.contentEditable = 'false'; el.classList.remove('__tdt_editing'); el.removeEventListener('blur', onBlur); editing = false; };
      el.addEventListener('blur', onBlur);
    }catch(e){}
  }

  function cssPath(el){
    if (!(el instanceof Element)) return '';
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.body){
      let selector = el.nodeName.toLowerCase();
      if (el.id){
        selector += '#' + el.id.replace(/(:|\.|\[|\]|,|=|@)/g,'\\$1');
        parts.unshift(selector);
        break;
      } else {
        const cls = Array.from(el.classList).join('.');
        if (cls) selector += '.' + cls;
        const parent = el.parentElement;
        if (parent){
          const siblings = Array.from(parent.children).filter(n=>n.nodeName===el.nodeName);
          if (siblings.length > 1){
            const index = Array.from(parent.children).indexOf(el) + 1;
            selector += `:nth-child(${index})`;
          }
        }
      }
      parts.unshift(selector);
      el = el.parentElement;
    }
    return parts.join(' > ');
  }
  function collectVisibleBlocks(){
    const blocks = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node){
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (!isVisible(p)) return NodeFilter.FILTER_REJECT;
        if (!/(P|H1|H2|H3|H4|H5|H6|SPAN|LI|A|BUTTON|LABEL|DIV|SMALL|EM|STRONG)/.test(p.tagName)) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())){
      blocks.push({ selector: cssPath(node.parentElement), text: node.nodeValue.trim() });
    }
    return blocks;
  }

  function zipStore(files){
    let fileRecords=[], centralRecords=[], offset=0;
    function crc32(u8){ let c=~0; for(let i=0;i<u8.length;i++){ c=(c^u8[i])>>>0; for(let k=0;k<8;k++){ c=(c>>>1) ^ (0xEDB88320 & -(c&1)); } } return (~c)>>>0; }
    function le32(n){ const b=new Uint8Array(4); new DataView(b.buffer).setUint32(0,n,true); return b; }
    function le16(n){ const b=new Uint8Array(2); new DataView(b.buffer).setUint16(0,n,true); return b; }
    function cat(arrs){ let L=0; arrs.forEach(a=>L+=a.length); const out=new Uint8Array(L); let p=0; arrs.forEach(a=>{ out.set(a,p); p+=a.length; }); return out; }
    files.forEach(f=>{
      const nameBytes=new TextEncoder().encode(f.name);
      const crc=crc32(f.data);
      const local=cat([ Uint8Array.from([0x50,0x4b,0x03,0x04]), le16(20), le16(0), le16(0), le16(0), le16(0), le32(crc), le32(f.data.length), le32(f.data.length), le16(nameBytes.length), le16(0), nameBytes, f.data ]);
      fileRecords.push(local);
      const central=cat([ Uint8Array.from([0x50,0x4b,0x01,0x02]), le16(20), le16(20), le16(0), le16(0), le16(0), le16(0), le32(crc), le32(f.data.length), le32(f.data.length), le16(nameBytes.length), le16(0), le16(0), le16(0), le16(0), le32(0), le32(offset), nameBytes ]);
      centralRecords.push(central);
      offset += local.length;
    });
    const centralBlob = cat(centralRecords);
    const filesBlob = cat(fileRecords);
    const end = cat([ Uint8Array.from([0x50,0x4b,0x05,0x06]), le16(0), le16(0), le16(files.length), le16(files.length), le32(centralBlob.length), le32(filesBlob.length), le16(0) ]);
    return new Blob([filesBlob, centralBlob, end], {type:'application/zip'});
  }
  function createDocx(paragraphs){
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
    const body = paragraphs.map(t=> `<w:p><w:r><w:t>${t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</w:t></w:r></w:p>`).join('');
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
    const files = [
      { name:"[Content_Types].xml", data:new TextEncoder().encode(contentTypes)},
      { name:"_rels/.rels", data:new TextEncoder().encode(rels)},
      { name:"word/document.xml", data:new TextEncoder().encode(documentXml)}
    ];
    const zipBlob = zipStore(files);
    return new Blob([zipBlob], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }
  function exportDocx(){
    const blob = createDocx(collectVisibleBlocks().map(b => b.text));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (document.title ? document.title.replace(/[^\w\-]+/g,'_') : 'page') + '_copy_deck.docx';
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  function exportJSON(){
    const data = { title: document.title || '', url: location.href, blocks: collectVisibleBlocks() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (document.title ? document.title.replace(/[^\w\-]+/g,'_') : 'page') + '_copy_deck.json';
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function onMessage(msg){
    if (!msg) return;
    if (msg.type === 'COPY_EXPORT_DOCX') exportDocx();
    else if (msg.type === 'COPY_EXPORT_JSON') exportJSON();
    else if (msg.type === 'CLEANUP_ALL') teardown();
  }

  function init(){
    installHoverCSS();
    markHoverables();
    addMouseHighlights();
    enableInlineEdit();
    try { chrome.runtime.sendMessage({ type: 'TOOL_READY', toolId: 'copy-designer' }); } catch(e){}
  }
  function teardown(){
    try{ cleanupFns.forEach(fn => fn()); }catch(e){}
    cleanupFns = [];
    try{ document.querySelectorAll('.__tdt_editing').forEach(el => { el.contentEditable = 'false'; el.classList.remove('__tdt_editing'); }); }catch(e){}
    try{ chrome.runtime.onMessage.removeListener(onMessage); }catch(e){}
  }

  try { chrome.runtime.onMessage.addListener(onMessage); } catch(e){}
  init();
})();
