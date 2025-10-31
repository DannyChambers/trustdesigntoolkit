const tools = [
  { id: "design-system-inspector", name: "Design System Inspector" },
  { id: "copy-designer", name: "Copy Designer" },
];

const toolList = document.getElementById("toolList");
const subset = document.getElementById("subset");
let activeTool = null;

// Empty by default → pattern mode unless user types an attribute
let dsiAttr = "";

function renderTools() {
  toolList.innerHTML = "";
  tools.forEach((t) => {
    const el = document.createElement("button");
    el.className = "tool";
    el.setAttribute("aria-pressed", "false");
    el.dataset.toolId = t.id;

    const left = document.createElement("div");
    left.className = "label";
    const name = document.createElement("div");
    name.textContent = t.name;
    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = "tool";

    left.appendChild(name);
    el.appendChild(left);
    el.appendChild(badge);

    el.addEventListener("click", () => activateTool(t.id));
    toolList.appendChild(el);
  });
}

function setActiveButton(toolId) {
  Array.from(toolList.children).forEach((btn) => {
    const isActive = btn.dataset.toolId === toolId;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
  });
}

function renderSubset(toolId) {
  subset.innerHTML = "";
  if (toolId === "design-system-inspector") {
    const title = document.createElement("div");
    title.innerHTML = "<h2 class='title'>Design System Inspector</h2>";

    const kv = document.createElement("div");
    kv.className = "kv";
    kv.innerHTML = `
      <div>Detected:</div><div id="dsiDetected">Waiting…</div>
      <div>Unique components:</div><div id="dsiComponentCount">–</div>
      <div>Component instances:</div><div id="dsiInstanceCount">–</div>
    `;

    const attrLabel = document.createElement("label");
    attrLabel.textContent = "Detect by:"; // merged wording per PRD

    const attrInput = document.createElement("input");
    attrInput.className = "input";
    attrInput.id = "dsiAttr";
    attrInput.placeholder = "e.g. data-component";
    attrInput.value = dsiAttr; // stays empty by default
    attrInput.addEventListener("change", (e) => {
      dsiAttr = e.target.value.trim(); // no implicit fallback
      chrome.runtime.sendMessage({
        type: "SEND_TO_ACTIVE",
        payload: { type: "DSI_SET_ATTR", attr: dsiAttr || null }, // null => pattern
      });
      chrome.runtime.sendMessage({
        type: "SEND_TO_ACTIVE",
        payload: { type: "DSI_REQUEST_SUMMARY" },
      });
    });

    const label = document.createElement("label");
    label.textContent = "Highlight";

    const select = document.createElement("select");
    select.className = "select";
    select.id = "dsiSelect";
    select.addEventListener("change", (e) => {
      const id = e.target.value || null;
      chrome.runtime.sendMessage({
        type: "SEND_TO_ACTIVE",
        payload: { type: "DSI_SELECT", name: id },
      });
    });

    subset.append(title, attrLabel, attrInput, kv, label, select);
  } else if (toolId === "copy-designer") {
    const title = document.createElement("div");
    title.innerHTML = "<strong>Copy Designer</strong>";

    const p = document.createElement("p");
    p.className = "placeholder";
    p.textContent = "Hover webpage to highlight text. Click to edit inline.";

    const btn = document.createElement("button");
    btn.className = "button";
    btn.textContent = "Export Copy Deck (.docx)";
    btn.addEventListener("click", () => {
      chrome.runtime.sendMessage({
        type: "SEND_TO_ACTIVE",
        payload: { type: "COPY_EXPORT_DOCX" },
      });
    });

    const btnJson = document.createElement("button");
    btnJson.className = "button";
    btnJson.textContent = "Export Copy Deck (.json)";
    btnJson.addEventListener("click", () => {
      chrome.runtime.sendMessage({
        type: "SEND_TO_ACTIVE",
        payload: { type: "COPY_EXPORT_JSON" },
      });
    });

    subset.append(title, p, btn, btnJson);
  } else {
    subset.innerHTML = '<div class="placeholder">Select a tool to begin.</div>';
  }
}

// Messaging from content scripts
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;

  if (msg.type === "DSI_SUMMARY") {
    const detected = document.getElementById("dsiDetected");
    const count = document.getElementById("dsiComponentCount");
    const instances = document.getElementById("dsiInstanceCount");
    const select = document.getElementById("dsiSelect");

    if (detected) detected.textContent = msg.detected || "—";

    if (count) {
      count.textContent =
        msg.totalComponents != null ? String(msg.totalComponents) : "0";
    }

    if (instances) {
      instances.textContent =
        msg.totalInstances != null ? String(msg.totalInstances) : "0";
    }

    if (select) {
      select.innerHTML = "";
      (msg.components || []).forEach((item) => {
        const opt = document.createElement("option");
        opt.value = item.id;
        const label = item.name || item.id;
        opt.textContent = `${label} (${item.count})`;
        select.appendChild(opt);
      });
    }
  } else if (msg.type === "TOOL_READY") {
    if (
      activeTool === "design-system-inspector" &&
      msg.toolId === "design-system-inspector"
    ) {
      chrome.runtime.sendMessage({
        type: "SEND_TO_ACTIVE",
        payload: { type: "DSI_SET_ATTR", attr: dsiAttr || null }, // null => pattern mode
      });
      chrome.runtime.sendMessage({
        type: "SEND_TO_ACTIVE",
        payload: { type: "DSI_REQUEST_SUMMARY" },
      });
    }
  }
});

function activateTool(toolId) {
  activeTool = toolId;
  setActiveButton(toolId);
  renderSubset(toolId);
  chrome.runtime.sendMessage({ type: "INJECT_TOOL", toolId });
}

renderTools();

/* --------------------------------------------------
   Simple persistence for Trust Design Toolkit
   (no logic changes, just remembers last state)
-------------------------------------------------- */

(async () => {
  // Load saved state
  const stored = await chrome.storage.local.get({
    activeTool: null,
    dsiAttr: "",
    dsiSelected: "",
  });

  // --- Restore ---
  const detectInput = document.querySelector("#dsi-detect");
  const selectEl = document.querySelector("#dsi-select");
  const activeBtn = stored.activeTool
    ? document.querySelector(`.td-tool[data-tool="${stored.activeTool}"]`)
    : null;

  // Restore "Detect by" field
  if (detectInput && stored.dsiAttr) {
    detectInput.value = stored.dsiAttr;
    detectInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Restore selected component
  if (selectEl && stored.dsiSelected) {
    const applySelection = () => {
      if ([...selectEl.options].some((o) => o.value === stored.dsiSelected)) {
        selectEl.value = stored.dsiSelected;
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
        document.removeEventListener("TD_DSI_OPTIONS_READY", applySelection);
      }
    };
    document.addEventListener("TD_DSI_OPTIONS_READY", applySelection);
    applySelection();
  }

  // Restore active tool (clicks your own button so your code runs)
  if (activeBtn) activeBtn.click();

  // --- Save updates ---
  document.addEventListener(
    "click",
    async (e) => {
      const btn = e.target.closest(".td-tool[data-tool]");
      if (btn) {
        await chrome.storage.local.set({ activeTool: btn.dataset.tool });
      }
    },
    true
  );

  if (detectInput) {
    detectInput.addEventListener("input", async (e) => {
      await chrome.storage.local.set({
        dsiAttr: e.target.value.trim(),
        dsiSelected: "",
      });
    });
  }

  if (selectEl) {
    selectEl.addEventListener("change", async (e) => {
      await chrome.storage.local.set({ dsiSelected: e.target.value || "" });
    });
  }
})();
