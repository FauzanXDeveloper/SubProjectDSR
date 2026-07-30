/* ============================================================
   dsrThresholds.js - DSR pass/fail tables + verdict strings
   Sources: 03_Home_Financing_Manual_DSR.txt sections 4 & 6,
            04_PF_CCRIS_DSR_Evaluation_Report.txt sections 6 & 8,
            credit_card.txt section 5 step 6.
   ============================================================ */
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

  /* All policy numbers read from the central config at call time, so
     admin/settings.php overrides apply without touching this logic. */
  function CFG() { return window.Engine.CONFIG; }

  /** Home Financing DSR threshold (fraction), income-banded.
      NORMAL  (List Z2:AA6): <3000 fail; >=3000 70%; >=5000 80%; >=16500 85%
      BIZMAN  (List AC3:AD5): >=5000 80%; >=16500 85% */
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

  /** HF verdict. dsr as fraction. */
  function hfVerdict(grossIncome, customerType, dsr) {
    var thr = hfThreshold(grossIncome, customerType);
    if (thr === 0) return { verdict: VERDICT.NOT_ELIGIBLE, threshold: 0 };
    return {
      verdict: dsr <= thr ? VERDICT.OK : VERDICT.DSR_BURST,
      threshold: thr
    };
  }

  /** Personal Financing DSR threshold (fraction) + NDI minimum.
      TYPE B: income <10000 -> 70%, >=10000 -> 75%, NDI >= 1500
      TYPE A: 60% across the board, NDI >= 2000 */
  function pfThreshold(grossIncome, customerClass) {
    var p = CFG().pf;
    if (customerClass === 'TYPE B') {
      return { threshold: grossIncome < p.typeB.incomeBreak
        ? p.typeB.thresholdLow : p.typeB.thresholdHigh, ndiMin: p.typeB.ndiMin };
    }
    return { threshold: p.typeA.threshold, ndiMin: p.typeA.ndiMin };
  }

  /** Excel H123 verdict is on DSR only - the NDI floor is returned for
      display but does not flip the verdict (matches the master Excel). */
  function pfVerdict(grossIncome, customerClass, dsr, ndi) {
    var t = pfThreshold(grossIncome, customerClass);
    var ok = dsr <= t.threshold;
    return {
      verdict: ok ? VERDICT.OK : VERDICT.DSR_BURST,
      threshold: t.threshold, ndiMin: t.ndiMin, ndiOk: ndi >= t.ndiMin
    };
  }

  /** PF stress-test verdict: TYPE A also uses 70/75% in the stress block
      (04 section 6). No NDI floor stated for the stress block. */
  function pfStressVerdict(grossIncome, dsr) {
    var st = CFG().pf.stress;
    var thr = grossIncome < st.incomeBreak ? st.low : st.high;
    return { verdict: dsr <= thr ? VERDICT.OK : VERDICT.DSR_BURST, threshold: thr };
  }

  /** Unsecured new-DSR cap (List P14:Q17), fraction. */
  function unsecuredCap(grossIncome) {
    var u = CFG().unsecured;
    if (grossIncome >= u.cap3Min) return u.cap3;
    if (grossIncome >= u.cap2Min) return u.cap2;
    if (grossIncome >= u.cap1Min) return u.cap1;
    return 0;
  }

  /** Max Unsecured Multiplier (MUM) by income bracket (List S/T, V/W). */
  function maxUnsecuredMultiplier(grossIncome) {
    var u = CFG().unsecured;
    if (grossIncome > u.mumHighMin) return u.mumHigh;   // strictly above
    if (grossIncome > u.mumMidMin) return u.mumMid;
    return u.mumLow;
  }

  /** PF eligibility gate (Excel H113) - bands on GROSS INCOME, not the
      requested amount:
        income < 3000           -> NOT ELIGIBLE
        income >= 5000          -> OK
        3000 <= income < 5000   -> requested amount must be <= the
          risk-grade limit (List!BC:BD); above it -> EXCEED LIMIT.
      gradeMax null (matrix not exported) -> band treated as OK. */
  function pfEligibilityGate(grossIncome, amount, gradeMax) {
    var g = CFG().pf.gate;
    if (!grossIncome || grossIncome < g.minIncome) return VERDICT.NOT_ELIGIBLE;
    if (grossIncome >= g.autoOk) return VERDICT.OK;
    if (gradeMax != null && amount > gradeMax) return VERDICT.EXCEED_LIMIT;
    return VERDICT.OK;
  }

  Engine.VERDICT = VERDICT;

  /* Officer-facing verdict wording. Internally the engine keeps the Excel
     master's own strings (OK / DSR BURST / NOT ELIGIBLE / EXCEED LIMIT /
     ELIGIBLE) so the parity tests stay honest, but every screen and the PDF
     collapse them to a single two-state decision: APPROVED or REJECTED.
     A blank verdict (no facility entered -> DSR 0) stays blank. */
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

  /* ---------- formatting helpers (shared) ---------- */
  Engine.formatCurrency = function (v, dashZero) {
    var n = parseFloat(v);
    if (!isFinite(n) || (dashZero !== false && n === 0)) return '-';
    return 'RM ' + n.toLocaleString('en-MY', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  };
  Engine.formatPct = function (fraction, dp) {
    var n = parseFloat(fraction);
    if (!isFinite(n)) return '-';
    return (n * 100).toFixed(dp == null ? 1 : dp) + '%';
  };
})();
