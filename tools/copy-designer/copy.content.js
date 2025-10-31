// Copy Designer – content script
// - START: enable editing UX (hover target, click to edit)
// - STOP: disable editing UX
// - EXPORT_JSON / EXPORT_DOCX: return/download edits
// Notes: focus state is inline-styled; blur restores prior styles.

(() => {
  const NS = "COPY";

  let enabled = false;
  let edited = new Map(); // selector -> text
  let lastHover = null;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.ns !== NS) return;

    if (msg.type === "START") {
      enable();
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === "STOP") {
      disable();
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === "EXPORT_JSON") {
      sendResponse({ ok: true, data: exportJSON() });
      return true;
    }

    if (msg.type === "EXPORT_DOCX") {
      exportDOCX();
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === "PING") {
      sendResponse({ ok: true });
      return true;
    }
  });

  function enable() {
    if (enabled) return;
    enabled = true;
    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);
    document.addEventListener("click", onClick, true);
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    cleanupHover();
    document.removeEventListener("mouseover", onOver, true);
    document.removeEventListener("mouseout", onOut, true);
    document.removeEventListener("click", onClick, true);
  }

  function onOver(e) {
    if (!enabled) return;
    const el = findEditable(e.target);
    if (!el) return;
    cleanupHover();
    lastHover = el;
    try {
      el.style.outline = "1px dashed #DF00A8";
      el.style.outlineOffset = "1px";
    } catch (_) {}
  }

  function onOut() {
    cleanupHover();
  }

  function onClick(e) {
    if (!enabled) return;

    const el = findEditable(e.target);
    if (!el) return;

    // Prevent navigation when clicking links while entering edit mode.
    e.preventDefault();
    e.stopPropagation();

    // Activate contenteditable with focus styling.
    el.setAttribute("contenteditable", "true");

    const prev = {
      outline: el.style.outline,
      outlineOffset: el.style.outlineOffset,
      backgroundColor: el.style.backgroundColor,
    };

    try {
      el.style.outline = "2px solid #DF00A8";
      el.style.outlineOffset = "2px";
      el.style.backgroundColor = "rgba(223,0,168,0.08)";
    } catch (_) {}

    el.focus();

    const onInput = () => {
      edited.set(cssPath(el), el.textContent || "");
    };

    const onBlur = () => {
      el.removeEventListener("input", onInput);
      try {
        el.style.outline = prev.outline;
        el.style.outlineOffset = prev.outlineOffset;
        el.style.backgroundColor = prev.backgroundColor;
      } catch (_) {}
      el.removeAttribute("contenteditable");
      el.removeEventListener("blur", onBlur);
    };

    el.addEventListener("input", onInput);
    el.addEventListener("blur", onBlur, { once: true });
  }

  function cleanupHover() {
    if (!lastHover) return;
    try {
      lastHover.style.outline = "";
      lastHover.style.outlineOffset = "";
    } catch (_) {}
    lastHover = null;
  }

  // Only allow editing of visible, text-bearing elements.
  function findEditable(node) {
    if (!node || node.nodeType !== 1) return null;
    const el = node.closest("p,h1,h2,h3,h4,h5,h6,li,a,span,div");
    if (!el) return null;
    const txt = (el.textContent || "").trim();
    if (!txt) return null;
    const cs = getComputedStyle(el);
    if (
      cs.visibility === "hidden" ||
      cs.display === "none" ||
      parseFloat(cs.opacity || "1") < 0.05
    )
      return null;
    return el;
  }

  function exportJSON() {
    return {
      url: location.href,
      items: Array.from(edited.entries()).map(([selector, text]) => ({
        selector,
        text,
      })),
    };
  }

  function exportDOCX() {
    const data = exportJSON();
    const html = `<!doctype html><html><body><pre>${escapeHTML(
      JSON.stringify(data, null, 2)
    )}</pre></body></html>`;
    const blob = new Blob([html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "copy-deck.docx";
    a.click();
    URL.revokeObjectURL(url);
  }

  function escapeHTML(s) {
    return String(s).replace(
      /[&<>]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])
    );
  }

  // Robust CSS path for uniquely identifying elements across edits.
  function cssPath(el) {
    if (!el || el === document || el === document.documentElement)
      return "html";
    if (el === document.body) return "body";
    const path = [];
    while (el && el.nodeType === 1 && el !== document) {
      let sel = el.nodeName.toLowerCase();
      if (el.id) {
        sel += `#${CSS.escape(el.id)}`;
        path.unshift(sel);
        break;
      }
      let nth = 1,
        sib = el;
      while ((sib = sib.previousElementSibling)) {
        if (sib.nodeName === el.nodeName) nth++;
      }
      sel += `:nth-of-type(${nth})`;
      path.unshift(sel);
      el = el.parentElement;
    }
    return path.join(">");
  }
})();
