chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
  } catch (e) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
    setTimeout(() => chrome.tabs.sendMessage(tab.id, { action: 'toggle' }), 150);
  }
});
