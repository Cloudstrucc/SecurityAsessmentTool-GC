/* Record action toolbar — progressive enhancement.
 *
 * Turns a record page's `.record-actions` button cluster into a tidy toolbar:
 *   • icons + tooltip by default; Ctrl/⌘ + \ expands to icon + text (persisted);
 *   • a drag grip so the whole toolbar can be moved anywhere on the page and
 *     re-docked near its home (clamped to the viewport, never leaves the page);
 *   • the header row wraps so the toolbar never overlaps the title;
 *   • on phones every action collapses into one icon-only Menu button.
 *
 * The underlying buttons (links, form submits, modals, the export dropdown) keep
 * their exact behaviour — the Menu proxies delegate to them via .click(). If any
 * step fails the original buttons are left untouched.
 */
(function () {
  if (!('PointerEvent' in window)) return;
  var body = document.body;
  var SS = 'aegisActionLabels';
  var mode = readMode();               // 'icons' | 'text'
  var MORE = body.getAttribute('data-ra-more') || 'Menu';
  var toolbars = [];

  function readMode() {
    try { var v = sessionStorage.getItem(SS); if (v === 'icons' || v === 'text') return v; } catch (e) {}
    var d = body.getAttribute('data-action-labels');
    return d === 'text' ? 'text' : 'icons';
  }
  function persist(v) {
    var f = new URLSearchParams(); f.set('actionLabels', v);
    fetch('/admin/ui-prefs', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: f.toString(), credentials: 'same-origin' }).catch(function () {});
  }
  function isMobile() {
    var w = window.innerWidth || document.documentElement.clientWidth || 1024; // guard 0-width envs
    return w > 0 && w <= 768;
  }

  var ghost = null;
  function getGhost() {
    if (ghost) return ghost;
    ghost = document.createElement('div');
    ghost.className = 'ra-dock-ghost';
    ghost.textContent = body.getAttribute('data-ra-dock') || 'Dock here';
    document.body.appendChild(ghost);
    return ghost;
  }

  function wrapLabel(el) {
    if (!el || el.querySelector('.ra-txt')) return;
    var txt = '';
    Array.prototype.forEach.call(el.childNodes, function (n) { if (n.nodeType === 3 && n.textContent.trim()) txt += n.textContent; });
    txt = txt.trim(); if (!txt) return;
    var span = document.createElement('span'); span.className = 'ra-txt'; span.textContent = txt;
    var done = false;
    Array.prototype.slice.call(el.childNodes).forEach(function (n) {
      if (n.nodeType === 3 && n.textContent.trim()) { if (!done) { el.replaceChild(span, n); done = true; } else { el.removeChild(n); } }
    });
    if (!el.getAttribute('title')) el.setAttribute('title', txt);
  }

  function collect(box) {
    var items = [];
    Array.prototype.forEach.call(box.children, function (child) {
      if (child.classList && (child.classList.contains('ra-grip') || child.classList.contains('ra-menu'))) return;
      var visible = null, trigger = null, href = null, isDropdown = false;
      if (child.matches('a.btn')) { visible = trigger = child; href = child.getAttribute('href'); }
      else if (child.matches('button')) { visible = trigger = child; }
      else if (child.tagName === 'FORM') { trigger = visible = child.querySelector('button, [type="submit"]'); }
      else if (child.classList.contains('dropdown')) { trigger = visible = child.querySelector('.dropdown-toggle, button'); isDropdown = true; }
      else if (child.matches('a')) { visible = trigger = child; href = child.getAttribute('href'); }
      if (!visible) return;
      wrapLabel(visible);
      var icon = visible.querySelector('i');
      var label = (visible.querySelector('.ra-txt') || {}).textContent || visible.textContent.trim();
      items.push({ el: child, trigger: trigger, icon: icon ? icon.className : '', label: label, href: href, isDropdown: isDropdown });
    });
    return items;
  }

  function enhance(box) {
    if (box.__ra) return; box.__ra = true;
    try {
      box.classList.add('ra-toolbar');
      if (box.parentElement) box.parentElement.classList.add('ra-head');
      var items = collect(box);
      if (!items.length) return;

      var grip = document.createElement('span');
      grip.className = 'ra-grip'; grip.title = body.getAttribute('data-ra-move') || 'Drag to move';
      grip.innerHTML = '<i class="bi bi-grip-vertical"></i>';
      box.insertBefore(grip, box.firstChild);

      var menu = document.createElement('div');
      menu.className = 'ra-menu dropdown';
      menu.innerHTML = '<button class="btn btn-outline-primary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="' + MORE + '"><i class="bi bi-list"></i></button><ul class="dropdown-menu dropdown-menu-end"></ul>';
      box.appendChild(menu);
      var menuList = menu.querySelector('.dropdown-menu');
      items.forEach(function (it) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.className = 'dropdown-item';
        a.href = (it.href && !it.isDropdown) ? it.href : '#';
        a.innerHTML = (it.icon ? '<i class="' + it.icon + '"></i>' : '') + '<span>' + it.label + '</span>';
        if (!(it.href && !it.isDropdown)) {
          a.addEventListener('click', function (e) { e.preventDefault(); if (it.trigger) it.trigger.click(); });
        }
        li.appendChild(a); menuList.appendChild(li);
      });

      var tb = { box: box, grip: grip, menu: menu };
      toolbars.push(tb);
      applyMode(tb); layout(tb); wireDrag(tb);
    } catch (e) { /* leave buttons as-is on failure */ }
  }

  function applyMode(tb) {
    var icons = mode === 'icons' || isMobile();
    tb.box.classList.toggle('ra-icons', icons);
    tb.box.classList.toggle('ra-text', !icons);
  }
  function layout(tb) {
    if (isMobile()) tb.box.classList.add('ra-collapsed');
    else tb.box.classList.remove('ra-collapsed');
  }
  function applyAll() { toolbars.forEach(function (tb) { applyMode(tb); layout(tb); }); }

  function wireDrag(tb) {
    var box = tb.box, grip = tb.grip;
    var homeMarker = document.createComment('ra-home');
    var grabX = 0, grabY = 0, sx = 0, sy = 0, homeX = 0, homeY = 0, drag = false, moved = false;
    var DOCK = 60;
    grip.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      var r = box.getBoundingClientRect();
      grabX = e.clientX - r.left; grabY = e.clientY - r.top; sx = e.clientX; sy = e.clientY;
      homeX = r.left; homeY = r.top; drag = true; moved = false;
      // leave a marker so we can restore the exact in-flow slot
      box.parentNode.insertBefore(homeMarker, box);
      box.classList.add('ra-dragging', 'ra-floating');
      document.body.classList.add('ra-dragging-active');
      box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.width = r.width + 'px';
      var g = getGhost(); g.style.left = r.left + 'px'; g.style.top = r.top + 'px';
      g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
      try { grip.setPointerCapture(e.pointerId); } catch (_) {}
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
      e.preventDefault();
    });
    function move(e) {
      if (!drag) return;
      var w = box.offsetWidth, h = box.offsetHeight;
      var vw = window.innerWidth || document.documentElement.clientWidth || 1024;
      var vh = window.innerHeight || document.documentElement.clientHeight || 768;
      var nx = Math.max(0, Math.min(e.clientX - grabX, vw - w));
      var ny = Math.max(0, Math.min(e.clientY - grabY, vh - h));
      box.style.left = nx + 'px'; box.style.top = ny + 'px';
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 3) moved = true;
      var atHome = Math.hypot(nx - homeX, ny - homeY) < DOCK;
      getGhost().classList.toggle('show', atHome && moved);
      box.classList.toggle('ra-near-dock', atHome && moved);
      e.preventDefault();
    }
    function up() {
      if (!drag) return; drag = false;
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      var docked = box.classList.contains('ra-near-dock') || !moved;
      getGhost().classList.remove('show');
      box.classList.remove('ra-dragging', 'ra-near-dock');
      document.body.classList.remove('ra-dragging-active');
      if (docked) {
        box.classList.remove('ra-floating');
        box.style.left = box.style.top = box.style.width = '';
        if (homeMarker.parentNode) homeMarker.parentNode.insertBefore(box, homeMarker);
      }
      if (homeMarker.parentNode) homeMarker.parentNode.removeChild(homeMarker);
    }
  }

  function setMode(v) {
    mode = (v === 'text') ? 'text' : 'icons';
    try { sessionStorage.setItem(SS, mode); } catch (e) {}
    applyAll(); persist(mode);
  }
  function toggleMode() { setMode(mode === 'icons' ? 'text' : 'icons'); }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('.record-actions'), enhance);
    if (!toolbars.length) return;
    // The Ctrl/⌘ + \ shortcut is owned by nav-dock.js, which broadcasts the new
    // mode so the nav and the record toolbar compact/expand together. Fall back to
    // our own key handler if the nav controller isn't present on this page.
    document.addEventListener('aegis:labels-toggle', function (e) {
      setMode(e.detail && e.detail.mode === 'text' ? 'text' : 'icons');
    });
    if (!document.body.classList.contains('nav-dock')) {
      document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === '\\' || e.code === 'Backslash')) {
          var t = e.target, tag = t && t.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
          e.preventDefault(); toggleMode();
        }
      });
    }
    window.addEventListener('resize', applyAll);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
