/* ============================================================
   core/decision.js - the decision summary shown under the products.
   Builds one normalised result for standalone products and combos
   (PF + HF, PF + CC, HF + CC). Products not in the list are skipped.
   ============================================================ */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var E = window.Engine;
  var fmt = App.mod.ui.fmt, fmtPct = App.mod.ui.fmtPct, DSR_DP = App.mod.ui.DSR_DP, esc = App.mod.ui.esc, el = App.mod.ui.el, vClass = App.mod.ui.vClass, vLabel = App.mod.ui.vLabel;
  var applicantType = App.mod.applicants.applicantType, applicantPersonalIncome = App.mod.applicants.applicantPersonalIncome, hfApplicantList = App.mod.applicants.hfApplicantList;
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
        App.runSeed('pf');
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
        App.runSeed('cc');
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

  App.mod = App.mod || {};
  App.mod.decision = { perApplicantBanner: perApplicantBanner, singleBanner: singleBanner };
})();
