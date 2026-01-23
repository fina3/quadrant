(function() {
  if (document.getElementById('quadrant-overlay')) return;

  const STORAGE_KEY = 'quadrant_' + location.hostname;
  let notes = {};
  let saveTimeout = null;

  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'quadrant-overlay';
  overlay.innerHTML = `
    <div class="header">
      <span class="header-title">Quadrant</span>
      <button class="header-btn close-btn">&times;</button>
    </div>
    <div class="grid">
      <div class="quadrant" data-q="1"><span class="quadrant-label">Do First</span></div>
      <div class="quadrant" data-q="2"><span class="quadrant-label">Schedule</span></div>
      <div class="quadrant" data-q="3"><span class="quadrant-label">Delegate</span></div>
      <div class="quadrant" data-q="4"><span class="quadrant-label">Eliminate</span></div>
    </div>
  `;

  // Position centered
  overlay.style.left = (window.innerWidth - 420) / 2 + 'px';
  overlay.style.top = (window.innerHeight - 420) / 2 + 'px';

  document.body.appendChild(overlay);

  // Close button
  overlay.querySelector('.close-btn').onclick = () => overlay.remove();

  // Drag overlay
  let dragging = false, dragX, dragY;
  const header = overlay.querySelector('.header');

  header.onmousedown = (e) => {
    if (e.target.classList.contains('header-btn')) return;
    dragging = true;
    dragX = e.clientX - overlay.offsetLeft;
    dragY = e.clientY - overlay.offsetTop;
    header.classList.add('dragging');
  };

  document.onmousemove = (e) => {
    if (!dragging) return;
    overlay.style.left = Math.max(0, Math.min(e.clientX - dragX, window.innerWidth - 420)) + 'px';
    overlay.style.top = Math.max(0, Math.min(e.clientY - dragY, window.innerHeight - 420)) + 'px';
  };

  document.onmouseup = () => {
    dragging = false;
    header.classList.remove('dragging');
  };

  // Double-click to create note
  overlay.querySelectorAll('.quadrant').forEach(q => {
    q.ondblclick = (e) => {
      if (e.target.classList.contains('note') || e.target.classList.contains('note-content')) return;
      const rect = q.getBoundingClientRect();
      createNote({
        id: Date.now().toString(),
        text: '',
        q: parseInt(q.dataset.q),
        x: Math.max(0, Math.min(e.clientX - rect.left - 40, rect.width - 80)),
        y: Math.max(0, Math.min(e.clientY - rect.top - 30, rect.height - 60))
      });
    };
  });

  function createNote(data) {
    notes[data.id] = data;

    const note = document.createElement('div');
    note.className = 'note';
    note.dataset.id = data.id;
    note.style.left = data.x + 'px';
    note.style.top = data.y + 'px';

    const content = document.createElement('div');
    content.className = 'note-content';
    content.contentEditable = true;
    content.textContent = data.text;

    content.oninput = () => {
      notes[data.id].text = content.textContent;
      save();
    };

    content.onmousedown = (e) => e.stopPropagation();

    // Drag note
    let noteDrag = false, noteX, noteY;
    note.onmousedown = (e) => {
      if (e.target === content && document.activeElement === content) return;
      e.preventDefault();
      noteDrag = true;
      noteX = e.clientX - note.offsetLeft;
      noteY = e.clientY - note.offsetTop;
      note.classList.add('dragging');
    };

    document.addEventListener('mousemove', (e) => {
      if (!noteDrag) return;
      const quadrant = note.parentElement;
      const rect = quadrant.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left - noteX, rect.width - 80));
      const y = Math.max(0, Math.min(e.clientY - rect.top - noteY, rect.height - 60));
      note.style.left = x + 'px';
      note.style.top = y + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (noteDrag) {
        noteDrag = false;
        note.classList.remove('dragging');
        notes[data.id].x = parseInt(note.style.left);
        notes[data.id].y = parseInt(note.style.top);
        save();
      }
    });

    // Right-click delete
    note.oncontextmenu = (e) => {
      e.preventDefault();
      if (confirm('Delete note?')) {
        note.remove();
        delete notes[data.id];
        save();
      }
    };

    note.appendChild(content);
    overlay.querySelector(`.quadrant[data-q="${data.q}"]`).appendChild(note);
    save();
  }

  function save() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      chrome.storage.local.set({ [STORAGE_KEY]: notes });
    }, 300);
  }

  // Load notes
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    if (result[STORAGE_KEY]) {
      Object.values(result[STORAGE_KEY]).forEach(createNote);
    }
  });
})();
