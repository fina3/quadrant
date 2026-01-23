(function() {
  if (document.getElementById('quadrant-note')) return;

  const STORAGE_KEY = 'quadrant_' + location.hostname;
  const DEBOUNCE_MS = 500;
  let saveTimeout = null;

  // Create note
  const note = document.createElement('div');
  note.id = 'quadrant-note';
  note.innerHTML = `
    <div class="header">
      <div class="header-left">
        <span class="header-title">Quadrant</span>
      </div>
      <div class="header-controls">
        <button class="header-btn copy-btn" title="Copy to clipboard">📋</button>
        <button class="header-btn clear-btn" title="Clear all">Clear</button>
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
          <div class="cell"><textarea data-cell="0" placeholder="Do First"></textarea></div>
          <div class="cell"><textarea data-cell="1" placeholder="Schedule"></textarea></div>
          <div class="cell"><textarea data-cell="2" placeholder="Delegate"></textarea></div>
          <div class="cell"><textarea data-cell="3" placeholder="Eliminate"></textarea></div>
        </div>
      </div>
    </div>
  `;

  // Default position (centered)
  note.style.left = (window.innerWidth - 300) / 2 + 'px';
  note.style.top = (window.innerHeight - 300) / 2 + 'px';

  document.body.appendChild(note);

  const textareas = note.querySelectorAll('textarea');
  const header = note.querySelector('.header');

  // Close button
  note.querySelector('.close-btn').onclick = (e) => {
    e.stopPropagation();
    note.remove();
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
      chrome.storage.local.remove(STORAGE_KEY);
    }
  };

  // Drag by header
  let dragging = false, dragX, dragY;

  header.onmousedown = (e) => {
    if (e.target.closest('.header-btn')) return;
    dragging = true;
    dragX = e.clientX - note.offsetLeft;
    dragY = e.clientY - note.offsetTop;
    header.classList.add('dragging');
  };

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    note.style.left = (e.clientX - dragX) + 'px';
    note.style.top = (e.clientY - dragY) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      header.classList.remove('dragging');
      save();
    }
  });

  // Track resize
  const resizeObserver = new ResizeObserver(() => save());
  resizeObserver.observe(note);

  // Save state
  function save() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const state = {
        x: note.offsetLeft,
        y: note.offsetTop,
        width: note.offsetWidth,
        height: note.offsetHeight,
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
    }
  });
})();
