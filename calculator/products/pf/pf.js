/* ============================================================
   products/pf/pf.js - Personal Financing (PF).
   Formulas, screen and registration for PF live in this folder.
   Shared intake (customer, CCRIS, income) comes from js/core.
   To remove PF: delete this folder and its line in js/products.js.
   ============================================================ */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var E = window.Engine;
  var fmt = App.mod.ui.fmt, fmtPct = App.mod.ui.fmtPct, DSR_DP = App.mod.ui.DSR_DP, num = App.mod.ui.num, esc = App.mod.ui.esc, el = App.mod.ui.el, vClass = App.mod.ui.vClass, vLabel = App.mod.ui.vLabel, tile = App.mod.ui.tile, gauge = App.mod.ui.gauge, field = App.mod.ui.field, bindNum = App.mod.ui.bindNum, cardShell = App.mod.ui.cardShell;
  var applicantPersonalIncome = App.mod.applicants.applicantPersonalIncome, applicantIScore = App.mod.applicants.applicantIScore, applicantExisting = App.mod.applicants.applicantExisting, applicantName = App.mod.applicants.applicantName, hfApplicantList = App.mod.applicants.hfApplicantList;
  /* ============================================================
     PERSONAL FINANCING (PF) - spec file 04
     ============================================================ */
  App.renderPF = function () {
    var p = App.state.pf;

    // ---- PF + HF: one financing application per applicant (multi-PF) ----
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
          '<div class="field"><label>Financing Requested</label><input class="editable" data-pf="amount" type="text" inputmode="decimal" data-fmt="money" value="' + esc(a.amount) + '"></div>' +
          '<div class="field"><label>Tenure (months)</label><input class="editable" data-pf="tenureMonths" type="text" inputmode="decimal" data-fmt="int" value="' + esc(a.tenureMonths) + '"></div>' +
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

    // ---- PF standalone / PF + CC: single financing (main applicant) ----
    var body =
      '<div class="grid c3">' +
      field('Financing Requested', 'pf-amount', p.amount) +
      field('Tenure (months)', 'pf-tenure', p.tenureMonths) +
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
    bindNum('pf-tenure', p, 'tenureMonths');
    bindNum('pf-dev', p, 'deviationPct');
  };

  /** One PF application's result block (PF+HF per-applicant). */
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

  /** Delegated bindings for the PF+HF application list (bound once). */
  function bindPFList() {
    var panel = el('panel-pf');
    if (!panel || panel._pfListBound) return;
    panel._pfListBound = true;
    panel.addEventListener('input', function (ev) {
      var t = ev.target, box = t.closest ? t.closest('.pf-app') : null;
      if (!box || t.dataset.pf == null) return;
      var app = App.state.pf.apps[+box.dataset.pi];
      if (!app) return;
      app[t.dataset.pf] = t.value;
      if (t.dataset.pf === 'applicant') { App.renderPF(); }
      App.refreshOutputs();
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

  /** Pure PF computation - reused verbatim by the combo panels. */
  App.computePF = function () {
    var s = App.state, c = App.computed, p = s.pf;
    var amount = num(p.amount), months = num(p.tenureMonths);
    var years = months / 12;

    // Profit rate is CALCULATED (Excel G115/H115): NDI matrix keyed by
    // income band / product / tenure / Experian risk grade (from iScore).
    var riskGrade = E.riskGradeFromIScore(s.iScore);
    var rates = E.lookupPFRates(c.grossIncome, amount, months, riskGrade);
    // Excel G116: deviation rate REPLACES the matrix flat rate when entered
    var deviation = num(p.deviationPct);
    var rateFrac = deviation > 0 ? deviation / 100 : rates.flat;

    // Excel H113: eligibility bands on GROSS INCOME; for the 3,000-4,999
    // band the amount is capped by the risk-grade limit (List!BC:BD)
    var gradeMax = riskGrade != null ? E.CONFIG.pf.gradeMax[riskGrade] : null;
    var gate = E.pfEligibilityGate(c.grossIncome, amount, gradeMax);
    if (gate === E.VERDICT.OK && c.grossIncome >= E.CONFIG.pf.gate.minIncome && c.grossIncome < E.CONFIG.pf.gate.autoOk
        && gradeMax == null && riskGrade != null) {
      gate = E.VERDICT.NOT_ELIGIBLE;   // grades 1-3 have no limit row
    }

    // Compute the instalment whenever a rate is available - even when the
    // gate is EXCEED LIMIT / NOT ELIGIBLE - so the DSR ratio is still shown
    // (the verdict message is unaffected; it comes from the gate below).
    var instalment = (rateFrac != null)
      ? E.flatInstalment(amount, rateFrac, months) : 0;
    var newInst = instalment;
    var newCommitment = c.grandTotal + newInst;         // G121 (L57 + inst) - after BT
    var ndi = c.netIncome - newCommitment;               // G122
    var newDSR = c.netIncome > 0 ? newCommitment / c.netIncome : 0;
    // "Current DSR": commitment AFTER any BT/settlement nets out (L57) but
    // BEFORE this application's own new instalment - the customer's
    // standing DSR right now, so it must NOT move as the officer tries
    // different amount/tenure combos below.
    var currentDSR = c.netIncome > 0 ? c.grandTotal / c.netIncome : 0;
    // "DSR Before BT": this application added on top of the FULL existing
    // commitment, crediting no settlement at all (neither the CC BT nor a
    // PF facility settlement) - the comparison figure showing how much the
    // BT/settlement is actually helping.
    var dsrBeforeBT = c.netIncome > 0 ? (c.totalCommitment + newInst) / c.netIncome : 0;
    // Excel G125: CLEAN unsecured lines + new instalment - settlements (L56)
    var unsecCommit = Math.max(0, c.unsecuredTotal + instalment - c.btTotal);
    var unsecDSR = c.netIncome > 0 ? unsecCommit / c.netIncome : 0;
    var unsecCap = E.unsecuredCap(c.grossIncome);

    var v = E.pfVerdict(c.grossIncome, s.customer.cardType, newDSR, ndi);
    var verdict = gate !== E.VERDICT.OK ? gate : v.verdict;

    // Stress test (Excel L121: L55 + inst - H72) - conservative: a CC
    // balance transfer isn't credited under stress (it can revert to
    // floating/revolving), but a genuine PF facility settlement still is.
    var stressCommit = c.totalCommitment + newInst - c.btPF;
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
      stressVerdict: gate !== E.VERDICT.OK ? gate : sv.verdict,
      stressThreshold: sv.threshold
    };
  };

  /** One personal-financing application (PF+HF multi-PF) scored on ITS
      applicant's personal income, iScore and own existing commitments -
      never the combined pot. Mirrors App.computeCCCard. */
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
      gate = E.VERDICT.NOT_ELIGIBLE;   // grades 1-3 have no limit row
    }

    var instalment = (rateFrac != null) ? E.flatInstalment(amount, rateFrac, months) : 0;
    var existing = applicantExisting(pfApp.applicant);          // their L57
    var newCommitment = existing + instalment;
    var dsr = pers.net > 0 ? newCommitment / pers.net : 0;
    var ndi = pers.net - newCommitment;
    var cardType = pers.gross >= E.CONFIG.classBreak ? 'TYPE B' : 'TYPE A';
    var v = E.pfVerdict(pers.gross, cardType, dsr, ndi);
    var verdict = gate !== E.VERDICT.OK ? gate : v.verdict;

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

  /** Applicants that can still take a PF (one application per person). */
  App.availablePFApplicants = function () {
    var used = {};
    (App.state.pf.apps || []).forEach(function (a) { used[a.applicant] = true; });
    return hfApplicantList().filter(function (a) { return !used[a.key]; });
  };

  /** Seed the PF+HF application list (first = main, carrying the single-PF
      inputs the officer may have already keyed), and drop stale applicants. */
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

    // read-only calculated cells (like the Excel's blue cells)
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
      '<div class="subhead">Result</div>' +
      // Standalone: the APPROVED/REJECTED decision lives in the Application
      // Summary below, so the panel shows only the DSR reading (no repeat).
      '<p>' + (App.mode === 'pf' ? '' : '<span class="verdict ' + vClass(r.verdict) + '">' + vLabel(r.verdict) + '</span>&nbsp;&nbsp;') +
      '<span class="verdict ' + (r.newDSR > 0 && r.newDSR <= r.threshold ? 'ok' : 'fail') +
      '">DSR ' + fmtPct(r.newDSR, DSR_DP) + '</span></p>' +
      gauge(r.newDSR, r.threshold) +
      '<div class="tile-grid" style="margin-top:10px">' +
      tile('Monthly Instalment (fixed rate)', fmt(r.instalment), 'accent') +
      tile('Existing Commitment (L57)', fmt(App.computed.grandTotal)) +
      tile('New Commitment', fmt(r.newCommitment)) +
      // the NDI floor is an internal policy figure: the tile still colours
      // pass/fail, but never prints the minimum itself
      tile('NDI', fmt(r.ndi), r.ndi >= r.ndiMin ? 'good' : 'accent') +
      // "Current DSR" is the customer's standing DSR right now - commitment
      // net of BT/settlement (L57), NOT including this application's own
      // instalment - so it must stay fixed as the officer tries different
      // amount/tenure combos below. "DSR After BT" is the one that moves.
      tile('Current DSR', fmtPct(r.currentDSR, DSR_DP)) +
      tile('DSR After BT', fmtPct(r.newDSR, DSR_DP)) +
      tile('DSR Before BT', fmtPct(r.dsrBeforeBT, DSR_DP)) +
      tile('Unsecured DSR', fmtPct(r.unsecDSR, DSR_DP)) +
      '</div>' +
      '<div class="subhead">Interest-Rate Stress Test (floating-rate lines)</div>' +
      '<p><span class="verdict ' + vClass(r.stressVerdict) + '">' + vLabel(r.stressVerdict) + '</span></p>' +
      '<div class="tile-grid">' +
      tile('Stress Test Combined Instalment', fmt(r.stressCommit)) +
      tile('Stress Net Disposable Income (Stress NDI)', fmt(r.stressNdi)) +
      tile('Stress Test DSR (%)', fmtPct(r.stressDSR, DSR_DP)) +
      '</div>';
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
