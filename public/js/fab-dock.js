/* Draggable + dockable floating action buttons (Assistant + Collaboration).
 *
 * Each FAB keeps its original click behaviour (opening its panel). Dragging is
 * pointer-based with a grab offset so the button tracks the cursor 1:1; it is
 * clamped to the viewport so it can roam over the header/footer yet never leaves
 * the page. Drag it back toward its home corner and a dashed ring appears; on
 * release it snaps home. A drag never fires the button's click. Positions are
 * not persisted (reset on reload) — matching the approved design.
 */
(function () {
  if (!('PointerEvent' in window)) return;
  var ghost = null;
  function getGhost() {
    if (ghost) return ghost;
    ghost = document.createElement('div');
    ghost.className = 'fab-dock-ghost';
    ghost.innerHTML = '<i class="bi bi-arrow-down-right-circle"></i>';
    document.body.appendChild(ghost);
    return ghost;
  }

  function enhance(el) {
    if (!el || el.__fabDock) return;
    el.__fabDock = true;
    el.classList.add('fab-dockable');
    if (!el.getAttribute('title') && el.getAttribute('aria-label')) el.setAttribute('title', el.getAttribute('aria-label'));

    var cs = getComputedStyle(el);
    var anchor = { right: el.style.right || cs.right, bottom: el.style.bottom || cs.bottom };
    var homeX = null, homeY = null, grabX = 0, grabY = 0, sx = 0, sy = 0;
    var drag = false, moved = false, justDragged = false;
    var DOCK = 48;

    function move(e) {
      if (!drag) return;
      var w = el.offsetWidth, h = el.offsetHeight;
      var vw = window.innerWidth || document.documentElement.clientWidth || 1024;
      var vh = window.innerHeight || document.documentElement.clientHeight || 768;
      var nx = Math.max(0, Math.min(e.clientX - grabX, vw - w));
      var ny = Math.max(0, Math.min(e.clientY - grabY, vh - h));
      el.style.left = nx + 'px'; el.style.top = ny + 'px';
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 3) moved = true;
      var atHome = Math.hypot(nx - homeX, ny - homeY) < DOCK;
      getGhost().classList.toggle('show', atHome && moved);
      el.classList.toggle('fab-near-dock', atHome && moved);
      e.preventDefault();
    }
    function end() {
      if (!drag) return;
      drag = false;
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', end);
      el.classList.remove('fab-dragging'); document.body.classList.remove('ra-dragging-active');
      var docked = el.classList.contains('fab-near-dock');
      getGhost().classList.remove('show'); el.classList.remove('fab-near-dock');
      if (docked || !moved) {
        el.style.left = ''; el.style.top = ''; el.style.right = anchor.right; el.style.bottom = anchor.bottom;
      }
      if (moved) { justDragged = true; setTimeout(function () { justDragged = false; }, 0); }
    }
    el.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      var r = el.getBoundingClientRect();
      grabX = e.clientX - r.left; grabY = e.clientY - r.top;
      sx = e.clientX; sy = e.clientY;
      if (homeX == null) { homeX = r.left; homeY = r.top; }
      drag = true; moved = false;
      el.classList.add('fab-dragging'); document.body.classList.add('ra-dragging-active');
      el.style.right = 'auto'; el.style.bottom = 'auto';
      el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
      var g = getGhost(); g.style.left = homeX + 'px'; g.style.top = homeY + 'px';
      g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
      e.preventDefault();
    });
    // A real drag must not open the panel.
    el.addEventListener('click', function (e) {
      if (justDragged || moved) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
  }

  function init() {
    ['aiaLaunch', 'cbLaunch'].forEach(function (id) { enhance(document.getElementById(id)); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
