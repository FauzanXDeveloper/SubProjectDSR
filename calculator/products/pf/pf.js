/* ---------------- personal financing ---------------- */

(function () {
  'use strict';
  var App = window.App = window.App || {};
  var E = window.Engine;
  var fmt = App.mod.ui.fmt, fmtPct = App.mod.ui.fmtPct, DSR_DP = App.mod.ui.DSR_DP, num = App.mod.ui.num, esc = App.mod.ui.esc, el = App.mod.ui.el, vClass = App.mod.ui.vClass, vLabel = App.mod.ui.vLabel, tile = App.mod.ui.tile, gauge = App.mod.ui.gauge, field = App.mod.ui.field, bindNum = App.mod.ui.bindNum, cardShell = App.mod.ui.cardShell;
  var applicantPersonalIncome = App.mod.applicants.applicantPersonalIncome, applicantIScore = App.mod.applicants.applicantIScore, applicantExisting = App.mod.applicants.applicantExisting, applicantName = App.mod.applicants.applicantName, hfApplicantList = App.mod.applicants.hfApplicantList;

  function pfTenureOptions(value) {
    var months = [], v = num(value);
    for (var y = 1; y <= 8; y++) months.push(y * 12);
    if (v > 0 && months.indexOf(v) === -1) months.push(v);
    months.sort(function (a, b) { return a - b; });
    return '<option value="">Select tenure</option>' + months.map(function (m) {
      var yrs = m / 12;
      var label = m + ' months (' + (yrs === 1 ? '1 year' : (yrs % 1 === 0 ? yrs + ' years' : yrs.toFixed(1) + ' years')) + ')';
      return '<option value="' + m + '"' + (String(m) === String(v) ? ' selected' : '') + '>' + label + '</option>';
    }).join('');
  }
  function pfTenureField(id, value, attr) {
    return '<div class="field"><label>Tenure</label>' +
      '<select class="editable" ' + (attr || ('id="' + id + '"')) + '>' +
      pfTenureOptions(value) + '</select></div>';
  }
  function bindSelect(id, obj, key) {
    var n = el(id);
    if (n) n.onchange = function () { obj[key] = this.value; App.refreshOutputs(); };
  }

  App.renderPF = function () {
    var p = App.state.pf;

    if (App.mode === 'pf-hf') {
      ensurePFSeed();
      var appList = hfApplicantList();
      var listHtml = p.apps.map(function (a, i) {
        var usedByOthers = {};
        p.apps.forEach(function (b, j) { if (j !== i) usedByOthers[b.applicant] = true; });
        var opts = appList.filter(function (ap) { return ap.key === a.applicant || !usedByOthers[ap.key]; })
          .map(function (ap) {
            return '<option value="' + ap.key + '"' + (ap.key === a.applicant ? ' selected' : '') + '>' +
              esc(ap.name) + (ap.key === 'MAIN' ? ' (Main)' : ' (Joint ' + ap.key + ')') + '</option>';
          }).join('');
        return '<div class="pf-app" data-pi="' + i + '">' +
          '<div class="pf-app-head">' +
          '<div class="field"><label>Applicant</label><select class="editable" data-pf="applicant">' + opts + '</select></div>' +
          (p.apps.length > 1 ? '<button class="row-del" data-pdel="' + i + '" title="Remove application" type="button">&times;</button>' : '') +
          '</div>' +
          '<div class="grid c3">' +
          '<div class="field"><label>Financing Requested (RM)</label><input class="editable" data-pf="amount" type="text" inputmode="decimal" data-fmt="money" value="' + esc(a.amount) + '"></div>' +
          pfTenureField('pf-tenure-' + i, a.tenureMonths, 'data-pf="tenureMonths"') +
          '<div class="field"><label>Profit Rate Deviation/Others (%)</label><input class="editable" data-pf="deviationPct" type="text" inputmode="decimal" data-fmt="pct" value="' + esc(a.deviationPct) + '"></div>' +
          '</div>' +
          '<div id="pf-out-' + i + '"></div>' +
          '</div>';
      }).join('');
      var canAdd = App.availablePFApplicants().length > 0;
      var body = '<div class="pf-list">' + listHtml + '</div>' +
        (canAdd ? '<div style="margin-top:12px"><button class="btn small secondary" id="pf-addapp" type="button">+ Add PF application</button></div>' : '');
      el('panel-pf').innerHTML = cardShell('card-pf', 'Personal Financing - Limit &amp; DSR (per applicant)', body);
      bindPFList();
      return;
    }

    var body =
      '<div class="grid c3">' +
      field('Financing Requested (RM)', 'pf-amount', p.amount, { fmt: 'money' }) +
      pfTenureField('pf-tenure', p.tenureMonths) +
      field('Profit Rate Deviation/Others (%)', 'pf-dev', p.deviationPct, { step: '0.01' }) +
      '<div class="field"><label>Experian Risk Rating (from iScore)</label>' +
      '<span class="readonly-val" id="pf-risk">-</span></div>' +
      '<div class="field"><label>Profit Rate (%) - calculated</label>' +
      '<span class="readonly-val" id="pf-rate-flat">-</span></div>' +
      '<div class="field"><label>EPR (%) - calculated</label>' +
      '<span class="readonly-val" id="pf-rate-epr">-</span></div>' +
      '</div>' +
      '<div id="pf-out"></div>';
    el('panel-pf').innerHTML = cardShell('card-pf', 'Personal Financing - DSR Evaluation', body);
    bindNum('pf-amount', p, 'amount');
    bindSelect('pf-tenure', p, 'tenureMonths');
    bindNum('pf-dev', p, 'deviationPct');
  };

  function pfAppResultHtml(r) {
    var rgLabel = r.riskGrade != null ? r.riskGrade + ' (iScore ' + r.iScore + ')'
      : (r.iScore ? 'no grade (iScore ' + r.iScore + ')' : 'iScore missing');
    var rateLabel = r.deviationUsed ? 'Deviation ' + (r.rateFrac * 100).toFixed(2) + '%'
      : (r.flatRate != null ? 'Fixed ' + (r.flatRate * 100).toFixed(2) + '%' : 'NA');
    return '<div class="subhead">' + esc(r.name) + ' - result</div>' +
      '<p><span class="verdict ' + vClass(r.verdict) + '">' + vLabel(r.verdict) + '</span>&nbsp;&nbsp;' +
      '<span class="verdict ' + (r.dsr > 0 && r.dsr <= r.threshold ? 'ok' : 'fail') + '">DSR ' + fmtPct(r.dsr, DSR_DP) + '</span></p>' +
      gauge(r.dsr, r.threshold) +
      '<div class="tile-grid" style="margin-top:10px">' +
      tile('Risk Rating', rgLabel, 'accent') +
      tile('Personal Gross', fmt(r.personal.gross)) +
      tile('Profit Rate', rateLabel) +
      tile('Monthly Instalment', fmt(r.instalment), 'accent') +
      tile('Existing Commitment', fmt(r.existing)) +
      tile('New DSR', fmtPct(r.dsr, DSR_DP)) +
      tile('NDI', fmt(r.ndi), r.ndi >= r.ndiMin ? 'good' : 'accent') +
      '</div>';
  }

  function refreshPFList() {
    (App.state.pf.apps || []).forEach(function (a, i) {
      var cell = el('pf-out-' + i);
      if (cell) cell.innerHTML = pfAppResultHtml(App.computePFApp(a));
    });
  }

  function bindPFList() {
    var panel = el('panel-pf');
    if (!panel || panel._pfListBound) return;
    panel._pfListBound = true;
    function onField(ev) {
      var t = ev.target, box = t.closest ? t.closest('.pf-app') : null;
      if (!box || t.dataset.pf == null) return;
      var app = App.state.pf.apps[+box.dataset.pi];
      if (!app) return;
      app[t.dataset.pf] = t.value;
      if (t.dataset.pf === 'applicant') { App.renderPF(); }
      App.refreshOutputs();
    }
    panel.addEventListener('input', onField);

    panel.addEventListener('change', function (ev) {
      if (ev.target && ev.target.tagName === 'SELECT') onField(ev);
    });
    panel.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t.id === 'pf-addapp') {
        var avail = App.availablePFApplicants();
        if (avail.length) {
          App.state.pf.apps.push({ applicant: avail[0].key, amount: '', tenureMonths: '', deviationPct: '' });
          App.renderPF(); App.refreshOutputs();
        }
        return;
      }
      if (t.dataset && t.dataset.pdel != null) {
        App.state.pf.apps.splice(+t.dataset.pdel, 1);
        App.renderPF(); App.refreshOutputs();
      }
    });
  }

  /* ---------------- calculation ---------------- */
App.computePF = function () {
    var s = App.state, c = App.computed, p = s.pf;
    var amount = num(p.amount), months = num(p.tenureMonths);

    var riskGrade = E.riskGradeFromIScore(s.iScore);
    var rates = E.lookupPFRates(c.grossIncome, amount, months, riskGrade);

    var deviation = num(p.deviationPct);
    var rateFrac = deviation > 0 ? deviation / 100 : rates.flat;

    var gradeMax = riskGrade != null ? E.CONFIG.pf.gradeMax[riskGrade] : null;
    var gate = E.pfEligibilityGate(c.grossIncome, amount, gradeMax);
    if (gate === E.VERDICT.OK && c.grossIncome >= E.CONFIG.pf.gate.minIncome && c.grossIncome < E.CONFIG.pf.gate.autoOk
        && gradeMax == null && riskGrade != null) {
      gate = E.VERDICT.NOT_ELIGIBLE;
    }

    var instalment = (rateFrac != null)
      ? Math.round(E.flatInstalment(amount, rateFrac, months)) : 0;
    var newInst = instalment;
    var newCommitment = c.grandTotal + newInst;
    var ndi = c.netIncome - newCommitment;
    var newDSR = c.netIncome > 0 ? newCommitment / c.netIncome : 0;

    var currentDSR = c.netIncome > 0 ? c.grandTotal / c.netIncome : 0;

    var dsrBeforeBT = c.netIncome > 0 ? (c.totalCommitment + newInst) / c.netIncome : 0;

    var unsecCommit = Math.max(0, c.unsecuredTotal + instalment - c.btTotal);
    var unsecDSR = c.netIncome > 0 ? unsecCommit / c.netIncome : 0;
    var unsecCap = E.unsecuredCap(c.grossIncome);

    var v = E.pfVerdict(c.grossIncome, s.customer.cardType, newDSR, ndi);

    var rateMissing = rateFrac == null;
    var verdict = rateMissing ? E.VERDICT.NOT_ELIGIBLE
      : (gate !== E.VERDICT.OK ? gate : v.verdict);

    var stressCommit = c.stressTotal + newInst - c.btPF;
    var stressDSR = c.netIncome > 0 ? stressCommit / c.netIncome : 0;
    var stressNdi = c.netIncome - stressCommit;
    var sv = E.pfStressVerdict(c.grossIncome, stressDSR);

    return {
      riskGrade: riskGrade, product: rates.product,
      flatRate: rates.flat, eprRate: rates.epr,
      deviationUsed: deviation > 0, rateFrac: rateFrac,
      gate: gate, instalment: instalment,
      newCommitment: newCommitment,
      ndi: ndi, newDSR: newDSR,
      currentDSR: currentDSR, dsrBeforeBT: dsrBeforeBT, unsecCommit: unsecCommit, unsecDSR: unsecDSR, unsecCap: unsecCap,
      threshold: v.threshold, ndiMin: v.ndiMin, verdict: verdict,
      stressCommit: stressCommit, stressDSR: stressDSR, stressNdi: stressNdi,
      stressVerdict: rateMissing ? E.VERDICT.NOT_ELIGIBLE
        : (gate !== E.VERDICT.OK ? gate : sv.verdict),
      stressThreshold: sv.threshold
    };
  };

  App.computePFApp = function (pfApp) {
    var pers = applicantPersonalIncome(pfApp.applicant);
    var iScore = applicantIScore(pfApp.applicant);
    var amount = num(pfApp.amount), months = num(pfApp.tenureMonths);
    var deviation = num(pfApp.deviationPct);

    var riskGrade = E.riskGradeFromIScore(iScore);
    var rates = E.lookupPFRates(pers.gross, amount, months, riskGrade);
    var rateFrac = deviation > 0 ? deviation / 100 : rates.flat;

    var gradeMax = riskGrade != null ? E.CONFIG.pf.gradeMax[riskGrade] : null;
    var gate = E.pfEligibilityGate(pers.gross, amount, gradeMax);
    if (gate === E.VERDICT.OK && pers.gross >= E.CONFIG.pf.gate.minIncome
        && pers.gross < E.CONFIG.pf.gate.autoOk
        && gradeMax == null && riskGrade != null) {
      gate = E.VERDICT.NOT_ELIGIBLE;
    }

    var instalment = (rateFrac != null) ? Math.round(E.flatInstalment(amount, rateFrac, months)) : 0;
    var existing = applicantExisting(pfApp.applicant);
    var newCommitment = existing + instalment;
    var dsr = pers.net > 0 ? newCommitment / pers.net : 0;
    var ndi = pers.net - newCommitment;
    var cardType = pers.gross >= E.CONFIG.classBreak ? 'TYPE B' : 'TYPE A';
    var v = E.pfVerdict(pers.gross, cardType, dsr, ndi);
    var verdict = rateFrac == null ? E.VERDICT.NOT_ELIGIBLE
      : (gate !== E.VERDICT.OK ? gate : v.verdict);

    return {
      app: pfApp, applicant: pfApp.applicant, name: applicantName(pfApp.applicant),
      personal: pers, iScore: iScore, riskGrade: riskGrade,
      product: rates.product, flatRate: rates.flat, eprRate: rates.epr,
      deviationUsed: deviation > 0, rateFrac: rateFrac,
      amount: amount, months: months, gate: gate, instalment: instalment,
      existing: existing, newCommitment: newCommitment, dsr: dsr, ndi: ndi,
      threshold: v.threshold, ndiMin: v.ndiMin, verdict: verdict
    };
  };

  App.availablePFApplicants = function () {
    var used = {};
    (App.state.pf.apps || []).forEach(function (a) { used[a.applicant] = true; });
    return hfApplicantList().filter(function (a) { return !used[a.key]; });
  };

  function ensurePFSeed() {
    var pf = App.state.pf;
    if (!pf.apps) pf.apps = [];
    if (!pf.apps.length) {
      pf.apps.push({ applicant: 'MAIN', amount: pf.amount || '', tenureMonths: pf.tenureMonths || '', deviationPct: pf.deviationPct || '' });
    }
    var valid = {}; hfApplicantList().forEach(function (a) { valid[a.key] = true; });
    pf.apps = pf.apps.filter(function (a) { return valid[a.applicant]; });
    if (!pf.apps.length) pf.apps.push({ applicant: 'MAIN', amount: '', tenureMonths: '', deviationPct: '' });
  }

  App.refreshPF = function () {
    if (App.mode === 'pf-hf') { refreshPFList(); return; }
    var out = el('pf-out');
    if (!out) return;
    var r = App.computePF();

    var riskEl = el('pf-risk');
    if (riskEl) riskEl.textContent = r.riskGrade != null
      ? r.riskGrade + '  (iScore ' + App.state.iScore + ')' : '-';
    var flatEl = el('pf-rate-flat');
    if (flatEl) flatEl.textContent = r.deviationUsed
      ? 'Deviation - ' + (r.rateFrac * 100).toFixed(2) + '%'
      : (r.flatRate != null ? 'Fixed Rate - ' + (r.flatRate * 100).toFixed(2) + '%' : '-');
    var eprEl = el('pf-rate-epr');
    if (eprEl) eprEl.textContent = r.eprRate != null
      ? 'EPR - ' + (r.eprRate * 100).toFixed(2) + '%' : '-';

    out.innerHTML =
      '<div class="result-card">' +
      '<div class="rc-head"><span class="rc-title">Result</span>' +

      '<span>' + (App.mode === 'pf' ? '' : '<span class="verdict ' + vClass(r.verdict) + '">' + vLabel(r.verdict) + '</span>&nbsp;&nbsp;') +
      '<span class="verdict ' + (r.newDSR > 0 && r.newDSR <= r.threshold ? 'ok' : 'fail') +
      '">DSR ' + fmtPct(r.newDSR, DSR_DP) + '</span></span></div>' +
      ((r.flatRate == null && !r.deviationUsed)
        ? '<div class="notice">No matrix rate for this tenure / risk grade. Pick a tenure from ' +
          'the list (1-8 years), or enter a Profit Rate Deviation to price it manually.</div>' : '') +
      gauge(r.newDSR, r.threshold) +
      '<div class="tile-grid" style="margin-top:10px">' +
      tile('Monthly Instalment (fixed rate)', fmt(r.instalment), 'accent') +
      tile('Existing Commitment (L57)', fmt(App.computed.grandTotal)) +
      tile('New Commitment', fmt(r.newCommitment)) +

      tile('NDI', fmt(r.ndi), r.ndi >= r.ndiMin ? 'good' : 'accent') +

      tile('Current DSR', fmtPct(r.currentDSR, DSR_DP)) +
      tile('DSR After BT', fmtPct(r.newDSR, DSR_DP)) +
      tile('DSR Before BT', fmtPct(r.dsrBeforeBT, DSR_DP)) +
      '</div></div>' +
      '<div class="result-card stress">' +
      '<div class="rc-head"><span class="rc-title">Interest-Rate Stress Test (floating-rate lines)</span>' +
      '<span><span class="verdict ' + vClass(r.stressVerdict) + '">' + vLabel(r.stressVerdict) + '</span>' +
      (App.computed.stressTotal > App.computed.totalCommitment
        ? '<span class="verdict warn" style="margin-left:8px">Stress uplift ' +
          fmt(App.computed.stressTotal - App.computed.totalCommitment) + '</span>'
        : '') +
      '</span></div>' +
      '<div class="tile-grid">' +
      tile('Stress Test Combined Instalment', fmt(r.stressCommit)) +
      tile('Stress Net Disposable Income (Stress NDI)', fmt(r.stressNdi)) +
      tile('Stress Test DSR (%)', fmtPct(r.stressDSR, DSR_DP)) +
      '</div></div>' +

      '<div class="result-card">' +
      '<div class="rc-head"><span class="rc-title">Unsecured Exposure</span></div>' +
      '<div class="tile-grid">' +
      tile('New Commitment Unsecured', fmt(r.unsecCommit)) +
      tile('New DSR Unsecured (%)', fmtPct(r.unsecDSR, DSR_DP)) +
      '</div></div>';
  };

  App.registerProduct({
    id: 'pf', label: 'Personal Financing (PF)', name: 'Personal Financing', short: 'PF',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>',
    panel: 'panel-pf', render: 'renderPF', refresh: 'refreshPF', seed: 'seedPF'
  });
  App.seedPF = ensurePFSeed;
  App.mod = App.mod || {};
  App.mod.pf = { pfAppResultHtml: pfAppResultHtml, refreshPFList: refreshPFList, bindPFList: bindPFList, ensurePFSeed: ensurePFSeed };
})();
