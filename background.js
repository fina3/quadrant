// Toggle quadrant note when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  // Skip chrome:// and other restricted URLs
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    return;
  }

  try {
    // Try to send toggle message
    await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
  } catch (e) {
    // Content script not injected yet - inject it and toggle
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
      });
      // Now send the toggle message
      await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
    } catch (e2) {
      // Cannot inject on this page
    }
  }
});
