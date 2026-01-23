document.getElementById('open-btn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.runtime.sendMessage({ action: 'inject', tabId: tab.id });
  window.close();
});
