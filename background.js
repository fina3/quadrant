// Background service worker for QuadrantNote extension

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('QuadrantNote extension installed');
});

// Handle messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getNotesForDomain') {
    getNotesForDomain(message.domain)
      .then(notes => sendResponse({ success: true, notes }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.action === 'saveNotesForDomain') {
    saveNotesForDomain(message.domain, message.notes)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'clearNotesForDomain') {
    clearNotesForDomain(message.domain)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

/**
 * Get notes for a specific domain
 * @param {string} domain - The domain to get notes for
 * @returns {Promise<Object>} - Notes object with quadrant arrays
 */
async function getNotesForDomain(domain) {
  const key = `notes_${domain}`;
  const result = await chrome.storage.local.get([key]);
  return result[key] || {
    doFirst: [],
    schedule: [],
    delegate: [],
    eliminate: []
  };
}

/**
 * Save notes for a specific domain
 * @param {string} domain - The domain to save notes for
 * @param {Object} notes - Notes object with quadrant arrays
 */
async function saveNotesForDomain(domain, notes) {
  const key = `notes_${domain}`;
  await chrome.storage.local.set({ [key]: notes });
}

/**
 * Clear notes for a specific domain
 * @param {string} domain - The domain to clear notes for
 */
async function clearNotesForDomain(domain) {
  const key = `notes_${domain}`;
  await chrome.storage.local.remove(key);
}
