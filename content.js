(function() {
  if (window.__quadrantInitialized) return;
  window.__quadrantInitialized = true;

  const STORAGE_KEY = 'quadrant_global';
  let note = null;
  let shadowRoot = null;
  let saveTimeout = null;

  // ============================================
  // STORAGE FUNCTIONS
  // ============================================

  async function loadContent() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const data = result[STORAGE_KEY] || {};
      const q1 = shadowRoot?.querySelector('[data-cell="q1"]');
      const q2 = shadowRoot?.querySelector('[data-cell="q2"]');
      const q3 = shadowRoot?.querySelector('[data-cell="q3"]');
      const q4 = shadowRoot?.querySelector('[data-cell="q4"]');
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
        q1: shadowRoot?.querySelector('[data-cell="q1"]')?.value || '',
        q2: shadowRoot?.querySelector('[data-cell="q2"]')?.value || '',
        q3: shadowRoot?.querySelector('[data-cell="q3"]')?.value || '',
        q4: shadowRoot?.querySelector('[data-cell="q4"]')?.value || ''
      };
      await chrome.storage.local.set({ [STORAGE_KEY]: data });
    } catch (e) {
      console.log('Quadrant: save failed', e.message);
    }
  }

  async function clearContent() {
    if (!confirm('Clear all tasks?')) return;
    shadowRoot?.querySelectorAll('[data-cell]').forEach(ta => ta.value = '');
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
    const host = document.createElement('div');
    host.id = 'quadrant-host';
    document.body.appendChild(host);
    shadowRoot = host.attachShadow({ mode: 'closed' });

    const styles = document.createElement('style');
    styles.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }

      .note {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 300px;
        height: 300px;
        min-width: 200px;
        min-height: 180px;
        background: #fff9b1;
        border-radius: 4px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.15);
        display: none;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        resize: both;
        overflow: hidden;
        z-index: 2147483647;
      }

      .note.visible { display: flex; }

      .header {
        height: 20px;
        min-height: 20px;
        background: #f0e098;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 8px;
        cursor: grab;
        user-select: none;
      }

      .header.dragging { cursor: grabbing; }

      .header-title {
        font-size: 10px;
        font-weight: 700;
        color: #665;
        letter-spacing: 0.5px;
      }

      .header-controls { display: flex; align-items: center; gap: 6px; }

      .header-btn {
        background: none;
        border: none;
        color: #776;
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 2px;
      }

      .header-btn:hover { background: rgba(0,0,0,0.1); color: #443; }
      .clear-btn { font-size: 9px; font-weight: 600; }
      .close-btn { font-size: 16px; padding: 0 2px; }

      .content {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 4px 10px 10px 24px;
        min-height: 0;
      }

      .top-labels { display: flex; height: 14px; padding-left: 2px; }
      .top-label {
        flex: 1;
        font-size: 9px;
        color: #998;
        text-transform: uppercase;
        text-align: center;
        font-weight: 500;
      }

      .grid-container { flex: 1; display: flex; min-height: 0; }

      .side-labels {
        width: 16px;
        margin-left: -20px;
        display: flex;
        flex-direction: column;
      }

      .side-label {
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

      .grid {
        flex: 1;
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr;
        gap: 2px;
        background: rgba(0,0,0,0.06);
        border-radius: 2px;
        min-height: 0;
      }

      .cell {
        background: rgba(255,255,255,0.3);
        min-height: 0;
        min-width: 0;
        border-radius: 1px;
      }

      .cell textarea {
        width: 100%;
        height: 100%;
        border: none;
        background: transparent;
        resize: none;
        padding: 6px;
        font-family: inherit;
        font-size: 11px;
        line-height: 1.4;
        color: #333;
        outline: none;
        overflow-y: auto;
      }

      .cell textarea::placeholder { color: #aa9; font-size: 10px; }
      .cell textarea::-webkit-scrollbar { width: 4px; }
      .cell textarea::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 2px; }
    `;
    shadowRoot.appendChild(styles);

    note = document.createElement('div');
    note.className = 'note';
    note.innerHTML = `
      <div class="header">
        <span class="header-title">QUADRANT</span>
        <div class="header-controls">
          <button class="header-btn refresh-btn" title="Refresh">↻</button>
          <button class="header-btn clear-btn" title="Clear all">CLEAR</button>
          <button class="header-btn close-btn" title="Close">&times;</button>
        </div>
      </div>
      <div class="content">
        <div class="top-labels">
          <span class="top-label">Urgent</span>
          <span class="top-label">Not Urgent</span>
        </div>
        <div class="grid-container">
          <div class="side-labels">
            <span class="side-label">Important</span>
            <span class="side-label">Not Important</span>
          </div>
          <div class="grid">
            <div class="cell"><textarea data-cell="q1" placeholder="Do first..." tabindex="0"></textarea></div>
            <div class="cell"><textarea data-cell="q2" placeholder="Schedule..." tabindex="0"></textarea></div>
            <div class="cell"><textarea data-cell="q3" placeholder="Delegate..." tabindex="0"></textarea></div>
            <div class="cell"><textarea data-cell="q4" placeholder="Eliminate..." tabindex="0"></textarea></div>
          </div>
        </div>
      </div>
    `;
    shadowRoot.appendChild(note);

    setupEventHandlers();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  function setupEventHandlers() {
    const header = note.querySelector('.header');
    const textareas = note.querySelectorAll('textarea');

    // Setup each textarea with event isolation
    textareas.forEach(ta => {
      // Ensure textarea is editable
      ta.disabled = false;
      ta.readOnly = false;

      // Stop all keyboard events from bubbling to the page
      ['keydown', 'keypress', 'keyup', 'input', 'beforeinput'].forEach(evt => {
        ta.addEventListener(evt, (e) => {
          e.stopPropagation();
          e.stopImmediatePropagation();
        }, true);
      });

      // Stop focus/click from being captured by page
      ta.addEventListener('focus', (e) => {
        e.stopPropagation();
      }, true);

      ta.addEventListener('click', (e) => {
        e.stopPropagation();
      }, true);

      // Debounced save on input
      ta.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveContent, 300);
      });
    });

    // Refresh button
    note.querySelector('.refresh-btn').onclick = (e) => {
      e.stopPropagation();
      loadContent();
    };

    // Clear button
    note.querySelector('.clear-btn').onclick = (e) => {
      e.stopPropagation();
      clearContent();
    };

    // Close button
    note.querySelector('.close-btn').onclick = (e) => {
      e.stopPropagation();
      note.classList.remove('visible');
    };

    // Drag functionality
    let dragging = false, startX, startY, origX, origY;
    header.onmousedown = (e) => {
      if (e.target.closest('.header-btn')) return;
      e.preventDefault();
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
    };

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
      loadContent(); // Always fetch latest when opening
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
