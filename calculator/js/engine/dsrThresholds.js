/* ---------------- dsr thresholds ---------------- */

(function () {
  'use strict';
  window.Engine = window.Engine || {};

  var VERDICT = {
    OK: 'OK',
    DSR_BURST: 'DSR BURST',
    NOT_ELIGIBLE: 'NOT ELIGIBLE',
    EXCEED_LIMIT: 'EXCEED LIMIT',
    ELIGIBLE: 'ELIGIBLE'
  };

  function CFG() { return window.Engine.CONFIG; }

  function hfThreshold(grossIncome, customerType) {
    var h = CFG().hf;
    if (customerType === 'BIZMAN') {
      if (grossIncome >= h.bizman.band3Min) return h.bizman.band3Thr;
      if (grossIncome >= h.bizman.band2Min) return h.bizman.band2Thr;
      return 0;
    }
    if (grossIncome >= h.normal.band3Min) return h.normal.band3Thr;
    if (grossIncome >= h.normal.band2Min) return h.normal.band2Thr;
    if (grossIncome >= h.normal.band1Min) return h.normal.band1Thr;
    return 0;
  }

  function hfVerdict(grossIncome, customerType, dsr) {
    var thr = hfThreshold(grossIncome, customerType);
    if (thr === 0) return { verdict: VERDICT.NOT_ELIGIBLE, threshold: 0 };
    return {
      verdict: dsr <= thr ? VERDICT.OK : VERDICT.DSR_BURST,
      threshold: thr
    };
  }

  function pfThreshold(grossIncome, customerClass) {
    var p = CFG().pf;
    if (customerClass === 'TYPE B') {
      return { threshold: grossIncome < p.typeB.incomeBreak
        ? p.typeB.thresholdLow : p.typeB.thresholdHigh, ndiMin: p.typeB.ndiMin };
    }
    return { threshold: p.typeA.threshold, ndiMin: p.typeA.ndiMin };
  }

  function pfVerdict(grossIncome, customerClass, dsr, ndi) {
    var t = pfThreshold(grossIncome, customerClass);
    var ok = dsr <= t.threshold;
    return {
      verdict: ok ? VERDICT.OK : VERDICT.DSR_BURST,
      threshold: t.threshold, ndiMin: t.ndiMin, ndiOk: ndi >= t.ndiMin
    };
  }

  function pfStressVerdict(grossIncome, dsr) {
    var st = CFG().pf.stress;
    var thr = grossIncome < st.incomeBreak ? st.low : st.high;
    return { verdict: dsr <= thr ? VERDICT.OK : VERDICT.DSR_BURST, threshold: thr };
  }

  function unsecuredCap(grossIncome) {
    var u = CFG().unsecured;
    if (grossIncome >= u.cap3Min) return u.cap3;
    if (grossIncome >= u.cap2Min) return u.cap2;
    if (grossIncome >= u.cap1Min) return u.cap1;
    return 0;
  }

  function maxUnsecuredMultiplier(grossIncome) {
    var u = CFG().unsecured;
    if (grossIncome > u.mumHighMin) return u.mumHigh;
    if (grossIncome > u.mumMidMin) return u.mumMid;
    return u.mumLow;
  }

  function pfEligibilityGate(grossIncome, amount, gradeMax) {
    var g = CFG().pf.gate;
    if (!grossIncome || grossIncome < g.minIncome) return VERDICT.NOT_ELIGIBLE;
    if (grossIncome >= g.autoOk) return VERDICT.OK;
    if (gradeMax != null && amount > gradeMax) return VERDICT.EXCEED_LIMIT;
    return VERDICT.OK;
  }

  Engine.VERDICT = VERDICT;

  Engine.verdictLabel = function (v) {
    if (v == null || v === '') return '';
    return (v === VERDICT.OK || v === VERDICT.ELIGIBLE) ? 'APPROVED' : 'REJECTED';
  };
  Engine.verdictClass = function (v) {
    if (v == null || v === '') return '';
    return (v === VERDICT.OK || v === VERDICT.ELIGIBLE) ? 'ok' : 'fail';
  };

  Engine.hfThreshold = hfThreshold;
  Engine.hfVerdict = hfVerdict;
  Engine.pfThreshold = pfThreshold;
  Engine.pfVerdict = pfVerdict;
  Engine.pfStressVerdict = pfStressVerdict;
  Engine.unsecuredCap = unsecuredCap;
  Engine.maxUnsecuredMultiplier = maxUnsecuredMultiplier;
  Engine.pfEligibilityGate = pfEligibilityGate;

  /* ---------------- formatting helpers (shared) ---------------- */

  Engine.formatAmount = function (v, dashZero) {
    var n = parseFloat(v);
    if (!isFinite(n) || (dashZero !== false && n === 0)) return '-';
    return n.toLocaleString('en-MY', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  };

  Engine.formatCurrency = function (v, dashZero) {
    var a = Engine.formatAmount(v, dashZero);
    return a === '-' ? a : 'RM ' + a;
  };
  Engine.formatPct = function (fraction, dp) {
    var n = parseFloat(fraction);
    if (!isFinite(n)) return '-';
    return (n * 100).toFixed(dp == null ? 1 : dp) + '%';
  };
})();
