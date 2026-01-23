// Content script for QuadrantNote - injected into every webpage

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.quadrantNoteInitialized) return;
  window.quadrantNoteInitialized = true;

  const STORAGE_KEY_PREFIX = 'quadrantNote_';
  let isOverlayVisible = false;
  let overlay = null;
  let floatingButton = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let currentDomain = window.location.hostname;

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
   * Create the floating toggle button
   */
  function createFloatingButton() {
    floatingButton = document.createElement('div');
    floatingButton.id = 'quadrant-note-toggle';
    floatingButton.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm8-2h8v8h-8v-8zm2 2v4h4v-4h-4z"/>
      </svg>
    `;
    floatingButton.title = 'Toggle QuadrantNote';
    floatingButton.addEventListener('click', toggleOverlay);
    document.body.appendChild(floatingButton);
  }

  /**
   * Create the quadrant matrix overlay
   */
  function createOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'quadrant-note-overlay';
    overlay.innerHTML = `
      <div class="quadrant-note-header">
        <span class="quadrant-note-title">QuadrantNote - ${currentDomain}</span>
        <div class="quadrant-note-controls">
          <button class="quadrant-note-btn" id="quadrant-clear-btn" title="Clear all notes">Clear</button>
          <button class="quadrant-note-btn quadrant-close-btn" id="quadrant-close-btn" title="Close">&times;</button>
        </div>
      </div>
      <div class="quadrant-note-matrix">
        <div class="quadrant-note-labels-top">
          <span></span>
          <span class="quadrant-label-urgent">URGENT</span>
          <span class="quadrant-label-not-urgent">NOT URGENT</span>
        </div>
        <div class="quadrant-note-row">
          <span class="quadrant-label-side quadrant-label-important">IMPORTANT</span>
          <div class="quadrant-note-cell" data-quadrant="doFirst">
            <div class="quadrant-cell-header do-first">Do First</div>
            <div class="quadrant-cell-notes" data-quadrant="doFirst"></div>
            <div class="quadrant-cell-input">
              <input type="text" placeholder="Add task..." data-quadrant="doFirst">
            </div>
          </div>
          <div class="quadrant-note-cell" data-quadrant="schedule">
            <div class="quadrant-cell-header schedule">Schedule</div>
            <div class="quadrant-cell-notes" data-quadrant="schedule"></div>
            <div class="quadrant-cell-input">
              <input type="text" placeholder="Add task..." data-quadrant="schedule">
            </div>
          </div>
        </div>
        <div class="quadrant-note-row">
          <span class="quadrant-label-side quadrant-label-not-important">NOT IMPORTANT</span>
          <div class="quadrant-note-cell" data-quadrant="delegate">
            <div class="quadrant-cell-header delegate">Delegate</div>
            <div class="quadrant-cell-notes" data-quadrant="delegate"></div>
            <div class="quadrant-cell-input">
              <input type="text" placeholder="Add task..." data-quadrant="delegate">
            </div>
          </div>
          <div class="quadrant-note-cell" data-quadrant="eliminate">
            <div class="quadrant-cell-header eliminate">Eliminate</div>
            <div class="quadrant-cell-notes" data-quadrant="eliminate"></div>
            <div class="quadrant-cell-input">
              <input type="text" placeholder="Add task..." data-quadrant="eliminate">
            </div>
          </div>
        </div>
      </div>
    `;

    // Set initial position (centered)
    overlay.style.left = `${(window.innerWidth - 400) / 2}px`;
    overlay.style.top = `${(window.innerHeight - 400) / 2}px`;

    // Add event listeners
    setupOverlayEvents();

    document.body.appendChild(overlay);
  }

  /**
   * Setup event listeners for the overlay
   */
  function setupOverlayEvents() {
    // Close button
    overlay.querySelector('#quadrant-close-btn').addEventListener('click', toggleOverlay);

    // Clear button
    overlay.querySelector('#quadrant-clear-btn').addEventListener('click', clearAllNotes);

    // Dragging
    const header = overlay.querySelector('.quadrant-note-header');
    header.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);

    // Input handling for each quadrant
    const inputs = overlay.querySelectorAll('.quadrant-cell-input input');
    inputs.forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
          addNote(input.dataset.quadrant, input.value.trim());
          input.value = '';
        }
      });
    });
  }

  /**
   * Start dragging the overlay
   */
  function startDrag(e) {
    if (e.target.closest('.quadrant-note-controls')) return;
    isDragging = true;
    const rect = overlay.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    overlay.style.cursor = 'grabbing';
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
    newX = Math.max(0, Math.min(newX, window.innerWidth - overlay.offsetWidth));
    newY = Math.max(0, Math.min(newY, window.innerHeight - overlay.offsetHeight));

    overlay.style.left = `${newX}px`;
    overlay.style.top = `${newY}px`;
  }

  /**
   * Stop dragging
   */
  function stopDrag() {
    isDragging = false;
    if (overlay) {
      overlay.style.cursor = '';
    }
  }

  /**
   * Toggle overlay visibility
   */
  function toggleOverlay() {
    isOverlayVisible = !isOverlayVisible;
    overlay.classList.toggle('visible', isOverlayVisible);
    floatingButton.classList.toggle('active', isOverlayVisible);
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

      if (response.success) {
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
   * Clear all notes
   */
  async function clearAllNotes() {
    if (!confirm('Clear all notes for this domain?')) return;

    notes = {
      doFirst: [],
      schedule: [],
      delegate: [],
      eliminate: []
    };

    renderAllNotes();

    try {
      await chrome.runtime.sendMessage({
        action: 'clearNotesForDomain',
        domain: currentDomain
      });
    } catch (error) {
      console.error('QuadrantNote: Failed to clear notes', error);
    }
  }

  /**
   * Render notes for a specific quadrant
   */
  function renderNotes(quadrant) {
    const container = overlay.querySelector(`.quadrant-cell-notes[data-quadrant="${quadrant}"]`);
    container.innerHTML = '';

    notes[quadrant].forEach(note => {
      const noteEl = document.createElement('div');
      noteEl.className = 'quadrant-note-item';
      noteEl.innerHTML = `
        <span class="note-text">${escapeHtml(note.text)}</span>
        <button class="note-delete" data-id="${note.id}">&times;</button>
      `;

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
