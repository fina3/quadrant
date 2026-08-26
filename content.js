(function () {
  'use strict';

  const INSTANCE_KEY = '__quadrantNoteInstance';
  const STORAGE_KEY = 'quadrant_global';
  const CELLS = ['q1', 'q2', 'q3', 'q4'];
  const MIN_W = 240;
  const MIN_H = 220;

  // ---- Re-injection guard -------------------------------------------------
  // The action handler re-injects this file on every click. If a live instance
  // exists, just toggle it. If a previous instance was detached (SPA replaced
  // <body>), tear it down first so its listeners and its detached DOM node are
  // released instead of accumulating.
  const previous = window[INSTANCE_KEY];
  if (previous && typeof previous.isAlive === 'function') {
    try {
      if (previous.isAlive()) { previous.toggle(); return; }
      previous.destroy();
    } catch (e) {
      // Stale instance from a reloaded/updated extension: drop it and rebuild.
      console.warn('Quadrant: replacing stale instance:', e);
      try { document.getElementById('quadrant-note')?.remove(); } catch (_) {}
      delete window[INSTANCE_KEY];
    }
  }

  if (!document.body) return;

  // Every listener this instance registers is tied to this signal, so destroy()
  // removes all of them in one shot -- nothing outlives the note.
  const ac = new AbortController();
  const signal = ac.signal;
  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };

  // ---- Build --------------------------------------------------------------
  const note = document.createElement('div');
  note.id = 'quadrant-note';
  note.style.display = 'none'; // inline, so it cannot flash before CSS applies
  note.innerHTML = `
    <div id="quadrant-header">
      <span>QUADRANT</span>
      <div>
        <button id="q-refresh" title="Refresh" type="button">↻</button>
        <button id="q-copy" title="Copy to clipboard" type="button">📋</button>
        <button id="q-clear" title="Clear all" type="button">CLEAR</button>
        <button id="q-close" title="Close" type="button">×</button>
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

  // All lookups scoped to `note`: a host page with an element id of "q-copy",
  // "quadrant-header", etc. would otherwise win document.getElementById.
  const $ = (sel) => note.querySelector(sel);
  const header = $('#quadrant-header');
  const resizeHandle = $('#quadrant-resize');
  const copyBtn = $('#q-copy');
  const clearBtn = $('#q-clear');
  const cellEls = {};
  CELLS.forEach((c) => { cellEls[c] = note.querySelector(`[data-cell="${c}"]`); });
  const textareas = CELLS.map((c) => cellEls[c]);

  // ---- Storage ------------------------------------------------------------
  let saveTimer = null;
  let lastWritten = null; // serialized copy of our own last write, to ignore the echo

  const readCells = () => {
    const data = {};
    CELLS.forEach((c) => { data[c] = cellEls[c].value; });
    return data;
  };

  async function loadContent() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const data = result[STORAGE_KEY] || {};
      CELLS.forEach((c) => { cellEls[c].value = data[c] || ''; });
      lastWritten = normalize(readCells());
    } catch (e) {
      console.warn('Quadrant load error:', e);
    }
  }

  async function saveContent() {
    saveTimer = null;
    try {
      const data = readCells();
      lastWritten = normalize(data);
      await chrome.storage.local.set({ [STORAGE_KEY]: data });
    } catch (e) {
      console.warn('Quadrant save error:', e);
    }
  }

  function scheduleSave() {
    if (saveTimer !== null) { clearTimeout(saveTimer); timers.delete(saveTimer); }
    saveTimer = later(saveContent, 300);
  }

  function flushSave() {
    if (saveTimer === null) return;
    clearTimeout(saveTimer);
    timers.delete(saveTimer);
    saveContent();
  }

  const normalize = (obj) => {
    const out = {};
    CELLS.forEach((c) => { out[c] = (obj && obj[c]) || ''; });
    return JSON.stringify(out);
  };

  // Keep tabs converged. Without this, two open tabs each hold a private copy
  // of one global key and the last one to type silently clobbers the other.
  function onStorageChanged(changes, area) {
    if (signal.aborted) { chrome.storage.onChanged.removeListener(onStorageChanged); return; }
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    const incoming = changes[STORAGE_KEY].newValue || {};
    if (normalize(incoming) === lastWritten) return; // echo of our own write
    CELLS.forEach((c) => {
      const el = cellEls[c];
      const next = incoming[c] || '';
      // Never yank text out from under someone mid-edit.
      if (el !== document.activeElement && el.value !== next) el.value = next;
    });
    lastWritten = normalize(readCells());
  }
  chrome.storage.onChanged.addListener(onStorageChanged);

  // ---- Drag ---------------------------------------------------------------
  // Pointer capture keeps the gesture on the element, so no document-level
  // mousemove/mouseup listeners have to stay armed for the life of the page.
  let dragDX = 0, dragDY = 0;

  header.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const rect = note.getBoundingClientRect();
    // Pin to left/top before dragging; the stylesheet may position via right/bottom.
    note.style.left = rect.left + 'px';
    note.style.top = rect.top + 'px';
    note.style.right = 'auto';
    note.style.bottom = 'auto';
    dragDX = e.clientX - rect.left;
    dragDY = e.clientY - rect.top;
    header.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, { signal });

  header.addEventListener('pointermove', (e) => {
    if (!header.hasPointerCapture(e.pointerId)) return;
    const w = note.offsetWidth, h = note.offsetHeight;
    // Clamp so the note can never be dragged fully off-screen and stranded.
    const maxLeft = Math.max(0, window.innerWidth - 60);
    const maxTop = Math.max(0, window.innerHeight - 24);
    note.style.left = Math.min(Math.max(e.clientX - dragDX, 60 - w), maxLeft) + 'px';
    note.style.top = Math.min(Math.max(e.clientY - dragDY, 0), maxTop) + 'px';
  }, { signal });

  const endDrag = (e) => {
    if (header.hasPointerCapture(e.pointerId)) header.releasePointerCapture(e.pointerId);
  };
  header.addEventListener('pointerup', endDrag, { signal });
  header.addEventListener('pointercancel', endDrag, { signal });

  // ---- Resize -------------------------------------------------------------
  resizeHandle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    resizeHandle.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }, { signal });

  resizeHandle.addEventListener('pointermove', (e) => {
    if (!resizeHandle.hasPointerCapture(e.pointerId)) return;
    const rect = note.getBoundingClientRect();
    const w = Math.min(Math.max(e.clientX - rect.left, MIN_W), window.innerWidth - rect.left);
    const h = Math.min(Math.max(e.clientY - rect.top, MIN_H), window.innerHeight - rect.top);
    note.style.width = w + 'px';
    note.style.height = h + 'px';
  }, { signal });

  const endResize = (e) => {
    if (resizeHandle.hasPointerCapture(e.pointerId)) resizeHandle.releasePointerCapture(e.pointerId);
  };
  resizeHandle.addEventListener('pointerup', endResize, { signal });
  resizeHandle.addEventListener('pointercancel', endResize, { signal });

  // ---- Typing -------------------------------------------------------------
  textareas.forEach((ta) => {
    ['keydown', 'keypress', 'keyup'].forEach((evt) => {
      ta.addEventListener(evt, (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }, { capture: true, signal });
    });
    ta.addEventListener('input', scheduleSave, { signal });
  });

  // ---- Buttons ------------------------------------------------------------
  $('#q-refresh').addEventListener('click', () => { flushSave(); loadContent(); }, { signal });

  let copyResetTimer = null;
  copyBtn.addEventListener('click', async () => {
    const d = readCells();
    const text = `URGENT + IMPORTANT:\n${d.q1}\n\nNOT URGENT + IMPORTANT:\n${d.q2}\n\n` +
                 `URGENT + NOT IMPORTANT:\n${d.q3}\n\nNOT URGENT + NOT IMPORTANT:\n${d.q4}`;

    let ok = true;
    try {
      // Rejects when the document isn't focused or the origin isn't secure.
      await navigator.clipboard.writeText(text);
    } catch (e) {
      ok = copyFallback(text);
    }

    if (copyResetTimer !== null) { clearTimeout(copyResetTimer); timers.delete(copyResetTimer); }
    copyBtn.textContent = ok ? '✓' : '✕';
    copyResetTimer = later(() => { copyBtn.textContent = '📋'; copyResetTimer = null; }, 1000);
  }, { signal });

  function copyFallback(text) {
    const tmp = document.createElement('textarea');
    tmp.value = text;
    tmp.setAttribute('readonly', '');
    tmp.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0;';
    document.body.appendChild(tmp);
    let ok = false;
    try {
      tmp.select();
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    } finally {
      tmp.remove();
    }
    return ok;
  }

  // Two-step inline confirm. window.confirm() is overridable by the host page
  // and unavailable in sandboxed iframes.
  let clearArmed = null;
  clearBtn.addEventListener('click', async () => {
    if (clearArmed === null) {
      clearBtn.textContent = 'SURE?';
      clearArmed = later(() => { clearBtn.textContent = 'CLEAR'; clearArmed = null; }, 3000);
      return;
    }
    clearTimeout(clearArmed);
    timers.delete(clearArmed);
    clearArmed = null;
    clearBtn.textContent = 'CLEAR';

    // Drop the pending debounce first, or it fires after the remove() and
    // resurrects the key.
    if (saveTimer !== null) { clearTimeout(saveTimer); timers.delete(saveTimer); saveTimer = null; }
    textareas.forEach((ta) => { ta.value = ''; });
    lastWritten = normalize(readCells());
    try {
      await chrome.storage.local.remove(STORAGE_KEY);
    } catch (e) {
      console.warn('Quadrant clear error:', e);
    }
  }, { signal });

  $('#q-close').addEventListener('click', () => { flushSave(); note.style.display = 'none'; }, { signal });

  // Don't lose the last <300ms of typing when the tab is hidden or unloaded.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  }, { signal });
  window.addEventListener('pagehide', flushSave, { signal });

  // ---- Instance API -------------------------------------------------------
  function toggle() {
    if (note.style.display === 'none' || note.style.display === '') {
      note.style.display = 'block';
      loadContent();
    } else {
      flushSave();
      note.style.display = 'none';
    }
  }

  function destroy() {
    ac.abort();                         // drops every listener registered above
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch (e) {}
    timers.forEach(clearTimeout);
    timers.clear();
    note.remove();
    if (window[INSTANCE_KEY] === api) delete window[INSTANCE_KEY];
  }

  const api = { toggle, destroy, isAlive: () => note.isConnected };
  window[INSTANCE_KEY] = api;

  toggle(); // first injection opens the note
})();
