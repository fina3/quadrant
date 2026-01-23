// Toggle quadrant note when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: 'toggle' }).catch(() => {
    // Content script not ready yet, ignore
  });
});
