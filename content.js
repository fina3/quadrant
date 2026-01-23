// Content script for QuadrantNote - injected into every webpage
// Uses Shadow DOM to isolate styles from host page

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.quadrantNoteInitialized) return;
  window.quadrantNoteInitialized = true;

  let isOverlayVisible = false;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let currentDomain = window.location.hostname;

  // Shadow DOM hosts
  let buttonHost = null;
  let overlayHost = null;
  let shadowRoot = null;
  let overlay = null;

  // Note data structure
  let notes = {
    doFirst: [],
    schedule: [],
    delegate: [],
    eliminate: []
  };

  /**
   * Initialize the extension
   */
  function init() {
    createFloatingButton();
    createOverlay();
    loadNotes();
  }

  /**
   * Create the floating toggle button with Shadow DOM
   */
  function createFloatingButton() {
    buttonHost = document.createElement('div');
    buttonHost.id = 'quadrant-note-button-host';
    buttonHost.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 2147483646;';

    const shadow = buttonHost.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        .toggle-btn {
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          border: none;
          padding: 0;
        }
        .toggle-btn:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
        }
        .toggle-btn.active {
          background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
        }
        .toggle-btn svg {
          width: 24px;
          height: 24px;
          fill: white;
        }
      </style>
      <button class="toggle-btn" title="Toggle QuadrantNote">
        <svg viewBox="0 0 24 24">
          <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm8-2h8v8h-8v-8zm2 2v4h4v-4h-4z"/>
        </svg>
      </button>
    `;

    const btn = shadow.querySelector('.toggle-btn');
    btn.addEventListener('click', toggleOverlay);

    document.body.appendChild(buttonHost);
  }

  /**
   * Create the quadrant matrix overlay with Shadow DOM
   */
  function createOverlay() {
    overlayHost = document.createElement('div');
    overlayHost.id = 'quadrant-note-overlay-host';
    overlayHost.style.cssText = 'position: fixed; top: 0; left: 0; z-index: 2147483647; pointer-events: none;';

    shadowRoot = overlayHost.attachShadow({ mode: 'closed' });
    shadowRoot.innerHTML = `
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .overlay {
          position: fixed;
          width: 420px;
          height: 420px;
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          display: none;
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          overflow: hidden;
          pointer-events: auto;
        }

        .overlay.visible {
          display: flex;
        }

        /* Header - 20px tall */
        .header {
          height: 20px;
          min-height: 20px;
          background: #333;
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 8px;
          cursor: grab;
          user-select: none;
        }

        .header.dragging {
          cursor: grabbing;
        }

        .header-title {
          font-size: 11px;
          font-weight: 600;
        }

        .close-btn {
          background: none;
          border: none;
          color: white;
          font-size: 14px;
          cursor: pointer;
          padding: 0 4px;
          line-height: 1;
          opacity: 0.8;
          transition: opacity 0.2s;
        }

        .close-btn:hover {
          opacity: 1;
        }

        /* Grid - fills remaining space */
        .grid {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
          gap: 1px;
          background: #ddd;
        }

        /* Quadrant cells */
        .quadrant {
          position: relative;
          padding: 24px 8px 8px 8px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .quadrant.do-first {
          background: #ffcccc;
        }

        .quadrant.schedule {
          background: #ccffcc;
        }

        .quadrant.delegate {
          background: #ffffcc;
        }

        .quadrant.eliminate {
          background: #ccccff;
        }

        /* Drop zone highlight */
        .quadrant.drag-over {
          outline: 2px dashed #333;
          outline-offset: -4px;
        }

        /* Quadrant label */
        .quadrant-label {
          position: absolute;
          top: 4px;
          left: 6px;
          font-size: 10px;
          color: #666;
          text-transform: uppercase;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        /* Notes container */
        .notes-container {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .notes-container::-webkit-scrollbar {
          width: 4px;
        }

        .notes-container::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 2px;
        }

        /* Note item */
        .note-item {
          background: rgba(255, 255, 255, 0.7);
          padding: 4px 6px;
          border-radius: 3px;
          font-size: 11px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 4px;
          cursor: grab;
        }

        .note-item.dragging {
          opacity: 0.5;
        }

        .note-text {
          flex: 1;
          word-break: break-word;
          line-height: 1.3;
          color: #333;
        }

        .note-delete {
          background: none;
          border: none;
          color: #999;
          cursor: pointer;
          font-size: 12px;
          padding: 0;
          line-height: 1;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .note-item:hover .note-delete {
          opacity: 1;
        }

        .note-delete:hover {
          color: #c00;
        }

        /* Input area */
        .input-area {
          margin-top: 4px;
        }

        .input-area input {
          width: 100%;
          padding: 4px 6px;
          border: 1px solid rgba(0, 0, 0, 0.15);
          border-radius: 3px;
          font-size: 11px;
          background: rgba(255, 255, 255, 0.8);
        }

        .input-area input:focus {
          outline: none;
          border-color: #667eea;
          background: white;
        }

        .input-area input::placeholder {
          color: #999;
        }
      </style>

      <div class="overlay">
        <div class="header">
          <span class="header-title">QuadrantNote</span>
          <button class="close-btn" title="Close">&times;</button>
        </div>
        <div class="grid">
          <div class="quadrant do-first" data-quadrant="doFirst">
            <span class="quadrant-label">Do First</span>
            <div class="notes-container" data-quadrant="doFirst"></div>
            <div class="input-area">
              <input type="text" placeholder="Add task..." data-quadrant="doFirst">
            </div>
          </div>
          <div class="quadrant schedule" data-quadrant="schedule">
            <span class="quadrant-label">Schedule</span>
            <div class="notes-container" data-quadrant="schedule"></div>
            <div class="input-area">
              <input type="text" placeholder="Add task..." data-quadrant="schedule">
            </div>
          </div>
          <div class="quadrant delegate" data-quadrant="delegate">
            <span class="quadrant-label">Delegate</span>
            <div class="notes-container" data-quadrant="delegate"></div>
            <div class="input-area">
              <input type="text" placeholder="Add task..." data-quadrant="delegate">
            </div>
          </div>
          <div class="quadrant eliminate" data-quadrant="eliminate">
            <span class="quadrant-label">Eliminate</span>
            <div class="notes-container" data-quadrant="eliminate"></div>
            <div class="input-area">
              <input type="text" placeholder="Add task..." data-quadrant="eliminate">
            </div>
          </div>
        </div>
      </div>
    `;

    overlay = shadowRoot.querySelector('.overlay');

    // Set initial position (centered)
    overlay.style.left = `${(window.innerWidth - 420) / 2}px`;
    overlay.style.top = `${(window.innerHeight - 420) / 2}px`;

    setupOverlayEvents();
    document.body.appendChild(overlayHost);
  }

  /**
   * Setup event listeners for the overlay
   */
  function setupOverlayEvents() {
    const header = shadowRoot.querySelector('.header');
    const closeBtn = shadowRoot.querySelector('.close-btn');

    // Close button
    closeBtn.addEventListener('click', toggleOverlay);

    // Dragging
    header.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);

    // Input handling for each quadrant
    const inputs = shadowRoot.querySelectorAll('.input-area input');
    inputs.forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
          addNote(input.dataset.quadrant, input.value.trim());
          input.value = '';
        }
      });
    });

    // Setup drop zones
    const quadrants = shadowRoot.querySelectorAll('.quadrant');
    quadrants.forEach(quadrant => {
      quadrant.addEventListener('dragover', handleDragOver);
      quadrant.addEventListener('dragleave', handleDragLeave);
      quadrant.addEventListener('drop', handleDrop);
    });
  }

  /**
   * Start dragging the overlay
   */
  function startDrag(e) {
    if (e.target.closest('.close-btn')) return;
    isDragging = true;
    const rect = overlay.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    shadowRoot.querySelector('.header').classList.add('dragging');
  }

  /**
   * Handle drag movement
   */
  function drag(e) {
    if (!isDragging) return;
    e.preventDefault();

    let newX = e.clientX - dragOffset.x;
    let newY = e.clientY - dragOffset.y;

    // Keep within viewport bounds
    newX = Math.max(0, Math.min(newX, window.innerWidth - 420));
    newY = Math.max(0, Math.min(newY, window.innerHeight - 420));

    overlay.style.left = `${newX}px`;
    overlay.style.top = `${newY}px`;
  }

  /**
   * Stop dragging
   */
  function stopDrag() {
    if (isDragging) {
      isDragging = false;
      shadowRoot.querySelector('.header').classList.remove('dragging');
    }
  }

  /**
   * Toggle overlay visibility
   */
  function toggleOverlay() {
    isOverlayVisible = !isOverlayVisible;
    overlay.classList.toggle('visible', isOverlayVisible);

    // Update button state
    const btnShadow = buttonHost.shadowRoot;
    if (btnShadow) {
      btnShadow.querySelector('.toggle-btn').classList.toggle('active', isOverlayVisible);
    }
  }

  // Drag and drop state
  let draggedNote = null;
  let draggedQuadrant = null;

  /**
   * Handle drag over quadrant
   */
  function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  }

  /**
   * Handle drag leave quadrant
   */
  function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  }

  /**
   * Handle drop on quadrant
   */
  function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    const targetQuadrant = e.currentTarget.dataset.quadrant;

    if (draggedNote && draggedQuadrant && targetQuadrant !== draggedQuadrant) {
      // Move note to new quadrant
      const noteIndex = notes[draggedQuadrant].findIndex(n => n.id === draggedNote);
      if (noteIndex !== -1) {
        const [note] = notes[draggedQuadrant].splice(noteIndex, 1);
        notes[targetQuadrant].push(note);
        renderAllNotes();
        saveNotes();
      }
    }

    draggedNote = null;
    draggedQuadrant = null;
  }

  /**
   * Load notes from storage
   */
  async function loadNotes() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getNotesForDomain',
        domain: currentDomain
      });

      if (response && response.success) {
        notes = response.notes;
        renderAllNotes();
      }
    } catch (error) {
      console.error('QuadrantNote: Failed to load notes', error);
    }
  }

  /**
   * Save notes to storage
   */
  async function saveNotes() {
    try {
      await chrome.runtime.sendMessage({
        action: 'saveNotesForDomain',
        domain: currentDomain,
        notes: notes
      });
    } catch (error) {
      console.error('QuadrantNote: Failed to save notes', error);
    }
  }

  /**
   * Add a note to a quadrant
   */
  function addNote(quadrant, text) {
    const note = {
      id: Date.now().toString(),
      text: text,
      createdAt: new Date().toISOString()
    };
    notes[quadrant].push(note);
    renderNotes(quadrant);
    saveNotes();
  }

  /**
   * Delete a note from a quadrant
   */
  function deleteNote(quadrant, noteId) {
    notes[quadrant] = notes[quadrant].filter(n => n.id !== noteId);
    renderNotes(quadrant);
    saveNotes();
  }

  /**
   * Render notes for a specific quadrant
   */
  function renderNotes(quadrant) {
    const container = shadowRoot.querySelector(`.notes-container[data-quadrant="${quadrant}"]`);
    container.innerHTML = '';

    notes[quadrant].forEach(note => {
      const noteEl = document.createElement('div');
      noteEl.className = 'note-item';
      noteEl.draggable = true;
      noteEl.innerHTML = `
        <span class="note-text">${escapeHtml(note.text)}</span>
        <button class="note-delete" data-id="${note.id}">&times;</button>
      `;

      // Drag events for note reordering
      noteEl.addEventListener('dragstart', (e) => {
        draggedNote = note.id;
        draggedQuadrant = quadrant;
        noteEl.classList.add('dragging');
      });

      noteEl.addEventListener('dragend', () => {
        noteEl.classList.remove('dragging');
      });

      noteEl.querySelector('.note-delete').addEventListener('click', () => {
        deleteNote(quadrant, note.id);
      });

      container.appendChild(noteEl);
    });
  }

  /**
   * Render all quadrants
   */
  function renderAllNotes() {
    ['doFirst', 'schedule', 'delegate', 'eliminate'].forEach(renderNotes);
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
