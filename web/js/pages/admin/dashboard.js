/* ============================================================
   admin/dashboard.js - system-wide analytics (admin only).

   One 12-column grid of panels (css/dashboard.css): KPIs, case
   volume over time, outcome split, recent cases, weekday load,
   product mix, approved financing, and the report-data SQL section
   at the bottom. Panels carry a title and numbers - no prose.
   ============================================================ */
(function () {
  'use strict';

  var user = Auth.requireLogin();
  if (!user) return;
  if (!Rbac.requireRole(user, ['admin'])) return;

  var esc = Chrome.esc;
  document.body.classList.add('dash');
  Chrome.mount({ user: user, pageTitle: 'Admin Dashboard', activeNav: 'admin' });

  var C = Charts.THEME;
  var db = Db.load();
  var counts = Cases.statusCounts();
  var total = counts.draft + counts.pending_checker + counts.returned + counts.approved + counts.rejected;
  var decided = counts.approved + counts.rejected;

  function pct(n, of) { return of > 0 ? Math.round((n / of) * 1000) / 10 : 0; }
  function money(n) {
    return (Math.round(Number(n) || 0)).toLocaleString('en-MY');
  }
  function userName(id) {
    var u = db.users.filter(function (x) { return x.id === id; })[0];
    return u ? u.name : null;
  }

  /* ---------------- date range ---------------- */
  function ymd(d) { return d.toISOString().slice(0, 10); }
  function addDaysYMD(str, n) {
    var d = new Date(str + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return ymd(d);
  }
  function validDate(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var d = new Date(s + 'T00:00:00Z');
    return (!isNaN(d.getTime()) && ymd(d) === s) ? s : null;
  }
  function diffDays(a, b) {
    return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
  }

  var params = new URLSearchParams(location.search);
  var today = Db.today();          // MYT, not the browser's zone
  var rangeTo = validDate(params.get('to')) || today;
  var rangeFrom = validDate(params.get('from')) || addDaysYMD(rangeTo, -13);
  if (rangeFrom > rangeTo) { var swap = rangeFrom; rangeFrom = rangeTo; rangeTo = swap; }
  var spanDays = diffDays(rangeFrom, rangeTo);
  if (spanDays > 365) { rangeFrom = addDaysYMD(rangeTo, -365); spanDays = 365; }

  var rangePreset = null;
  [7, 14, 30, 90].forEach(function (p) {
    if (rangeTo === today && rangeFrom === addDaysYMD(today, -(p - 1))) rangePreset = p;
  });

  /* ---------------- series ---------------- */
  var dailyMap = {};
  db.cases.forEach(function (c) {
    var d = Db.date(c.created_at);
    if (d < rangeFrom || d > rangeTo) return;
    dailyMap[d] = dailyMap[d] || {};
    dailyMap[d][c.status] = (dailyMap[d][c.status] || 0) + 1;
  });
  var dayKeys = [], labels = [];
  for (var i = 0; i <= spanDays; i++) {
    var dstr = addDaysYMD(rangeFrom, i);
    var dObj = new Date(dstr + 'T00:00:00Z');
    dayKeys.push(dstr);
    labels.push(('0' + dObj.getUTCDate()).slice(-2) + '/' + ('0' + (dObj.getUTCMonth() + 1)).slice(-2));
  }
  function seriesFor(status) {
    return dayKeys.map(function (k) { return (dailyMap[k] && dailyMap[k][status]) || 0; });
  }
  var areaData = {
    categories: labels,
    series: [
      { name: 'Approved', data: seriesFor('approved'), color: C.green },
      { name: 'Rejected', data: seriesFor('rejected'), color: C.red },
      { name: 'Pending', data: seriesFor('pending_checker'), color: C.violet },
      { name: 'Returned', data: seriesFor('returned'), color: C.cyan }
    ]
  };

  // weekday load (Mon-Sun) across every case, not just the range
  var WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  var weekCounts = [0, 0, 0, 0, 0, 0, 0];
  db.cases.forEach(function (c) {
    var dstr = Db.date(c.created_at);
    if (!dstr) return;
    var d = new Date(dstr + 'T00:00:00Z');
    if (isNaN(d.getTime())) return;
    weekCounts[(d.getUTCDay() + 6) % 7]++;     // JS Sunday=0 -> Monday-first
  });

  // product mix
  var MODES = [
    { key: 'pf', label: 'PF', color: C.cyan },
    { key: 'hf', label: 'HF', color: C.blue },
    { key: 'cc', label: 'CC', color: C.violet },
    { key: 'pf-cc', label: 'PF + CC', color: C.green },
    { key: 'hf-cc', label: 'HF + CC', color: C.amber },
    { key: 'pf-hf', label: 'PF + HF', color: '#C77CF6' }
  ];
  var modeCounts = {};
  db.cases.forEach(function (c) { modeCounts[c.mode] = (modeCounts[c.mode] || 0) + 1; });
  var modeMax = Math.max.apply(null, MODES.map(function (m) { return modeCounts[m.key] || 0; }).concat([1]));

  /* Approved financing volume: what the bank actually committed to.
     PF takes the financing amount, HF the total financing (both terms of a
     Home One Account), so a combo case counts both of its products. */
  function caseFinancing(c) {
    var s = (c.payload && c.payload.state) || {};
    var amount = 0;
    var mode = String(c.mode || '');
    if (mode.indexOf('pf') !== -1) {
      var pf = s.pf || {};
      if (pf.apps && pf.apps.length) {
        pf.apps.forEach(function (a) { amount += parseFloat(a.amount) || 0; });
      } else { amount += parseFloat(pf.amount) || 0; }
    }
    if (mode.indexOf('hf') !== -1) {
      var h = s.hf || {};
      if (h.product === 'HOME ONE ACCOUNT') {
        var hoa = h.hoa || {};
        amount += (parseFloat((hoa.t1 || {}).financing) || 0) + (parseFloat((hoa.t2 || {}).financing) || 0);
      } else { amount += parseFloat(h.financing) || 0; }
    }
    return amount;
  }
  var financedTotal = 0;
  var financedByDay = dayKeys.map(function (k) {
    var sum = 0;
    db.cases.forEach(function (c) {
      if (c.status !== 'approved') return;
      if (Db.date(c.created_at) !== k) return;
      sum += caseFinancing(c);
    });
    return Math.round(sum);
  });
  db.cases.forEach(function (c) { if (c.status === 'approved') financedTotal += caseFinancing(c); });

  // recent cases + makers + activity
  var recentCases = db.cases.slice().sort(function (a, b) { return b.id - a.id; }).slice(0, 6);
  var byMaker = {};
  db.cases.forEach(function (c) {
    if (c.created_by == null) return;
    var m = byMaker[c.created_by] = byMaker[c.created_by] || { n: 0, approved: 0 };
    m.n++;
    if (c.status === 'approved') m.approved++;
  });
  var makerRows = Object.keys(byMaker).map(function (id) {
    return { name: userName(+id) || '(deleted user)', n: byMaker[id].n, approved: byMaker[id].approved };
  }).sort(function (a, b) { return b.n - a.n; }).slice(0, 6);
  var recentAudit = Audit.search({}, 1, 6).rows;

  /* ---------------- report data (SQL) ---------------- */
  var sqlData = null, sqlError = null;
  try {
    sqlData = ReportSql.buildData();
  } catch (e) {
    sqlError = e.message || String(e);
  }
  var sqlRows = 0;
  if (sqlData) Object.keys(sqlData.counts).forEach(function (k) { sqlRows += sqlData.counts[k]; });

  var TABLE_ORDER = [
    'customer', 'credit_report', 'report_credit_score',
    'report_summary_credit_info', 'report_liability_summary',
    'report_facility_summary', 'report_utilisation',
    'ccris_account', 'ccris_facility', 'nlci_account',
    'dsr_case', 'dsr_case_comment', 'case_income', 'case_income_month', 'case_balance_transfer',
    'loan_application', 'personal_loan_application',
    'home_loan_application', 'home_loan_term', 'credit_card_application',
    'combo_application', 'combo_pf_cc', 'combo_hf_cc', 'combo_pf_hf'
  ];

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

  function presetHref(p) {
    return '/admin/index.html?from=' + addDaysYMD(today, -(p - 1)) + '&to=' + today;
  }

  var caseRows = recentCases.map(function (c) {
    return '<tr>' +
      '<td><a href="/index.html?case=' + c.id + '">' + esc(c.reference) + '</a></td>' +
      '<td>' + esc(c.customer_name || '-') + '</td>' +
      '<td>' + esc(String(c.mode || '').toUpperCase()) + '</td>' +
      '<td>' + esc(userName(c.created_by) || '-') + '</td>' +
      '<td class="num money">' + money(c.gross_income) + '</td>' +
      '<td><span class="status-pill ' + esc(c.status) + '">' + esc(String(c.status).replace('_', ' ')) + '</span></td>' +
      '</tr>';
  }).join('');

  var makerHtml = !makerRows.length ? '<p class="empty">No cases yet.</p>' :
    '<div class="tbl-scroll"><table class="dash-tbl"><thead><tr><th>Maker</th><th class="num">Cases</th>' +
    '<th class="num">Approved</th><th class="num">Rate</th></tr></thead><tbody>' +
    makerRows.map(function (m) {
      return '<tr><td>' + esc(m.name) + '</td><td class="num">' + m.n + '</td>' +
        '<td class="num">' + m.approved + '</td>' +
        '<td class="num">' + pct(m.approved, m.n) + '%</td></tr>';
    }).join('') + '</tbody></table></div>';

  var auditHtml = !recentAudit.length ? '<p class="empty">Nothing logged yet.</p>' :
    '<div class="tbl-scroll"><table class="dash-tbl"><thead><tr><th>When</th><th>Actor</th><th>Action</th></tr></thead><tbody>' +
    recentAudit.map(function (a) {
      return '<tr><td>' + esc(Db.dateTime(a.created_at).slice(0, 16)) + '</td>' +
        '<td>' + esc(a.actor_name || 'system') + '</td>' +
        '<td>' + esc(a.action) + '</td></tr>';
    }).join('') + '</tbody></table></div>';

  function reportPanel() {
    if (sqlError) {
      return '<div class="panel c12"><div class="panel-head"><h2>Report data (SQL)</h2></div>' +
        '<div class="auth-err">' + esc(sqlError) + '</div></div>';
    }
    var tables = TABLE_ORDER.slice();
    Object.keys(sqlData.counts).forEach(function (t) {
      if (tables.indexOf(t) === -1) tables.push(t);
    });
    var tiles = tables.map(function (t) {
      var n = sqlData.counts[t] || 0;
      return '<div class="count-tile' + (n ? '' : ' zero') + '"><span>' + esc(t) + '</span><b>' + n + '</b></div>';
    }).join('');
    var options = tables.filter(function (t) { return sqlData.counts[t]; })
      .map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }).join('');

    return '<div class="panel c12" id="report-data">' +
      '<div class="panel-head"><h2>Report data (SQL)</h2>' +
        '<span class="meta">' + sqlData.caseCount + ' cases &middot; ' + sqlRows + ' rows &middot; ' +
        Object.keys(sqlData.counts).length + ' tables</span></div>' +
      '<div class="toolbar" style="margin-bottom:12px">' +
        '<button class="btn small" id="btn-db">Download .db</button>' +
        '<button class="btn small secondary" id="btn-sql-export">.sql dump</button>' +
        '<a class="btn small secondary" href="' + ReportSql.SCHEMA_URL + '" download="report_schema.sql">Schema</a>' +
        '<span class="meta" id="sql-msg"></span>' +
      '</div>' +
      '<div class="count-grid">' + tiles + '</div>' +
      '<div class="toolbar" style="margin-top:14px">' +
        '<select id="q-table">' + options + '</select>' +
        '<input type="number" id="q-limit" value="20" min="1" max="1000" style="width:76px">' +
        '<button class="btn small" id="btn-run">Run</button>' +
      '</div>' +
      '<textarea class="sql-query" id="q-sql" spellcheck="false"></textarea>' +
      '<div id="q-result"></div>' +
    '</div>';
  }

  document.getElementById('app-content').innerHTML =
    '<div class="dash-grid">' +
      '<div class="c3">' + tile('', total, 'Total cases') + '</div>' +
      '<div class="c3">' + tile('ok', counts.approved, 'Approved',
        pct(counts.approved, decided) + '% of decided', 'up') + '</div>' +
      '<div class="c3">' + tile('fail', counts.rejected, 'Rejected',
        pct(counts.rejected, decided) + '% of decided', 'down') + '</div>' +
      '<div class="c3">' + tile('warn', counts.pending_checker, 'Pending checker',
        counts.returned ? counts.returned + ' returned to makers' : '', 'down') + '</div>' +

      '<div class="panel c8">' +
        '<div class="panel-head"><h2>Case volume</h2>' +
          '<div class="toolbar">' +
            '<span class="seg">' + [7, 14, 30, 90].map(function (p) {
              return '<a class="' + (rangePreset === p ? 'on' : '') + '" href="' + presetHref(p) + '">' + p + 'd</a>';
            }).join('') + '</span>' +
            '<input type="date" id="range-from" value="' + esc(rangeFrom) + '" max="' + esc(rangeTo) + '">' +
            '<input type="date" id="range-to" value="' + esc(rangeTo) + '" max="' + esc(today) + '">' +
            '<button class="btn small secondary" id="btn-range">Apply</button>' +
          '</div>' +
        '</div>' +
        '<div id="chart-area"></div>' +
      '</div>' +

      '<div class="panel c4">' +
        '<div class="panel-head"><h2>Outcomes</h2></div>' +
        '<div id="chart-donut"></div>' +
        '<div class="legend">' +
          legendRow('Approved', counts.approved, C.green, pct(counts.approved, total)) +
          legendRow('Rejected', counts.rejected, C.red, pct(counts.rejected, total)) +
          legendRow('Pending checker', counts.pending_checker, C.violet, pct(counts.pending_checker, total)) +
          legendRow('Returned', counts.returned, C.cyan, pct(counts.returned, total)) +
          legendRow('Draft', counts.draft, C.muted, pct(counts.draft, total)) +
        '</div>' +
      '</div>' +

      '<div class="panel c7">' +
        '<div class="panel-head"><h2>Recent cases</h2>' +
          '<a class="meta" href="/cases.html" style="text-decoration:none">All &rarr;</a></div>' +
        (recentCases.length
          ? '<div class="tbl-scroll"><table class="dash-tbl"><thead><tr><th>Reference</th><th>Customer</th>' +
            '<th>Mode</th><th>Maker</th><th class="num">Gross</th><th>Status</th></tr></thead>' +
            '<tbody>' + caseRows + '</tbody></table></div>'
          : '<p class="empty">No cases yet.</p>') +
      '</div>' +

      '<div class="panel c5">' +
        '<div class="panel-head"><h2>By weekday</h2></div>' +
        '<div id="chart-week"></div>' +
      '</div>' +

      '<div class="panel c8">' +
        '<div class="panel-head"><h2>By product</h2></div>' +
        '<div class="ring-row">' + MODES.map(function (m) {
          return '<div class="ring-cell"><div class="cap">' + esc(m.label) + '</div>' +
            '<div class="box" id="ring-' + m.key.replace('-', '_') + '"></div></div>';
        }).join('') + '</div>' +
      '</div>' +

      '<div class="panel c4">' +
        '<div class="panel-head"><h2>Approved financing</h2></div>' +
        '<div class="kpi"><div class="n">' + money(financedTotal) + '</div>' +
          '<div class="l">RM committed &middot; ' + counts.approved + ' cases</div></div>' +
        '<div id="chart-spark" style="margin-top:10px"></div>' +
      '</div>' +

      '<div class="panel c6"><div class="panel-head"><h2>By maker</h2></div>' + makerHtml + '</div>' +
      '<div class="panel c6">' +
        '<div class="panel-head"><h2>Activity</h2>' +
          '<a class="meta" href="/admin/audit.html" style="text-decoration:none">Log &rarr;</a></div>' +
        auditHtml + '</div>' +

      reportPanel() +
    '</div>';

  /* ---------------- charts ---------------- */
  Charts.area(document.getElementById('chart-area'), areaData);
  Charts.donut(document.getElementById('chart-donut'),
    [{ label: 'Approved', value: counts.approved, color: C.green },
     { label: 'Rejected', value: counts.rejected, color: C.red },
     { label: 'Pending checker', value: counts.pending_checker, color: C.violet },
     { label: 'Returned', value: counts.returned, color: C.cyan },
     { label: 'Draft', value: counts.draft, color: C.muted }],
    { value: pct(counts.approved, decided) + '%', label: 'Approved' });
  Charts.bars(document.getElementById('chart-week'), { categories: WEEK, data: weekCounts });
  Charts.spark(document.getElementById('chart-spark'), financedByDay, C.violet);
  MODES.forEach(function (m) {
    Charts.ring(document.getElementById('ring-' + m.key.replace('-', '_')),
      { value: modeCounts[m.key] || 0, max: modeMax, color: m.color, unit: 'CASES' });
  });

  /* ---------------- interactions ---------------- */
  document.getElementById('btn-range').addEventListener('click', function () {
    location.href = '/admin/index.html?from=' +
      encodeURIComponent(document.getElementById('range-from').value) +
      '&to=' + encodeURIComponent(document.getElementById('range-to').value);
  });

  function sqlMsg(text, color) {
    var el = document.getElementById('sql-msg');
    if (!el) return;
    el.style.color = color;
    el.textContent = text;
  }
  function logExport(kind) {
    Audit.log(user.id, 'REPORT_SQL_EXPORTED', 'report_data', null,
      { kind: kind, cases: sqlData.caseCount, rows: sqlRows });
  }
  function onExportError(err) { sqlMsg(err.message || String(err), 'var(--d-red)'); }

  var dbBtn = document.getElementById('btn-db');
  if (dbBtn) {
    dbBtn.addEventListener('click', function () {
      sqlMsg('Building...', 'var(--d-muted)');
      ReportSql.downloadDatabase().then(function () {
        logExport('db');
        sqlMsg('Downloaded.', 'var(--d-green)');
      }).catch(onExportError);
    });
  }
  var sqlBtn = document.getElementById('btn-sql-export');
  if (sqlBtn) {
    sqlBtn.addEventListener('click', function () {
      sqlMsg('Building...', 'var(--d-muted)');
      ReportSql.buildDump().then(function (sql) {
        ReportSql.download(sql, 'dsr-report-data-{stamp}.sql');
        logExport('full');
        sqlMsg('Downloaded.', 'var(--d-green)');
      }).catch(onExportError);
    });
  }

  /* Query box - runs against a real SQLite database built in the browser
     from the same schema + rows as the download (vendor/sql-wasm.js). */
  (function bindQueryBox() {
    var tableSel = document.getElementById('q-table');
    var limitEl = document.getElementById('q-limit');
    var sqlEl = document.getElementById('q-sql');
    var resultEl = document.getElementById('q-result');
    var runBtn = document.getElementById('btn-run');
    if (!sqlEl) return;

    function defaultQuery() {
      return 'SELECT * FROM ' + tableSel.value + ' LIMIT ' + (parseInt(limitEl.value, 10) || 20) + ';';
    }
    var edited = false;
    sqlEl.value = defaultQuery();
    sqlEl.addEventListener('input', function () { edited = true; });
    function resync() { if (!edited) sqlEl.value = defaultQuery(); }
    tableSel.addEventListener('change', function () { resync(); run(); });
    limitEl.addEventListener('change', resync);

    function render(res) {
      if (!res.length || !res[0].values.length) {
        resultEl.innerHTML = '<p class="empty">No rows.</p>';
        return;
      }
      var r = res[0];
      var head = r.columns.map(function (col) { return '<th>' + esc(col) + '</th>'; }).join('');
      var body = r.values.slice(0, 500).map(function (vals) {
        return '<tr>' + vals.map(function (v) {
          return '<td>' + (v === null ? '<span class="null">NULL</span>' : esc(v)) + '</td>';
        }).join('') + '</tr>';
      }).join('');
      resultEl.innerHTML = '<div class="tbl-scroll"><table class="dash-tbl">' +
        '<thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
        '<p class="empty">' + r.values.length + ' row' + (r.values.length === 1 ? '' : 's') +
        (r.values.length > 500 ? ' (first 500 shown)' : '') + '</p>';
    }

    function run() {
      resultEl.innerHTML = '<p class="empty">Running...</p>';
      ReportSql.query(sqlEl.value).then(render).catch(function (err) {
        resultEl.innerHTML = '<div class="auth-err">' + esc(err.message || String(err)) + '</div>';
      });
    }
    runBtn.addEventListener('click', run);
    sqlEl.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); }
    });
    run();
  })();
})();
