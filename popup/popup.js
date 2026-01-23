// QuadrantNote Popup Script

document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  setupEventListeners();
});

/**
 * Load and display storage statistics
 */
async function loadStats() {
  const statsEl = document.getElementById('stats');

  try {
    const storage = await chrome.storage.local.get(null);
    const keys = Object.keys(storage).filter(k => k.startsWith('notes_'));

    let totalNotes = 0;
    keys.forEach(key => {
      const notes = storage[key];
      if (notes) {
        totalNotes += (notes.doFirst?.length || 0);
        totalNotes += (notes.schedule?.length || 0);
        totalNotes += (notes.delegate?.length || 0);
        totalNotes += (notes.eliminate?.length || 0);
      }
    });

    statsEl.innerHTML = `
      <p><strong>Domains with notes:</strong> ${keys.length}</p>
      <p><strong>Total tasks:</strong> ${totalNotes}</p>
    `;
  } catch (error) {
    statsEl.innerHTML = '<p>Unable to load stats</p>';
    console.error('Failed to load stats:', error);
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  document.getElementById('clear-all-btn').addEventListener('click', clearAllData);
}

/**
 * Clear all stored data
 */
async function clearAllData() {
  if (!confirm('Are you sure you want to clear ALL QuadrantNote data from ALL domains?')) {
    return;
  }

  try {
    const storage = await chrome.storage.local.get(null);
    const keysToRemove = Object.keys(storage).filter(k => k.startsWith('notes_'));

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }

    loadStats();
    alert('All data cleared successfully!');
  } catch (error) {
    console.error('Failed to clear data:', error);
    alert('Failed to clear data. Please try again.');
  }
}
