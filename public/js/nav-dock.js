/* Dockable navigation controller.
 *
 * The server renders the body with the user's SAVED default (data-nav-default-*)
 * and applies it as the current state. During a session the user can move/pin the
 * menu (kept in sessionStorage so it survives navigation) without changing the
 * saved default; the ★ button POSTs the current state as the new default.
 */
(function () {
  var body = document.body;
  if (!body.classList.contains('nav-dock')) return; // signed-out / no dock

  var SS_KEY = 'aegisNavOverride';
  var saved = {
    pos: body.getAttribute('data-nav-default-pos') || 'top',
    pinned: body.getAttribute('data-nav-default-pinned') !== '0'
  };
  var current = readOverride() || { pos: saved.pos, pinned: saved.pinned };
  var hideTimer = null;

  function readOverride() {
    try { var v = JSON.parse(sessionStorage.getItem(SS_KEY)); if (v && v.pos) return { pos: v.pos, pinned: !!v.pinned }; }
    catch (e) {}
    return null;
  }
  function writeOverride() {
    try { sessionStorage.setItem(SS_KEY, JSON.stringify(current)); } catch (e) {}
  }
  function isDefault() { return current.pos === saved.pos && current.pinned === saved.pinned; }

  function applyBody() {
    ['nav-pos-top', 'nav-pos-left', 'nav-pos-right'].forEach(function (c) { body.classList.remove(c); });
    body.classList.add('nav-pos-' + current.pos);
    body.classList.toggle('nav-pinned', current.pinned);
    if (current.pinned) body.classList.remove('nav-peek');
    setBrandHeight();
  }

  function setBrandHeight() {
    var fip = document.querySelector('.gc-fip');
    if (fip) document.documentElement.style.setProperty('--brand-h', fip.getBoundingClientRect().height + 'px');
  }

  function syncControls() {
    // position segments
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav-pos]'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-nav-pos') === current.pos);
    });
    // pin buttons
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav-act="pin"]'), function (b) {
      b.classList.toggle('on', current.pinned);
      var i = b.querySelector('i'); if (i) i.className = 'bi ' + (current.pinned ? 'bi-pin-angle-fill' : 'bi-pin-angle');
    });
    // star buttons
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav-act="star"]'), function (b) {
      var on = isDefault();
      b.classList.toggle('on', on);
      var i = b.querySelector('i'); if (i) i.className = 'bi ' + (on ? 'bi-star-fill' : 'bi-star');
    });
  }

  function setPos(p) { current.pos = p; writeOverride(); applyBody(); syncControls(); closePop(); if (!current.pinned) peek(); }
  function setPinned(v) { current.pinned = v; writeOverride(); applyBody(); syncControls(); }

  function saveDefault() {
    var form = new URLSearchParams();
    form.set('position', current.pos); form.set('pinned', current.pinned ? '1' : '0');
    fetch('/admin/nav-prefs', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(), credentials: 'same-origin'
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function () {
      saved = { pos: current.pos, pinned: current.pinned };
      try { sessionStorage.removeItem(SS_KEY); } catch (e) {}
      syncControls(); toast();
    }).catch(function () {});
  }

  // ── auto-hide reveal ──
  function peek() { body.classList.add('nav-peek'); clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { if (!current.pinned) body.classList.remove('nav-peek'); }, 2000); }
  function bindPeek() {
    Array.prototype.forEach.call(document.querySelectorAll('.nav-hotzone'), function (h) {
      h.addEventListener('mouseenter', function () { if (!current.pinned) peek(); });
    });
    var bar = document.getElementById('gcAppBar');
    if (bar) {
      bar.addEventListener('mouseenter', function () { if (!current.pinned) { clearTimeout(hideTimer); body.classList.add('nav-peek'); } });
      bar.addEventListener('mouseleave', function () { if (!current.pinned) peek(); });
    }
  }

  // ── top expander popover ──
  function closePop() {
    var pop = document.getElementById('navPop'); if (pop) pop.classList.remove('show');
    var ex = document.getElementById('navExpander'); if (ex) ex.classList.remove('on');
  }
  function bindControls() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav-pos]'), function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); setPos(b.getAttribute('data-nav-pos')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav-act="pin"]'), function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); setPinned(!current.pinned); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav-act="star"]'), function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); saveDefault(); });
    });
    var ex = document.getElementById('navExpander');
    if (ex) ex.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var pop = document.getElementById('navPop'); if (pop) pop.classList.toggle('show'); ex.classList.toggle('on');
    });
    document.addEventListener('click', function () { closePop(); });
    var pop = document.getElementById('navPop'); if (pop) pop.addEventListener('click', function (e) { e.stopPropagation(); });
  }

  function toast() {
    var t = document.getElementById('navToast');
    if (!t) return;
    t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 1900);
  }

  applyBody(); syncControls(); bindControls(); bindPeek();
  window.addEventListener('resize', setBrandHeight);
})();
