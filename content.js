(function() {
  if (document.getElementById('quadrant-note')) return;

  const STORAGE_KEY = 'quadrant_' + location.hostname;

  // Create note
  const note = document.createElement('div');
  note.id = 'quadrant-note';
  note.innerHTML = `
    <div class="header">
      <span class="header-title">Quadrant</span>
      <button class="close-btn">&times;</button>
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

  // Position centered
  note.style.left = (window.innerWidth - 300) / 2 + 'px';
  note.style.top = (window.innerHeight - 300) / 2 + 'px';

  document.body.appendChild(note);

  // Close button
  note.querySelector('.close-btn').onclick = () => note.remove();

  // Drag by header
  let dragging = false, dragX, dragY;
  const header = note.querySelector('.header');

  header.onmousedown = (e) => {
    if (e.target.classList.contains('close-btn')) return;
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
    dragging = false;
    header.classList.remove('dragging');
  });

  // Save/load
  const textareas = note.querySelectorAll('textarea');
  let saveTimeout = null;

  function save() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const data = {};
      textareas.forEach(ta => {
        data[ta.dataset.cell] = ta.value;
      });
      chrome.storage.local.set({ [STORAGE_KEY]: data });
    }, 300);
  }

  textareas.forEach(ta => {
    ta.addEventListener('input', save);
  });

  // Load saved data
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    if (result[STORAGE_KEY]) {
      textareas.forEach(ta => {
        if (result[STORAGE_KEY][ta.dataset.cell]) {
          ta.value = result[STORAGE_KEY][ta.dataset.cell];
        }
      });
    }
  });
})();
