/* Monolith Guide: theme toggle, scroll-spy for the contents rail, copy buttons on code blocks. No dependencies. */
(function () {
  var root = document.documentElement;
  var KEY = 'monolith-guide-theme';

  // 1. Theme: follows the system unless the reader picked one (remembered in localStorage when available).
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);
  } catch (e) { /* private mode */ }

  function currentTheme() {
    var forced = root.getAttribute('data-theme');
    if (forced) return forced;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.querySelector('.theme-btn');
    function label() { if (btn) btn.textContent = currentTheme() === 'dark' ? 'Light mode' : 'Dark mode'; }
    label();
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', label);
    }
    if (btn) btn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
      label();
    });

    // 2. Scroll-spy: highlight the section in view.
    var links = Array.prototype.slice.call(document.querySelectorAll('.toc a[href^="#"]'));
    if ('IntersectionObserver' in window && links.length) {
      var byId = {};
      links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          links.forEach(function (a) { a.classList.remove('on'); });
          var a = byId[entry.target.id];
          if (a) a.classList.add('on');
        });
      }, { rootMargin: '-20% 0px -70% 0px' });
      Object.keys(byId).forEach(function (id) {
        var el = document.getElementById(id);
        if (el) observer.observe(el);
      });
    }

    // 3. Copy buttons on code blocks.
    Array.prototype.forEach.call(document.querySelectorAll('pre.code'), function (pre) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'copy-btn';
      b.textContent = 'Copy';
      b.addEventListener('click', function () {
        var clone = pre.cloneNode(true);
        var inner = clone.querySelector('.copy-btn');
        if (inner) inner.remove();
        var text = clone.textContent;
        var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { b.textContent = 'Select & copy'; });
      });
      pre.appendChild(b);
    });

    // 4. Opening a deep link to a collapsed endpoint or tool expands it.
    function openTarget() {
      var id = location.hash.slice(1);
      var el = id && document.getElementById(id);
      if (el && el.tagName === 'DETAILS') el.open = true;
    }
    window.addEventListener('hashchange', openTarget);
    openTarget();
  });
})();
