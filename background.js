// background.js — inject content scripts per tool
const TOOL_SCRIPTS = {
  "design-system-inspector": ["tools/design-system-inspector/dsi.content.js"],
  "copy-designer": ["tools/copy-designer/copy.content.js"],
  "trust-design-audit": ["tools/trust-design-audit/audit.content.js"]
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "INJECT_TOOL") return;
  const files = TOOL_SCRIPTS[msg.tool];
  const tabId = msg.tabId || sender?.tab?.id;
  if (!files || !tabId) { sendResponse({ ok:false, error:"Missing files or tabId" }); return; }
  chrome.scripting.executeScript({ target: { tabId }, files }, () => {
    if (chrome.runtime.lastError) sendResponse({ ok:false, error: chrome.runtime.lastError.message });
    else sendResponse({ ok:true });
  });
  return true; // async
});
