// background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;
  if (message.type === "INJECT_TOOL") {
    const toolId = message.toolId;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.id) return;
      // Ask any previous tool to clean up
      chrome.tabs.sendMessage(
        tab.id,
        { type: "CLEANUP_ALL" },
        () => void chrome.runtime.lastError
      );
      const fileMap = {
        "design-system-inspector":
          "tools/design-system-inspector/dsi.content.js",
        "copy-designer": "tools/copy-designer/copy.content.js",
      };
      const file = fileMap[toolId];
      if (!file) return;
      chrome.scripting
        .executeScript({ target: { tabId: tab.id }, files: [file] })
        .catch(() => {});
    });
  } else if (message.type === "SEND_TO_ACTIVE") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.id) return;
      chrome.tabs.sendMessage(
        tab.id,
        message.payload || {},
        () => void chrome.runtime.lastError
      );
    });
  }
});
