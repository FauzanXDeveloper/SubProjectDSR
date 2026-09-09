/* ============================================================
   admin.js - Calculation Settings editor (admin/settings.html).

   Edits Engine.CONFIG values and saves them as overrides via
   store/policyConfig.js, into the browser's local JSON database.
   Every session's calculator merges those overrides over the Excel
   defaults on its next page load. Reset clears the overrides entirely.

   PF pricing matrices: edited per grid (raw fractions p.a.,
   blank = NA); included in the saved overrides only once a cell
   has actually been changed, so future updates to the shipped
   matrices are not silently masked.
   ============================================================ */
(function () {
  'use strict';
  var E = window.Engine;
  var current = E.cloneConfig(E.CONFIG);       // working copy (defaults + saved overrides)
  var matrices = null;                          // lazy working copy of the PF grids
  var matricesDirty = !!current.pfMatrices;     // overrides already carried grids?

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function getPath(obj, p) {
    return p.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
  }
  function setPath(obj, p, v) {
    var ks = p.split('.'), last = ks.pop();
    var o = ks.reduce(function (a, k) { return a[k]; }, obj);
    o[last] = v;
  }
  function parseNum(v) {
    var n = parseFloat(String(v == null ? '' : v).replace(/[,\s%]/g, ''));
    return isFinite(n) ? n : null;
  }
  /* kinds: num = plain number | money = RM | pct = stored as percent number
            frac = stored as fraction, edited as percent */
  function show(v, kind) {
    if (v == null) return '';
    if (kind === 'frac') v = v * 100;
    return (v % 1 !== 0) ? v.toFixed(2) : String(v);
  }
  function store(v, kind) {
    var n = parseNum(v);
    if (n == null) return null;
    return kind === 'frac' ? n / 100 : n;
  }

  /* ---------------- schema ---------------- */
  var SECTIONS = [
    { title: 'Customer Class (TYPE A / TYPE B)',
      note: 'TYPE B at or above this gross monthly income; TYPE A below.',
      fields: [
        ['classBreak', 'Class break - gross income', 'money']
      ] },
    { title: 'Personal Financing - DSR & NDI',
      fields: [
        ['pf.typeA.threshold', 'TYPE A DSR cap (%)', 'frac'],
        ['pf.typeA.ndiMin', 'TYPE A NDI minimum', 'money'],
        ['pf.typeB.thresholdLow', 'TYPE B DSR cap - lower band (%)', 'frac'],
        ['pf.typeB.thresholdHigh', 'TYPE B DSR cap - upper band (%)', 'frac'],
        ['pf.typeB.incomeBreak', 'TYPE B band break - gross income', 'money'],
        ['pf.typeB.ndiMin', 'TYPE B NDI minimum', 'money'],
        ['pf.stress.low', 'Stress DSR cap - lower band (%)', 'frac'],
        ['pf.stress.high', 'Stress DSR cap - upper band (%)', 'frac'],
        ['pf.stress.incomeBreak', 'Stress band break', 'money'],
        ['pf.gate.minIncome', 'Eligibility: minimum gross income', 'money'],
        ['pf.gate.autoOk', 'Eligibility: auto-OK gross income', 'money']
      ],
      map: { path: 'pf.gradeMax', title: 'Max financing by PF risk grade (income band 3,000-4,999)',
             keyLabel: 'Risk grade', valLabel: 'Max amount', kind: 'money' } },
    { title: 'Home Financing - DSR thresholds',
      fields: [
        ['hf.normal.band1Min', 'NORMAL band 1 from', 'money'],
        ['hf.normal.band1Thr', 'NORMAL band 1 DSR cap (%)', 'frac'],
        ['hf.normal.band2Min', 'NORMAL band 2 from', 'money'],
        ['hf.normal.band2Thr', 'NORMAL band 2 DSR cap (%)', 'frac'],
        ['hf.normal.band3Min', 'NORMAL band 3 from', 'money'],
        ['hf.normal.band3Thr', 'NORMAL band 3 DSR cap (%)', 'frac'],
        ['hf.bizman.band2Min', 'BIZMAN band from', 'money'],
        ['hf.bizman.band2Thr', 'BIZMAN band DSR cap (%)', 'frac'],
        ['hf.bizman.band3Min', 'BIZMAN top band from', 'money'],
        ['hf.bizman.band3Thr', 'BIZMAN top band DSR cap (%)', 'frac']
      ] },
    { title: 'Unsecured exposure',
      fields: [
        ['unsecured.cap1Min', 'Cap band 1 from', 'money'],
        ['unsecured.cap1', 'Cap band 1 (%)', 'frac'],
        ['unsecured.cap2Min', 'Cap band 2 from', 'money'],
        ['unsecured.cap2', 'Cap band 2 (%)', 'frac'],
        ['unsecured.cap3Min', 'Cap band 3 from', 'money'],
        ['unsecured.cap3', 'Cap band 3 (%)', 'frac'],
        ['unsecured.mumLow', 'MUM - base multiplier', 'num'],
        ['unsecured.mumMidMin', 'MUM - mid band above', 'money'],
        ['unsecured.mumMid', 'MUM - mid multiplier', 'num'],
        ['unsecured.mumHighMin', 'MUM - top band above', 'money'],
        ['unsecured.mumHigh', 'MUM - top multiplier', 'num']
      ] },
    { title: 'Credit Card',
      fields: [
        ['cc.cardMax', 'Maximum card limit', 'money'],
        ['cc.minPlatinum', 'Minimum limit - Platinum', 'money'],
        ['cc.minSignature', 'Minimum limit - Signature / Both', 'money'],
        ['cc.minScore', 'Minimum eligible iScore', 'num'],
        ['cc.salaryCap.minIncome', 'Salary cap: gross from', 'money'],
        ['cc.salaryCap.maxIncome', 'Salary cap: gross to', 'money'],
        ['cc.salaryCap.multiplier', 'Salary cap: limit = gross x', 'num'],
        ['cc.dsrLow', 'DSR cap - low band (%)', 'pct'],
        ['cc.dsrMid', 'DSR cap - mid band (%)', 'pct'],
        ['cc.dsrHigh', 'DSR cap - high band (%)', 'pct'],
        ['cc.dsrMidMin', 'Mid band from', 'money'],
        ['cc.dsrHighMin', 'High band above', 'money'],
        ['cc.instalmentPct', 'Monthly instalment (% of limit)', 'pct']
      ],
      map: { path: 'cc.multipliers', title: 'Limit multiplier by card risk grade',
             keyLabel: 'Risk grade', valLabel: 'x gross income', kind: 'num' } },
    { title: 'CCRIS commitments',
      fields: [
        ['ccris.cardRatePct', 'Credit-card commitment rate (%)', 'pct'],
        ['ccris.cardFloor', 'Credit-card commitment floor', 'money'],
        ['ccris.odRatePct', 'Overdraft rate - % of LIMIT', 'pct'],
        ['ccris.btRatePct', 'Balance-transfer repayment rate (%)', 'pct'],
        ['ccris.btFloor', 'Balance-transfer floor - PF/CC', 'money']
      ],
      map: { path: 'ccris.facilityFactors', title: 'Facility commitment factors (0 = excluded, 1 = as per CCRIS)',
             keyLabel: 'Facility code', valLabel: 'Factor', kind: 'num' },
      map2: { path: 'ccris.stressFactors', title: 'Stress-test uplift by collateral (%)',
              keyLabel: 'Collateral', valLabel: 'Uplift (%)', kind: 'num' } },
    { title: 'Income recognition',
      fields: [
        ['income.commissionPct', 'Commission recognition (%)', 'pct'],
        ['income.epfVariablePct', 'EPF variable-income recognition (%)', 'pct'],
        ['income.epfDefaultRatePct', 'Default EPF contribution rate (%)', 'pct'],
        ['income.incomeTypeRatioPct', 'Fixed/Variable income split ratio (%)', 'pct'],
        ['income.bizmanVariationPct', 'BIZMAN variation acceptable (%)', 'pct']
      ] }
  ];

  /* ---------------- render ---------------- */
  function fieldHtml(f) {
    var v = getPath(current, f[0]);
    return '<div class="field"><label>' + esc(f[1]) + '</label>' +
      '<input class="editable" type="text" inputmode="decimal" data-p="' + f[0] +
      '" data-kind="' + f[2] + '" value="' + esc(show(v, f[2])) + '"></div>';
  }
  function mapHtml(m) {
    var obj = getPath(current, m.path) || {};
    var rows = Object.keys(obj).map(function (k) {
      return '<tr><td>' + esc(k) + '</td><td class="editable">' +
        '<input data-map="' + m.path + '" data-key="' + esc(k) + '" data-kind="' + m.kind +
        '" type="text" inputmode="decimal" value="' + esc(show(obj[k], m.kind)) + '"></td></tr>';
    }).join('');
    return '<div class="subhead">' + esc(m.title) + '</div>' +
      '<div class="tbl-wrap" style="max-width:460px"><table class="tbl adm-grid"><thead><tr><th>' +
      esc(m.keyLabel) + '</th><th>' + esc(m.valLabel) + '</th></tr></thead><tbody>' + rows +
      '</tbody></table></div>';
  }
  function sectionHtml(s) {
    var body = (s.note ? '<div class="adm-note">' + esc(s.note) + '</div>' : '') +
      '<div class="grid c3">' + s.fields.map(fieldHtml).join('') + '</div>' +
      (s.map ? mapHtml(s.map) : '') + (s.map2 ? mapHtml(s.map2) : '');
    return '<div class="card"><div class="card-head"><span>' + esc(s.title) +
      '</span></div><div class="card-body">' + body + '</div></div>';
  }

  /* ---------------- PF matrices editor ---------------- */
  var GRIDS = [
    ['flatOthers.0', 'Fixed Rate - OTHERS, income 3,000-4,999'],
    ['flatOthers.1', 'Fixed Rate - OTHERS, income 5,000-14,999'],
    ['flatOthers.2', 'Fixed Rate - OTHERS, income 15,000-29,999'],
    ['flatOthers.3', 'Fixed Rate - OTHERS, income 30,000+'],
    ['eprOthers.0', 'EPR - OTHERS, income 3,000-4,999'],
    ['eprOthers.1', 'EPR - OTHERS, income 5,000-14,999'],
    ['eprOthers.2', 'EPR - OTHERS, income 15,000-29,999'],
    ['eprOthers.3', 'EPR - OTHERS, income 30,000+'],
    ['flatMicro1', 'Fixed Rate - MICRO 1 (1,000-10,000)'],
    ['eprMicro1', 'EPR - MICRO 1'],
    ['flatMicro2', 'Fixed Rate - MICRO 2 (10,500-20,000)'],
    ['eprMicro2', 'EPR - MICRO 2']
  ];
  function ensureMatrices() {
    if (matrices) return matrices;
    var src = current.pfMatrices || {
      flatOthers: E.NDI_PRICING.flatOthers, eprOthers: E.NDI_PRICING.eprOthers,
      flatMicro1: E.NDI_PRICING.flatMicro1, eprMicro1: E.NDI_PRICING.eprMicro1,
      flatMicro2: E.NDI_PRICING.flatMicro2, eprMicro2: E.NDI_PRICING.eprMicro2
    };
    matrices = JSON.parse(JSON.stringify(src));
    return matrices;
  }
  function gridOf(key) {
    var parts = key.split('.');
    var g = ensureMatrices()[parts[0]];
    return parts.length > 1 ? g[+parts[1]] : g;
  }
  function matrixTable(key) {
    var g = gridOf(key);
    var head = '<tr><th>Grade \\ Tenure</th>';
    for (var t = 1; t <= 10; t++) head += '<th>' + t + 'y</th>';
    head += '</tr>';
    var body = '';
    for (var r = 0; r < 10; r++) {
      body += '<tr><th>RG ' + (r + 1) + '</th>';
      for (var c = 0; c < 10; c++) {
        var v = g[r][c];
        // stored as a fraction p.a. (0.135 = 13.5%); shown/edited as a
        // percent to 2 decimal places, which is how these rates are
        // actually quoted
        body += '<td><input data-mx="' + key + '" data-r="' + r + '" data-c="' + c +
          '" value="' + (v == null ? '' : (v * 100).toFixed(2)) + '"></td>';
      }
      body += '</tr>';
    }
    return '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }
  function matrixSectionHtml() {
    var opts = GRIDS.map(function (g) {
      return '<option value="' + g[0] + '">' + esc(g[1]) + '</option>';
    }).join('');
    return '<div class="card"><div class="card-head"><span>PF Pricing Matrices (profit rates)</span></div>' +
      '<div class="card-body">' +
      '<div class="adm-note">% p.a., 2 dp. Blank = NA. ' +
      'Rows = Experian PF risk grade 1-10, columns = tenure in whole years.</div>' +
      '<div class="field narrow" style="max-width:420px;margin-bottom:10px"><label>Matrix</label>' +
      '<select class="editable" id="mx-select">' + opts + '</select></div>' +
      '<div class="mx-wrap" id="mx-host"></div>' +
      '</div></div>';
  }

  /* ---------------- events / persistence ---------------- */
  /* Sidebar-routed: each schema section renders into its own .adm-sec panel;
     the nav item with the matching data-sec shows it (index 7 = matrices). */
  function renderAll() {
    var html = SECTIONS.map(function (s, i) {
      return '<div class="adm-sec" id="adm-sec-' + i + '">' + sectionHtml(s) + '</div>';
    }).join('') + '<div class="adm-sec" id="adm-sec-' + SECTIONS.length + '">' +
      matrixSectionHtml() + '</div>';
    el('adm-sections').innerHTML = html;
    el('mx-host').innerHTML = matrixTable(el('mx-select').value);
    el('mx-select').onchange = function () { el('mx-host').innerHTML = matrixTable(this.value); };
    wireNav();
    activateSection(initialSection());
    refreshStatus();
  }

  /** Deep-link support: Policy Settings links elsewhere in the app (the
      shared sidebar on Dashboard/Users/Audit Log) point straight at a
      section via ?sec=N so admins don't have to land on section 0 and
      re-click. */
  function initialSection() {
    var m = /[?&]sec=(\d+)/.exec(location.search);
    var i = m ? +m[1] : 0;
    return (i >= 0 && i <= SECTIONS.length) ? i : 0;
  }

  function activateSection(i) {
    document.querySelectorAll('.adm-sec').forEach(function (n, idx) {
      n.classList.toggle('active', idx === i);
    });
    // scoped to [data-sec]: the sidebar also carries plain page-to-page
    // nav links (Dashboard, Users, ...) that share the .nav-item look but
    // aren't part of this in-page section router
    document.querySelectorAll('.nav-item[data-sec]').forEach(function (btn) {
      btn.classList.toggle('active', +btn.dataset.sec === i);
      if (+btn.dataset.sec === i) {
        el('page-title').textContent = btn.querySelector('.nav-txt').textContent;
      }
    });
  }

  function wireNav() {
    document.querySelectorAll('.nav-item[data-sec]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activateSection(+btn.dataset.sec);
        el('sidebar').classList.remove('open');
      });
    });
    var menu = el('btn-menu');
    if (menu) menu.addEventListener('click', function () {
      el('sidebar').classList.toggle('open');
    });
  }
  var hasOverridesOnServer = window.PolicyConfig ? PolicyConfig.hasOverrides() : !!window.__DSR_CONFIG_OVERRIDES;
  function refreshStatus() {
    el('adm-status').innerHTML = hasOverridesOnServer
      ? '<span class="chip ovr">CUSTOM SETTINGS ACTIVE</span> saved overrides are applied on top of the Excel defaults.'
      : '<span class="chip def">EXCEL DEFAULTS</span> no overrides saved - the system runs on the master Excel values.';
  }

  /** Save the overrides (or {} to clear them) into the local JSON database; returns a Promise for API parity with the old fetch()-based version. */
  function saveToServer(overrides) {
    try {
      var user = window.Auth ? Auth.currentUser() : null;
      PolicyConfig.save(overrides, user ? user.id : null);
      return Promise.resolve({ ok: true });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.dataset.p) {
      var v = store(t.value, t.dataset.kind);
      if (v != null) setPath(current, t.dataset.p, v);
    } else if (t.dataset.map) {
      var obj = getPath(current, t.dataset.map);
      var mv = store(t.value, t.dataset.kind);
      if (mv != null) obj[t.dataset.key] = mv;
    } else if (t.dataset.mx) {
      var g = gridOf(t.dataset.mx);
      var n = parseNum(t.value);           // typed as a percent, 2dp (e.g. 13.50)
      // store back as the fraction the engine expects (13.50 -> 0.135),
      // rounded to strip float noise from the /100 division
      g[+t.dataset.r][+t.dataset.c] = n == null ? null : Math.round((n / 100) * 1e6) / 1e6;
      matricesDirty = true;
    }
  });

  function overridesSnapshot() {
    var out = E.cloneConfig(current);
    if (matricesDirty && matrices) out.pfMatrices = matrices;
    else delete out.pfMatrices;    // untouched -> keep following the shipped grids
    return out;
  }
  el('btn-save').onclick = function () {
    saveToServer(overridesSnapshot()).then(function () {
      hasOverridesOnServer = true;
      el('save-msg').textContent = 'Saved. Applies to every user on their next page load.';
      setTimeout(function () { el('save-msg').textContent = ''; }, 4000);
      refreshStatus();
    }).catch(function (e) { alert('Could not save: ' + e.message); });
  };
  el('btn-reset').onclick = function () {
    if (!confirm('Remove ALL custom settings and restore the master Excel defaults?')) return;
    saveToServer({}).then(function () { location.reload(); })
      .catch(function (e) { alert('Could not reset: ' + e.message); });
  };
  el('btn-export').onclick = function () {
    var blob = new Blob([JSON.stringify(overridesSnapshot(), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dsr-calc-settings_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };
  el('btn-import').onclick = function () { el('file-import').click(); };
  el('file-import').onchange = function () {
    var f = this.files[0];
    if (!f) return;
    f.text().then(function (txt) {
      var obj = JSON.parse(txt);
      return saveToServer(obj);
    }).then(function () { location.reload(); })
      .catch(function (e) { alert('Could not import: ' + e.message); });
  };

  renderAll();
})();
