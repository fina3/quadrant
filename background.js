chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'inject') {
    chrome.scripting.insertCSS({
      target: { tabId: message.tabId },
      files: ['content.css']
    });

    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      files: ['content.js']
    }).then(() => {
      // Send toggle message after injection
      chrome.tabs.sendMessage(message.tabId, { action: 'toggle' });
    });
  }
});
