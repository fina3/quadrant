(function() {
  if (window.__quadrantInitialized) return;
  window.__quadrantInitialized = true;

  const GLOBAL_KEY = 'quadrant_global';
  const SITE_KEY = 'quadrant_site_' + location.hostname;
  const DEBOUNCE_MS = 300;

  let saveTimeout = null;
  let note = null;
  let shadowRoot = null;
  let isVisible = false;
  let activeTextarea = null;
  let isPinned = false;
  let pinBtn = null;
  let textareas = null;
  let isLoading = true;

  // ============================================
  // SAFE STORAGE HELPERS
  // ============================================

  async function safeStorageGet(keys) {
    try {
      return await chrome.storage.local.get(keys);
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) {
        console.log('Quadrant: extension reloaded, storage unavailable');
      }
      return {};
    }
  }

  async function safeStorageSet(data) {
    try {
      await chrome.storage.local.set(data);
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) {
        console.log('Quadrant: extension reloaded, storage unavailable');
      }
    }
  }

  async function safeStorageRemove(key) {
    try {
      await chrome.storage.local.remove(key);
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) {
        console.log('Quadrant: extension reloaded, storage unavailable');
      }
    }
  }

  // ============================================
  // CREATE DOM STRUCTURE
  // ============================================

  const host = document.createElement('div');
  host.id = 'quadrant-host';
  document.body.appendChild(host);
  shadowRoot = host.attachShadow({ mode: 'closed' });

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
      will-change: transform;
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
    .pin-btn { font-size: 10px; opacity: 0.5; }
    .pin-btn.pinned { opacity: 1; }
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

  note = document.createElement('div');
  note.className = 'note';
  note.innerHTML = `
    <div class="header">
      <span class="header-title">Quadrant</span>
      <div class="header-controls">
        <button class="header-btn copy-btn" title="Copy to clipboard">📋</button>
        <button class="header-btn pin-btn" title="Pin to this site">📌</button>
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
          <div class="cell"><textarea data-cell="0" placeholder="Add tasks..." tabindex="0"></textarea></div>
          <div class="cell"><textarea data-cell="1" placeholder="Add tasks..." tabindex="0"></textarea></div>
          <div class="cell"><textarea data-cell="2" placeholder="Add tasks..." tabindex="0"></textarea></div>
          <div class="cell"><textarea data-cell="3" placeholder="Add tasks..." tabindex="0"></textarea></div>
        </div>
      </div>
    </div>
  `;

  shadowRoot.appendChild(note);

  textareas = note.querySelectorAll('textarea');
  const header = note.querySelector('.header');
  pinBtn = note.querySelector('.pin-btn');

  // ============================================
  // KEYBOARD EVENT ISOLATION
  // ============================================

  const KEYBOARD_EVENTS = ['keydown', 'keyup', 'keypress', 'input', 'beforeinput', 'textInput'];
  const ALL_EVENTS = [...KEYBOARD_EVENTS, 'paste', 'cut', 'copy', 'compositionstart', 'compositionend', 'compositionupdate'];

  ALL_EVENTS.forEach(eventType => {
    note.addEventListener(eventType, (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, true);
  });

  ALL_EVENTS.forEach(eventType => {
    host.addEventListener(eventType, (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, true);
  });

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
  });

  // ============================================
  // STORAGE KEY LOGIC
  // ============================================

  function getCurrentStorageKey() {
    return isPinned ? SITE_KEY : GLOBAL_KEY;
  }

  function updatePinUI() {
    if (isPinned) {
      pinBtn.classList.add('pinned');
      pinBtn.title = 'Unpin from this site (using site-specific note)';
    } else {
      pinBtn.classList.remove('pinned');
      pinBtn.title = 'Pin to this site (using global note)';
    }
  }

  // ============================================
  // VISIBILITY FUNCTIONS
  // ============================================

  function showNote() {
    isVisible = true;
    note.classList.add('visible');
  }

  function hideNote() {
    isVisible = false;
    note.classList.remove('visible');
  }

  function toggleNote() {
    if (isVisible) {
      hideNote();
    } else {
      showNote();
    }
    scheduleSave();
  }

  // ============================================
  // SAVE / LOAD
  // ============================================

  function scheduleSave() {
    if (isLoading) return;

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const rect = note.getBoundingClientRect();
      const state = {
        x: rect.left,
        y: rect.top,
        width: note.offsetWidth,
        height: note.offsetHeight,
        isOpen: isVisible,
        cells: {
          '0': textareas[0].value,
          '1': textareas[1].value,
          '2': textareas[2].value,
          '3': textareas[3].value
        }
      };
      safeStorageSet({ [getCurrentStorageKey()]: state });
    }, DEBOUNCE_MS);
  }

  function applyState(state) {
    // Position
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

    // Size
    note.style.width = (state.width || 300) + 'px';
    note.style.height = (state.height || 300) + 'px';

    // Cell contents
    if (state.cells) {
      textareas.forEach(ta => {
        ta.value = state.cells[ta.dataset.cell] || '';
      });
    } else {
      textareas.forEach(ta => { ta.value = ''; });
    }

    // Visibility - auto-show if was open
    if (state.isOpen || state.visible) {
      showNote();
    } else {
      hideNote();
    }
  }

  function setDefaults() {
    note.style.left = (window.innerWidth - 300) / 2 + 'px';
    note.style.top = (window.innerHeight - 300) / 2 + 'px';
    note.style.width = '300px';
    note.style.height = '300px';
    textareas.forEach(ta => { ta.value = ''; });
    hideNote();
  }

  async function loadState() {
    isLoading = true;

    const result = await safeStorageGet([SITE_KEY, GLOBAL_KEY]);

    if (result[SITE_KEY]) {
      // Site has pinned note
      isPinned = true;
      updatePinUI();
      applyState(result[SITE_KEY]);
    } else if (result[GLOBAL_KEY]) {
      // Use global note
      isPinned = false;
      updatePinUI();
      applyState(result[GLOBAL_KEY]);
    } else {
      // No saved state
      isPinned = false;
      updatePinUI();
      setDefaults();
    }

    isLoading = false;
  }

  async function loadFromKey(key) {
    isLoading = true;
    const result = await safeStorageGet([key]);
    if (result[key]) {
      applyState(result[key]);
    } else {
      setDefaults();
    }
    isLoading = false;
  }

  // ============================================
  // BUTTON HANDLERS
  // ============================================

  note.querySelector('.close-btn').onclick = (e) => {
    e.stopPropagation();
    hideNote();
    scheduleSave();
  };

  note.querySelector('.copy-btn').onclick = (e) => {
    e.stopPropagation();
    const labels = [
      'URGENT + IMPORTANT',
      'NOT URGENT + IMPORTANT',
      'URGENT + NOT IMPORTANT',
      'NOT URGENT + NOT IMPORTANT'
    ];
    let text = '';
    textareas.forEach((ta, i) => {
      const content = ta.value.trim();
      if (content) {
        text += labels[i] + ':\n' + content + '\n\n';
      }
    });
    if (text) {
      navigator.clipboard.writeText(text.trim());
    }
  };

  pinBtn.onclick = async (e) => {
    e.stopPropagation();

    if (isPinned) {
      // Unpinning: delete site entry, switch to global
      await safeStorageRemove(SITE_KEY);
      isPinned = false;
      updatePinUI();
      await loadFromKey(GLOBAL_KEY);
    } else {
      // Pinning: save current state to site key
      isPinned = true;
      updatePinUI();
      scheduleSave();
    }
  };

  note.querySelector('.clear-btn').onclick = (e) => {
    e.stopPropagation();
    if (confirm('Clear all tasks?')) {
      textareas.forEach(ta => { ta.value = ''; });
      scheduleSave();
    }
  };

  // ============================================
  // DRAG
  // ============================================

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
      scheduleSave();
    }
  });

  // ============================================
  // RESIZE
  // ============================================

  const resizeObserver = new ResizeObserver(() => {
    if (isVisible && !isLoading) scheduleSave();
  });
  resizeObserver.observe(note);

  // ============================================
  // TEXT INPUT
  // ============================================

  textareas.forEach(ta => {
    ta.addEventListener('input', scheduleSave);
  });

  // ============================================
  // CROSS-TAB SYNC
  // ============================================

  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (isLoading) return;

      const relevantKey = isPinned ? SITE_KEY : GLOBAL_KEY;

      if (changes[relevantKey]?.newValue) {
        isLoading = true;
        applyState(changes[relevantKey].newValue);
        isLoading = false;
      }

      // Global mode: site key appeared -> switch to pinned
      if (!isPinned && changes[SITE_KEY]?.newValue) {
        isPinned = true;
        updatePinUI();
        isLoading = true;
        applyState(changes[SITE_KEY].newValue);
        isLoading = false;
      }

      // Pinned mode: site key removed -> switch to global
      if (isPinned && changes[SITE_KEY] && !changes[SITE_KEY].newValue) {
        isPinned = false;
        updatePinUI();
        loadFromKey(GLOBAL_KEY);
      }
    });
  } catch (e) {
    console.log('Quadrant: storage listener unavailable');
  }

  // ============================================
  // MESSAGE LISTENER (for extension icon click)
  // ============================================

  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'toggle') {
        toggleNote();
      }
    });
  } catch (e) {
    console.log('Quadrant: message listener unavailable');
  }

  // ============================================
  // INIT: Load state immediately
  // ============================================

  loadState();
})();
