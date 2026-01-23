(function() {
  if (window.__quadrantInitialized) return;
  window.__quadrantInitialized = true;

  const STORAGE_KEY = 'quadrant_global';
  let note = null;
  let saveTimeout = null;

  // ============================================
  // STORAGE FUNCTIONS
  // ============================================

  async function loadContent() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const data = result[STORAGE_KEY] || {};
      const q1 = document.querySelector('#quadrant-note [data-cell="q1"]');
      const q2 = document.querySelector('#quadrant-note [data-cell="q2"]');
      const q3 = document.querySelector('#quadrant-note [data-cell="q3"]');
      const q4 = document.querySelector('#quadrant-note [data-cell="q4"]');
      if (q1) q1.value = data.q1 || '';
      if (q2) q2.value = data.q2 || '';
      if (q3) q3.value = data.q3 || '';
      if (q4) q4.value = data.q4 || '';
    } catch (e) {
      console.log('Quadrant: load failed', e.message);
    }
  }

  async function saveContent() {
    try {
      const data = {
        q1: document.querySelector('#quadrant-note [data-cell="q1"]')?.value || '',
        q2: document.querySelector('#quadrant-note [data-cell="q2"]')?.value || '',
        q3: document.querySelector('#quadrant-note [data-cell="q3"]')?.value || '',
        q4: document.querySelector('#quadrant-note [data-cell="q4"]')?.value || ''
      };
      await chrome.storage.local.set({ [STORAGE_KEY]: data });
    } catch (e) {
      console.log('Quadrant: save failed', e.message);
    }
  }

  async function clearContent() {
    if (!confirm('Clear all tasks?')) return;
    document.querySelectorAll('#quadrant-note [data-cell]').forEach(ta => ta.value = '');
    try {
      await chrome.storage.local.remove(STORAGE_KEY);
    } catch (e) {
      console.log('Quadrant: clear failed', e.message);
    }
  }

  // ============================================
  // CREATE NOTE
  // ============================================

  function createNote() {
    // Create style element
    const style = document.createElement('style');
    style.id = 'quadrant-styles';
    style.textContent = `
      #quadrant-note,
      #quadrant-note * {
        all: revert;
        box-sizing: border-box;
      }

      #quadrant-note {
        position: fixed !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%);
        width: 300px;
        height: 300px;
        min-width: 200px;
        min-height: 180px;
        background: #fff9b1 !important;
        border-radius: 4px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.15);
        display: none;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        resize: both;
        overflow: hidden;
        z-index: 2147483647 !important;
        pointer-events: auto !important;
        margin: 0;
        padding: 0;
      }

      #quadrant-note.visible { display: flex !important; }

      #quadrant-note .q-header {
        height: 24px;
        min-height: 24px;
        background: #f0e098;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 8px;
        cursor: grab;
        user-select: none;
      }

      #quadrant-note .q-header.dragging { cursor: grabbing; }

      #quadrant-note .q-title {
        font-size: 11px;
        font-weight: 700;
        color: #665;
        letter-spacing: 0.5px;
      }

      #quadrant-note .q-controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      #quadrant-note .q-btn {
        background: none !important;
        border: none !important;
        color: #776;
        font-size: 12px;
        line-height: 1;
        cursor: pointer !important;
        padding: 2px 6px;
        border-radius: 2px;
        pointer-events: auto !important;
      }

      #quadrant-note .q-btn:hover {
        background: rgba(0,0,0,0.1) !important;
        color: #443;
      }

      #quadrant-note .q-clear { font-size: 9px; font-weight: 600; }
      #quadrant-note .q-close { font-size: 18px; padding: 0 4px; }

      #quadrant-note .q-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 4px 10px 10px 24px;
        min-height: 0;
      }

      #quadrant-note .q-top-labels {
        display: flex;
        height: 14px;
        padding-left: 2px;
      }

      #quadrant-note .q-top-label {
        flex: 1;
        font-size: 9px;
        color: #998;
        text-transform: uppercase;
        text-align: center;
        font-weight: 500;
      }

      #quadrant-note .q-grid-container {
        flex: 1;
        display: flex;
        min-height: 0;
      }

      #quadrant-note .q-side-labels {
        width: 16px;
        margin-left: -20px;
        display: flex;
        flex-direction: column;
      }

      #quadrant-note .q-side-label {
        flex: 1;
        font-size: 9px;
        color: #998;
        text-transform: uppercase;
        writing-mode: vertical-rl;
        text-orientation: mixed;
        transform: rotate(180deg);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 500;
      }

      #quadrant-note .q-grid {
        flex: 1;
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr;
        gap: 2px;
        background: rgba(0,0,0,0.06);
        border-radius: 2px;
        min-height: 0;
      }

      #quadrant-note .q-cell {
        background: rgba(255,255,255,0.3);
        min-height: 0;
        min-width: 0;
        border-radius: 1px;
      }

      #quadrant-note .q-cell textarea {
        width: 100% !important;
        height: 100% !important;
        border: none !important;
        background: transparent !important;
        resize: none !important;
        padding: 6px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 11px !important;
        line-height: 1.4 !important;
        color: #333 !important;
        outline: none !important;
        overflow-y: auto !important;
        pointer-events: auto !important;
        user-select: text !important;
        -webkit-user-select: text !important;
        cursor: text !important;
      }

      #quadrant-note .q-cell textarea::placeholder {
        color: #aa9;
        font-size: 10px;
      }
    `;
    document.head.appendChild(style);

    // Create note element
    note = document.createElement('div');
    note.id = 'quadrant-note';
    note.innerHTML = `
      <div class="q-header">
        <span class="q-title">QUADRANT</span>
        <div class="q-controls">
          <button class="q-btn q-refresh" title="Refresh">↻</button>
          <button class="q-btn q-clear" title="Clear all">CLEAR</button>
          <button class="q-btn q-close" title="Close">×</button>
        </div>
      </div>
      <div class="q-content">
        <div class="q-top-labels">
          <span class="q-top-label">Urgent</span>
          <span class="q-top-label">Not Urgent</span>
        </div>
        <div class="q-grid-container">
          <div class="q-side-labels">
            <span class="q-side-label">Important</span>
            <span class="q-side-label">Not Important</span>
          </div>
          <div class="q-grid">
            <div class="q-cell"><textarea data-cell="q1" placeholder="Do first..."></textarea></div>
            <div class="q-cell"><textarea data-cell="q2" placeholder="Schedule..."></textarea></div>
            <div class="q-cell"><textarea data-cell="q3" placeholder="Delegate..."></textarea></div>
            <div class="q-cell"><textarea data-cell="q4" placeholder="Eliminate..."></textarea></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(note);

    setupEventHandlers();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  function setupEventHandlers() {
    const header = note.querySelector('.q-header');
    const textareas = note.querySelectorAll('textarea');

    // Setup each textarea
    textareas.forEach(ta => {
      ta.disabled = false;
      ta.readOnly = false;

      // Stop events from bubbling to page
      ['keydown', 'keypress', 'keyup', 'input', 'beforeinput'].forEach(evt => {
        ta.addEventListener(evt, (e) => {
          e.stopPropagation();
          e.stopImmediatePropagation();
        }, true);
      });

      ta.addEventListener('focus', (e) => e.stopPropagation(), true);
      ta.addEventListener('click', (e) => e.stopPropagation(), true);
      ta.addEventListener('mousedown', (e) => e.stopPropagation(), true);

      // Save on input (debounced)
      ta.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveContent, 300);
      });
    });

    // Button handlers
    note.querySelector('.q-refresh').onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      loadContent();
    };

    note.querySelector('.q-clear').onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      clearContent();
    };

    note.querySelector('.q-close').onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      note.classList.remove('visible');
    };

    // Drag functionality
    let dragging = false, startX, startY, origX, origY;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.q-btn')) return;
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      const rect = note.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      origX = rect.left;
      origY = rect.top;
      note.style.transform = 'none';
      note.style.left = origX + 'px';
      note.style.top = origY + 'px';
      header.classList.add('dragging');
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      note.style.left = (origX + e.clientX - startX) + 'px';
      note.style.top = (origY + e.clientY - startY) + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (dragging) {
        dragging = false;
        header.classList.remove('dragging');
      }
    });
  }

  // ============================================
  // TOGGLE
  // ============================================

  function toggleQuadrant() {
    if (!note) {
      createNote();
    }

    if (note.classList.contains('visible')) {
      note.classList.remove('visible');
    } else {
      note.classList.add('visible');
      loadContent();
    }
  }

  // ============================================
  // MESSAGE LISTENER
  // ============================================

  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'toggle') {
        toggleQuadrant();
      }
    });
  } catch (e) {}
})();
