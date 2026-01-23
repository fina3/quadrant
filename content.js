(function() {
  if (window.__quadrantInitialized) return;
  window.__quadrantInitialized = true;

  let note = null;
  let shadowRoot = null;
  let saveTimeout = null;

  // ============================================
  // SAFE STORAGE WRAPPERS
  // ============================================

  async function safeGet() {
    try {
      if (!chrome?.storage?.local) {
        console.log('Quadrant: chrome.storage not available');
        return null;
      }
      const result = await chrome.storage.local.get('quadrant_global');
      console.log('Quadrant LOADED:', JSON.stringify(result.quadrant_global));
      return result.quadrant_global || null;
    } catch (e) {
      console.log('Quadrant: load FAILED', e.message);
      return null;
    }
  }

  async function safeSave(content) {
    try {
      if (!chrome?.storage?.local) {
        console.log('Quadrant: chrome.storage not available');
        return false;
      }
      console.log('Quadrant SAVING:', JSON.stringify(content));
      await chrome.storage.local.set({ quadrant_global: content });
      console.log('Quadrant: save successful');
      return true;
    } catch (e) {
      console.log('Quadrant: save FAILED', e.message);
      return false;
    }
  }

  // ============================================
  // DEBOUNCED SAVE
  // ============================================

  function saveContent() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      const content = {
        q1: shadowRoot?.querySelector('[data-cell="q1"]')?.value || '',
        q2: shadowRoot?.querySelector('[data-cell="q2"]')?.value || '',
        q3: shadowRoot?.querySelector('[data-cell="q3"]')?.value || '',
        q4: shadowRoot?.querySelector('[data-cell="q4"]')?.value || ''
      };
      const saved = await safeSave(content);
      if (!saved) {
        console.log('Quadrant: could not save, extension may need refresh');
      }
    }, 300);
  }

  // ============================================
  // LOAD CONTENT
  // ============================================

  async function loadContent() {
    const content = await safeGet();
    if (content) {
      const q1 = shadowRoot?.querySelector('[data-cell="q1"]');
      const q2 = shadowRoot?.querySelector('[data-cell="q2"]');
      const q3 = shadowRoot?.querySelector('[data-cell="q3"]');
      const q4 = shadowRoot?.querySelector('[data-cell="q4"]');
      if (q1) q1.value = content.q1 || '';
      if (q2) q2.value = content.q2 || '';
      if (q3) q3.value = content.q3 || '';
      if (q4) q4.value = content.q4 || '';
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
        height: 16px;
        min-height: 16px;
        background: #f0e098;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 6px;
        cursor: grab;
        user-select: none;
      }

      .header.dragging { cursor: grabbing; }

      .header-title {
        font-size: 9px;
        font-weight: 600;
        color: #665;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .header-controls { display: flex; align-items: center; gap: 4px; }

      .header-btn {
        background: none;
        border: none;
        color: #887;
        font-size: 9px;
        line-height: 1;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 2px;
      }

      .header-btn:hover { background: rgba(0,0,0,0.1); color: #443; }
      .refresh-btn { font-size: 12px; }
      .copy-btn { font-size: 11px; }
      .clear-btn { font-size: 8px; text-transform: uppercase; }
      .close-btn { font-size: 14px; padding: 0 3px; }

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
        <span class="header-title">Quadrant</span>
        <div class="header-controls">
          <button class="header-btn refresh-btn" title="Refresh from cloud">↻</button>
          <button class="header-btn copy-btn" title="Copy to clipboard">📋</button>
          <button class="header-btn clear-btn" title="Clear all">Clear</button>
          <button class="header-btn close-btn" title="Hide">&times;</button>
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
            <div class="cell"><textarea data-cell="q1" placeholder="Add tasks..." tabindex="0"></textarea></div>
            <div class="cell"><textarea data-cell="q2" placeholder="Add tasks..." tabindex="0"></textarea></div>
            <div class="cell"><textarea data-cell="q3" placeholder="Add tasks..." tabindex="0"></textarea></div>
            <div class="cell"><textarea data-cell="q4" placeholder="Add tasks..." tabindex="0"></textarea></div>
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
    const host = shadowRoot.host;

    // Keyboard isolation
    const EVENTS = ['keydown', 'keyup', 'keypress', 'input', 'beforeinput', 'textInput', 'paste', 'cut', 'copy'];
    EVENTS.forEach(evt => {
      note.addEventListener(evt, e => { e.stopPropagation(); e.stopImmediatePropagation(); }, true);
      host.addEventListener(evt, e => { e.stopPropagation(); e.stopImmediatePropagation(); }, true);
    });

    let activeTextarea = null;
    ['keydown', 'keyup', 'keypress', 'input'].forEach(evt => {
      window.addEventListener(evt, e => { if (activeTextarea) { e.stopPropagation(); e.stopImmediatePropagation(); } }, true);
    });

    textareas.forEach(ta => {
      ta.addEventListener('focus', () => { activeTextarea = ta; });
      ta.addEventListener('blur', () => { if (activeTextarea === ta) activeTextarea = null; });
      ta.addEventListener('input', saveContent);
    });

    // Close
    note.querySelector('.close-btn').onclick = (e) => {
      e.stopPropagation();
      note.classList.remove('visible');
    };

    // Copy
    note.querySelector('.copy-btn').onclick = (e) => {
      e.stopPropagation();
      const labels = ['URGENT + IMPORTANT', 'NOT URGENT + IMPORTANT', 'URGENT + NOT IMPORTANT', 'NOT URGENT + NOT IMPORTANT'];
      let text = '';
      ['q1', 'q2', 'q3', 'q4'].forEach((cell, i) => {
        const val = shadowRoot.querySelector(`[data-cell="${cell}"]`)?.value?.trim();
        if (val) text += labels[i] + ':\n' + val + '\n\n';
      });
      if (text) navigator.clipboard.writeText(text.trim());
    };

    // Refresh
    note.querySelector('.refresh-btn').onclick = async (e) => {
      e.stopPropagation();
      await loadContent();
      console.log('Quadrant: manually refreshed');
    };

    // Clear
    note.querySelector('.clear-btn').onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('Clear all tasks from Quadrant?')) return;

      // Clear textareas visually
      textareas.forEach(ta => { ta.value = ''; });

      // Clear global storage and VERIFY it worked
      try {
        const emptyContent = { q1: '', q2: '', q3: '', q4: '' };
        await chrome.storage.local.set({ quadrant_global: emptyContent });

        // Verify
        const check = await chrome.storage.local.get('quadrant_global');
        console.log('Quadrant CLEARED, verified:', JSON.stringify(check.quadrant_global));
      } catch (err) {
        console.log('Quadrant: clear FAILED', err.message);
        alert('Clear failed - extension may need refresh');
      }
    };

    // Drag
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
  // TOGGLE QUADRANT
  // ============================================

  function toggleQuadrant() {
    if (!note) {
      createNote();
    }

    if (note.classList.contains('visible')) {
      note.classList.remove('visible');
    } else {
      note.classList.add('visible');
      loadContent(); // Always reload from storage when opening
    }
  }

  // ============================================
  // LISTEN FOR EXTENSION ICON CLICK
  // ============================================

  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'toggle') {
        toggleQuadrant();
      }
    });
  } catch (e) {}
})();
