
(function () {
  // Proposed / Today toggles
  document.querySelectorAll('[data-fig]').forEach(function (fig) {
    var buttons = fig.querySelectorAll('.seg-ctl button');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var show = btn.getAttribute('data-show');
        buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        fig.querySelectorAll('[data-view]').forEach(function (v) { v.hidden = v.getAttribute('data-view') !== show; });
      });
    });
  });

  // Deterministic example data for the dashboard wireframe
  var seed = 7;
  function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }

  var heat = document.getElementById('heat');
  if (heat) {
    var days = ['S','M','T','W','T','F','S','S','M','T','W','T','F','S'];
    var html = '<span></span>' + days.map(function (d, i) { return '<span class="hd">' + d + '<br>' + (18 + i > 31 ? 18 + i - 31 : 18 + i) + '</span>'; }).join('');
    var people = [['AD','Administrator',[0,2,2,3,3,2,0,0,2,3,4,3,2,0]],['EL','Elena',[0,3,3,3,2,2,0,0,1,2,2,2,1,0]],['MR','Marco',[0,1,1,2,2,1,0,0,3,4,4,3,3,0]],['PR','Priya',[0,2,1,1,0,0,0,0,1,1,2,2,1,0]]];
    people.forEach(function (p) {
      html += '<span class="row" style="gap:6px"><span class="av">' + p[0] + '</span><span>' + p[1] + '</span></span>';
      p[2].forEach(function (l, i) { html += '<span class="hc' + (l ? ' l' + l : '') + '" title="' + p[1] + ', day ' + (i + 1) + '"></span>'; });
    });
    heat.innerHTML = html;
  }

  var wl = document.getElementById('workload');
  if (wl) {
    var rows = [['Administrator',14,3],['Elena',11,1],['Marco',16,5],['Priya',7,0]];
    var max = 22;
    wl.innerHTML = rows.map(function (r) {
      return '<div class="wl"><span class="s">' + r[0] + '</span><span class="track"><i style="display:block;width:' + (r[1] - r[2]) / max * 100 + '%;background:var(--accent)"></i><i style="display:block;width:' + r[2] / max * 100 + '%;background:var(--bad)"></i></span><span class="num" style="text-align:right">' + r[1] + '</span></div>';
    }).join('') + '<div class="legend" style="font-size:11px"><span><i class="dot" style="background:var(--accent)"></i>On track</span><span><i class="dot" style="background:var(--bad)"></i>Overdue</span></div>';
  }

  var risk = document.getElementById('risk');
  if (risk) {
    var counts = {'5-4':1,'4-4':2,'4-2':1,'3-3':3,'2-4':1,'2-2':4,'1-3':2,'1-1':5};
    var cells = '';
    for (var p = 5; p >= 1; p--) {
      for (var i = 1; i <= 5; i++) {
        var s = p * i, cls = s <= 4 ? 'r-lo' : s <= 9 ? 'r-mid' : 'r-hi';
        var n = counts[p + '-' + i] || '';
        cells += '<div class="' + cls + '" title="Probability ' + p + ', impact ' + i + '">' + n + '</div>';
      }
    }
    risk.innerHTML = cells;
  }

  var contrib = document.getElementById('contrib');
  if (contrib) {
    var out = '';
    for (var k = 0; k < 26 * 7; k++) {
      var day = k % 7, r = rnd();
      var lvl = (day === 0 || day === 6) ? (r > .85 ? 1 : 0) : (r > .8 ? 3 : r > .55 ? 2 : r > .25 ? 1 : 0);
      out += '<i' + (lvl ? ' class="l' + lvl + '"' : '') + '></i>';
    }
    contrib.innerHTML = out;
  }

  // Contents scroll-spy
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
  if ('IntersectionObserver' in window && links.length) {
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          links.forEach(function (a) { a.classList.remove('on'); });
          var a = byId[e.target.id];
          if (a) a.classList.add('on');
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    Object.keys(byId).forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
  }
})();
