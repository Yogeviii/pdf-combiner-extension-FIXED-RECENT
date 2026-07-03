chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "ARM_COMMB0X_PDF_PICKER" });
  } catch (error) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    await chrome.tabs.sendMessage(tab.id, { type: "ARM_COMMB0X_PDF_PICKER" });
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "DOWNLOAD_COMMB0X_PDFS") {
    const files = Array.isArray(message.files) ? message.files : [];

    for (const file of files) {
      if (!file?.url || !file?.filename) continue;

      chrome.downloads.download({
        url: file.url,
        filename: file.filename,
        saveAs: false,
        conflictAction: "uniquify"
      });
    }
  }

  if (message?.type === "OPEN_COMMB0X_PDFS") {
    const urls = Array.isArray(message.urls) ? message.urls : [];
    for (const url of urls) {
      if (!url) continue;
      chrome.tabs.create({ url, active: false });
    }
  }
});
