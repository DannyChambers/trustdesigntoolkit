(function () {
  let groupsCache = [];
  // Default to pattern mode (per PRD v1.1.4)
  let dsiMode = "pattern"; // 'pattern' | 'data'
  let dsiAttr = ""; // empty unless user explicitly sets it

  function isVisible(el) {
    try {
      const s = window.getComputedStyle(el);
      if (
        s.display === "none" ||
        s.visibility === "hidden" ||
        s.opacity === "0"
      )
        return false;
      const r = el.getBoundingClientRect();
      return r.width > 6 && r.height > 6;
    } catch (e) {
      return false;
    }
  }

  function classSet(el) {
    return new Set(Array.from(el.classList).filter(Boolean));
  }
  function setToSig(set) {
    return Array.from(set).sort().join(".");
  }
  function jaccard(a, b) {
    let inter = 0;
    for (const v of a) {
      if (b.has(v)) inter++;
    }
    const union = a.size + b.size - inter;
    return union === 0 ? 1 : inter / union;
  }

  // --- Scanners ----------------------------------------------------

  function scanByAttribute() {
    const selector = `[${CSS.escape(dsiAttr)}]`;
    const nodes = Array.from(document.querySelectorAll(selector)).filter(
      isVisible
    );
    const map = new Map();

    for (const el of nodes) {
      const val = el.getAttribute(dsiAttr) || "component";
      if (!map.has(val)) map.set(val, []);
      map.get(val).push(el);
    }

    const groups = [];
    for (const [val, els] of map.entries()) {
      groups.push({
        id: `data:${dsiAttr}:${val}`,
        label: val,
        count: els.length,
        elements: els,
      });
    }
    return groups;
  }

  function scanByClassPatternsMerged() {
    const els = Array.from(document.body.querySelectorAll("*")).filter(
      isVisible
    );
    const byKey = new Map();

    for (const el of els) {
      const set = classSet(el);
      if (set.size === 0) continue;
      const key = setToSig(set);
      if (!byKey.has(key)) byKey.set(key, { set, elements: [] });
      byKey.get(key).elements.push(el);
    }

    const base = Array.from(byKey.values());
    const merged = [];
    const used = new Set();
    const THRESH = 0.7;

    for (let i = 0; i < base.length; i++) {
      if (used.has(i)) continue;

      let core = [base[i].set];
      let elements = base[i].elements.slice();
      used.add(i);

      let changed = true;
      while (changed) {
        changed = false;
        for (let j = 0; j < base.length; j++) {
          if (used.has(j)) continue;

          const cs = base[j].set;
          let match = false;

          for (const s of core) {
            const jac = jaccard(s, cs);
            if (jac >= THRESH) {
              match = true;
              break;
            }

            // subset/superset affinity
            let csSub = true;
            for (const v of cs) {
              if (!s.has(v)) {
                csSub = false;
                break;
              }
            }
            let sSub = true;
            for (const v of s) {
              if (!cs.has(v)) {
                sSub = false;
                break;
              }
            }
            if (csSub || sSub) {
              match = true;
              break;
            }
          }

          if (match) {
            core.push(cs);
            elements = elements.concat(base[j].elements);
            used.add(j);
            changed = true;
          }
        }
      }

      // Label: top 3 most frequent classes
      const freq = new Map();
      for (const el of elements) {
        for (const c of el.classList) {
          if (!c) continue;
          freq.set(c, (freq.get(c) || 0) + 1);
        }
      }

      const label =
        Array.from(freq.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 3)
          .map(([c]) => c)
          .join(".") || "element";

      const uniq = Array.from(new Set(elements));
      merged.push({
        id: "classm:" + label,
        label,
        count: uniq.length,
        elements: uniq,
      });
    }

    merged.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return merged;
  }

  function scanDOM() {
    let groups = [];
    if (dsiMode === "data" && dsiAttr) {
      groups = scanByAttribute();
      if (groups.length === 0) groups = scanByClassPatternsMerged(); // graceful fallback
    } else {
      groups = scanByClassPatternsMerged();
    }
    groupsCache = groups;
    return groups;
  }

  // --- Highlighting ------------------------------------------------

  function clearHighlights() {
    document.querySelectorAll(".__tdt_dsi_border").forEach((el) => {
      try {
        if (el.dataset.__tdt_prev_outline !== undefined) {
          el.style.outline = el.dataset.__tdt_prev_outline;
          delete el.dataset.__tdt_prev_outline;
        } else {
          el.style.outline = "";
        }
        el.classList.remove("__tdt_dsi_border");
      } catch (e) {}
    });
  }

  function highlightGroup(id) {
    clearHighlights();
    const group = groupsCache.find((g) => g.id === id);
    if (!group) return;
    for (const el of group.elements) {
      try {
        el.dataset.__tdt_prev_outline = el.style.outline || "";
        el.style.outline = "2px solid #DF00A8";
        el.classList.add("__tdt_dsi_border");
      } catch (e) {}
    }
  }

  // --- Messaging ---------------------------------------------------

  function sendSummary() {
    const groups = scanDOM();

    const mode =
      dsiMode === "data" &&
      dsiAttr &&
      groups.length &&
      groups[0].id.startsWith("data:")
        ? dsiAttr
        : groups.length
        ? "pattern (merged)"
        : "none";

    const payload = groups.map((g) => ({
      id: g.id,
      name: g.label || g.id,
      count: g.count,
    }));
    const totalInstances = payload.reduce((sum, g) => sum + (g.count || 0), 0);

    try {
      chrome.runtime.sendMessage({
        type: "DSI_SUMMARY",
        detected: mode,
        components: payload,
        totalComponents: payload.length, // unique component groups
        totalInstances, // total DOM matches across groups
      });
    } catch (e) {}
  }

  function onMessage(msg) {
    if (!msg) return;

    if (msg.type === "DSI_REQUEST_SUMMARY") {
      sendSummary();
    } else if (msg.type === "DSI_SELECT") {
      if (!msg.name) {
        clearHighlights();
      } else {
        highlightGroup(msg.name);
      }
    } else if (msg.type === "DSI_SET_MODE") {
      if (msg.mode === "data" || msg.mode === "pattern") dsiMode = msg.mode;
    } else if (msg.type === "DSI_SET_ATTR") {
      if (typeof msg.attr === "string" && msg.attr.trim()) {
        dsiAttr = msg.attr.trim();
        dsiMode = "data";
      } else {
        dsiAttr = "";
        dsiMode = "pattern";
      }
    } else if (msg.type === "CLEANUP_ALL") {
      teardown();
    }
  }

  function teardown() {
    clearHighlights();
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch (e) {}
  }

  try {
    chrome.runtime.onMessage.addListener(onMessage);
  } catch (e) {}
  try {
    chrome.runtime.sendMessage({
      type: "TOOL_READY",
      toolId: "design-system-inspector",
    });
  } catch (e) {}
})();
