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
  var savedLabels = body.getAttribute('data-nav-default-labels') || 'auto';
  var over = readOverride() || {};
  var current = { pos: over.pos || saved.pos, pinned: (typeof over.pinned === 'boolean' ? over.pinned : saved.pinned) };
  var labels = over.labels || savedLabels;          // 'auto' | 'icons' | 'text'
  var railExpanded = !!over.railExpanded;           // session-only rail widen
  var hideTimer = null;
  var nav = document.getElementById('gcNav');

  function readOverride() {
    try { var v = JSON.parse(sessionStorage.getItem(SS_KEY)); if (v && v.pos) return { pos: v.pos, pinned: !!v.pinned }; }
    catch (e) {}
    return null;
  }
  function writeOverride() {
    try { sessionStorage.setItem(SS_KEY, JSON.stringify({ pos: current.pos, pinned: current.pinned, labels: labels, railExpanded: railExpanded })); } catch (e) {}
  }
  function isDefault() { return current.pos === saved.pos && current.pinned === saved.pinned; }

  function applyBody() {
    ['nav-pos-top', 'nav-pos-left', 'nav-pos-right'].forEach(function (c) { body.classList.remove(c); });
    body.classList.add('nav-pos-' + current.pos);
    body.classList.toggle('nav-pinned', current.pinned);
    if (current.pinned) body.classList.remove('nav-peek');
    applyLabels();
    setBrandHeight();
  }

  // ── Compact-nav label mode ──────────────────────────────────────────────
  // Wrap each top-level nav link's text in <span class="nav-txt"> once, and set
  // a native title so icon-only mode keeps a tooltip.
  function wrapLabels() {
    if (!nav) return;
    Array.prototype.forEach.call(nav.querySelectorAll(':scope > li > a'), function (a) {
      if (a.querySelector('.nav-txt')) return;
      var txt = '';
      Array.prototype.forEach.call(a.childNodes, function (n) {
        if (n.nodeType === 3 && n.textContent.trim()) txt += n.textContent;
      });
      txt = txt.trim();
      if (!txt) return;
      var span = document.createElement('span');
      span.className = 'nav-txt';
      span.textContent = txt;
      // replace the first non-empty text node with the span; strip the rest
      var done = false;
      Array.prototype.slice.call(a.childNodes).forEach(function (n) {
        if (n.nodeType === 3 && n.textContent.trim()) {
          if (!done) { a.replaceChild(span, n); done = true; } else { a.removeChild(n); }
        }
      });
      if (!a.getAttribute('title')) a.setAttribute('title', txt);
    });
  }

  function applyLabels() {
    ['nav-labels-auto', 'nav-labels-icons', 'nav-labels-text'].forEach(function (c) { body.classList.remove(c); });
    body.classList.add('nav-labels-' + labels);
    body.classList.toggle('nav-rail-expanded', railExpanded && current.pos !== 'top');
    buildOverflow();
    syncControls();
  }

  // Move top-bar items that don't fit onto one line into a "More" dropdown.
  // Only runs on the desktop top bar when titles are shown (auto/text). Icon
  // mode is compact enough to fit, and the rail scrolls vertically.
  function buildOverflow() {
    if (!nav) return;
    restoreOverflow();
    var wide = window.matchMedia('(min-width: 992px)').matches;
    var showsTitles = current.pos === 'top' && labels !== 'icons';
    if (!wide || current.pos !== 'top' || !showsTitles) return;
    var lis = Array.prototype.filter.call(nav.children, function (li) {
      return li.tagName === 'LI' && !li.classList.contains('nav-more');
    });
    // candidates = plain links only (never the trailing dropdowns / notifications / user menu)
    var candidates = lis.filter(function (li) {
      return !li.classList.contains('dropdown') && !li.querySelector('.dropdown-toggle') &&
             !li.querySelector('a[href="/admin/notifications"]');
    });
    if (candidates.length < 2) return;
    try {
      var first = nav.querySelector(':scope > li');
      if (!first) return;
      var rowTop = first.offsetTop;
      var more = makeMore();
      // hide from the end until everything sits on the first row
      for (var i = candidates.length - 1; i >= 0 && wrapped(); i--) {
        var li = candidates[i];
        if (li.offsetTop > rowTop || wrapped()) {
          addToMore(more, li);
        }
      }
      var menu = more.querySelector('.dropdown-menu');
      if (!menu || !menu.children.length) restoreOverflow();
    } catch (e) { restoreOverflow(); }

    function wrapped() {
      // more than one visual row among the visible top-level items
      var vis = Array.prototype.filter.call(nav.children, function (li) {
        return li.tagName === 'LI' && !li.classList.contains('nav-hidden') && li.offsetParent !== null;
      });
      if (vis.length < 2) return false;
      var top0 = vis[0].offsetTop, maxTop = top0;
      vis.forEach(function (li) { if (li.offsetTop > maxTop) maxTop = li.offsetTop; });
      return maxTop - top0 > 4;
    }
  }
  function makeMore() {
    var more = nav.querySelector('.nav-more');
    if (more) return more;
    more = document.createElement('li');
    more.className = 'nav-more dropdown';
    more.innerHTML = '<a class="dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">' +
      '<i class="bi bi-three-dots" aria-hidden="true"></i><span class="nav-txt">' + (body.getAttribute('data-more-label') || 'More') + '</span></a>' +
      '<ul class="dropdown-menu dropdown-menu-end"></ul>';
    // insert before the first trailing dropdown (user/admin), else append
    var trailing = Array.prototype.filter.call(nav.children, function (li) {
      return li.classList && (li.classList.contains('dropdown') || (li.querySelector && li.querySelector('.dropdown-toggle')));
    })[0];
    if (trailing) nav.insertBefore(more, trailing); else nav.appendChild(more);
    return more;
  }
  function addToMore(more, li) {
    var menu = more.querySelector('.dropdown-menu');
    var a = li.querySelector('a'); if (!a) return;
    var item = document.createElement('li');
    var icon = a.querySelector('i');
    var label = (a.querySelector('.nav-txt') || {}).textContent || a.textContent.trim();
    var link = document.createElement('a');
    link.className = 'dropdown-item' + (a.classList.contains('active') ? ' active' : '');
    link.href = a.getAttribute('href') || '#';
    link.innerHTML = (icon ? '<i class="' + icon.className + '"></i>' : '') + '<span>' + label + '</span>';
    item.appendChild(link);
    menu.insertBefore(item, menu.firstChild);   // keep source order (we walk from the end)
    li.classList.add('nav-hidden');
    li.setAttribute('data-nav-moved', '1');
  }
  function restoreOverflow() {
    if (!nav) return;
    Array.prototype.forEach.call(nav.querySelectorAll('[data-nav-moved]'), function (li) {
      li.classList.remove('nav-hidden'); li.removeAttribute('data-nav-moved');
    });
    var more = nav.querySelector('.nav-more'); if (more) more.parentNode.removeChild(more);
  }

  function setLabels(v) {
    labels = v; railExpanded = false; writeOverride(); applyLabels();
    persist({ navLabels: v });
  }
  function toggleLabels() { setLabels(labels === 'icons' ? 'text' : 'icons'); }
  function setRailExpanded(v) { railExpanded = v; writeOverride(); applyLabels(); }

  function persist(obj) {
    var form = new URLSearchParams();
    Object.keys(obj).forEach(function (k) { form.set(k, obj[k]); });
    fetch('/admin/ui-prefs', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(), credentials: 'same-origin'
    }).catch(function () {});
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
    // label-mode buttons (highlight the effective mode; 'auto' lights neither hard-set)
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav-labels]'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-nav-labels') === labels);
    });
    // rail expand button
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav-act="expand"]'), function (b) {
      b.classList.toggle('on', railExpanded);
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
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav-labels]'), function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); setLabels(b.getAttribute('data-nav-labels')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav-act="expand"]'), function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); setRailExpanded(!railExpanded); });
    });
    // Power-user shortcut: Ctrl/⌘ + \ flips icons ⇄ icon+title (not while typing).
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === '\\' || e.code === 'Backslash')) {
        var t = e.target; var tag = t && t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
        e.preventDefault(); toggleLabels();
      }
    });
    window.addEventListener('resize', function () { buildOverflow(); });
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

  wrapLabels(); applyBody(); syncControls(); bindControls(); bindPeek();
  window.addEventListener('resize', setBrandHeight);
})();
