// Content script for QuadrantNote - injected into every webpage
// Uses Shadow DOM to isolate styles from host page

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.quadrantNoteInitialized) return;
  window.quadrantNoteInitialized = true;

  const MAX_NOTES_PER_QUADRANT = 20;
  const DEBOUNCE_DELAY = 300;
  const STORAGE_KEY = `notes_${window.location.hostname}`;

  let isOverlayVisible = false;
  let isDraggingOverlay = false;
  let dragOffset = { x: 0, y: 0 };
  let currentDomain = window.location.hostname;

  // Shadow DOM hosts
  let buttonHost = null;
  let overlayHost = null;
  let shadowRoot = null;
  let overlay = null;
  let contextMenu = null;

  // Note dragging state
  let draggedNote = null;
  let draggedNoteOffset = { x: 0, y: 0 };
  let isDraggingNote = false;

  // Notes storage: { id: { id, text, quadrant, x, y, created } }
  let notes = {};

  // Debounce timer
  let saveTimer = null;

  // Flag to ignore storage changes triggered by this tab
  let isSaving = false;

  /**
   * Generate UUID v4
   */
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Debounced save to storage
   */
  function debouncedSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      saveNotes();
    }, DEBOUNCE_DELAY);
  }

  /**
   * Initialize the extension
   */
  function init() {
    createFloatingButton();
    createOverlay();
    loadNotes();
    setupStorageListener();
  }

  /**
   * Setup chrome.storage.onChanged listener for cross-tab sync
   */
  function setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (!changes[STORAGE_KEY]) return;

      // Ignore changes we triggered ourselves
      if (isSaving) return;

      const newValue = changes[STORAGE_KEY].newValue;
      if (newValue) {
        notes = newValue;
        renderAllNotes();
      } else {
        // Storage was cleared
        notes = {};
        renderAllNotes();
      }
    });
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

        .header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .header-title {
          font-size: 11px;
          font-weight: 600;
        }

        .header-controls {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .export-btn {
          background: rgba(255, 255, 255, 0.15);
          border: none;
          color: white;
          font-size: 9px;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 3px;
          opacity: 0.8;
          transition: opacity 0.2s, background 0.2s;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .export-btn:hover {
          opacity: 1;
          background: rgba(255, 255, 255, 0.25);
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
          overflow: hidden;
        }

        .quadrant[data-quadrant="1"] {
          background: #ffcccc;
        }

        .quadrant[data-quadrant="2"] {
          background: #ccffcc;
        }

        .quadrant[data-quadrant="3"] {
          background: #ffffcc;
        }

        .quadrant[data-quadrant="4"] {
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
          pointer-events: none;
          z-index: 1;
        }

        /* Sticky note */
        .sticky-note {
          position: absolute;
          width: 80px;
          height: 60px;
          background: #fff9b1;
          box-shadow: 1px 1px 4px rgba(0, 0, 0, 0.15);
          cursor: grab;
          user-select: none;
          z-index: 10;
          display: flex;
          align-items: flex-start;
          justify-content: flex-start;
          overflow: hidden;
        }

        .sticky-note:hover {
          box-shadow: 2px 2px 6px rgba(0, 0, 0, 0.2);
        }

        .sticky-note.dragging {
          cursor: grabbing;
          opacity: 0.8;
          z-index: 100;
          box-shadow: 3px 3px 10px rgba(0, 0, 0, 0.3);
        }

        .sticky-note-content {
          width: 100%;
          height: 100%;
          padding: 4px;
          font-size: 11px;
          line-height: 1.3;
          color: #333;
          outline: none;
          overflow: hidden;
          word-break: break-word;
          cursor: text;
        }

        .sticky-note-content:empty::before {
          content: 'Type here...';
          color: #999;
          font-style: italic;
        }

        /* Context menu */
        .context-menu {
          position: fixed;
          background: white;
          border-radius: 4px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
          padding: 4px 0;
          min-width: 120px;
          z-index: 1000;
          display: none;
          pointer-events: auto;
        }

        .context-menu.visible {
          display: block;
        }

        .context-menu-item {
          padding: 6px 12px;
          font-size: 12px;
          color: #333;
          cursor: pointer;
          transition: background 0.15s;
        }

        .context-menu-item:hover {
          background: #f0f0f0;
        }

        .context-menu-item.delete {
          color: #c00;
        }

        .context-menu-item.delete:hover {
          background: #fee;
        }
      </style>

      <div class="overlay">
        <div class="header">
          <div class="header-left">
            <span class="header-title">QuadrantNote</span>
          </div>
          <div class="header-controls">
            <button class="export-btn" title="Export as JSON">Export</button>
            <button class="close-btn" title="Close">&times;</button>
          </div>
        </div>
        <div class="grid">
          <div class="quadrant" data-quadrant="1">
            <span class="quadrant-label">Do First</span>
          </div>
          <div class="quadrant" data-quadrant="2">
            <span class="quadrant-label">Schedule</span>
          </div>
          <div class="quadrant" data-quadrant="3">
            <span class="quadrant-label">Delegate</span>
          </div>
          <div class="quadrant" data-quadrant="4">
            <span class="quadrant-label">Eliminate</span>
          </div>
        </div>
      </div>

      <div class="context-menu">
        <div class="context-menu-item delete">Delete note</div>
      </div>
    `;

    overlay = shadowRoot.querySelector('.overlay');
    contextMenu = shadowRoot.querySelector('.context-menu');

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
    const exportBtn = shadowRoot.querySelector('.export-btn');
    const quadrants = shadowRoot.querySelectorAll('.quadrant');

    // Close button
    closeBtn.addEventListener('click', toggleOverlay);

    // Export button
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportNotes();
    });

    // Header dragging
    header.addEventListener('mousedown', startOverlayDrag);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Quadrant events
    quadrants.forEach(quadrant => {
      // Double-click to create note
      quadrant.addEventListener('dblclick', handleQuadrantDoubleClick);

      // Drag over/drop for notes
      quadrant.addEventListener('dragover', (e) => e.preventDefault());
      quadrant.addEventListener('dragenter', handleDragEnter);
      quadrant.addEventListener('dragleave', handleDragLeave);
    });

    // Hide context menu on click elsewhere
    shadowRoot.addEventListener('click', (e) => {
      if (!e.target.closest('.context-menu')) {
        hideContextMenu();
      }
    });

    // Context menu delete action
    shadowRoot.querySelector('.context-menu-item.delete').addEventListener('click', () => {
      if (contextMenu.targetNoteId) {
        deleteNote(contextMenu.targetNoteId);
        hideContextMenu();
      }
    });

    // Prevent context menu on overlay background
    overlay.addEventListener('contextmenu', (e) => {
      if (!e.target.closest('.sticky-note')) {
        e.preventDefault();
      }
    });
  }

  /**
   * Export notes as JSON file
   */
  function exportNotes() {
    const exportData = {
      domain: currentDomain,
      exportedAt: new Date().toISOString(),
      version: '1.0',
      notes: notes
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `quadrantnote-${currentDomain}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Start dragging the overlay
   */
  function startOverlayDrag(e) {
    if (e.target.closest('.close-btn') || e.target.closest('.export-btn')) return;
    isDraggingOverlay = true;
    const rect = overlay.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    shadowRoot.querySelector('.header').classList.add('dragging');
  }

  /**
   * Handle mouse move for both overlay and note dragging
   */
  function handleMouseMove(e) {
    if (isDraggingOverlay) {
      e.preventDefault();
      let newX = e.clientX - dragOffset.x;
      let newY = e.clientY - dragOffset.y;
      newX = Math.max(0, Math.min(newX, window.innerWidth - 420));
      newY = Math.max(0, Math.min(newY, window.innerHeight - 420));
      overlay.style.left = `${newX}px`;
      overlay.style.top = `${newY}px`;
    }

    if (isDraggingNote && draggedNote) {
      e.preventDefault();
      const overlayRect = overlay.getBoundingClientRect();
      const gridRect = shadowRoot.querySelector('.grid').getBoundingClientRect();

      // Calculate position relative to grid
      let x = e.clientX - overlayRect.left - draggedNoteOffset.x;
      let y = e.clientY - overlayRect.top - 20 - draggedNoteOffset.y; // 20px header

      // Find which quadrant we're over
      const quadrants = shadowRoot.querySelectorAll('.quadrant');
      let targetQuadrant = null;

      quadrants.forEach(q => {
        const rect = q.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          targetQuadrant = q;
        }
      });

      if (targetQuadrant) {
        const qRect = targetQuadrant.getBoundingClientRect();
        const relX = e.clientX - qRect.left - draggedNoteOffset.x;
        const relY = e.clientY - qRect.top - draggedNoteOffset.y;

        // Constrain within quadrant
        const noteX = Math.max(0, Math.min(relX, qRect.width - 80));
        const noteY = Math.max(0, Math.min(relY, qRect.height - 60));

        // Temporarily position note in the target quadrant
        const currentQuadrant = draggedNote.parentElement;
        if (currentQuadrant !== targetQuadrant) {
          targetQuadrant.appendChild(draggedNote);
        }

        draggedNote.style.left = `${noteX}px`;
        draggedNote.style.top = `${noteY}px`;
      }
    }
  }

  /**
   * Handle mouse up
   */
  function handleMouseUp(e) {
    if (isDraggingOverlay) {
      isDraggingOverlay = false;
      shadowRoot.querySelector('.header').classList.remove('dragging');
    }

    if (isDraggingNote && draggedNote) {
      draggedNote.classList.remove('dragging');

      // Update note data
      const noteId = draggedNote.dataset.noteId;
      const note = notes[noteId];
      if (note) {
        const quadrant = draggedNote.parentElement;
        const newQuadrant = parseInt(quadrant.dataset.quadrant);

        note.quadrant = newQuadrant;
        note.x = parseInt(draggedNote.style.left) || 0;
        note.y = parseInt(draggedNote.style.top) || 0;

        debouncedSave();
      }

      // Remove drag-over highlight from all quadrants
      shadowRoot.querySelectorAll('.quadrant').forEach(q => {
        q.classList.remove('drag-over');
      });

      isDraggingNote = false;
      draggedNote = null;
    }
  }

  /**
   * Handle drag enter on quadrant
   */
  function handleDragEnter(e) {
    if (isDraggingNote) {
      e.currentTarget.classList.add('drag-over');
    }
  }

  /**
   * Handle drag leave on quadrant
   */
  function handleDragLeave(e) {
    // Only remove if actually leaving the quadrant
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom) {
      e.currentTarget.classList.remove('drag-over');
    }
  }

  /**
   * Handle double-click on quadrant to create note
   */
  function handleQuadrantDoubleClick(e) {
    if (e.target.closest('.sticky-note')) return;

    const quadrant = e.currentTarget;
    const quadrantNum = parseInt(quadrant.dataset.quadrant);

    // Check max notes limit
    const notesInQuadrant = Object.values(notes).filter(n => n.quadrant === quadrantNum);
    if (notesInQuadrant.length >= MAX_NOTES_PER_QUADRANT) {
      return;
    }

    const rect = quadrant.getBoundingClientRect();
    let x = e.clientX - rect.left - 40; // Center the note on click
    let y = e.clientY - rect.top - 30;

    // Constrain within quadrant
    x = Math.max(0, Math.min(x, rect.width - 80));
    y = Math.max(0, Math.min(y, rect.height - 60));

    const note = {
      id: generateUUID(),
      text: '',
      quadrant: quadrantNum,
      x: x,
      y: y,
      created: Date.now()
    };

    notes[note.id] = note;
    createNoteElement(note, quadrant);
    debouncedSave();

    // Focus the new note
    setTimeout(() => {
      const noteEl = shadowRoot.querySelector(`[data-note-id="${note.id}"] .sticky-note-content`);
      if (noteEl) {
        noteEl.focus();
      }
    }, 0);
  }

  /**
   * Create a sticky note DOM element
   */
  function createNoteElement(note, quadrant) {
    const noteEl = document.createElement('div');
    noteEl.className = 'sticky-note';
    noteEl.dataset.noteId = note.id;
    noteEl.style.left = `${note.x}px`;
    noteEl.style.top = `${note.y}px`;

    const content = document.createElement('div');
    content.className = 'sticky-note-content';
    content.contentEditable = 'true';
    content.textContent = note.text;

    // Handle text changes
    content.addEventListener('input', () => {
      notes[note.id].text = content.textContent;
      debouncedSave();
    });

    // Prevent dragging when editing
    content.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    // Handle note dragging
    noteEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('.sticky-note-content') && document.activeElement === content) {
        return; // Don't drag while editing
      }

      e.preventDefault();
      isDraggingNote = true;
      draggedNote = noteEl;
      noteEl.classList.add('dragging');

      const rect = noteEl.getBoundingClientRect();
      draggedNoteOffset.x = e.clientX - rect.left;
      draggedNoteOffset.y = e.clientY - rect.top;
    });

    // Context menu
    noteEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, note.id);
    });

    noteEl.appendChild(content);
    quadrant.appendChild(noteEl);
  }

  /**
   * Show context menu
   */
  function showContextMenu(x, y, noteId) {
    const overlayRect = overlay.getBoundingClientRect();
    contextMenu.style.left = `${x - overlayRect.left}px`;
    contextMenu.style.top = `${y - overlayRect.top}px`;
    contextMenu.targetNoteId = noteId;
    contextMenu.classList.add('visible');
  }

  /**
   * Hide context menu
   */
  function hideContextMenu() {
    contextMenu.classList.remove('visible');
    contextMenu.targetNoteId = null;
  }

  /**
   * Delete a note
   */
  function deleteNote(noteId) {
    const noteEl = shadowRoot.querySelector(`[data-note-id="${noteId}"]`);
    if (noteEl) {
      noteEl.remove();
    }
    delete notes[noteId];
    debouncedSave();
  }

  /**
   * Toggle overlay visibility
   */
  function toggleOverlay() {
    isOverlayVisible = !isOverlayVisible;
    overlay.classList.toggle('visible', isOverlayVisible);
    hideContextMenu();

    // Update button state
    const btnShadow = buttonHost.shadowRoot;
    if (btnShadow) {
      btnShadow.querySelector('.toggle-btn').classList.toggle('active', isOverlayVisible);
    }
  }

  /**
   * Load notes from storage on page load
   */
  async function loadNotes() {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEY]);
      if (result[STORAGE_KEY]) {
        notes = result[STORAGE_KEY];
        renderAllNotes();
      }
      // If no data exists, notes stays empty {} and quadrants show empty
    } catch (error) {
      console.error('QuadrantNote: Failed to load notes', error);
    }
  }

  /**
   * Save notes to storage (debounced)
   */
  async function saveNotes() {
    try {
      isSaving = true;
      await chrome.storage.local.set({ [STORAGE_KEY]: notes });
      // Small delay to ensure the onChanged listener ignores this change
      setTimeout(() => {
        isSaving = false;
      }, 50);
    } catch (error) {
      isSaving = false;
      console.error('QuadrantNote: Failed to save notes', error);
    }
  }

  /**
   * Render all notes from storage
   */
  function renderAllNotes() {
    // Clear existing notes
    shadowRoot.querySelectorAll('.sticky-note').forEach(el => el.remove());

    // Render each note in its quadrant
    Object.values(notes).forEach(note => {
      const quadrant = shadowRoot.querySelector(`.quadrant[data-quadrant="${note.quadrant}"]`);
      if (quadrant) {
        createNoteElement(note, quadrant);
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
