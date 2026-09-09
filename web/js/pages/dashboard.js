/* ============================================================
   dashboard.js - landing page after login (maker / checker / admin).

   Same panel grid as the admin dashboard (css/dashboard.css), scoped
   to what THIS user is allowed to see: a maker sees their own cases,
   a checker sees their queue, an admin sees everything.
   ============================================================ */
(function () {
  'use strict';

  var user = Auth.requireLogin();
  if (!user) return;

  var esc = Chrome.esc;
  document.body.classList.add('dash');
  Chrome.mount({ user: user, pageTitle: 'Dashboard', activeNav: 'dashboard' });

  var C = Charts.THEME;
  var rows = Cases.listForUser(user);
  var counts = { draft: 0, pending_checker: 0, returned: 0, approved: 0, rejected: 0 };
  rows.forEach(function (r) { if (counts[r.status] !== undefined) counts[r.status]++; });
  var total = rows.length;
  var decided = counts.approved + counts.rejected;

  function pct(n, of) { return of > 0 ? Math.round((n / of) * 1000) / 10 : 0; }
  function money(n) { return (Math.round(Number(n) || 0)).toLocaleString('en-MY'); }

  /* ---------------- 14-day volume ---------------- */
  function ymd(d) { return d.toISOString().slice(0, 10); }
  function addDays(str, n) {
    var d = new Date(str + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return ymd(d);
  }
  var today = Db.today();          // MYT, not the browser's zone
  var from = addDays(today, -13);
  var dayKeys = [], labels = [];
  for (var i = 0; i < 14; i++) {
    var k = addDays(from, i);
    var d = new Date(k + 'T00:00:00Z');
    dayKeys.push(k);
    labels.push(('0' + d.getUTCDate()).slice(-2) + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2));
  }
  function seriesFor(status) {
    return dayKeys.map(function (k) {
      return rows.filter(function (r) {
        return r.status === status && Db.date(r.created_at) === k;
      }).length;
    });
  }

  /* ---------------- product mix ---------------- */
  var MODES = [
    { key: 'pf', label: 'PF', color: C.cyan },
    { key: 'hf', label: 'HF', color: C.blue },
    { key: 'cc', label: 'CC', color: C.violet },
    { key: 'pf-cc', label: 'PF + CC', color: C.green },
    { key: 'hf-cc', label: 'HF + CC', color: C.amber },
    { key: 'pf-hf', label: 'PF + HF', color: '#C77CF6' }
  ];
  var modeCounts = {};
  rows.forEach(function (r) { modeCounts[r.mode] = (modeCounts[r.mode] || 0) + 1; });
  var modeMax = Math.max.apply(null, MODES.map(function (m) { return modeCounts[m.key] || 0; }).concat([1]));

  /* ---------------- markup ---------------- */
  function tile(cls, n, label, delta, deltaCls) {
    return '<div class="panel tile ' + cls + '"><span class="bar"></span><div class="kpi">' +
      '<div class="n">' + n + '</div><div class="l">' + esc(label) + '</div>' +
      (delta ? '<div class="delta ' + (deltaCls || '') + '">' + esc(delta) + '</div>' : '') +
      '</div></div>';
  }
  function legendRow(label, value, color, share) {
    return '<div class="legend-row"><span class="dot" style="background:' + color + '"></span>' +
      '<span class="txt">' + esc(label) + '</span>' +
      '<span class="val">' + value + ' &middot; ' + share + '%</span></div>';
  }

  var isMaker = user.role === 'normal';
  var queueLabel = user.role === 'checker' ? 'In your queue' : 'Awaiting checker';

  var tiles =
    '<div class="c3">' + tile('violet', total, 'Total cases') + '</div>' +
    '<div class="c3">' + tile('warn', counts.pending_checker, queueLabel,
      counts.returned ? counts.returned + (isMaker ? ' returned to you' : ' returned to makers') : '',
      'down') + '</div>' +
    '<div class="c3">' + tile('ok', counts.approved, 'Approved',
      pct(counts.approved, decided) + '% of decided', 'up') + '</div>' +
    '<div class="c3">' + tile('fail', counts.rejected, 'Rejected',
      pct(counts.rejected, decided) + '% of decided', 'down') + '</div>';

  var caseRows = rows.slice(0, 8).map(function (r) {
    return '<tr>' +
      '<td><a href="/index.html?case=' + r.id + '">' + esc(r.reference) + '</a></td>' +
      '<td>' + esc(r.customer_name || '-') + '</td>' +
      '<td>' + esc(String(r.mode || '').toUpperCase()) + '</td>' +
      (isMaker ? '<td>' + esc(r.checker_name || '-') + '</td>'
               : '<td>' + esc(r.maker_name || '-') + '</td>') +
      '<td class="num money">' + money(r.gross_income) + '</td>' +
      '<td><span class="status-pill ' + esc(r.status) + '">' +
        esc(String(r.status).replace('_', ' ')) + '</span></td>' +
      '</tr>';
  }).join('');

  document.getElementById('app-content').innerHTML =
    '<div class="dash-grid">' +
      tiles +

      '<div class="panel c8">' +
        '<div class="panel-head"><h2>Last 14 days</h2>' +
          (isMaker ? '<a class="btn small" href="/index.html">+ New case</a>' : '') +
        '</div>' +
        '<div id="chart-area"></div>' +
      '</div>' +

      '<div class="panel c4">' +
        '<div class="panel-head"><h2>Outcomes</h2></div>' +
        '<div id="chart-donut"></div>' +
        '<div class="legend">' +
          legendRow('Approved', counts.approved, C.green, pct(counts.approved, total)) +
          legendRow('Rejected', counts.rejected, C.red, pct(counts.rejected, total)) +
          legendRow(queueLabel, counts.pending_checker, C.violet, pct(counts.pending_checker, total)) +
          legendRow('Returned', counts.returned, C.cyan, pct(counts.returned, total)) +
        '</div>' +
      '</div>' +

      '<div class="panel c7">' +
        '<div class="panel-head"><h2>Recent cases</h2>' +
          '<a class="meta" href="/cases.html" style="text-decoration:none">All &rarr;</a></div>' +
        (rows.length
          ? '<div class="tbl-scroll"><table class="dash-tbl"><thead><tr><th>Reference</th><th>Customer</th>' +
            '<th>Mode</th><th>' + (isMaker ? 'Checker' : 'Maker') + '</th>' +
            '<th class="num">Gross</th><th>Status</th></tr></thead>' +
            '<tbody>' + caseRows + '</tbody></table></div>'
          : '<p class="empty">No cases yet.</p>') +
      '</div>' +

      '<div class="panel c5">' +
        '<div class="panel-head"><h2>By product</h2></div>' +
        '<div class="ring-row compact">' + MODES.map(function (m) {
          return '<div class="ring-cell"><div class="cap">' + esc(m.label) + '</div>' +
            '<div class="box" id="ring-' + m.key.replace('-', '_') + '"></div></div>';
        }).join('') + '</div>' +
      '</div>' +
    '</div>';

  Charts.area(document.getElementById('chart-area'), {
    categories: labels,
    series: [
      { name: 'Approved', data: seriesFor('approved'), color: C.green },
      { name: 'Rejected', data: seriesFor('rejected'), color: C.red },
      { name: 'Pending', data: seriesFor('pending_checker'), color: C.violet },
      { name: 'Returned', data: seriesFor('returned'), color: C.cyan }
    ]
  });
  Charts.donut(document.getElementById('chart-donut'),
    [{ label: 'Approved', value: counts.approved, color: C.green },
     { label: 'Rejected', value: counts.rejected, color: C.red },
     { label: queueLabel, value: counts.pending_checker, color: C.violet },
     { label: 'Returned', value: counts.returned, color: C.cyan }],
    { value: pct(counts.approved, decided) + '%', label: 'Approved' });
  MODES.forEach(function (m) {
    Charts.ring(document.getElementById('ring-' + m.key.replace('-', '_')),
      { value: modeCounts[m.key] || 0, max: modeMax, color: m.color, unit: 'CASES' });
  });
})();
