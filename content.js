(function() {
  // Prevent double initialization
  if (window.__quadrantInitialized) return;
  window.__quadrantInitialized = true;

  // ============================================
  // CHROME API SAFETY CHECK
  // ============================================

  function isChromeAvailable() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.runtime?.id;
  }

  // ============================================
  // GLOBALS
  // ============================================

  const STORAGE_KEY = 'quadrant_global';
  let note = null;
  let shadowRoot = null;
  let saveTimeout = null;
  let isInitialized = false;

  // ============================================
  // CREATE QUADRANT NOTE
  // ============================================

  function createQuadrantNote() {
    // Create host element for shadow DOM
    const host = document.createElement('div');
    host.id = 'quadrant-host';
    document.body.appendChild(host);
    shadowRoot = host.attachShadow({ mode: 'closed' });

    // Inject styles
    const styles = document.createElement('style');
    styles.textContent = `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      .note {
        position: fixed;
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
        pointer-events: auto;
        z-index: 2147483647;
      }

      .note.visible {
        display: flex;
      }

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

      .header.dragging {
        cursor: grabbing;
      }

      .header-title {
        font-size: 9px;
        font-weight: 600;
        color: #665;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .header-controls {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .header-btn {
        background: none;
        border: none;
        color: #887;
        font-size: 9px;
        line-height: 1;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 2px;
        font-family: inherit;
      }

      .header-btn:hover {
        background: rgba(0,0,0,0.1);
        color: #443;
      }

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

      .top-labels {
        display: flex;
        height: 14px;
        padding-left: 2px;
      }

      .top-label {
        flex: 1;
        font-size: 9px;
        color: #998;
        text-transform: uppercase;
        text-align: center;
        font-weight: 500;
      }

      .grid-container {
        flex: 1;
        display: flex;
        min-height: 0;
      }

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

      .cell textarea::placeholder {
        color: #aa9;
        font-size: 10px;
      }

      .cell textarea::-webkit-scrollbar {
        width: 4px;
      }

      .cell textarea::-webkit-scrollbar-thumb {
        background: rgba(0,0,0,0.15);
        border-radius: 2px;
      }
    `;
    shadowRoot.appendChild(styles);

    // Create note element
    note = document.createElement('div');
    note.className = 'note';
    note.innerHTML = `
      <div class="header">
        <span class="header-title">Quadrant</span>
        <div class="header-controls">
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

    // Setup event handlers
    setupEventHandlers();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  function setupEventHandlers() {
    const header = note.querySelector('.header');
    const textareas = note.querySelectorAll('textarea');
    const host = shadowRoot.host;

    // Keyboard event isolation
    const KEYBOARD_EVENTS = ['keydown', 'keyup', 'keypress', 'input', 'beforeinput', 'textInput'];
    const ALL_EVENTS = [...KEYBOARD_EVENTS, 'paste', 'cut', 'copy', 'compositionstart', 'compositionend', 'compositionupdate'];

    ALL_EVENTS.forEach(eventType => {
      note.addEventListener(eventType, (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }, true);
      host.addEventListener(eventType, (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }, true);
    });

    let activeTextarea = null;
    function windowKeyHandler(e) {
      if (activeTextarea) {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    }
    KEYBOARD_EVENTS.forEach(eventType => {
      window.addEventListener(eventType, windowKeyHandler, true);
      document.addEventListener(eventType, windowKeyHandler, true);
    });

    textareas.forEach(ta => {
      ta.addEventListener('focus', () => { activeTextarea = ta; });
      ta.addEventListener('blur', () => { if (activeTextarea === ta) activeTextarea = null; });
      // Save on every input
      ta.addEventListener('input', () => saveState());
    });

    // Close button
    note.querySelector('.close-btn').onclick = (e) => {
      e.stopPropagation();
      note.classList.remove('visible');
      saveState();
    };

    // Copy button
    note.querySelector('.copy-btn').onclick = (e) => {
      e.stopPropagation();
      const labels = ['URGENT + IMPORTANT', 'NOT URGENT + IMPORTANT', 'URGENT + NOT IMPORTANT', 'NOT URGENT + NOT IMPORTANT'];
      const cells = ['q1', 'q2', 'q3', 'q4'];
      let text = '';
      cells.forEach((cell, i) => {
        const content = shadowRoot.querySelector(`[data-cell="${cell}"]`)?.value?.trim();
        if (content) {
          text += labels[i] + ':\n' + content + '\n\n';
        }
      });
      if (text) {
        navigator.clipboard.writeText(text.trim());
      }
    };

    // Clear button
    note.querySelector('.clear-btn').onclick = (e) => {
      e.stopPropagation();
      if (confirm('Clear all tasks?')) {
        textareas.forEach(ta => { ta.value = ''; });
        saveState();
      }
    };

    // Drag functionality
    let dragging = false, dragX, dragY, noteX, noteY;

    header.onmousedown = (e) => {
      if (e.target.closest('.header-btn')) return;
      e.preventDefault();
      dragging = true;
      const rect = note.getBoundingClientRect();
      noteX = rect.left;
      noteY = rect.top;
      dragX = e.clientX;
      dragY = e.clientY;
      header.classList.add('dragging');
    };

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      e.preventDefault();
      note.style.left = (noteX + e.clientX - dragX) + 'px';
      note.style.top = (noteY + e.clientY - dragY) + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (dragging) {
        dragging = false;
        header.classList.remove('dragging');
        saveState();
      }
    });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (isInitialized && note.classList.contains('visible')) {
        saveState();
      }
    });
    resizeObserver.observe(note);
  }

  // ============================================
  // SAVE STATE - BULLETPROOF
  // ============================================

  function saveState() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      if (!isChromeAvailable()) return;
      if (!note) return;

      const rect = note.getBoundingClientRect();
      const state = {
        x: parseInt(note.style.left) || rect.left || 100,
        y: parseInt(note.style.top) || rect.top || 100,
        width: note.offsetWidth || 300,
        height: note.offsetHeight || 300,
        isOpen: note.classList.contains('visible'),
        cells: {
          q1: shadowRoot.querySelector('[data-cell="q1"]')?.value || '',
          q2: shadowRoot.querySelector('[data-cell="q2"]')?.value || '',
          q3: shadowRoot.querySelector('[data-cell="q3"]')?.value || '',
          q4: shadowRoot.querySelector('[data-cell="q4"]')?.value || ''
        }
      };

      try {
        await chrome.storage.local.set({ [STORAGE_KEY]: state });
      } catch (e) {
        // Extension context invalidated - ignore
      }
    }, 300);
  }

  // ============================================
  // TOGGLE NOTE
  // ============================================

  function toggleNote() {
    if (!note) return;
    note.classList.toggle('visible');
    saveState();
  }

  // ============================================
  // INITIALIZE
  // ============================================

  async function initQuadrant() {
    if (!isChromeAvailable()) return;

    try {
      // Load saved state FIRST
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const state = result[STORAGE_KEY];

      // Create the note DOM
      createQuadrantNote();

      if (state) {
        // Restore position
        if (state.x !== undefined) {
          note.style.left = state.x + 'px';
        } else {
          note.style.left = (window.innerWidth - 300) / 2 + 'px';
        }
        if (state.y !== undefined) {
          note.style.top = state.y + 'px';
        } else {
          note.style.top = (window.innerHeight - 300) / 2 + 'px';
        }

        // Restore size
        if (state.width) note.style.width = state.width + 'px';
        if (state.height) note.style.height = state.height + 'px';

        // Restore text content - THIS IS CRITICAL
        if (state.cells) {
          const q1 = shadowRoot.querySelector('[data-cell="q1"]');
          const q2 = shadowRoot.querySelector('[data-cell="q2"]');
          const q3 = shadowRoot.querySelector('[data-cell="q3"]');
          const q4 = shadowRoot.querySelector('[data-cell="q4"]');
          if (q1) q1.value = state.cells.q1 || '';
          if (q2) q2.value = state.cells.q2 || '';
          if (q3) q3.value = state.cells.q3 || '';
          if (q4) q4.value = state.cells.q4 || '';
        }

        // Restore visibility - auto-show if was open
        if (state.isOpen) {
          note.classList.add('visible');
        }
      } else {
        // No saved state - center the note
        note.style.left = (window.innerWidth - 300) / 2 + 'px';
        note.style.top = (window.innerHeight - 300) / 2 + 'px';
      }

      isInitialized = true;

      // Listen for toggle messages from extension icon
      chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'toggle') {
          toggleNote();
        }
      });

      // Cross-tab sync
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        if (!changes[STORAGE_KEY]) return;

        const newState = changes[STORAGE_KEY].newValue;
        if (!newState) return;

        // Apply changes from other tabs
        if (newState.x !== undefined) note.style.left = newState.x + 'px';
        if (newState.y !== undefined) note.style.top = newState.y + 'px';
        if (newState.width) note.style.width = newState.width + 'px';
        if (newState.height) note.style.height = newState.height + 'px';

        if (newState.cells) {
          const q1 = shadowRoot.querySelector('[data-cell="q1"]');
          const q2 = shadowRoot.querySelector('[data-cell="q2"]');
          const q3 = shadowRoot.querySelector('[data-cell="q3"]');
          const q4 = shadowRoot.querySelector('[data-cell="q4"]');
          if (q1) q1.value = newState.cells.q1 || '';
          if (q2) q2.value = newState.cells.q2 || '';
          if (q3) q3.value = newState.cells.q3 || '';
          if (q4) q4.value = newState.cells.q4 || '';
        }

        if (newState.isOpen) {
          note.classList.add('visible');
        } else {
          note.classList.remove('visible');
        }
      });

    } catch (e) {
      console.log('Quadrant init error:', e);
    }
  }

  // Run initialization immediately
  initQuadrant();
})();
