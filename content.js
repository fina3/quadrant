(function() {
  if (document.getElementById('quadrant-note')) return;

  const STORAGE_KEY = 'quadrant_global';
  let isDragging = false;
  let dragOffsetX, dragOffsetY;

  // Create note
  const note = document.createElement('div');
  note.id = 'quadrant-note';
  note.innerHTML = `
    <div id="quadrant-header">
      <span>QUADRANT</span>
      <div>
        <button id="q-refresh" title="Refresh">↻</button>
        <button id="q-copy" title="Copy to clipboard">📋</button>
        <button id="q-clear" title="Clear all">CLEAR</button>
        <button id="q-close" title="Close">×</button>
      </div>
    </div>
    <div id="quadrant-body">
      <div id="quadrant-top-labels">
        <span>URGENT</span>
        <span>NOT URGENT</span>
      </div>
      <div id="quadrant-main">
        <div id="quadrant-side-labels">
          <span>IMPORTANT</span>
          <span>NOT IMPORTANT</span>
        </div>
        <div id="quadrant-grid">
          <textarea data-cell="q1"></textarea>
          <textarea data-cell="q2"></textarea>
          <textarea data-cell="q3"></textarea>
          <textarea data-cell="q4"></textarea>
        </div>
      </div>
    </div>
    <div id="quadrant-resize">⟋</div>
  `;
  document.body.appendChild(note);

  // Get elements
  const header = document.getElementById('quadrant-header');
  const textareas = note.querySelectorAll('textarea');

  // DRAG FUNCTIONALITY
  header.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    isDragging = true;
    dragOffsetX = e.clientX - note.offsetLeft;
    dragOffsetY = e.clientY - note.offsetTop;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    note.style.left = (e.clientX - dragOffsetX) + 'px';
    note.style.top = (e.clientY - dragOffsetY) + 'px';
    note.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // RESIZE FUNCTIONALITY
  let isResizing = false;

  document.getElementById('quadrant-resize').addEventListener('mousedown', (e) => {
    isResizing = true;
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const rect = note.getBoundingClientRect();
    const newWidth = e.clientX - rect.left;
    const newHeight = e.clientY - rect.top;

    // Minimum size
    if (newWidth > 200) note.style.width = newWidth + 'px';
    if (newHeight > 200) note.style.height = newHeight + 'px';
  });

  document.addEventListener('mouseup', () => {
    isResizing = false;
  });

  // KEYBOARD - stop page from capturing
  textareas.forEach(ta => {
    ['keydown', 'keypress', 'keyup'].forEach(evt => {
      ta.addEventListener(evt, (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }, true);
    });
  });

  // STORAGE
  async function loadContent() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const data = result[STORAGE_KEY] || {};
      note.querySelector('[data-cell="q1"]').value = data.q1 || '';
      note.querySelector('[data-cell="q2"]').value = data.q2 || '';
      note.querySelector('[data-cell="q3"]').value = data.q3 || '';
      note.querySelector('[data-cell="q4"]').value = data.q4 || '';
    } catch (e) {
      console.log('Quadrant load error:', e);
    }
  }

  async function saveContent() {
    try {
      const data = {
        q1: note.querySelector('[data-cell="q1"]').value,
        q2: note.querySelector('[data-cell="q2"]').value,
        q3: note.querySelector('[data-cell="q3"]').value,
        q4: note.querySelector('[data-cell="q4"]').value
      };
      await chrome.storage.local.set({ [STORAGE_KEY]: data });
    } catch (e) {
      console.log('Quadrant save error:', e);
    }
  }

  async function clearContent() {
    if (!confirm('Clear all tasks?')) return;
    textareas.forEach(ta => ta.value = '');
    try {
      await chrome.storage.local.remove(STORAGE_KEY);
    } catch (e) {}
  }

  // AUTO-SAVE on typing
  let saveTimer;
  textareas.forEach(ta => {
    ta.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveContent, 300);
    });
  });

  // BUTTONS
  document.getElementById('q-refresh').addEventListener('click', loadContent);
  document.getElementById('q-copy').addEventListener('click', async () => {
    const q1 = document.querySelector('[data-cell="q1"]').value;
    const q2 = document.querySelector('[data-cell="q2"]').value;
    const q3 = document.querySelector('[data-cell="q3"]').value;
    const q4 = document.querySelector('[data-cell="q4"]').value;

    const text = `URGENT + IMPORTANT:\n${q1}\n\nNOT URGENT + IMPORTANT:\n${q2}\n\nURGENT + NOT IMPORTANT:\n${q3}\n\nNOT URGENT + NOT IMPORTANT:\n${q4}`;

    await navigator.clipboard.writeText(text);

    // Brief visual feedback
    const btn = document.getElementById('q-copy');
    btn.textContent = '✓';
    setTimeout(() => btn.textContent = '📋', 1000);
  });
  document.getElementById('q-clear').addEventListener('click', clearContent);
  document.getElementById('q-close').addEventListener('click', () => {
    note.style.display = 'none';
  });

  // TOGGLE function for background.js
  function toggleQuadrant() {
    if (note.style.display === 'none' || note.style.display === '') {
      note.style.display = 'block';
      loadContent();
    } else {
      note.style.display = 'none';
    }
  }

  // Listen for toggle message
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'toggle') {
      toggleQuadrant();
    }
  });

})();
