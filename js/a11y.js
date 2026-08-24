// js/a11y.js — 접근성 모드 토글 (전 페이지 공용)
(function () {
  'use strict';

  var STORAGE_KEY = 'jeommetu_a11y_mode';

  function injectMarkup() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'a11yToggle';
    btn.className = 'a11y-toggle-btn dot';
    btn.setAttribute('aria-pressed', 'false');
    btn.textContent = '접근성 모드';
    document.body.insertBefore(btn, document.body.firstChild);
    return btn;
  }

  function applyA11yMode(on, btn) {
    document.documentElement.classList.toggle('a11y-mode', on);
    if (btn) btn.setAttribute('aria-pressed', String(on));
  }

  var btn = injectMarkup();

  var stored = null;
  try { stored = window.localStorage.getItem(STORAGE_KEY); } catch (e) {}
  applyA11yMode(stored === 'on', btn);

  btn.addEventListener('click', function () {
    var next = btn.getAttribute('aria-pressed') !== 'true';
    applyA11yMode(next, btn);
    try { window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off'); } catch (e) {}
  });
})();
