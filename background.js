chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) return;

  try {
    // Try to send message first
    await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
  } catch (e) {
    // Content script not loaded, inject it first then toggle
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content.css']
    });
    // Small delay then toggle
    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
    }, 100);
  }
});
