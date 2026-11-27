/* ---------------- policy config ---------------- */

(function () {
  'use strict';
  var Engine = window.Engine = window.Engine || {};

  var DEFAULTS = {

    classBreak: 5000,

    pf: {

      typeA: { threshold: 0.60, ndiMin: 2000 },
      typeB: { thresholdLow: 0.70, thresholdHigh: 0.75, incomeBreak: 10000, ndiMin: 1500 },

      stress: { low: 0.70, high: 0.75, incomeBreak: 10000 },

      gate: { minIncome: 3000, autoOk: 5000 },

      gradeMax: { 4: 20000, 5: 30000, 6: 30000, 7: 40000, 8: 40000, 9: 50000, 10: 50000 },

      /* NDI enhancement (v2) - additive. Does not change the rules above. */
      ndiV2: {
        increment: { urban: 0.0468, suburban: 0.0374 },
        cost: {
          urban: { base: 0.0749, h2: 0.4332, h3: 0.6659, h4: 0.7971 },
          suburban: { base: 0.0755, h2: 0.3404, h3: 0.4870, h4: 0.6316 }
        },
        onMissing: 'none'
      },

      /* PF Aggregated = existing PF commitments + new PF, without BT netting. */
      aggregate: { facilities: ['PELNFNCE', 'PELNFNSA'] }
    },

    hf: {

      normal: { band1Min: 3000, band1Thr: 0.70, band2Min: 5000, band2Thr: 0.80, band3Min: 16500, band3Thr: 0.85 },
      bizman: { band2Min: 5000, band2Thr: 0.80, band3Min: 16500, band3Thr: 0.85 }
    },

    unsecured: {

      cap1Min: 4500, cap1: 0.60, cap2Min: 6001, cap2: 0.65, cap3Min: 10001, cap3: 0.70,

      mumLow: 9, mumMid: 13, mumMidMin: 10000, mumHigh: 14, mumHighMin: 15000
    },

    cc: {
      cardMax: 400000, minPlatinum: 2000, minSignature: 4000,
      minScore: 605,

      multipliers: { RG5: 3, RG6: 4, RG7: 5, RG8: 6, RG9: 7, RG10: 8 },

      salaryCap: { minIncome: 2000, maxIncome: 3000, multiplier: 2 },

      dsrLow: 60, dsrMid: 70, dsrHigh: 75, dsrMidMin: 5000, dsrHighMin: 10000,

      instalmentPct: 1
    },

    ccris: {
      cardRatePct: 5,
      cardFloor: 50,
      odRatePct: 0.77529,
      btRatePct: 5,
      btFloor: 50,

      facilityFactors: {
        HLFNNNPS: 1, HLFNPRSR: 1, HRPCNSCG: 1, HRPCSCGD: 1, HSLNFNCE: 1,
        ISPJTFNG: 1, ISPWNBKG: 0, MICROFNCE: 1, OHRPCREC: 1, OTLNFNCE: 1,
        PCPASCAR: 1, PELNFNCE: 1, RVVGCRDT: 1, SHMARGIN: 0, SOFTLN: 1,
        STLNFNCE: 1, NHEDFNCE: 1, PELNFNSA: 1, OTHER: 1
      },

      stressFactors: {
        'PROPERTIES': 5,
        'CLEAN': 0.8928571428571428,
        'MOTOR V (JPJ)': 1.6544117647058824,
        'UNIT TRUST': 2.083333333333314
      }
    },

    income: {
      commissionPct: 60,
      epfVariablePct: 60,
      epfDefaultRatePct: 11,
      incomeTypeRatioPct: 25,
      bizmanVariationPct: 25
    },

    pfMatrices: null
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

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
      if (window.__DSR_TEST_DEFAULTS) return null;
      if (window.PolicyConfig) return PolicyConfig.overrides();
      return window.__DSR_CONFIG_OVERRIDES || null;
    } catch (e) { return null; }
  }

  var overrides = loadOverrides();
  Engine.CONFIG = overrides ? merge(clone(DEFAULTS), overrides) : clone(DEFAULTS);
})();
