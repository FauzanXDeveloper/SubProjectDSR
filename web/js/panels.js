/* ============================================================
   panels.js - product-specific calculator panels
   A) Credit Card  B) Home Financing (DSR + pricing sub-calcs)
   C) Personal Financing  D) Combo (composed, never forked)
   ============================================================ */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var E = window.Engine;
  var fmt = E.formatCurrency;
  var amt = E.formatAmount;      // CCRIS grids: bare numbers, no RM
  var fmtPct = E.formatPct;
  // every DSR reading is shown to 2 dp; thresholds stay whole (fmtPct(x, 0))
  var DSR_DP = 2;
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[,\s%]/g, '')); return isFinite(n) ? n : 0; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(id) { return document.getElementById(id); }
  // Officer-facing decision is two-state (APPROVED green / REJECTED red);
  // the internal Excel-parity verdicts still drive the class via the engine.
  function vClass(verdict) { return E.verdictClass(verdict); }
  function vLabel(verdict) { return E.verdictLabel(verdict); }
  function tile(label, value, cls) {
    return '<div class="tile' + (cls ? ' ' + cls : '') + '"><div class="t-label">' + label +
      '</div><div class="t-value">' + value + '</div></div>';
  }
  /** The bar still turns red once the DSR is over the limit (that is the
      verdict), but the limit itself is never drawn or named: the marker line
      and the "Threshold x%" caption are deliberately gone so the capping
      thresholds stay internal. */
  function gauge(dsr, threshold) {
    var pct = Math.min(100, Math.max(0, dsr * 100));
    return '<div class="gauge"><div class="fill' + (dsr > threshold ? ' over' : '') +
      '" style="width:' + pct + '%"></div></div>' +
      '<div class="gauge-cap"><span>DSR ' + fmtPct(dsr, DSR_DP) + '</span></div>';
  }
  /** Numeric fields are text inputs with a display format derived from
      the label: "(RM" -> money, "(%)" -> pct, tenure/years/months -> int.
      format.js formats on blur/Enter; num() strips commas/% back out. */
  function field(label, id, value, opts) {
    opts = opts || {};
    var kind = opts.fmt;
    if (kind == null && !opts.text) {
      if (label.indexOf('(RM') !== -1) kind = 'money';
      else if (label.indexOf('(%)') !== -1) kind = 'pct';
      else if (/tenure|years|months|grace/i.test(label)) kind = 'int';
    }
    var shown = kind ? App.fmtInput(value, kind) : value;
    return '<div class="field"><label>' + label + '</label>' +
      '<input class="editable" type="text"' +
      (kind ? ' inputmode="decimal" data-fmt="' + kind + '"' : '') +
      ' id="' + id + '" value="' + esc(shown) + '"></div>';
  }
  function bindNum(id, obj, key) {
    var n = el(id);
    if (n) n.oninput = function () { obj[key] = this.value; App.refreshOutputs(); };
  }
  function cardShell(id, title, bodyHtml) {
    return '<div class="card" id="' + id + '"><div class="card-head" data-toggle="' + id + '">' +
      '<span>' + title + '</span><span class="chev">&#9662;</span></div>' +
      '<div class="card-body">' + bodyHtml + '</div></div>';
  }

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

  /* ============================================================
     HOME FINANCING (HF) - DSR decision per Home Financing Manual
     DSR.xlsm (Summary + joint applicant sheets) + B2 pricing (file 02)
     ============================================================ */
  var HF_CAPACITIES = ['OWN', 'JOINT', 'GUARANTOR', 'DIRECTOR'];
  var HF_COLLATERALS = ['', 'PROPERTIES', 'CLEAN', 'MOTOR V (JPJ)', 'UNIT TRUST', 'SHARES', 'FIN.ASSTS', 'OTHERS'];
  var HF_MONTH_COLS = [
    ['basic', 'Basic Income'], ['fixedAllowance', 'Fixed Allowance'],
    ['fixedAllowanceDesc', 'Allowance Desc'], ['other', 'Other Income'],
    ['commission', 'Commission'], ['ot', 'OT'],
    ['epf', 'EPF'], ['pcb', 'PCB / Zakat'], ['socso', 'SOCSO']
  ];

  /** Recognised EPF income for an applicant in EPF mode, else null. The
      caller decides whether EPF applies (a BIZMAN applicant never is). */
  function epfIncomeOf(mode, epf) {
    if (mode !== 'EPF') return null;
    return E.calcEPFIncome(
      ((epf && epf.months) || []).map(function (m) { return m.employee; }),
      epf && epf.epfRatePct, epf && epf.deductions);
  }

  function emptyBizBlock() {
    return { months: [], profitMarginPct: '', shareholdingPct: 100, avgITRAnnual: '', taxDeduction: '' };
  }

  /** Resolve one applicant's income contribution by THEIR own type/mode into
      the shape calcHFIncomeMixed sums: payslip months, an EPF recognition, or
      a business block - the other two zeroed so streams never double-count. */
  function resolveApplicantIncome(type, mode, months, bizman, epf) {
    var isBiz = type === 'BIZMAN';
    return {
      months: (isBiz || mode === 'EPF') ? [] : (months || []),
      bizman: isBiz ? bizman : emptyBizBlock(),
      epfIncome: (!isBiz && mode === 'EPF') ? epfIncomeOf('EPF', epf) : null
    };
  }

  /** The resolved income streams for one applicant key (main or joint). */
  function applicantIncomeParts(key) {
    var s = App.state;
    if (key === 'MAIN') {
      return resolveApplicantIncome(s.customer.type, s.income.normalMode,
        s.income.manualMonths, s.income.bizman, s.income.epf);
    }
    var a = s.hfJoint[key] || {};
    return resolveApplicantIncome(a.type, a.incomeMode, a.months, a.bizman, a.epf);
  }

  /** Customer type for one applicant (each may differ in a joint HF). */
  function applicantType(key) {
    return key === 'MAIN' ? App.state.customer.type
      : ((App.state.hfJoint[key] || {}).type || 'NORMAL');
  }

  /** Personal (NOT combined) income for one HF applicant, as {gross, net},
      by THEIR own type - a credit card and each person's DSR run on their own
      income (normal payslip/EPF or business), never the combined pot. */
  function applicantPersonalIncome(key) {
    var inc = E.calcHFIncomeMixed([applicantIncomeParts(key)]);
    return { gross: inc.grossIncome || 0, net: inc.netIncome || 0 };
  }

  /** Experian iScore for one applicant (drives their card risk grade). */
  function applicantIScore(key) {
    return key === 'MAIN' ? App.state.iScore : ((App.state.hfJoint[key] || {}).iScore);
  }

  /** That applicant's own existing commitment after settlement (L57). */
  function applicantExisting(key) {
    if (key === 'MAIN') return App.computed.grandTotal || 0;
    var out = 0;
    App.computeHF().perApplicant.forEach(function (p) { if (p.key === key) out = p.l57; });
    return out;
  }

  /** Display name for an applicant key. */
  function applicantName(key) {
    if (key === 'MAIN') return App.state.customer.name || 'Main Applicant';
    var a = App.state.hfJoint[key] || {};
    return a.name || ('Joint Applicant ' + key);
  }

  /** Enabled HF applicants in order: main first, then joint A / B. */
  function hfApplicantList() {
    var s = App.state;
    var list = [{ key: 'MAIN', name: s.customer.name || 'Main Applicant' }];
    ['A', 'B'].forEach(function (k) {
      var a = s.hfJoint[k];
      if (a && a.enabled) list.push({ key: k, name: a.name || ('Joint Applicant ' + k) });
    });
    return list;
  }

  /** Applicant list for HF: main (shared intake) + enabled joint A/B. Each
      applicant's income is resolved by ITS OWN type (NORMAL payslip/EPF or
      BIZMAN business), so a mixed joint sums correctly in calcHFIncomeMixed. */
  function hfApplicants() {
    var s = App.state;
    function build(key, label, ccris, bt, parts) {
      return { key: key, label: label, ccris: ccris, bt: bt,
        months: parts.months, bizman: parts.bizman, epfIncome: parts.epfIncome };
    }
    var list = [build('MAIN', 'Main Applicant', s.ccris, s.bt, applicantIncomeParts('MAIN'))];
    ['A', 'B'].forEach(function (k) {
      var a = s.hfJoint[k];
      if (a && a.enabled) list.push(build(k, 'Joint Applicant ' + k, a.ccris, a.bt, applicantIncomeParts(k)));
    });
    return list;
  }

  function hfSelect(options, value, attr) {
    return '<select ' + attr + '>' + options.map(function (o) {
      return '<option value="' + esc(o) + '"' + (String(o) === String(value) ? ' selected' : '') + '>' +
        (o === '' ? '-' : esc(o)) + '</option>';
    }).join('') + '</select>';
  }

  function hfJointCCRISRows(a, k) {
    return a.ccris.map(function (r, i) {
      var src = r.sourceSection || 'USER_ADDED';
      var editable = src === 'USER_ADDED';
      var h = '<tr data-i="' + i + '" class="src-' + src + '"><td class="num">' + (i + 1) + '</td>';
      if (editable) {
        h += '<td class="editable"><input data-f="date" type="date" value="' + esc(r.date) + '" style="min-width:86px"></td>' +
          '<td class="editable">' + hfSelect(HF_CAPACITIES, r.capacity, 'data-f="capacity"') + '</td>' +
          '<td class="editable">' + hfSelect(HF_COLLATERALS, r.collateral, 'data-f="collateral"') + '</td>' +
          '<td class="editable"><input data-f="facility" list="facility-list" value="' + esc(r.facility) + '" style="min-width:96px;text-transform:uppercase"></td>' +
          '<td class="editable"><input data-f="outstanding" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.outstanding) + '"></td>' +
          '<td class="editable"><input data-f="limit" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.limit) + '"></td>' +
          '<td class="editable"><input data-f="legalStatus" value="' + esc(r.legalStatus) + '" style="min-width:60px"></td>' +
          '<td class="editable"><input data-f="commitmentPerCCRIS" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.commitmentPerCCRIS) + '"></td>';
      } else {
        var lock = function (v, isNum) {
          return '<td class="locked' + (isNum ? ' num' : '') + '">' +
            (isNum ? (num(v) ? fmt(v) : '-') : (esc(v) || '-')) + '</td>';
        };
        h += lock(r.date) + lock(r.capacity) + lock(r.collateral) + lock(r.facility) +
          lock(r.outstanding, true) + lock(r.limit, true) + lock(r.legalStatus) +
          lock(r.commitmentPerCCRIS, true);
      }
      h += '<td class="override"><input data-f="override" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.override) + '" class="' + (E.hasOverride(r.override) ? 'has-value' : '') + '"></td>' +
        '<td class="readonly" id="hfj-commit-' + k + '-' + i + '">-</td>' +
        '<td>' + esc(src) + '</td>' +
        '<td>' + (editable ? '<button class="row-del" data-del="' + i + '" title="Delete row">&times;</button>' : '') + '</td></tr>';
      return h;
    }).join('');
  }

  /** Sub Step B (rendered inside the shared CCRIS card on HF pages):
      a full per-applicant copy of Step B - identity + Experian dropzone
      + CCRIS table + Balance Transfer / settlement block (Excel joint
      applicant sheets rows 14-72). */
  App.hfJointStepBHtml = function (k) {
    var a = App.state.hfJoint[k];
    if (!a.enabled) return '';
    var sub = k === 'A' ? 'B1' : 'B2';

    var btRows = (a.bt || []).map(function (r, i) {
      return '<tr data-bti="' + i + '">' +
        '<td class="editable">' + hfSelect(['BT', 'SETTLE'], r.type, 'data-btf="type"')
          .replace('>BT<', '>CC Balance Transfer<').replace('>SETTLE<', '>Facility Settlement<') + '</td>' +
        '<td class="editable"><input data-btf="outstanding" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.outstanding) + '"' + (r.type !== 'BT' ? ' disabled' : '') + '></td>' +
        (r.type === 'BT'
          ? '<td class="readonly" id="hfj-btrep-' + k + '-' + i + '">-</td>'
          : '<td class="editable"><input data-btf="repayment" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.repayment) + '"></td>') +
        '<td><button class="row-del" data-btdel="' + i + '">&times;</button></td></tr>';
    }).join('');

    return '<div class="card" id="hfj-box-' + k + '" style="margin-top:10px">' +
      '<div class="card-head" data-toggle="hfj-box-' + k + '">' +
      '<span><span class="step-tag">STEP ' + sub + '</span>Joint Applicant ' + k +
      (a.name ? ' - ' + esc(a.name) : '') + '</span>' +
      '<button class="row-del" data-hfj-del="' + k + '" title="Remove applicant" type="button">&times;</button></div>' +
      '<div class="card-body">' +
      // Name + IC are locked: they come from this applicant's own Experian
      // extract and must not be edited, exactly like the main applicant's.
      '<div class="grid c4" style="margin-bottom:8px">' +
      '<div class="field"><label>Customer Name</label><span class="readonly-val" id="hfj-name-' + k + '">' + (esc(a.name) || '-') + '</span></div>' +
      '<div class="field"><label>IC / Passport Number</label><span class="readonly-val" id="hfj-ic-' + k + '">' + (esc(E.formatIC(a.ic)) || '-') + '</span></div>' +
      '<div class="field"><label>Age (derived from IC)</label><span class="readonly-val" id="hfj-age-' + k + '">-</span></div>' +
      '<div class="field"><label>Experian iScore</label><span class="readonly-val" id="hfj-iscore-' + k + '">' + (esc(a.iScore) || '-') + '</span></div>' +
      '</div>' +
      '<div class="dropzone" id="dz-hfj-' + k + '">' +
      '<div class="dz-title">Experian report</div>' +
      '<div class="dz-sub">Drop or click.</div>' +
      '<input type="file" id="file-hfj-' + k + '" accept=".pdf" style="display:none"></div>' +
      '<div id="dz-hfj-' + k + '-msg"></div>' +
      '<div class="subhead">CCRIS Records - Joint Applicant ' + k + '</div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>No</th><th>Date</th><th>Capacity</th><th>Collateral</th><th>Facility</th>' +
      '<th>Outstanding</th><th>Limit</th><th>Legal Status</th>' +
      '<th>Instalment per<br>CCRIS</th><th>Override</th><th>Commitment</th><th>Source</th><th></th></tr></thead>' +
      '<tbody data-hfjccris="' + k + '">' + hfJointCCRISRows(a, k) + '</tbody>' +
      '<tfoot><tr class="total-row"><td colspan="10">Total CCRIS Commitment</td>' +
      '<td class="num" id="hfj-total-' + k + '">-</td><td colspan="2"></td></tr></tfoot></table></div>' +
      '<div style="margin-top:8px"><button class="btn small secondary" data-hfj-addrow="' + k + '" type="button">+ Add CCRIS / other commitment row</button></div>' +
      // hidden until there is a row to show, exactly as the main applicant's
      // settlement table in js/intake.js
      '<div class="subhead" style="margin-top:26px">Balance Transfer / Facilities To Be Settled - Joint Applicant ' + k + '</div>' +
      ((a.bt || []).length
        ? '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
          '<th>Type</th><th>Outstanding</th><th>Monthly Repayment</th><th></th>' +
          '</tr></thead><tbody data-hfjbt="' + k + '">' + btRows + '</tbody>' +
          '<tfoot><tr class="total-row"><td colspan="2">Total To Be Settled</td>' +
          '<td class="num" id="hfj-bt-total-' + k + '">-</td><td></td></tr>' +
          '<tr class="total-row"><td colspan="2">Grand Total Commitment After Settlement</td>' +
          '<td class="num" id="hfj-grand-' + k + '">-</td><td></td></tr></tfoot></table></div>'
        : '') +
      '<div style="margin-top:8px"><button class="btn small secondary" data-hfj-addbt="' + k + '" type="button">+ Add settlement row</button></div>' +
      '</div></div>';
  };

  /** EPF sub-form for a joint applicant (mirrors the main income EPF form):
      a dropzone that parses the applicant's own KWSP statement, a 12-month
      Caruman Ahli grid and the manual deductions block. */
  function hfJointEPFForm(a, k) {
    var epf = a.epf;
    var rows = '';
    for (var i = 0; i < 12; i++) {
      var m = epf.months[i] || { label: '', employee: '' };
      rows += '<tr data-jei="' + i + '"><td class="num">' + (i + 1) + '</td>' +
        '<td class="editable"><input data-jef="label" value="' + esc(m.label) + '" placeholder="e.g. Jan-25"></td>' +
        '<td class="editable"><input data-jef="employee" type="text" inputmode="decimal" data-fmt="money" value="' + esc(m.employee) + '"></td>' +
        '<td class="readonly" id="hfj-epf-mi-' + k + '-' + i + '">-</td></tr>';
    }
    var d = epf.deductions;
    return '<div class="dropzone" id="dz-hfjinc-' + k + '">' +
      '<div class="dz-title">EPF / KWSP statement</div>' +
      '<div class="dz-sub">Drop or click &middot; one or more EPF statements</div>' +
      '<input type="file" id="file-hfjinc-' + k + '" accept=".pdf" multiple style="display:none"></div>' +
      '<div id="dz-hfjinc-' + k + '-msg"></div>' +
      '<div class="field narrow" style="margin:8px 0">' +
      '<label>EPF Rate (%)</label><input class="editable" type="text" inputmode="decimal" data-fmt="pct" data-jepf-rate value="' + esc(epf.epfRatePct) + '"></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Month</th><th>Caruman Ahli</th><th>Proxy Monthly Income</th></tr></thead>' +
      '<tbody data-hfjepf="' + k + '">' + rows + '</tbody></table></div>' +
      '<div class="subhead">Deductions</div>' +
      '<div class="grid c4">' +
      '<div class="field"><label>EPF</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-jedf="epf" value="' + esc(d.epf) + '"></div>' +
      '<div class="field"><label>PCB / Zakat</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-jedf="pcb" value="' + esc(d.pcb) + '"></div>' +
      '<div class="field"><label>SOCSO</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-jedf="socso" value="' + esc(d.socso) + '"></div>' +
      '<div class="field"><label>Other</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-jedf="other" value="' + esc(d.other) + '"></div></div>';
  }

  /** Recognised-income tiles for a joint applicant, mirroring the main
      applicant's per-type breakdown. Every joint - NORMAL manual, NORMAL EPF
      and BIZMAN - shows one, populated by refreshHFJointBlocks. */
  function jointRecognisedHtml(k, type, mode) {
    function t(label, id, cls) {
      return '<div class="tile' + (cls ? ' ' + cls : '') + '"><div class="t-label">' + label +
        '</div><div class="t-value" id="hfj-inc-' + id + '-' + k + '">-</div></div>';
    }
    var detail = type === 'BIZMAN'
      ? t('Avg Monthly Credit', 'bizcredit') + t('Monthly Business Income', 'bizbus') + t('Monthly Personal Income', 'bizpers')
      : mode === 'EPF'
        ? t('Fixed Income', 'fixed') + t('Variable Income', 'var') + t('Income Type', 'itype')
        : t('Basic Income', 'basic') + t('Other Income', 'other') + t('Total Deductions', 'ded');
    return '<div class="subhead">Recognised Income</div><div class="tile-grid">' +
      detail + t('Gross Income', 'gross', 'accent') + t('Net Income', 'net', 'good') + '</div>';
  }

  /** Step C block (rendered inside the shared Income card on HF pages):
      income for a joint applicant. NORMAL customers get Manual / EPF tabs
      (same as the main applicant); BIZMAN customers get the business block. */
  App.hfJointStepCHtml = function (k) {
    var a = App.state.hfJoint[k];
    if (!a.enabled) return '';
    var isBiz = a.type === 'BIZMAN';   // this joint applicant's OWN type

    var manualTable =
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Month</th>' +
      HF_MONTH_COLS.map(function (c) { return '<th>' + c[1] + '</th>'; }).join('') +
      '</tr></thead><tbody data-hfjinc="' + k + '">' +
      a.months.map(function (m, i) {
        return '<tr data-mi="' + i + '"><td class="num">M' + (i + 1) + '</td>' +
          HF_MONTH_COLS.map(function (c) {
            var isText = c[0] === 'fixedAllowanceDesc';
            return '<td class="editable"><input data-mf="' + c[0] + '"' +
              (isText ? '' : ' type="text" inputmode="decimal" data-fmt="money"') + ' value="' + esc(m[c[0]]) + '"></td>';
          }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';

    var bizHtml = '';
    if (isBiz) {
      var b = a.bizman;
      var bizRows = b.months.map(function (m, i) {
        return '<tr data-bi="' + i + '"><td class="num">M' + (i + 1) + '</td>' +
          '<td class="editable"><input data-bf="bank1" type="text" inputmode="decimal" data-fmt="money" value="' + esc(m.bank1) + '"></td>' +
          '<td class="editable"><input data-bf="bank2" type="text" inputmode="decimal" data-fmt="money" value="' + esc(m.bank2) + '"></td></tr>';
      }).join('');
      bizHtml = '<div class="subhead">Income for Bizman - ' + esc('Joint Applicant ' + k) + '</div>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Month</th><th>Bank I Total Credit</th><th>Bank II Total Credit</th></tr></thead>' +
        '<tbody data-hfjbiz="' + k + '">' + bizRows + '</tbody></table></div>' +
        '<div class="grid c4" style="margin-top:8px">' +
        '<div class="field"><label>Profit Margin (%)</label><input class="editable" type="text" inputmode="decimal" data-fmt="pct" data-bs="profitMarginPct" value="' + esc(b.profitMarginPct) + '" step="0.01"></div>' +
        '<div class="field"><label>Shareholding (%)</label><input class="editable" type="text" inputmode="decimal" data-fmt="pct" data-bs="shareholdingPct" value="' + esc(b.shareholdingPct) + '"></div>' +
        '<div class="field"><label>Avg Latest 2 Years ITR (annual)</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-bs="avgITRAnnual" value="' + esc(b.avgITRAnnual) + '"></div>' +
        '<div class="field"><label>Tax Deduction LHDN (monthly)</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-bs="taxDeduction" value="' + esc(b.taxDeduction) + '"></div></div>';
    }

    // each joint applicant picks their own type here
    var typeSel = '<div class="field narrow" style="margin-bottom:10px"><label>Customer Type</label>' +
      '<select class="editable" data-jtype="' + k + '">' +
      '<option value="NORMAL"' + (!isBiz ? ' selected' : '') + '>NORMAL</option>' +
      '<option value="BIZMAN"' + (isBiz ? ' selected' : '') + '>BIZMAN</option></select></div>';

    var incomeBody;
    if (isBiz) {
      incomeBody = bizHtml;   // BIZMAN: business block only
    } else {
      // NORMAL: Manual / EPF tabs, mirroring the main applicant's income
      var mode = a.incomeMode === 'EPF' ? 'EPF' : 'MANUAL';
      incomeBody =
        '<div class="tabs" data-hfjinctab="' + k + '">' +
        '<button data-tab="MANUAL" class="' + (mode === 'MANUAL' ? 'active' : '') + '">Salary / Payslip (6 months)</button>' +
        '<button data-tab="EPF" class="' + (mode === 'EPF' ? 'active' : '') + '">EPF Statement</button></div>' +
        (mode === 'EPF' ? hfJointEPFForm(a, k) : manualTable);
    }

    return '<div class="card" id="hfj-inc-box-' + k + '" style="margin-top:10px">' +
      '<div class="card-head"><span>Income - Joint Applicant ' + k + (a.name ? ' (' + esc(a.name) + ')' : '') + '</span></div>' +
      '<div class="card-body">' + typeSel + incomeBody +
      jointRecognisedHtml(k, a.type, a.incomeMode) + '</div></div>';
  };

  /** Re-render everything that shows joint applicant structure. Used only
      when an applicant is enabled/removed (that also adds/removes their
      income + HF blocks). */
  function rerenderHFJoint() {
    App.renderCCRIS();
    App.renderIncome();
    App.renderHF();
    App.renderPF();       // the PF application list depends on the applicant roster
    App.renderCC();       // the CC card list depends on the applicant roster
    App.refreshOutputs();
  }

  /** Lighter re-render for CCRIS/BT structural edits inside a Sub Step B
      block: only the shared CCRIS card (which hosts the joint blocks) is
      rebuilt, then outputs refresh - so joint rows populate as fast as the
      main applicant's table instead of rebuilding Income + HF panels too. */
  function rerenderHFJointCCRIS() {
    App.renderCCRIS();
    App.renderPF();       // a newly-extracted joint must appear in the PF roster
    App.renderCC();       // a newly-extracted joint must appear in the card roster
    App.refreshOutputs();
  }

  /** Enable the next free joint applicant slot (Step B header button). */
  App.addHFJointApplicant = function () {
    var j = App.state.hfJoint;
    var k = !j.A.enabled ? 'A' : (!j.B.enabled ? 'B' : null);
    if (!k) return;
    j[k].enabled = true;
    rerenderHFJoint();
  };

  /** Bindings for a Sub Step B block (remove applicant, CCRIS table,
      BT/settlement table, identity fields, Experian dropzone). */
  App.bindHFJointStepB = function (k) {
    var a = App.state.hfJoint[k];
    if (!a.enabled) return;
    var box = el('hfj-box-' + k);
    if (!box) return;

    box.addEventListener('input', function (ev) {
      var t = ev.target;
      // name / IC are locked (populated from this applicant's Experian extract)
      var tr = t.closest('tr'); if (!tr) return;
      if (t.dataset.f != null && tr.dataset.i != null) {
        var i = +tr.dataset.i;
        var src = a.ccris[i].sourceSection || 'USER_ADDED';
        if (src !== 'USER_ADDED' && t.dataset.f !== 'override') return; // locked
        var v = t.value;
        if (t.dataset.f === 'facility') v = v.toUpperCase();
        a.ccris[i][t.dataset.f] = v;
        if (t.dataset.f === 'override') t.classList.toggle('has-value', E.hasOverride(v));
        App.refreshOutputs();
      } else if (t.dataset.btf != null && tr.dataset.bti != null) {
        a.bt[+tr.dataset.bti][t.dataset.btf] = t.value;
        if (t.dataset.btf === 'type') { rerenderHFJointCCRIS(); return; }
        App.refreshOutputs();
      }
    });

    box.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t.dataset.hfjDel != null) {
        App.modal.confirm('This removes Joint Applicant ' + k + ' and all of their data.',
          { title: 'Remove Joint Applicant ' + k + '?', okLabel: 'Remove', danger: true })
          .then(function (ok) {
            if (ok) { App.state.hfJoint[k] = App.defaultState().hfJoint[k]; rerenderHFJoint(); }
          });
        return;
      }
      if (t.dataset.hfjAddrow != null) {
        a.ccris.push({ no: a.ccris.length + 1, date: '', capacity: 'OWN', collateral: '',
          facility: '', outstanding: '', limit: '', legalStatus: '',
          commitmentPerCCRIS: '', override: '', floating: 'NO', sourceSection: 'USER_ADDED' });
        rerenderHFJointCCRIS();
        return;
      }
      if (t.dataset.hfjAddbt != null) {
        a.bt.push({ type: 'BT', outstanding: '', repayment: '' });
        rerenderHFJointCCRIS();
        return;
      }
      if (t.dataset.btdel != null && t.closest('[data-hfjbt]')) {
        a.bt.splice(+t.dataset.btdel, 1);
        rerenderHFJointCCRIS();
        return;
      }
      if (t.dataset.del != null && t.closest('[data-hfjccris]')) {
        a.ccris.splice(+t.dataset.del, 1);
        rerenderHFJointCCRIS();
      }
    });

    App.bindDropzone('dz-hfj-' + k, 'file-hfj-' + k, function (files) {
      handleHFJointPDF(k, files);
    }, false);
  };

  /** Bindings for the Step C block (income months + bizman + EPF inputs). */
  App.bindHFJointStepC = function (k) {
    var a = App.state.hfJoint[k];
    if (!a.enabled) return;
    var box = el('hfj-inc-box-' + k);
    if (!box) return;

    // Manual / EPF tab switch (NORMAL customers only)
    var tabs = box.querySelector('[data-hfjinctab="' + k + '"]');
    if (tabs) tabs.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      a.incomeMode = b.dataset.tab;
      rerenderHFJoint();          // rebuild the income card, then refresh
    });

    box.addEventListener('input', function (ev) {
      var t = ev.target;
      if (t.dataset.jtype != null) { a.type = t.value; rerenderHFJoint(); return; }  // NORMAL/BIZMAN swap
      if (t.dataset.bs) { a.bizman[t.dataset.bs] = t.value; App.refreshOutputs(); return; }
      if (t.hasAttribute('data-jepf-rate')) { a.epf.epfRatePct = t.value; App.refreshOutputs(); return; }
      if (t.dataset.jedf) { a.epf.deductions[t.dataset.jedf] = t.value; App.refreshOutputs(); return; }
      var tr = t.closest('tr'); if (!tr) return;
      if (t.dataset.jef != null && tr.dataset.jei != null) {
        while (a.epf.months.length <= +tr.dataset.jei) a.epf.months.push({ label: '', employee: '' });
        a.epf.months[+tr.dataset.jei][t.dataset.jef] = t.value;
      } else if (t.dataset.mf != null && tr.dataset.mi != null) {
        a.months[+tr.dataset.mi][t.dataset.mf] = t.value;
      } else if (t.dataset.bf != null && tr.dataset.bi != null) {
        a.bizman.months[+tr.dataset.bi][t.dataset.bf] = t.value;
      } else { return; }
      App.refreshOutputs();
    });

    App.bindDropzone('dz-hfjinc-' + k, 'file-hfjinc-' + k, function (files) {
      handleHFJointEPF(k, files);
    }, true);
  };

  /** Parse a joint applicant's EPF/KWSP statement(s). Same append-and-merge
      behaviour as the main applicant (attach one year at a time), and the
      statement is REJECTED unless its name + IC match THIS joint applicant's
      Experian identity - never the main applicant's. */
  async function handleHFJointEPF(k, files) {
    var a = App.state.hfJoint[k];
    var epfFiles = (files || []).filter(function (f) { return /\.pdf$/i.test(f.name); });
    if (!epfFiles.length) return;
    App.dzState('dz-hfjinc-' + k, 'loading', 'Parsing ' + epfFiles.length + ' EPF statement(s) ...');
    try {
      var results = [];
      for (var i = 0; i < epfFiles.length; i++) {
        results.push(await E.extractFromEPFStatement(epfFiles[i]));
      }
      var epfName = '', epfIC = '';
      results.forEach(function (r) {
        if (!epfName && r.name) epfName = r.name;
        if (!epfIC && r.ic) epfIC = r.ic;
      });
      // match against the JOINT applicant's own identity
      var mismatch = App.identityMismatch(epfName, epfIC, a.name, a.ic);
      if (mismatch) {
        App.modal.alert(mismatch + '\n\nNothing was loaded. Attach the EPF/KWSP statement ' +
          'belonging to Joint Applicant ' + k + '.',
          { type: 'error', title: 'EPF statement rejected' });
        App.dzState('dz-hfjinc-' + k, 'error', 'EPF statement rejected - identity does not match ' +
          'Joint Applicant ' + k + ': ' + esc(mismatch.replace(/\n/g, '; ')) + '. Nothing was loaded' +
          (a.epf.months.length ? ' and the ' + a.epf.months.length + ' month(s) already attached are unchanged.' : '.'));
        return;
      }
      var prior = a.epf.parsedMonths || [];
      var months = E.mergeEPFMonths([{ months: prior }].concat(results));
      if (!months.length) throw new Error('No contribution rows recognised in the PDF(s).');
      var added = months.length - prior.length;

      a.incomeMode = 'EPF';
      a.epf.parsedMonths = months;
      a.epf.months = months.map(function (m) { return { label: m.label, employee: m.employee }; });
      rerenderHFJoint();
      App.dzState('dz-hfjinc-' + k, 'success',
        'EPF statement' + (epfFiles.length > 1 ? 's' : '') + ' parsed (' + epfFiles.length +
        ' file' + (epfFiles.length > 1 ? 's' : '') + '): ' + months.length + ' months loaded (' +
        months[0].label + ' to ' + months[months.length - 1].label + ')' +
        (prior.length ? ' - ' + (added > 0 ? added + ' new month' + (added === 1 ? '' : 's') +
          ' merged with the ' + prior.length + ' already attached' : 'already-attached months refreshed') : '') +
        '. Attach another year to extend the timeline.');
    } catch (e) {
      App.dzState('dz-hfjinc-' + k, 'error', 'EPF parsing failed: ' + esc(e.message) + ' - enter the months manually.');
      console.error(e);
    }
  }

  async function handleHFJointPDF(k, files) {
    var file = files[0];
    if (!file) return;
    var a = App.state.hfJoint[k];
    App.dzState('dz-hfj-' + k, 'loading', 'Reading ' + esc(file.name) + ' ...');
    try {
      var res = await E.extractFromExperian(file);
      if (res.name) a.name = res.name;
      if (res.icNumber) a.ic = res.icNumber;
      if (res.iScore != null) a.iScore = res.iScore;
      if (res.reportDate) a.reportDate = res.reportDate;
      a.ccris = res.records.concat(res.nlciRecords);
      rerenderHFJointCCRIS();
      App.dzState('dz-hfj-' + k, 'success',
        'Extracted ' + res.records.length + ' CCRIS + ' + res.nlciRecords.length +
        ' NLCI records for Joint Applicant ' + k + '.');
    } catch (e) {
      App.dzState('dz-hfj-' + k, 'error', 'Extraction failed: ' + esc(e.message) +
        ' - you can still key in the CCRIS rows manually.');
      console.error(e);
    }
  }

  App.renderHF = function () {
    var h = App.state.hf;

    var finGrid;
    if (h.product === 'HOME ONE ACCOUNT') {
      var ho = h.hoa;
      var termGrid = function (t, p) {
        return field('Original Financing Amount', p + '-fin', t.financing) +
          field('MRTT Contribution', p + '-mrtt', t.mrtt) +
          field('Valuation Cost', p + '-val', t.valuation) +
          field('Legal &amp; Stamping Cost', p + '-legal', t.legal) +
          field('Financing Tenure (Years)', p + '-tenure', t.tenureYears) +
          field('SBR (%)', p + '-sbr', t.sbrPct, { step: '0.01' }) +
          field('Spread on SBR (%)', p + '-spread', t.spreadPct, { step: '0.01' });
      };
      finGrid =
        '<div class="grid c3">' +
        field('Property Value', 'hoa-prop', ho.propertyValue) +
        field('Monthly CTF Installment', 'hf-ctf', h.ctf) +
        '</div>' +
        '<div class="subhead">Term Financing 1</div><div class="grid c4">' + termGrid(ho.t1, 'hoa1') + '</div>' +
        '<div class="subhead">Term Financing 2</div><div class="grid c4">' + termGrid(ho.t2, 'hoa2') + '</div>';
    } else {
      finGrid =
        '<div class="grid c3">' +
        field('Property Value', 'hf-prop', h.propertyValue) +
        field('Original Financing Amount', 'hf-fin', h.financing) +
        field('MRTT Contribution', 'hf-mrtt', h.mrtt) +
        field('Valuation Cost', 'hf-val', h.valuation) +
        field('Legal &amp; Stamping Cost', 'hf-legal', h.legal) +
        field('Financing Tenure (Years)', 'hf-tenure', h.tenureYears) +
        field('SBR (%)', 'hf-sbr', h.sbrPct, { step: '0.01' }) +
        field('Spread on SBR (%)', 'hf-spread', h.spreadPct, { step: '0.01' }) +
        field('Monthly CTF Installment', 'hf-ctf', h.ctf) +
        '</div>';
    }

    var dsrBody =
      '<div class="subhead">' + esc(h.product) + '</div>' +
      finGrid +
      '<div id="hf-out"></div>';

    var tabs = ['dsr', 'homeone', 'structured', 'fixed', 'puc'];
    var tabLabels = ['DSR Decision', 'Home One Account (Pricing)', 'Property Fin (Structured)', 'Property Fin (Fixed)', 'Property Fin (PUC)'];
    App.hfTab = App.hfTab || 'dsr';

    var body = '<div class="tabs" id="hf-tabs">' + tabs.map(function (t, i) {
      return '<button data-tab="' + t + '" class="' + (App.hfTab === t ? 'active' : '') + '">' + tabLabels[i] + '</button>';
    }).join('') + '</div><div id="hf-tab-body"></div>';

    el('panel-hf').innerHTML = cardShell('card-hf', 'Home Financing', body);
    el('hf-tabs').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      App.hfTab = b.dataset.tab;
      App.renderHF(); App.refreshOutputs();
    });

    var tb = el('hf-tab-body');
    if (App.hfTab === 'dsr') {
      tb.innerHTML = dsrBody;
      if (h.product === 'HOME ONE ACCOUNT') {
        bindNum('hoa-prop', h.hoa, 'propertyValue'); bindNum('hf-ctf', h, 'ctf');
        [['hoa1', h.hoa.t1], ['hoa2', h.hoa.t2]].forEach(function (p) {
          bindNum(p[0] + '-fin', p[1], 'financing'); bindNum(p[0] + '-mrtt', p[1], 'mrtt');
          bindNum(p[0] + '-val', p[1], 'valuation'); bindNum(p[0] + '-legal', p[1], 'legal');
          bindNum(p[0] + '-tenure', p[1], 'tenureYears'); bindNum(p[0] + '-sbr', p[1], 'sbrPct');
          bindNum(p[0] + '-spread', p[1], 'spreadPct');
        });
      } else {
        bindNum('hf-prop', h, 'propertyValue'); bindNum('hf-fin', h, 'financing');
        bindNum('hf-mrtt', h, 'mrtt'); bindNum('hf-val', h, 'valuation');
        bindNum('hf-legal', h, 'legal'); bindNum('hf-tenure', h, 'tenureYears');
        bindNum('hf-sbr', h, 'sbrPct'); bindNum('hf-spread', h, 'spreadPct');
        bindNum('hf-ctf', h, 'ctf');
      }
    } else {
      renderHFPricingTab(tb, App.hfTab);
    }
  };

  /** Pure HF-DSR computation per the HF master Summary sheet
      (single + joint applicants consolidated) - reused by combos.
      All formula logic lives in Engine.computeHFSummary (hfSummary.js). */
  App.computeHF = function () {
    var s = App.state, h = s.hf;
    // Each applicant carries its own recognised EPF income (hfApplicants),
    // so the main applicant's EPF statement and any joint applicant's EPF
    // statement both feed the combined HF DSR through the same path.
    return E.computeHFSummary({
      applicants: hfApplicants(),
      customerType: s.customer.type,
      product: h.product,
      hf: h, hoa: h.hoa, ctf: h.ctf
    });
  };

  /* HOME ONE ACCOUNT output: Term 1 and Term 2 are separate financings, so
     the result is a Facility x [Term 1 | Term 2 | Total] table (mirrors the
     Excel Summary J/K columns), not shared single figures. */
  function hoaFinTable(r, s) {
    var t1 = s.hf.hoa.t1, t2 = s.hf.hoa.t2;
    var pv = num(s.hf.hoa.propertyValue);
    var mof1 = pv > 0 ? r.term1.totalFinancing / pv : 0;
    var mof2 = pv > 0 ? r.term2.totalFinancing / pv : 0;
    function pctRaw(v) { return fmtPct(num(v) / 100, 2); }
    function yrs(v) { return num(v) ? String(num(v)) : ''; }
    // [label, term1, term2, total, emphasize]
    var rows = [
      ['Property Value', '', '', fmt(pv)],
      ['Original Financing Amount', fmt(t1.financing), fmt(t2.financing), fmt(num(t1.financing) + num(t2.financing))],
      ['MRTT Contribution', fmt(t1.mrtt), fmt(t2.mrtt), fmt(num(t1.mrtt) + num(t2.mrtt))],
      ['Valuation Cost', fmt(t1.valuation), fmt(t2.valuation), fmt(num(t1.valuation) + num(t2.valuation))],
      ['Legal &amp; Stamping Cost', fmt(t1.legal), fmt(t2.legal), fmt(num(t1.legal) + num(t2.legal))],
      ['FEC (Entry Cost)', fmt(r.term1.fec), fmt(r.term2.fec), fmt(r.fec)],
      ['Financing Tenure (Years)', yrs(t1.tenureYears), yrs(t2.tenureYears), ''],
      ['Total Financing Amount', fmt(r.term1.totalFinancing), fmt(r.term2.totalFinancing), fmt(r.totalFinancing), true],
      ['Total Margin of Financing', fmtPct(mof1, 2), fmtPct(mof2, 2), fmtPct(r.totalMOF, 2)],
      ['Standardised Base Rate (SBR)', pctRaw(t1.sbrPct), pctRaw(t2.sbrPct), ''],
      ['Spread on SBR ( + or - )', pctRaw(t1.spreadPct), pctRaw(t2.spreadPct), ''],
      ['Effective Rate', fmtPct(r.term1.effectiveRate, 2), fmtPct(r.term2.effectiveRate, 2), ''],
      ['Instalment Based on Effective Rate', fmt(r.term1.instalment), fmt(r.term2.instalment), fmt(r.instalment), true],
      ['Instalment Based on Full Tenure', fmt(r.fullTenure1), fmt(r.fullTenure2), fmt(r.fullTenure1 + r.fullTenure2), true]
    ];
    var body = rows.map(function (rw) {
      var cls = rw[4] ? ' class="hoa-emph"' : '';
      return '<tr' + cls + '><td class="hoa-lbl">' + rw[0] + '</td>' +
        '<td class="num">' + (rw[1] === '' ? '-' : rw[1]) + '</td>' +
        '<td class="num">' + (rw[2] === '' ? '-' : rw[2]) + '</td>' +
        '<td class="num hoa-total">' + (rw[3] === '' ? '-' : rw[3]) + '</td></tr>';
    }).join('');
    return '<div class="tbl-wrap"><table class="tbl hoa-tbl">' +
      '<thead><tr><th>Facility</th><th class="num">Term Financing 1</th>' +
      '<th class="num">Term Financing 2</th><th class="num">Total</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  /** Populate each joint applicant's per-row commitment, BT repayment,
      L55/L56/L57 totals, name, IC and age. Runs on its OWN, independent of
      the main applicant's intake being complete - otherwise a joint block
      stays blank ("calculating...") until the main applicant is finished,
      which is the bug officers hit when they fill the joint side first. */
  App.refreshHFJointBlocks = function () {
    var s = App.state;
    if (!(s.hfJoint.A.enabled || s.hfJoint.B.enabled)) return;
    var r = App.computeHF();
    ['A', 'B'].forEach(function (k) {
      var a = s.hfJoint[k];
      if (!a || !a.enabled) return;
      a.ccris.forEach(function (row, i) {
        var cell = el('hfj-commit-' + k + '-' + i);
        if (!cell) return;
        var lc = E.lineCommitment(row, r.hfType, 'HF');
        cell.textContent = amt(lc.commitment);
        cell.classList.toggle('override', lc.overridden);
      });
      (a.bt || []).forEach(function (row, i) {
        var cell = el('hfj-btrep-' + k + '-' + i);
        // HF master D62 = outstanding x 5% (no RM50 floor)
        if (cell) cell.textContent = amt(Math.abs(num(row.outstanding)) * 0.05);
      });
      var totals = null;
      r.perApplicant.forEach(function (p) { if (p.key === k) totals = p; });
      if (totals) {
        var t55 = el('hfj-total-' + k); if (t55) t55.textContent = amt(totals.l55);
        var t56 = el('hfj-bt-total-' + k); if (t56) t56.textContent = amt(totals.l56);
        var t57 = el('hfj-grand-' + k); if (t57) t57.textContent = amt(totals.l57);
      }
      var nameEl = el('hfj-name-' + k); if (nameEl) nameEl.textContent = a.name || '-';
      var icEl = el('hfj-ic-' + k); if (icEl) icEl.textContent = E.formatIC(a.ic) || '-';
      var isEl = el('hfj-iscore-' + k); if (isEl) isEl.textContent = (a.iScore || a.iScore === 0) ? a.iScore : '-';
      var ageCell = el('hfj-age-' + k);
      if (ageCell) {
        var age = E.calculateAgeFromIC(a.ic);
        ageCell.textContent = age != null ? age + ' years' : '-';
      }
      // Recognised income tiles - shown for EVERY joint applicant, by type
      var set = function (id, v) { var cc = el(id); if (cc) cc.textContent = fmt(v); };
      var setText = function (id, v) { var cc = el(id); if (cc) cc.textContent = v; };
      var pers = applicantPersonalIncome(k);
      if (a.type === 'BIZMAN') {
        var bz = E.calcBizmanHF(a.bizman);
        set('hfj-inc-bizcredit-' + k, bz.bizAvgCredit);
        set('hfj-inc-bizbus-' + k, bz.monthlyBusinessIncome);
        set('hfj-inc-bizpers-' + k, bz.monthlyPersonalIncome);
      } else if (a.incomeMode === 'EPF') {
        var ei = E.calcEPFIncome((a.epf.months || []).map(function (m) { return m.employee; }),
          a.epf.epfRatePct, a.epf.deductions);
        (ei.monthlyIncomes || []).forEach(function (v, i) {
          var cell = el('hfj-epf-mi-' + k + '-' + i);
          if (cell) cell.textContent = fmt(v);
        });
        set('hfj-inc-fixed-' + k, ei.fixedIncome);
        set('hfj-inc-var-' + k, ei.variableRaw);
        setText('hfj-inc-itype-' + k, ei.incomeType);
      } else {
        var mi = E.calcNormalManual(a.months || []);
        set('hfj-inc-basic-' + k, mi.basicRecog);
        set('hfj-inc-other-' + k, mi.avgOther);
        set('hfj-inc-ded-' + k, mi.average60EPF + mi.avgPCB + mi.avgSocso);
      }
      set('hfj-inc-gross-' + k, pers.gross);
      set('hfj-inc-net-' + k, pers.net);
    });
  };

  App.refreshHF = function () {
    var r = App.computeHF();
    var s = App.state;

    // Sub Step B tables live in the shared Step B card - refresh them
    // regardless of which HF tab is open
    App.refreshHFJointBlocks();

    // result block (only present on the DSR Decision tab)
    var out = el('hf-out');
    if (out) {
      var finBlock;
      if (r.isHOA) {
        finBlock = hoaFinTable(r, s);
      } else {
        finBlock = '<div class="tile-grid">' +
          tile('FEC (Entry Cost)', fmt(r.fec)) +
          tile('Total Financing Amount', fmt(r.totalFinancing)) +
          tile('Total Margin of Financing', fmtPct(r.totalMOF)) +
          tile('Effective Rate (SBR + Spread)', fmtPct(r.effectiveRate, 2)) +
          tile('Instalment Based on Effective Rate', fmt(r.instalment), 'accent') +
          '</div>';
      }

      var inc = r.income;
      out.innerHTML =
        '<div class="subhead">Income (' + (r.perApplicant.length > 1 ? 'combined, ' + r.perApplicant.length + ' applicants' : 'single applicant') + ')</div>' +
        '<div class="tile-grid">' +
        tile('Basic Income', fmt(inc.basic)) +
        tile('Fixed Allowance', fmt(inc.fixedAllowance)) +
        tile('Other Income', fmt(inc.otherIncome)) +
        tile('Commission', fmt(inc.commission)) +
        tile('OT', fmt(inc.ot)) +
        tile('Gross Income', fmt(inc.grossIncome), 'accent') +
        tile('EPF', fmt(inc.epf)) +
        tile('PCB/Zakat/Tax Deduction', fmt(inc.pcb)) +
        tile('Socso', fmt(inc.socso)) +
        tile('Net Income', fmt(inc.netIncome), 'good') +
        '</div>' +
        '<div class="subhead">Commitments</div>' +
        '<div class="tile-grid">' +
        r.perApplicant.map(function (p) {
          return tile(p.label + ' (L57)', fmt(p.l57));
        }).join('') +
        tile('Total CCRIS (L55)', fmt(r.totalCommitment)) +
        tile('Deduct BT &amp; PF Settlement (L56)', fmt(r.btTotal)) +
        tile('Grand Total Commitment (L57)', fmt(r.grandTotal), 'accent') +
        '</div>' +
        '<div class="subhead">' + esc(s.hf.product) + '</div>' +
        finBlock +
        '<div class="subhead">DSR After Balance Transfer</div>' +
        '<p>' + (r.verdict && App.mode !== 'hf' ? '<span class="verdict ' + vClass(r.verdict) + '">' + vLabel(r.verdict) + '</span>&nbsp;&nbsp;' : '') +
        '<span class="verdict ' + (r.newDSR > 0 && r.threshold > 0 && r.newDSR <= r.threshold ? 'ok' : 'fail') +
        '">DSR ' + fmtPct(r.newDSR, DSR_DP) + '</span></p>' +
        gauge(r.newDSR, r.threshold || 0.0001) +
        '<div class="tile-grid" style="margin-top:10px">' +
        tile('Monthly Installment', fmt(r.instalment)) +
        tile('Monthly CTF Installment', fmt(r.ctf)) +
        tile('New Commitment', fmt(r.newCommitment)) +
        tile('New DSR', fmtPct(r.newDSR, DSR_DP)) +
        '</div>';
    }
    refreshHFPricing();
  };

  /* ---------------- B2 pricing sub-calculators (quotation only) ---------------- */
  function renderHFPricingTab(container, tab) {
    var hp = App.state.hfPricing;
    var html = '';

    if (tab === 'structured' || tab === 'puc') {
      var o = tab === 'puc' ? hp.puc : hp.structured;
      html += '<div class="grid c3">' +
        field('Property Value', 'hpx-prop', o.propertyValue) +
        field('Original Financing Amount', 'hpx-fin', o.financing) +
        field('MRTT Contribution', 'hpx-mrtt', o.mrtt) +
        field('Valuation Cost', 'hpx-val', o.valuation) +
        field('Legal &amp; Stamping', 'hpx-legal', o.legal) +
        field('Tenure (years)', 'hpx-tenure', o.tenureYears) +
        (tab === 'puc' ? field('Grace Period (years)', 'hpx-grace', o.graceYears) : '') +
        field('Ceiling Rate (%)', 'hpx-ceil', o.ceilingPct, { step: '0.01' }) +
        field('Base / SBR (%)', 'hpx-base', o.basePct, { step: '0.01' }) +
        field('Spread (%)', 'hpx-spread', o.spreadPct, { step: '0.01' }) +
        '</div><div id="hfp-out"></div>';
      container.innerHTML = html;
      bindNum('hpx-prop', o, 'propertyValue'); bindNum('hpx-fin', o, 'financing');
      bindNum('hpx-mrtt', o, 'mrtt'); bindNum('hpx-val', o, 'valuation');
      bindNum('hpx-legal', o, 'legal'); bindNum('hpx-tenure', o, 'tenureYears');
      bindNum('hpx-ceil', o, 'ceilingPct'); bindNum('hpx-base', o, 'basePct');
      bindNum('hpx-spread', o, 'spreadPct');
      if (tab === 'puc') bindNum('hpx-grace', o, 'graceYears');
    } else if (tab === 'fixed') {
      var f = hp.fixed;
      html += '<div class="grid c3">' +
        field('Property Value', 'hpf-prop', f.propertyValue) +
        field('Financing Amount', 'hpf-fin', f.financing) +
        field('MRTT', 'hpf-mrtt', f.mrtt) +
        field('Valuation Cost', 'hpf-val', f.valuation) +
        field('Legal &amp; Stamping', 'hpf-legal', f.legal) +
        field('Tenure (years)', 'hpf-tenure', f.tenureYears) +
        field('Fixed Rate (%)', 'hpf-rate', f.ratePct, { step: '0.01' }) +
        '</div><div id="hfp-out"></div>';
      container.innerHTML = html;
      bindNum('hpf-prop', f, 'propertyValue'); bindNum('hpf-fin', f, 'financing');
      bindNum('hpf-mrtt', f, 'mrtt'); bindNum('hpf-val', f, 'valuation');
      bindNum('hpf-legal', f, 'legal'); bindNum('hpf-tenure', f, 'tenureYears');
      bindNum('hpf-rate', f, 'ratePct');
    } else if (tab === 'homeone') {
      var ho = hp.homeOne;
      function hoTermInputs(t, p) {
        return field('Original Financing Amount', p + '-fin', t.financing) +
          field('Renovation + Education', p + '-ren', t.renovation) +
          field('MRTT Contribution', p + '-mrtt', t.mrtt) +
          field('Valuation Cost', p + '-val', t.valuation) +
          field('Legal &amp; Stamping', p + '-legal', t.legal) +
          field('Financing Tenure (Years)', p + '-tenure', t.tenureYears) +
          field('Spread on SBR (%)', p + '-spread', t.spreadPct, { step: '0.01' });
      }
      html += '<div class="grid c3">' +
        field('Property Value', 'hph-prop', ho.propertyValue) +
        field('Standardised Base Rate SBR (%)', 'hph-sbr', ho.sbrPct, { step: '0.01' }) +
        field('Ceiling Rate (%)', 'hph-ceil', ho.ceilingPct, { step: '0.01' }) +
        '</div>' +
        '<div class="subhead">Term Financing 1</div><div class="grid c4">' + hoTermInputs(ho.t1, 'hph1') + '</div>' +
        '<div class="subhead">Term Financing 2</div><div class="grid c4">' + hoTermInputs(ho.t2, 'hph2') + '</div>' +
        '<div id="hfp-out"></div>';
      container.innerHTML = html;
      bindNum('hph-prop', ho, 'propertyValue');
      bindNum('hph-sbr', ho, 'sbrPct'); bindNum('hph-ceil', ho, 'ceilingPct');
      [['hph1', ho.t1], ['hph2', ho.t2]].forEach(function (pr) {
        bindNum(pr[0] + '-fin', pr[1], 'financing'); bindNum(pr[0] + '-ren', pr[1], 'renovation');
        bindNum(pr[0] + '-mrtt', pr[1], 'mrtt'); bindNum(pr[0] + '-val', pr[1], 'valuation');
        bindNum(pr[0] + '-legal', pr[1], 'legal'); bindNum(pr[0] + '-tenure', pr[1], 'tenureYears');
        bindNum(pr[0] + '-spread', pr[1], 'spreadPct');
      });
    }
  }

  function refreshHFPricing() {
    var out = el('hfp-out');
    if (!out) return;
    var hp = App.state.hfPricing, tab = App.hfTab, html = '';

    function pct(v) { return num(v) / 100; }

    if (tab === 'structured') {
      var o = hp.structured;
      var r = E.hfStructured({
        propertyValue: o.propertyValue, financing: o.financing, mrtt: o.mrtt,
        valuation: o.valuation, legal: o.legal, tenureYears: o.tenureYears,
        ceilingRate: pct(o.ceilingPct), baseRate: pct(o.basePct), spread: pct(o.spreadPct)
      });
      html = '<div class="tile-grid" style="margin-top:12px">' +
        tile('FEC (Entry Cost)', fmt(r.fec)) +
        tile('Total Financing', fmt(r.totalFinancing)) +
        tile('Original HF MOF', fmtPct(r.origMOF)) +
        tile('Total MOF', fmtPct(r.totalMOF)) +
        tile('Effective Rate', fmtPct(r.effectiveRate, 2)) +
        tile('Selling Price @ Ceiling', fmt(r.sellingPrice), 'accent') +
        tile('Instalment @ Ceiling', fmt(r.instalmentCeiling)) +
        tile('Instalment @ Effective', fmt(r.instalmentEffective), 'good') +
        '</div><p><span class="verdict ' + (r.mrttFecRatio <= 0.05 ? 'ok' : 'fail') + '">' + r.note + '</span></p>';
    } else if (tab === 'fixed') {
      var f = hp.fixed;
      var rf = E.hfFixed({
        propertyValue: f.propertyValue, financing: f.financing, mrtt: f.mrtt,
        valuation: f.valuation, legal: f.legal, tenureYears: f.tenureYears,
        rate: pct(f.ratePct)
      });
      html = '<div class="tile-grid" style="margin-top:12px">' +
        tile('Entry Costs', fmt(rf.entryCosts)) +
        tile('3% Entry Guide', fmt(rf.entryGuide3pct)) +
        tile('Total Financing', fmt(rf.totalFinancing)) +
        tile('HF MOF', fmtPct(rf.hfMOF)) +
        tile('Total MOF', fmtPct(rf.totalMOF)) +
        tile('Selling Price', fmt(rf.sellingPrice), 'accent') +
        tile('Monthly Instalment', fmt(rf.instalment), 'good') +
        '</div><p><span class="verdict ' + (rf.entryRatio <= 0.05 ? 'ok' : 'fail') + '">' + rf.note + '</span></p>';
    } else if (tab === 'puc') {
      var pz = hp.puc;
      var rp = E.hfPUC({
        propertyValue: pz.propertyValue, financing: pz.financing, mrtt: pz.mrtt,
        valuation: pz.valuation, legal: pz.legal, tenureYears: pz.tenureYears,
        graceYears: pz.graceYears, ceilingRate: pct(pz.ceilingPct),
        baseRate: pct(pz.basePct), spread: pct(pz.spreadPct)
      });
      html = '<div class="tile-grid" style="margin-top:12px">' +
        tile('FEC (Entry Cost)', fmt(rp.fec)) +
        tile('Total Financing', fmt(rp.totalFinancing)) +
        tile('Total MOF', fmtPct(rp.totalMOF)) +
        tile('Effective Rate', fmtPct(rp.effectiveRate, 2)) +
        tile('Selling Price incl Grace @ Ceiling', fmt(rp.sellingPriceWithGrace), 'accent') +
        tile('Grace Monthly Profit @ Ceiling', fmt(rp.graceMonthlyCeiling)) +
        tile('Grace Monthly Profit @ Effective', fmt(rp.graceMonthlyEffective)) +
        tile('Instalment @ Ceiling (after grace)', fmt(rp.instalmentCeiling)) +
        tile('Instalment @ Effective (after grace)', fmt(rp.instalmentEffective), 'good') +
        '</div><p><span class="verdict ' + (rp.mrttFecRatio <= 0.05 ? 'ok' : 'fail') + '">' + rp.note + '</span></p>';
    } else if (tab === 'homeone') {
      var ho = hp.homeOne;
      var rh = E.hfHomeOne({
        propertyValue: ho.propertyValue, sbr: pct(ho.sbrPct), ceiling: pct(ho.ceilingPct),
        t1: { financing: ho.t1.financing, renovation: ho.t1.renovation, mrtt: ho.t1.mrtt,
              valuation: ho.t1.valuation, legal: ho.t1.legal, tenureYears: ho.t1.tenureYears, spread: pct(ho.t1.spreadPct) },
        t2: { financing: ho.t2.financing, renovation: ho.t2.renovation, mrtt: ho.t2.mrtt,
              valuation: ho.t2.valuation, legal: ho.t2.legal, tenureYears: ho.t2.tenureYears, spread: pct(ho.t2.spreadPct) }
      });
      var t1 = rh.t1, t2 = rh.t2, tt = rh.totals;
      function yrs(v) { return num(v) ? String(num(v)) : ''; }
      // [label, term1, term2, total, emphasize]  ('' -> shown as '-')
      var rows = [
        ['Property Value', '', '', fmt(rh.property)],
        ['Original Financing Amount', fmt(t1.financing), fmt(t2.financing), fmt(tt.financing)],
        ['Renovation + Education', fmt(t1.renovation), fmt(t2.renovation), fmt(tt.renovation)],
        ['MRTT Contribution', fmt(t1.mrtt), fmt(t2.mrtt), fmt(tt.mrtt)],
        ['Valuation Cost', fmt(t1.valuation), fmt(t2.valuation), fmt(tt.valuation)],
        ['Legal &amp; Stamping Cost', fmt(t1.legal), fmt(t2.legal), fmt(tt.legal)],
        ['FEC (Entry Costs) [ e + f ]', fmt(t1.fec), fmt(t2.fec), fmt(tt.fec)],
        ['Financing Tenure (Years)', yrs(t1.tenure), yrs(t2.tenure), ''],
        ['Total Financing Amount [ c + c1 + d + g ]', fmt(t1.totalFinancing), fmt(t2.totalFinancing), fmt(tt.totalFinancing), true],
        ['Original HF MOF [ (c + c1) / b ]', fmtPct(t1.origMOF, 2), fmtPct(t2.origMOF, 2), fmtPct(tt.origMOF, 2)],
        ['FEC MOF [ g / b ]', fmtPct(t1.fecMOF, 2), fmtPct(t2.fecMOF, 2), fmtPct(tt.fecMOF, 2)],
        ['MRTT MOF (Inclusive FEC) [ (d + g) / b ]', fmtPct(t1.mrttMOF, 2), fmtPct(t2.mrttMOF, 2), fmtPct(tt.mrttMOF, 2)],
        ['Total Margin of Financing (MOF) [ i / b ]', fmtPct(t1.totalMOF, 2), fmtPct(t2.totalMOF, 2), fmtPct(tt.totalMOF, 2)],
        ['Ceiling Rate', fmtPct(rh.ceiling, 2), fmtPct(rh.ceiling, 2), fmtPct(rh.ceiling, 2)],
        ['Selling Price (Based on Ceiling Rate)', fmt(t1.sellingPriceCeiling), fmt(t2.sellingPriceCeiling), fmt(tt.sellingPriceCeiling)],
        ['Instalment Based on Ceiling Rate', fmt(t1.instalmentCeiling), fmt(t2.instalmentCeiling), fmt(tt.instalmentCeiling)],
        ['Standardised Base Rate (SBR)', fmtPct(rh.sbr, 2), fmtPct(rh.sbr, 2), ''],
        ['Spread on SBR ( + or - )', fmtPct(t1.spread, 2), fmtPct(t2.spread, 2), ''],
        ['Effective Rate', fmtPct(t1.effectiveRate, 2), fmtPct(t2.effectiveRate, 2), ''],
        ['Instalment Based on Effective Rate', fmt(t1.instalmentEffective), fmt(t2.instalmentEffective), fmt(tt.instalmentEffective), true]
      ];
      var bodyRows = rows.map(function (rw) {
        var cls = rw[4] ? ' class="hoa-emph"' : '';
        return '<tr' + cls + '><td class="hoa-lbl">' + rw[0] + '</td>' +
          '<td class="num">' + (rw[1] === '' ? '-' : rw[1]) + '</td>' +
          '<td class="num">' + (rw[2] === '' ? '-' : rw[2]) + '</td>' +
          '<td class="num hoa-total">' + (rw[3] === '' ? '-' : rw[3]) + '</td></tr>';
      }).join('');
      html = '<div class="tbl-wrap" style="margin-top:12px"><table class="tbl hoa-tbl">' +
        '<thead><tr><th>Facility</th><th class="num">Term Financing 1</th>' +
        '<th class="num">Term Financing 2</th><th class="num">Total</th></tr></thead>' +
        '<tbody>' + bodyRows + '</tbody></table></div>' +
        '<div class="tile-grid" style="margin-top:10px">' +
        tile('Blended Effective Rate', fmtPct(rh.blendedRate, 3), 'accent') +
        tile('Total Monthly Instalment (Effective)', fmt(tt.instalmentEffective), 'good') +
        '</div>' +
        '<p><span class="verdict ' + (rh.mrttFecRatio <= 0.05 ? 'ok' : 'fail') + '">' + rh.note + '</span></p>';
    }
    out.innerHTML = html;
  }

  /* ============================================================
     CREDIT CARD (CC) - credit_card.txt sections 3 & 5
     ============================================================ */
  // Card image(s) for a product. BOTH shows Platinum + Signature side by side.
  function cardImagesHtml(product) {
    var imgs = product === 'BOTH'
      ? [['visa_platinum_cc.svg', 'Visa Platinum'], ['visa_signature_cc.svg', 'Visa Signature']]
      : product === 'VISA_SIGNATURE'
        ? [['visa_signature_cc.svg', 'Visa Signature']]
        : [['visa_platinum_cc.svg', 'Visa Platinum']];
    return '<div class="cc-cards' + (imgs.length > 1 ? ' both' : '') + '">' +
      imgs.map(function (c) {
        return '<div class="cc-card"><img src="public/' + c[0] + '" alt="' + c[1] +
          ' credit card"><div class="cc-card-name">' + c[1] + '</div></div>';
      }).join('') + '</div>';
  }
  function ccProductOptions(sel) {
    return [['VISA_PLATINUM', 'Visa Platinum'], ['VISA_SIGNATURE', 'Visa Signature'],
            ['BOTH', 'Both (Platinum + Signature)']]
      .map(function (o) { return '<option value="' + o[0] + '"' + (sel === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
  }

  App.renderCC = function () {
    var cc = App.state.cc;

    // ---- HF + CC: one card application per applicant (multi-card) ----
    if (App.mode === 'hf-cc') {
      ensureCardSeed();
      var appList = hfApplicantList();
      var listHtml = cc.cards.map(function (card, i) {
        var usedByOthers = {};
        cc.cards.forEach(function (c2, j) { if (j !== i) usedByOthers[c2.applicant] = true; });
        var opts = appList.filter(function (a) { return a.key === card.applicant || !usedByOthers[a.key]; })
          .map(function (a) {
            return '<option value="' + a.key + '"' + (a.key === card.applicant ? ' selected' : '') + '>' +
              esc(a.name) + (a.key === 'MAIN' ? ' (Main)' : ' (Joint ' + a.key + ')') + '</option>';
          }).join('');
        return '<div class="cc-app" data-ci="' + i + '">' +
          '<div class="cc-app-head">' +
          '<div class="field"><label>Applicant</label><select class="editable" data-cf="applicant">' + opts + '</select></div>' +
          '<div class="field"><label>Card Product</label><select class="editable" data-cf="product">' + ccProductOptions(card.product) + '</select></div>' +
          (cc.cards.length > 1 ? '<button class="row-del" data-cdel="' + i + '" title="Remove application" type="button">&times;</button>' : '') +
          '</div>' +
          cardImagesHtml(card.product) +
          '<div class="grid c2">' +
          '<div class="field"><label>Proposed Limit (RM, optional)</label><input class="editable" data-cf="proposedLimit" type="text" inputmode="decimal" data-fmt="money" value="' + esc(card.proposedLimit) + '"></div>' +
          '<div class="field"><label>Figures Shown</label><select class="editable" data-cf="useProposed">' +
          '<option value="0"' + (!card.useProposed ? ' selected' : '') + '>Original (system-calculated)</option>' +
          '<option value="1"' + (card.useProposed ? ' selected' : '') + '>Proposed limit</option></select></div>' +
          '</div>' +
          '<div id="cc-out-' + i + '"></div>' +
          '</div>';
      }).join('');
      var canAdd = App.availableCardApplicants().length > 0;
      var body = '<div class="cc-list">' + listHtml + '</div>' +
        (canAdd ? '<div style="margin-top:12px"><button class="btn small secondary" id="cc-addcard" type="button">+ Add credit card application</button></div>' : '');
      el('panel-cc').innerHTML = cardShell('card-cc', 'Credit Cards - Limit &amp; DSR (per applicant)', body);
      bindCCList();
      return;
    }

    // ---- CC standalone / PF + CC: single card, product from Step A ----
    var body =
      cardImagesHtml(cc.product) +
      '<div class="grid c2">' +
      field('Proposed Limit (RM, optional override)', 'cc-proposed', cc.proposedLimit) +
      '<div class="field"><label>Figures Shown</label><select class="editable" id="cc-useproposed">' +
      '<option value="0"' + (!cc.useProposed ? ' selected' : '') + '>Original (system-calculated)</option>' +
      '<option value="1"' + (cc.useProposed ? ' selected' : '') + '>Proposed limit</option></select></div>' +
      '</div>' +
      '<div id="cc-out"></div>';
    el('panel-cc').innerHTML = cardShell('card-cc', 'Credit Card - Limit &amp; DSR Evaluation', body);
    bindNum('cc-proposed', cc, 'proposedLimit');
    var up = el('cc-useproposed');
    if (up) up.onchange = function () { App.state.cc.useProposed = this.value === '1'; App.refreshOutputs(); };
  };

  /** Delegated bindings for the HF+CC card list (bound once on the panel). */
  function bindCCList() {
    var panel = el('panel-cc');
    if (!panel) return;
    if (!panel._ccListBound) {
      panel._ccListBound = true;
      panel.addEventListener('input', function (ev) {
        var t = ev.target, box = t.closest ? t.closest('.cc-app') : null;
        if (!box || t.dataset.cf == null) return;
        var card = App.state.cc.cards[+box.dataset.ci];
        if (!card) return;
        var f = t.dataset.cf;
        if (f === 'useProposed') card.useProposed = t.value === '1';
        else card[f] = f === 'product' ? t.value : t.value;
        if (f === 'applicant' || f === 'product') { App.renderCC(); }
        App.refreshOutputs();
      });
      panel.addEventListener('click', function (ev) {
        var t = ev.target;
        if (t.id === 'cc-addcard') {
          var avail = App.availableCardApplicants();
          if (avail.length) {
            App.state.cc.cards.push({ applicant: avail[0].key, product: 'VISA_PLATINUM', proposedLimit: '', useProposed: false });
            App.renderCC(); App.refreshOutputs();
          }
          return;
        }
        if (t.dataset && t.dataset.cdel != null) {
          App.state.cc.cards.splice(+t.dataset.cdel, 1);
          App.renderCC(); App.refreshOutputs();
        }
      });
    }
  }

  /** Pure CC computation - reused by combos. */
  App.computeCC = function () {
    var s = App.state, c = App.computed;
    var original = E.calculateMaxCreditLimit(c.grossIncome, s.iScore, s.cc.product);
    var active = original;
    if (s.cc.useProposed && num(s.cc.proposedLimit) > 0) {
      active = E.evaluateProposedLimit(s.cc.proposedLimit, s.cc.product);
      active.multiplier = original.multiplier;
    }
    var threshold = E.ccDsrThreshold(c.grossIncome) / 100;

    function evaluate(baseCommitment) {
      var newCommitment = baseCommitment + active.monthlyInstallment;
      var dsr = c.netIncome > 0 ? newCommitment / c.netIncome : 0;
      return {
        newCommitment: newCommitment, dsr: dsr,
        ndi: c.netIncome - newCommitment,
        eligible: active.isEligibleByLimit && dsr > 0 && dsr <= threshold && c.netIncome > 0
      };
    }
    var afterBT = evaluate(c.grandTotal);
    var beforeBT = evaluate(c.totalCommitment);

    return {
      original: original, active: active, threshold: threshold,
      afterBT: afterBT, beforeBT: beforeBT,
      verdict: afterBT.eligible ? E.VERDICT.ELIGIBLE : E.VERDICT.NOT_ELIGIBLE
    };
  };

  /** One credit-card application (HF+CC multi-card) scored on ITS applicant's
      personal income, iScore and own existing commitments - never combined. */
  App.computeCCCard = function (card) {
    var pers = applicantPersonalIncome(card.applicant);
    var iScore = applicantIScore(card.applicant);
    var original = E.calculateMaxCreditLimit(pers.gross, iScore, card.product);
    var active = original;
    if (card.useProposed && num(card.proposedLimit) > 0) {
      active = E.evaluateProposedLimit(card.proposedLimit, card.product);
      active.multiplier = original.multiplier;
    }
    var threshold = E.ccDsrThreshold(pers.gross) / 100;
    var existing = applicantExisting(card.applicant);
    var newCommitment = existing + active.monthlyInstallment;
    var dsr = pers.net > 0 ? newCommitment / pers.net : 0;
    return {
      card: card, applicant: card.applicant, name: applicantName(card.applicant),
      personal: pers, iScore: iScore, original: original, active: active,
      threshold: threshold, existing: existing, newCommitment: newCommitment,
      dsr: dsr, ndi: pers.net - newCommitment,
      eligible: active.isEligibleByLimit && dsr > 0 && dsr <= threshold && pers.net > 0,
      verdict: (active.isEligibleByLimit && dsr > 0 && dsr <= threshold && pers.net > 0)
        ? E.VERDICT.ELIGIBLE : E.VERDICT.NOT_ELIGIBLE
    };
  };

  /** Applicants that can still receive a card (one application per person). */
  App.availableCardApplicants = function () {
    var used = {};
    (App.state.cc.cards || []).forEach(function (c) { used[c.applicant] = true; });
    return hfApplicantList().filter(function (a) { return !used[a.key]; });
  };

  /** Ensure the HF+CC card list is seeded (first card = main applicant,
      carrying whatever Step-A product was previously chosen). */
  function ensureCardSeed() {
    var cc = App.state.cc;
    if (!cc.cards) cc.cards = [];
    if (!cc.cards.length) {
      cc.cards.push({ applicant: 'MAIN', product: cc.product || 'VISA_PLATINUM',
        proposedLimit: cc.proposedLimit || '', useProposed: !!cc.useProposed });
    }
    // drop cards whose applicant is no longer an enabled HF applicant
    var valid = {}; hfApplicantList().forEach(function (a) { valid[a.key] = true; });
    cc.cards = cc.cards.filter(function (c) { return valid[c.applicant]; });
    if (!cc.cards.length) cc.cards.push({ applicant: 'MAIN', product: 'VISA_PLATINUM', proposedLimit: '', useProposed: false });
  }

  /** Render one card application's result block (HF+CC per-applicant). */
  function ccCardResultHtml(rc) {
    var a = rc.active;
    var rg = E.cardRiskGrade(rc.iScore);
    var rgLabel = rg ? rg + ' (iScore ' + rc.iScore + ')'
      : (rc.iScore ? 'Below RG5 - rejected (iScore ' +rc.iScore + ')' : 'iScore missing');
    return '<div class="subhead">' + esc(rc.name) + ' - result' + (rc.card && rc.card.useProposed ? ' (proposed limit)' : '') + '</div>' +
      '<p><span class="verdict ' + vClass(rc.verdict) + '">' + vLabel(rc.verdict) + '</span>&nbsp;&nbsp;' +
      '<span class="verdict ' + (rc.dsr <= rc.threshold && rc.dsr > 0 ? 'ok' : 'fail') + '">DSR ' + fmtPct(rc.dsr, DSR_DP) + '</span></p>' +
      gauge(rc.dsr, rc.threshold) +
      '<div class="tile-grid" style="margin-top:10px">' +
      tile('Credit Card Risk Grade', rgLabel, 'accent') +
      tile('Personal Gross', fmt(rc.personal.gross)) +
      tile('Max Credit Limit', fmt(a.maxCreditLimit), 'accent') +
      tile('Card Instalment (1%)', fmt(a.monthlyInstallment)) +
      tile('Existing Commitment', fmt(rc.existing)) +
      tile('New DSR', fmtPct(rc.dsr, DSR_DP)) +
      tile('NDI', fmt(rc.ndi), rc.ndi > 0 ? 'good' : 'accent') +
      '</div>';
  }

  App.refreshCC = function () {
    // HF+CC: one result block per card application
    if (App.mode === 'hf-cc') {
      (App.state.cc.cards || []).forEach(function (card, i) {
        var cell = el('cc-out-' + i);
        if (cell) cell.innerHTML = ccCardResultHtml(App.computeCCCard(card));
      });
      return;
    }
    var out = el('cc-out');
    if (!out) return;
    var r = App.computeCC();
    var a = r.active;
    // Credit-card Risk Grade (distinct from the PF/iScore grade)
    var cardRG = E.cardRiskGrade(App.state.iScore);
    var rgLabel = cardRG
      ? cardRG + ' (iScore ' + App.state.iScore + ')'
      : (App.state.iScore ? 'Below RG5 - rejected (iScore ' +App.state.iScore + ')' : '-');
    out.innerHTML =
      '<div class="subhead">Result' + (App.state.cc.useProposed ? ' (proposed limit)' : '') + '</div>' +
      // Standalone: decision shown once, in the Application Summary below.
      '<p>' + (App.mode === 'cc' ? '' : '<span class="verdict ' + vClass(r.verdict) + '">' + vLabel(r.verdict) + '</span>&nbsp;&nbsp;') +
      '<span class="verdict ' + (r.afterBT.dsr <= r.threshold && r.afterBT.dsr > 0 ? 'ok' : 'fail') +
      '">DSR ' + fmtPct(r.afterBT.dsr, DSR_DP) + '</span></p>' +
      gauge(r.afterBT.dsr, r.threshold) +
      '<div class="tile-grid" style="margin-top:10px">' +
      tile('Credit Card Risk Grade', rgLabel, 'accent') +
      tile('Max Credit Limit', fmt(a.maxCreditLimit), 'accent') +
      tile('Card Monthly Instalment (1%)', fmt(a.monthlyInstallment)) +
      '</div>' +
      '<div class="subhead">Before vs After Balance Transfer</div>' +
      '<div class="tile-grid">' +
      tile('New Commitment (before BT)', fmt(r.beforeBT.newCommitment)) +
      tile('New DSR (before BT)', fmtPct(r.beforeBT.dsr, DSR_DP)) +
      tile('NDI (before BT)', fmt(r.beforeBT.ndi)) +
      tile('New Commitment (after BT)', fmt(r.afterBT.newCommitment)) +
      tile('New DSR (after BT)', fmtPct(r.afterBT.dsr, DSR_DP)) +
      tile('NDI (after BT)', fmt(r.afterBT.ndi), r.afterBT.ndi > 0 ? 'good' : 'accent') +
      '</div>';
  };

  /* ============================================================
     COMBO - compose the pure per-product functions, never fork
     ============================================================ */
  /**
   * Normalised decision model for EVERY ready mode - standalone AND combo -
   * so the on-screen banner and the PDF report render from ONE source.
   * Returns null when intake is not complete. Two shapes:
   *   kind:'per-applicant'  (hf-cc / pf-hf: one DSR row per applicant)
   *   kind:'single'         (pf / hf / cc standalone and pf-cc: one DSR)
   */
  App.combinedDecisionData = function (mode) {
    if (!App.computed.intakeReady) return null;
    var c = App.computed, s = App.state;
    var hasPF = mode.indexOf('pf') !== -1;
    var hasHF = mode.indexOf('hf') !== -1;
    var hasCC = mode.indexOf('cc') !== -1;

    // Per-applicant instalment maps (PF+HF / HF+CC assign a facility per
    // applicant; every other combo is the single main applicant).
    var pfTotal = 0, pfByApplicant = {};
    if (hasPF) {
      if (mode === 'pf-hf') {
        ensurePFSeed();
        (s.pf.apps || []).forEach(function (a) {
          var inst = App.computePFApp(a).instalment;
          pfByApplicant[a.applicant] = (pfByApplicant[a.applicant] || 0) + inst;
          pfTotal += inst;
        });
      } else { pfTotal = App.computePF().instalment; pfByApplicant.MAIN = pfTotal; }
    }
    var ccTotal = 0, ccByApplicant = {};
    if (hasCC) {
      if (mode === 'hf-cc') {
        ensureCardSeed();
        (s.cc.cards || []).forEach(function (card) {
          var inst = App.computeCCCard(card).active.monthlyInstallment;
          ccByApplicant[card.applicant] = (ccByApplicant[card.applicant] || 0) + inst;
          ccTotal += inst;
        });
      } else { ccTotal = App.computeCC().active.monthlyInstallment; ccByApplicant.MAIN = ccTotal; }
    }

    // ---- Per-applicant combos (Home Financing split across applicants) ----
    if (mode === 'hf-cc' || mode === 'pf-hf') {
      var hf = App.computeHF();
      var hfInst = hf.ctf !== 0 ? hf.ctf : hf.instalment;
      var apps = hfApplicantList();
      var N = apps.length || 1;
      var share = hfInst / N;
      var l57 = {};
      hf.perApplicant.forEach(function (p) { l57[p.key] = p.l57; });
      var rows = apps.map(function (ap) {
        var main = ap.key === 'MAIN';
        var pers = applicantPersonalIncome(ap.key);
        var existing = main ? c.grandTotal : (l57[ap.key] || 0);
        var pfShare = pfByApplicant[ap.key] || 0;
        var ccShare = ccByApplicant[ap.key] || 0;
        var commit = share + existing + pfShare + ccShare;
        var dsr = pers.net > 0 ? commit / pers.net : 0;
        var thr = E.hfThreshold(pers.gross, applicantType(ap.key));
        var ok = dsr > 0 && dsr <= thr;
        var build = [['HF', share]], prods = ['HF'];
        if (pfShare) { build.push(['PF', pfShare]); prods.push('PF'); }
        if (ccShare) { build.push(['CC', ccShare]); prods.push('CC'); }
        return { key: ap.key, name: ap.name, build: build, prods: prods,
          existing: existing, commit: commit, net: pers.net, dsr: dsr, ok: ok };
      });
      return { kind: 'per-applicant', mode: mode, hfInst: hfInst, N: N, rows: rows };
    }

    // ---- HF standalone (may still have joint applicants; combined Summary) ----
    if (mode === 'hf') {
      var hfS = App.computeHF();
      var hfSInst = hfS.ctf !== 0 ? hfS.ctf : hfS.instalment;
      var netS = hfS.income ? hfS.income.netIncome : c.netIncome;
      return { kind: 'single', mode: mode, multi: false,
        parts: [{ code: 'HF', label: 'Home Financing', amount: hfSInst, verdict: hfS.verdict }],
        commitment: hfS.newCommitment, dsr: hfS.newDSR, ndi: netS - hfS.newCommitment,
        verdict: hfS.verdict, prods: ['HF'] };
    }

    // ---- Single DSR: PF / CC standalone and PF+CC (main-applicant pot) ----
    var parts = [], instalments = 0, thresholds = [], lastVerdict = null;
    if (hasPF) {
      var pf = App.computePF();
      instalments += pfTotal; thresholds.push(pf.threshold);
      parts.push({ code: 'PF', label: 'Personal Financing', amount: pfTotal, verdict: pf.verdict });
      lastVerdict = pf.verdict;
    }
    if (hasCC) {
      var cc = App.computeCC();
      instalments += ccTotal; thresholds.push(E.ccDsrThreshold(c.grossIncome) / 100);
      parts.push({ code: 'CC', label: 'Credit Card', amount: ccTotal, verdict: cc.verdict });
      lastVerdict = cc.verdict;
    }
    var valid = thresholds.filter(function (t) { return t > 0; });
    var governing = valid.length ? Math.min.apply(null, valid) : 0;
    var commitment = c.grandTotal + instalments;
    var dsr = c.netIncome > 0 ? commitment / c.netIncome : 0;
    var ndi = c.netIncome - commitment;
    var multi = parts.length > 1;
    // Standalone uses the product's OWN verdict (respects CC limit eligibility);
    // a multi-product combo uses the governing-threshold DSR verdict.
    var verdict = multi
      ? (governing > 0 && dsr <= governing ? E.VERDICT.OK : E.VERDICT.DSR_BURST)
      : lastVerdict;
    return { kind: 'single', mode: mode, multi: multi, parts: parts,
      commitment: commitment, dsr: dsr, ndi: ndi, verdict: verdict,
      prods: parts.map(function (p) { return p.code; }) };
  };

  /** Per-applicant banner (hf-cc / pf-hf). */
  function perApplicantBanner(d) {
    var rows = d.rows.map(function (r) {
      var build = r.build.map(function (b) { return b[0] + ' ' + fmt(b[1]); });
      if (r.existing) build.push('existing ' + fmt(r.existing));
      var verdictTxt = (r.ok ? 'APPROVED ' : 'REJECTED ') + r.prods.join(' + ');
      return '<div class="cb-person">' +
        '<div class="cb-who"><div class="cb-name">' + esc(r.name) + '</div>' +
        '<div class="cb-build">' + build.join('  +  ') + '</div></div>' +
        '<div class="cb-metric"><span>New commitment</span><b>' + fmt(r.commit) + '</b></div>' +
        '<div class="cb-metric"><span>Personal net</span><b>' + fmt(r.net) + '</b></div>' +
        '<div class="cb-metric"><span>DSR</span><b class="cb-dsr">' + fmtPct(r.dsr, DSR_DP) + '</b></div>' +
        '<div class="cb-metric"><span class="verdict ' + (r.ok ? 'ok' : 'fail') + '">' + verdictTxt + '</span></div>' +
        '</div>';
    }).join('');
    return '<div class="combined-banner">' +
      '<div class="cb-title">Combined Application - per applicant &nbsp;&middot;&nbsp; home instalment ' +
      fmt(d.hfInst) + ' split &divide; ' + d.N + '</div>' + rows + '</div>';
  }

  /** Single-DSR banner (standalone summary AND pf-cc). Arranged as one row of
      labelled metrics ending in the decision pill. */
  function singleBanner(d) {
    var title = (d.multi ? 'Combined Application - ' : 'Application Summary - ') + d.prods.join(' + ');
    var partsHtml = d.parts.map(function (p) {
      // A single-product summary carries the decision once (the pill below);
      // only a multi-product combo labels each facility's own verdict.
      var v = d.multi ? ' (' + (vLabel(p.verdict) || '-') + ')' : '';
      return '<div class="cb-metric"><span>' + esc(p.label) + v + '</span>' +
        '<b>' + fmt(p.amount) + '</b></div>';
    }).join('');
    var vl = vLabel(d.verdict);
    var verdictTxt = (vl || 'PENDING') + ' ' + d.prods.join(' + ');
    var vcls = vClass(d.verdict) || 'warn';
    return '<div class="combined-banner">' +
      '<div class="cb-title">' + esc(title) + '</div>' +
      '<div class="cb-single">' + partsHtml +
      '<div class="cb-metric"><span>New commitment</span><b>' + fmt(d.commitment) + '</b></div>' +
      '<div class="cb-metric"><span>New DSR</span><b class="cb-dsr">' + fmtPct(d.dsr, DSR_DP) + '</b></div>' +
      '<div class="cb-metric"><span>NDI</span><b>' + fmt(d.ndi) + '</b></div>' +
      '<div class="cb-metric"><span class="verdict ' + vcls + '">' + verdictTxt + '</span></div>' +
      '</div></div>';
  }

  App.refreshCombined = function (mode) {
    var box = el('combined-panel');
    if (!box) return;
    var d = App.combinedDecisionData(mode);
    if (!d) { box.innerHTML = ''; return; }
    box.innerHTML = d.kind === 'per-applicant' ? perApplicantBanner(d) : singleBanner(d);
  };

  /* ============================================================
     MAKER / CHECKER SIGN-OFF (draw on canvas OR upload a PNG/JPEG)

     Two states, driven by globals set in js/pages/calculator.js (see
     web/index.html) from the local JSON database:
       - NEW case (no window.__DSR_CASE): the maker (role "normal")
         fills their own box + picks a checker from
         window.__DSR_CHECKERS, then "Submit to Checker" calls
         App.submitCaseToChecker() (web/js/caseSync.js), which writes
         straight into the local database via store/cases.js. Nothing
         is saved anywhere until that click.
       - EXISTING case (window.__DSR_CASE set): both boxes render
         from the stored payload; only the assigned checker, while
         the case is still pending, gets an editable checker box +
         Approve/Reject/Return buttons (App.submitCheckerDecision,
         App.returnCaseToMaker). Every other viewer (the maker, an
         admin, or after a decision is made) sees a fully read-only
         record.
       - RETURNED case (status 'returned'): the checker spotted
         something wrong and sent it back rather than rejecting it.
         The case leaves the checker's queue and the maker gets the
         calculator unlocked again (Edit Case) plus a "Resubmit to
         Checker" button (App.resubmitCase) that routes it back to
         the same checker. Return and resubmit both carry a comment,
         and the whole exchange is rendered as a thread below the
         status banner so the next reviewer can see what was queried.
     ============================================================ */
  App.renderSignoff = function () {
    var so = App.state.signoff;
    var user = window.__DSR_USER || { role: 'normal' };
    var caseInfo = window.__DSR_CASE || null;
    var isNewCase = !caseInfo;
    var isMaker = user.role === 'normal';
    var isChecker = user.role === 'checker';
    var canDecide = !!(isChecker && caseInfo && caseInfo.status === 'pending_checker');
    var isReturned = !!(caseInfo && caseInfo.status === 'returned');
    var isOwnCase = !!(caseInfo && user.id === caseInfo.makerId);
    // the maker can fix a typo / reduce an amount etc. on their OWN case
    // while it's still awaiting the checker, or after the checker sent it
    // back - never once decided, and never anyone else's case
    // (checkers/admins only ever view+decide)
    var canEdit = !!(isOwnCase && (caseInfo.status === 'pending_checker' || isReturned));
    // only a returned case can be routed back into the checker's queue;
    // one that is still pending is already there
    var canResubmit = !!(isOwnCase && isReturned);

    if (isNewCase && isMaker && !so.makerName && user.name) { so.makerName = user.name; }
    if (isNewCase && isMaker && !so.makerId && user.staffId) { so.makerId = user.staffId; }
    if (canDecide && !so.checkerName && user.name) { so.checkerName = user.name; }
    if (canDecide && !so.checkerId && user.staffId) { so.checkerId = user.staffId; }
    // the checker's sign-off date must be the Malaysian calendar day - taking
    // it from UTC back-dates every signature made before 08:00 MYT
    if (canDecide && !so.checkerDate) { so.checkerDate = Db.today(); }

    function sigBox(role, key, editable) {
      var dis = editable ? '' : ' disabled';
      var body = '<div class="sig-box"><div class="subhead">' + role + '</div>' +
        '<div class="grid c2" style="margin-bottom:8px">' +
        '<div class="field"><label>Name</label><input class="readonly" data-so="' + key + 'Name" disabled value="' + esc(so[key + 'Name']) + '"></div>' +
        '<div class="field"><label>Staff ID</label><input class="readonly" data-so="' + key + 'Id" disabled value="' + esc(so[key + 'Id']) + '"></div>' +
        '<div class="field"><label>Date</label><input class="editable" type="date" data-so="' + key + 'Date"' + dis + ' value="' + esc(so[key + 'Date']) + '"></div></div>';
      if (editable) {
        body += '<label style="font-size:11px;color:var(--muted);font-weight:600">Signature (draw below, or upload a PNG / JPEG)</label>' +
          '<canvas data-sig="' + key + '" width="600" height="180"></canvas>' +
          '<div class="no-print" style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn small secondary" data-sigupload="' + key + '" type="button">Upload image</button>' +
          '<button class="btn small secondary" data-sigclear="' + key + '" type="button">Clear signature</button>' +
          '<input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" data-sigfile="' + key + '" style="display:none"></div>';
      } else {
        body += '<label style="font-size:11px;color:var(--muted);font-weight:600">Signature</label>' +
          (so[key + 'Signature']
            ? '<img src="' + so[key + 'Signature'] + '" style="max-width:100%;height:110px;border:1.5px dashed var(--border-strong);border-radius:6px;display:block">'
            : '<div style="height:110px;border:1.5px dashed var(--border-strong);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px">Not yet signed</div>');
      }
      return body + '</div>';
    }

    function statusBanner() {
      if (!caseInfo) return '';
      var cls = { draft: 'warn', pending_checker: 'warn', returned: 'info', approved: 'ok', rejected: 'fail' }[caseInfo.status] || 'warn';
      var label = { draft: 'DRAFT', pending_checker: 'PENDING CHECKER', returned: 'RETURNED TO MAKER',
        approved: 'APPROVED', rejected: 'REJECTED' }[caseInfo.status] || caseInfo.status;
      var line = '<b>' + esc(caseInfo.reference) + '</b> &nbsp; <span class="verdict ' + cls + '">' + label + '</span>' +
        (caseInfo.checkerName ? ' &nbsp; routed to <b>' + esc(caseInfo.checkerName) + '</b>' : '');
      // transparency for a maker-side correction: visible to the checker
      // and anyone else looking at the case, not just the maker who did it
      if (caseInfo.editCount > 0) {
        line += ' &nbsp; <span class="verdict warn">EDITED &times;' + caseInfo.editCount + '</span>' +
          (caseInfo.editedAt ? ' <span style="font-size:11px;color:var(--muted)">last ' +
            esc(Db.dateTime(caseInfo.editedAt)) + ' ' + Db.TZ_LABEL + '</span>' : '');
      }
      // a case that has been round the loop shows how many times, so a
      // reviewer can tell a first submission from a third attempt
      if (caseInfo.returnCount > 0 && caseInfo.status !== 'returned') {
        line += ' &nbsp; <span class="verdict warn">RETURNED &times;' + caseInfo.returnCount + '</span>';
      }
      if (caseInfo.status === 'approved' || caseInfo.status === 'rejected') {
        line += '<br><span style="font-size:12px;color:var(--muted)">Decided ' +
          esc(Db.dateTime(caseInfo.decidedAt)) + ' ' + Db.TZ_LABEL +
          (caseInfo.decisionNotes ? ' - ' + esc(caseInfo.decisionNotes) : '') + '</span>';
      }
      if (caseInfo.status === 'returned') {
        line += '<br><span style="font-size:12px;color:var(--muted)">Returned ' +
          esc(Db.dateTime(caseInfo.returnedAt)) + ' ' + Db.TZ_LABEL +
          (caseInfo.returnCount > 1 ? ' (' + caseInfo.returnCount + 'x so far)' : '') + '</span>';
      }
      return '<div class="notice info" style="margin-bottom:14px">' + line + '</div>';
    }

    /**
     * The maker/checker exchange: every return, resubmission and final
     * decision, oldest first. Printed with the case (no .no-print) - the
     * reason a case went back and forth is part of the record.
     */
    function commentThreadHtml() {
      var list = (caseInfo && caseInfo.comments) || [];
      if (!list.length) return '';
      var TYPE = {
        RETURNED: { label: 'Returned for amendment', cls: 'info' },
        RESUBMITTED: { label: 'Resubmitted to checker', cls: 'warn' },
        APPROVED: { label: 'Approved', cls: 'ok' },
        REJECTED: { label: 'Rejected', cls: 'fail' }
      };
      var items = list.map(function (c) {
        var t = TYPE[c.type] || { label: c.type, cls: 'warn' };
        return '<li style="padding:9px 0;border-top:1px solid var(--border)">' +
          '<div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap">' +
            '<span class="verdict ' + t.cls + '">' + esc(t.label) + '</span>' +
            '<b style="font-size:12.5px">' + esc(c.by_name || 'Unknown user') + '</b>' +
            '<span style="font-size:11px;color:var(--muted)">' +
              esc(Db.dateTime(c.at)) + ' ' + Db.TZ_LABEL + '</span>' +
          '</div>' +
          (c.text
            ? '<div style="font-size:12.5px;margin-top:4px;white-space:pre-wrap">' + esc(c.text) + '</div>'
            : '<div style="font-size:12px;margin-top:4px;color:var(--muted)">No comment given.</div>') +
          '</li>';
      }).join('');
      return '<div style="margin-bottom:14px">' +
        '<div class="subhead">Case comments (' + list.length + ')</div>' +
        '<ul style="list-style:none;margin:0;padding:0">' + items + '</ul></div>';
    }

    function editControlsHtml() {
      if (!canEdit) return '';
      if (App.caseEditing) {
        // A returned case always lands here (caseSync.js opens it unlocked),
        // so this is the maker's only control surface for one.
        return '<div class="no-print" style="margin-bottom:14px">' +
          '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
            // a returned case has one job - fix it and send it back - so it
            // gets the single Save & Resubmit action; a still-pending case
            // being edited in place gets the plain save
            (canResubmit
              ? '<button class="btn" id="btn-save-resubmit" type="button">Save &amp; Resubmit</button>'
              : '<button class="btn" id="btn-save-edit" type="button">Save Changes</button>') +
            '<button class="btn secondary" id="btn-cancel-edit" type="button">' +
              // nothing to "cancel" back to on a returned case - it opens in
              // edit mode - so the reload just throws away what was typed
              (canResubmit ? 'Discard Changes' : 'Cancel') + '</button>' +
            '<span id="edit-save-msg" style="font-size:12.5px"></span>' +
          '</div>' +
          (canResubmit
            ? '<div class="field" style="margin-top:10px;max-width:520px">' +
                '<label>Reply to the checker (optional)</label>' +
                '<textarea id="so-resubmit-note" rows="2" style="width:100%"></textarea>' +
              '</div>'
            : '') +
          '</div>';
      }
      // read-only entry point - only ever a still-pending case, since a
      // returned one is unlocked from the moment it loads
      return '<div class="no-print" style="margin-bottom:14px">' +
        '<button class="btn secondary" id="btn-start-edit" type="button">Edit Case</button> ' +
        '<span style="font-size:11.5px;color:var(--muted)">Found a typo, or the checker asked for a smaller amount? ' +
        'Edit and re-save - the checker will see it was revised.</span>' +
        '</div>';
    }

    function submitBlockHtml() {
      var checkers = window.__DSR_CHECKERS || [];
      if (!checkers.length) {
        return '<div class="notice" style="margin-top:14px">No active checker accounts exist yet - ask an admin to create one before you can submit a case.</div>';
      }
      return '<div class="no-print" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">' +
        '<div class="grid c3" style="align-items:end">' +
        '<div class="field"><label>Route to checker</label><select id="so-checker-pick">' +
        checkers.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('') +
        '</select></div>' +
        '<div><button class="btn" id="btn-submit-checker" type="button">Submit to Checker</button></div>' +
        '</div><div id="so-submit-msg" style="margin-top:8px;font-size:12.5px"></div></div>';
    }

    function decisionBlockHtml() {
      return '<div class="no-print" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">' +
        '<div class="field"><label>Comment (required if rejecting or returning)</label>' +
        '<textarea id="so-decision-notes" rows="2" style="width:100%"></textarea></div>' +
        '<div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap">' +
        '<button class="btn" id="btn-decide-approve" type="button">Approve</button>' +
        '<button class="btn secondary" id="btn-decide-return" type="button">Return to Maker</button>' +
        '<button class="btn danger" id="btn-decide-reject" type="button">Reject</button>' +
        '</div>' +
        '<div id="so-decision-msg" style="margin-top:8px;font-size:12.5px"></div></div>';
    }

    var boxes = '<div class="sig-grid">' +
      sigBox('Maker (TL / BM)', 'maker', isNewCase && isMaker) +
      (isNewCase ? '' : sigBox('Checker (SSU)', 'checker', canDecide)) +
      '</div>';
    var extra = (isNewCase && isMaker) ? submitBlockHtml() : (canDecide ? decisionBlockHtml() : '');

    el('signoff-panel').innerHTML = cardShell('card-signoff', 'Maker / Checker Sign-off',
      statusBanner() + commentThreadHtml() + editControlsHtml() + boxes + extra);

    document.querySelectorAll('[data-so]:not([disabled])').forEach(function (inp) {
      inp.oninput = function () { App.state.signoff[this.dataset.so] = this.value; };
    });
    document.querySelectorAll('canvas[data-sig]').forEach(function (cv) {
      var key = cv.dataset.sig;
      var ctx = cv.getContext && cv.getContext('2d');
      if (!ctx) return;   // environment without canvas support
      ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1a5276';
      var saved = App.state.signoff[key + 'Signature'];
      if (saved) { var img = new Image(); img.onload = function () { ctx.drawImage(img, 0, 0, cv.width, cv.height); }; img.src = saved; }
      var drawing = false;
      function pos(ev) {
        var r = cv.getBoundingClientRect();
        var p = ev.touches ? ev.touches[0] : ev;
        return { x: (p.clientX - r.left) * cv.width / r.width, y: (p.clientY - r.top) * cv.height / r.height };
      }
      function start(ev) { drawing = true; var p = pos(ev); ctx.beginPath(); ctx.moveTo(p.x, p.y); ev.preventDefault(); }
      function move(ev) { if (!drawing) return; var p = pos(ev); ctx.lineTo(p.x, p.y); ctx.stroke(); ev.preventDefault(); }
      function end() { if (drawing) { drawing = false; App.state.signoff[key + 'Signature'] = cv.toDataURL(); } }
      cv.addEventListener('mousedown', start); cv.addEventListener('mousemove', move);
      window.addEventListener('mouseup', end);
      cv.addEventListener('touchstart', start); cv.addEventListener('touchmove', move);
      cv.addEventListener('touchend', end);
    });
    document.querySelectorAll('[data-sigclear]').forEach(function (btn) {
      btn.onclick = function () {
        var key = this.dataset.sigclear;
        var cv = document.querySelector('canvas[data-sig="' + key + '"]');
        var ctx = cv.getContext && cv.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, cv.width, cv.height);
        App.state.signoff[key + 'Signature'] = '';
      };
    });
    // upload a signature image (PNG/JPEG) - drawn onto the same canvas,
    // fitted and centred, then stored like a drawn signature
    document.querySelectorAll('[data-sigupload]').forEach(function (btn) {
      var key = btn.dataset.sigupload;
      var input = document.querySelector('[data-sigfile="' + key + '"]');
      if (!input) return;
      btn.onclick = function () { input.click(); };
      input.onchange = function () {
        var file = input.files && input.files[0];
        var cv = document.querySelector('canvas[data-sig="' + key + '"]');
        var ctx = cv && cv.getContext && cv.getContext('2d');
        if (!file || !ctx) { input.value = ''; return; }
        var reader = new FileReader();
        reader.onload = function (e) {
          var img = new Image();
          img.onload = function () {
            ctx.clearRect(0, 0, cv.width, cv.height);
            var scale = Math.min(cv.width / img.width, cv.height / img.height);
            var w = img.width * scale, h = img.height * scale;
            ctx.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
            App.state.signoff[key + 'Signature'] = cv.toDataURL('image/png');
          };
          img.onerror = function () {
            App.modal.alert('Could not read that image. Use a PNG or JPEG file.',
              { type: 'error', title: 'Unsupported image' });
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
        input.value = '';
      };
    });

    // ---- submit to checker (new case, maker only) ----
    var submitBtn = el('btn-submit-checker');
    if (submitBtn) {
      submitBtn.onclick = function () {
        if (!App.computed.intakeReady) {
          App.modal.alert('Complete the customer, CCRIS and income intake before submitting.', { type: 'error' });
          return;
        }
        var checkerId = +el('so-checker-pick').value;
        submitBtn.disabled = true;
        var msg = el('so-submit-msg');
        msg.textContent = 'Submitting...';
        App.submitCaseToChecker(checkerId).then(function (result) {
          if (result.ok) {
            location.href = '/index.html?case=' + result.id + '&submitted=1';
          } else {
            msg.textContent = result.error || 'Submit failed.';
            msg.style.color = 'var(--fail)';
            submitBtn.disabled = false;
          }
        });
      };
    }

    // ---- checker decision (existing pending case, assigned checker only) ----
    function decide(decision) {
      var notes = el('so-decision-notes').value.trim();
      if (decision === 'rejected' && !notes) {
        App.modal.alert('Enter a reason before rejecting.', { type: 'error' });
        return;
      }
      var msg = el('so-decision-msg');
      msg.textContent = 'Saving decision...';
      var signoff = {
        checkerName: so.checkerName || '', checkerId: so.checkerId || '',
        checkerDate: so.checkerDate || '', checkerSignature: so.checkerSignature || ''
      };
      App.submitCheckerDecision(caseInfo.id, decision, notes, signoff).then(function (result) {
        if (result.ok) {
          location.href = '/index.html?case=' + caseInfo.id + '&decided=1';
        } else {
          msg.textContent = result.error || 'Could not save decision.';
          msg.style.color = 'var(--fail)';
        }
      });
    }
    var appBtn = el('btn-decide-approve');
    if (appBtn) appBtn.onclick = function () { decide('approved'); };
    var rejBtn = el('btn-decide-reject');
    if (rejBtn) rejBtn.onclick = function () { decide('rejected'); };

    // ---- return to maker (existing pending case, assigned checker only) ----
    // Not a decision: the case leaves the queue but stays open, so the
    // checker's signature deliberately isn't captured here - they sign when
    // they finally approve or reject the amended case.
    var retBtn = el('btn-decide-return');
    if (retBtn) retBtn.onclick = function () {
      var notes = el('so-decision-notes').value.trim();
      if (!notes) {
        App.modal.alert('Tell the maker what needs amending before returning the case.',
          { type: 'error', title: 'Comment required' });
        return;
      }
      App.modal.confirm('Send ' + caseInfo.reference + ' back to the maker for amendment?',
        { title: 'Return to maker', okLabel: 'Return case', cancelLabel: 'Keep reviewing' }
      ).then(function (ok) {
        if (!ok) return;
        retBtn.disabled = true;
        var msg = el('so-decision-msg');
        msg.textContent = 'Returning case...';
        App.returnCaseToMaker(caseInfo.id, notes).then(function (result) {
          if (result.ok) {
            location.href = '/index.html?case=' + caseInfo.id + '&returned=1';
          } else {
            msg.textContent = result.error || 'Could not return the case.';
            msg.style.color = 'var(--fail)';
            retBtn.disabled = false;
          }
        });
      });
    };

    // ---- maker resubmitting a returned case ----
    // The on-screen figures always go with it: the case has been editable
    // since it loaded, so they are what the maker wants the checker to see
    // whether or not anything was actually changed.
    var saveResubmitBtn = el('btn-save-resubmit');
    if (saveResubmitBtn) saveResubmitBtn.onclick = function () {
      if (!App.computed.intakeReady) {
        App.modal.alert('Complete the customer, CCRIS and income intake before resubmitting.', { type: 'error' });
        return;
      }
      var noteEl = el('so-resubmit-note');
      saveResubmitBtn.disabled = true;
      var msg = el('edit-save-msg');
      msg.textContent = 'Resubmitting...';
      App.resubmitCase(caseInfo.id, noteEl ? noteEl.value.trim() : '', true).then(function (result) {
        if (result.ok) {
          location.href = '/index.html?case=' + caseInfo.id + '&resubmitted=1';
        } else {
          msg.textContent = result.error || 'Resubmit failed.';
          msg.style.color = 'var(--fail)';
          saveResubmitBtn.disabled = false;
        }
      });
    };

    // ---- maker editing their own pending case ----
    var startEditBtn = el('btn-start-edit');
    if (startEditBtn) startEditBtn.onclick = function () {
      // App.renderAll() rebuilds every panel from scratch; with
      // App.caseEditing true, caseSync.js's lock never re-applies to the
      // fresh markup, so this alone is enough to make it interactive again.
      App.caseEditing = true;
      App.renderAll();
    };
    var cancelEditBtn = el('btn-cancel-edit');
    if (cancelEditBtn) cancelEditBtn.onclick = function () {
      // simplest correct "discard my in-memory edits": drop caseEditing and
      // reload, which re-fetches the still-unsaved-server-side state fresh
      location.reload();
    };
    var saveEditBtn = el('btn-save-edit');
    if (saveEditBtn) saveEditBtn.onclick = function () {
      if (!App.computed.intakeReady) {
        App.modal.alert('Complete the customer, CCRIS and income intake before saving.', { type: 'error' });
        return;
      }
      saveEditBtn.disabled = true;
      var msg = el('edit-save-msg');
      msg.textContent = 'Saving...';
      App.updateCase(caseInfo.id).then(function (result) {
        if (result.ok) {
          location.href = '/index.html?case=' + caseInfo.id + '&edited=1';
        } else {
          msg.textContent = result.error || 'Save failed.';
          msg.style.color = 'var(--fail)';
          saveEditBtn.disabled = false;
        }
      });
    };
  };
})();
