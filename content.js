(function() {
  if (window.__quadrantInitialized) return;
  window.__quadrantInitialized = true;

  const STORAGE_KEY = 'quadrant_' + location.hostname;
  const DEBOUNCE_MS = 500;
  let saveTimeout = null;
  let note = null;
  let shadowRoot = null;
  let isVisible = false;
  let activeTextarea = null;

  // Create host and shadow DOM
  const host = document.createElement('div');
  host.id = 'quadrant-host';
  document.body.appendChild(host);
  shadowRoot = host.attachShadow({ mode: 'closed' });

  // Inject styles into shadow DOM
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
          <div class="cell"><textarea data-cell="0" placeholder="Add tasks..." tabindex="0"></textarea></div>
          <div class="cell"><textarea data-cell="1" placeholder="Add tasks..." tabindex="0"></textarea></div>
          <div class="cell"><textarea data-cell="2" placeholder="Add tasks..." tabindex="0"></textarea></div>
          <div class="cell"><textarea data-cell="3" placeholder="Add tasks..." tabindex="0"></textarea></div>
        </div>
      </div>
    </div>
  `;

  shadowRoot.appendChild(note);

  const textareas = note.querySelectorAll('textarea');
  const header = note.querySelector('.header');

  // ============================================
  // KEYBOARD EVENT ISOLATION
  // Prevents host pages (Gmail, Notion, Slack, etc.) from capturing keystrokes
  // ============================================

  const KEYBOARD_EVENTS = ['keydown', 'keyup', 'keypress', 'input', 'beforeinput', 'textInput'];
  const ALL_EVENTS = [...KEYBOARD_EVENTS, 'paste', 'cut', 'copy', 'compositionstart', 'compositionend', 'compositionupdate'];

  // Stop events at the note level (capture phase)
  ALL_EVENTS.forEach(eventType => {
    note.addEventListener(eventType, (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, true);
  });

  // Stop events at the host element level
  ALL_EVENTS.forEach(eventType => {
    host.addEventListener(eventType, (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, true);
  });

  // Intercept at window/document level when our textarea is focused
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

  // Track active textarea
  textareas.forEach(ta => {
    ta.addEventListener('focus', () => {
      activeTextarea = ta;
    });
    ta.addEventListener('blur', () => {
      if (activeTextarea === ta) {
        activeTextarea = null;
      }
    });
  });

  // ============================================
  // CORE FUNCTIONALITY
  // ============================================

  // Toggle visibility
  function toggle() {
    isVisible = !isVisible;
    note.classList.toggle('visible', isVisible);
    save();
  }

  function show() {
    isVisible = true;
    note.classList.add('visible');
  }

  function hide() {
    isVisible = false;
    note.classList.remove('visible');
    save();
  }

  // Close button hides
  note.querySelector('.close-btn').onclick = (e) => {
    e.stopPropagation();
    hide();
  };

  // Copy button
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

  // Clear button
  note.querySelector('.clear-btn').onclick = (e) => {
    e.stopPropagation();
    if (confirm('Clear all tasks?')) {
      textareas.forEach(ta => ta.value = '');
      save();
    }
  };

  // Smooth drag
  let dragging = false, dragX, dragY;
  let noteX, noteY;

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
    const dx = e.clientX - dragX;
    const dy = e.clientY - dragY;
    note.style.left = (noteX + dx) + 'px';
    note.style.top = (noteY + dy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      header.classList.remove('dragging');
      save();
    }
  });

  // Track resize
  const resizeObserver = new ResizeObserver(() => {
    if (isVisible) save();
  });
  resizeObserver.observe(note);

  // Save state
  function save() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const rect = note.getBoundingClientRect();
      const state = {
        x: rect.left,
        y: rect.top,
        width: note.offsetWidth,
        height: note.offsetHeight,
        visible: isVisible,
        cells: {}
      };
      textareas.forEach(ta => {
        state.cells[ta.dataset.cell] = ta.value;
      });
      chrome.storage.local.set({ [STORAGE_KEY]: state });
    }, DEBOUNCE_MS);
  }

  // Save on text input
  textareas.forEach(ta => {
    ta.addEventListener('input', save);
  });

  // Load saved state
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    const state = result[STORAGE_KEY];
    if (state) {
      if (state.x !== undefined) note.style.left = state.x + 'px';
      if (state.y !== undefined) note.style.top = state.y + 'px';
      if (state.width) note.style.width = state.width + 'px';
      if (state.height) note.style.height = state.height + 'px';
      if (state.cells) {
        textareas.forEach(ta => {
          if (state.cells[ta.dataset.cell]) {
            ta.value = state.cells[ta.dataset.cell];
          }
        });
      }
      if (state.visible) {
        show();
      }
    } else {
      // Default position centered
      note.style.left = (window.innerWidth - 300) / 2 + 'px';
      note.style.top = (window.innerHeight - 300) / 2 + 'px';
    }
  });

  // Listen for toggle messages
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'toggle') {
      toggle();
    }
  });
})();
