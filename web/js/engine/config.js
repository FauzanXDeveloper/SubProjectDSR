/* ============================================================
   config.js - central policy configuration.

   Every hard-coded policy number the engine uses lives HERE as a
   default. admin/settings.html (admin-only) saves overrides via
   store/policyConfig.js into the browser's local JSON database, so
   the calculator/editor always start from that database's current
   value. store/db.js + store/policyConfig.js MUST be loaded before
   this file wherever policy overrides matter (index.html,
   admin/settings.html) - this file falls back to Excel defaults if
   they weren't.

   MUST be loaded BEFORE every other engine file (index.html,
   admin/settings.html and the Node test bootstraps).

   The DEFAULTS below are the values from the master Excels - the
   parity tests run against them, so with no overrides saved the
   system behaves exactly as before.
   ============================================================ */
(function () {
  'use strict';
  var Engine = window.Engine = window.Engine || {};

  var DEFAULTS = {
    /* Customer Class: TYPE B at/above this gross income, TYPE A below */
    classBreak: 5000,

    pf: {
      /* PF DSR ceilings + NDI floors by Customer Class */
      typeA: { threshold: 0.60, ndiMin: 2000 },
      typeB: { thresholdLow: 0.70, thresholdHigh: 0.75, incomeBreak: 10000, ndiMin: 1500 },
      /* stress-test ceilings (both classes) */
      stress: { low: 0.70, high: 0.75, incomeBreak: 10000 },
      /* eligibility gate: gross bands */
      gate: { minIncome: 3000, autoOk: 5000 },
      /* max financing by PF risk grade (List!BC:BD), band 3000-4999 */
      gradeMax: { 4: 20000, 5: 30000, 6: 30000, 7: 40000, 8: 40000, 9: 50000, 10: 50000 }
    },

    hf: {
      /* HF DSR thresholds by gross-income band */
      normal: { band1Min: 3000, band1Thr: 0.70, band2Min: 5000, band2Thr: 0.80, band3Min: 16500, band3Thr: 0.85 },
      bizman: { band2Min: 5000, band2Thr: 0.80, band3Min: 16500, band3Thr: 0.85 }
    },

    unsecured: {
      /* unsecured new-DSR caps (List P14:Q17) */
      cap1Min: 4500, cap1: 0.60, cap2Min: 6001, cap2: 0.65, cap3Min: 10001, cap3: 0.70,
      /* Max Unsecured Multiplier: strictly ABOVE the min -> that multiplier */
      mumLow: 9, mumMid: 13, mumMidMin: 10000, mumHigh: 14, mumHighMin: 15000
    },

    cc: {
      cardMax: 400000, minPlatinum: 2000, minSignature: 4000,
      minScore: 605,
      /* limit multiplier by card risk grade (iScore bands RG5-RG10) */
      multipliers: { RG5: 3, RG6: 4, RG7: 5, RG8: 6, RG9: 7, RG10: 8 },
      /* Platinum salary cap: gross in [minIncome,maxIncome] -> limit <= gross x mult */
      salaryCap: { minIncome: 2000, maxIncome: 3000, multiplier: 2 },
      /* CC DSR thresholds (%) by gross band */
      dsrLow: 60, dsrMid: 70, dsrHigh: 75, dsrMidMin: 5000, dsrHighMin: 10000,
      /* monthly instalment as % of limit */
      instalmentPct: 1
    },

    ccris: {
      cardRatePct: 5,           /* credit-card commitment: % of outstanding/limit */
      cardFloor: 50,            /* RM floor on the card commitment */
      odRatePct: 0.77529,       /* overdraft commitment: % of LIMIT */
      btRatePct: 5,             /* balance-transfer repayment: % of outstanding */
      btFloor: 50,              /* RM floor on BT repayment (PF/CC; HF has none) */
      /* facility code -> commitment factor (List!D:E). 0 = excluded. */
      facilityFactors: {
        HLFNNNPS: 1, HLFNPRSR: 1, HRPCNSCG: 1, HRPCSCGD: 1, HSLNFNCE: 1,
        ISPJTFNG: 1, ISPWNBKG: 0, MICROFNCE: 1, OHRPCREC: 1, OTLNFNCE: 1,
        PCPASCAR: 1, PELNFNCE: 1, RVVGCRDT: 1, SHMARGIN: 0, SOFTLN: 1,
        STLNFNCE: 1, NHEDFNCE: 1, PELNFNSA: 1, OTHER: 1
      },
      /* stress-test % uplift by collateral type (List!A28:B32), as % */
      stressFactors: {
        'PROPERTIES': 5,
        'CLEAN': 0.8928571428571428,
        'MOTOR V (JPJ)': 1.6544117647058824,
        'UNIT TRUST': 2.083333333333314
      }
    },

    income: {
      commissionPct: 60,        /* commission recognition (Excel G87) */
      epfVariablePct: 60,       /* EPF variable-income recognition (E21) */
      epfDefaultRatePct: 11,    /* default employee contribution rate */
      incomeTypeRatioPct: 25,   /* variable/fixed <= this -> "Fixed Income" */
      bizmanVariationPct: 25    /* BIZMAN variation acceptable (J111) */
    },

    /* PF pricing matrix overrides (null = use data/ndiPricing.js exports).
       Shape mirrors Engine.NDI_PRICING: flatOthers/eprOthers = [4 bands][10 grades][10 tenures],
       flatMicro1/eprMicro1/flatMicro2/eprMicro2 = [10][10]. */
    pfMatrices: null
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /** Deep-merge src over target (objects only; arrays/scalars replace). */
  function merge(target, src) {
    Object.keys(src || {}).forEach(function (k) {
      if (src[k] !== null && typeof src[k] === 'object' && !Array.isArray(src[k])
          && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
        merge(target[k], src[k]);
      } else {
        target[k] = src[k];
      }
    });
    return target;
  }

  function loadOverrides() {
    try {
      if (window.__DSR_TEST_DEFAULTS) return null;              // parity test page
      if (window.PolicyConfig) return PolicyConfig.overrides(); // store/policyConfig.js, backed by the local JSON database
      return window.__DSR_CONFIG_OVERRIDES || null;             // fallback if store/policyConfig.js wasn't loaded first
    } catch (e) { return null; }                                // Node (tests): window is undefined
  }

  var overrides = loadOverrides();
  Engine.DEFAULT_CONFIG = DEFAULTS;
  Engine.CONFIG = overrides ? merge(clone(DEFAULTS), overrides) : clone(DEFAULTS);
  Engine.CONFIG_HAS_OVERRIDES = !!overrides;
  Engine.mergeConfig = merge;
  Engine.cloneConfig = clone;
})();
