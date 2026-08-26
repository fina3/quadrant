// Toggling is driven entirely by re-injection: content.js is idempotent and
// toggles itself if an instance already exists. This removes the old
// sendMessage/setTimeout race and needs no message channel at all.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const url = tab.url || '';
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('about:') || url.startsWith('edge://') || url.startsWith('devtools://')) return;

  try {
    // CSS first so the note is never painted unstyled.
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (e) {
    console.warn('Quadrant: cannot inject into this tab:', e.message);
  }
});
