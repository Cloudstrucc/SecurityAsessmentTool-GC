/**
 * Clamp long control statements to a few lines and add a Show more / Show less
 * toggle.
 *
 * Control text from NIST/FedRAMP catalogs regularly runs 600-1000 characters,
 * which buries the evidence editor underneath a wall of prose. The clamp is
 * applied here rather than in the template so that:
 *   - a description that already fits gets no toggle at all, and
 *   - with JavaScript off the full text is still rendered (no hidden content).
 *
 * Labels come from window.CF_DESC_LABELS, set by the layout from the cf.* keys.
 */
(function () {
  'use strict';

  var L = window.CF_DESC_LABELS || {};
  var MORE = L.more || 'Show more';
  var LESS = L.less || 'Show less';
  var ARIA = L.aria || 'Show or hide the full control description';

  function attach(p) {
    if (p.dataset.descToggle) return;
    p.dataset.descToggle = '1';

    // Measure with the clamp on: if nothing is hidden, leave the text alone.
    p.classList.add('is-clamped');
    if (p.scrollHeight - p.clientHeight < 4) {
      p.classList.remove('is-clamped');
      return;
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-link btn-sm desc-toggle d-block';
    btn.textContent = MORE;
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', ARIA);
    btn.addEventListener('click', function () {
      var clamped = p.classList.toggle('is-clamped');
      btn.textContent = clamped ? MORE : LESS;
      btn.setAttribute('aria-expanded', clamped ? 'false' : 'true');
    });
    p.insertAdjacentElement('afterend', btn);
  }

  function init(root) {
    var scope = root && root.querySelectorAll ? root : document;
    Array.prototype.forEach.call(scope.querySelectorAll('.control-desc'), attach);
  }

  // Exposed so pages that inject control cards after load can re-run it.
  window.initControlDescToggles = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else {
    init(document);
  }
})();
