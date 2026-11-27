/* ---------------- case state ---------------- */

(function () {
  'use strict';

  function emptyIncomeMonth() {
    return { monthLabel: '', basic: '', fixedAllowance: '', fixedAllowanceDesc: '', other: '',
             commission: '', ot: '', epf: '', pcb: '', socso: '', otherDeduction: '',
             edited: false };
  }
  function emptyBizMonth() { return { bank1: '', bank2: '' }; }

  function emptyHFApplicant() {
    return {
      enabled: false,
      name: '', ic: '', iScore: '', reportDate: '',
      ccris: [], bt: [],

      type: 'NORMAL',

      incomeMode: 'MANUAL',

      incomeSource: '',
      epf: {
        months: [],
        parsedMonths: [],
        epfRatePct: 11,

        holderName: '', holderIC: '',
        deductions: { epf: '', pcb: '', socso: '', other: '' },
        editedDeductions: {}
      },
      months: [emptyIncomeMonth(), emptyIncomeMonth(), emptyIncomeMonth(),
               emptyIncomeMonth(), emptyIncomeMonth(), emptyIncomeMonth()],
      bizman: {
        months: [emptyBizMonth(), emptyBizMonth(), emptyBizMonth(),
                 emptyBizMonth(), emptyBizMonth(), emptyBizMonth(),
                 emptyBizMonth(), emptyBizMonth(), emptyBizMonth(),
                 emptyBizMonth(), emptyBizMonth(), emptyBizMonth()],
        bank1Name: '', bank2Name: '',
        profitMarginPct: '', shareholdingPct: 100,
        avgITRAnnual: '', taxDeduction: ''
      }
    };
  }

  /* ---------------- defaults ---------------- */
function defaultState() {
    return {
      version: 1,
      savedAt: null,
      customer: {
        name: '', ic: '', type: 'NORMAL', segment: '',
        cardType: 'TYPE A',

        fromExperian: false
      },
      iScore: '',
      reportDate: '',
      ccris: [],

      bt: [],
      income: {
        normalMode: 'MANUAL',

        source: '',
        sourceMode: 'MANUAL',
        manualMonths: [emptyIncomeMonth(), emptyIncomeMonth(), emptyIncomeMonth(),
                       emptyIncomeMonth(), emptyIncomeMonth(), emptyIncomeMonth()],

        payslipAudit: [],

        payslipHolder: null,
        epf: {
          months: [],

          parsedMonths: [],
          epfRatePct: 11,

          holderName: '', holderIC: '',
          deductions: { epf: '', pcb: '', socso: '', other: '' },
          editedDeductions: {}
        },
        bizman: {

          months: [emptyBizMonth(), emptyBizMonth(), emptyBizMonth(),
                   emptyBizMonth(), emptyBizMonth(), emptyBizMonth(),
                   emptyBizMonth(), emptyBizMonth(), emptyBizMonth(),
                   emptyBizMonth(), emptyBizMonth(), emptyBizMonth()],
          bank1Name: '', bank2Name: '',
          profitMarginPct: '', shareholdingPct: 100,
          avgITRAnnual: '', taxDeduction: '', socso: ''
        }
      },
      pf: {

        amount: '', tenureMonths: '',
        deviationPct: '',

        apps: []
      },
      hf: {

        product: 'HOME FINANCING',
        propertyValue: '', financing: '', mrtt: '', valuation: '', legal: '',
        tenureYears: '', sbrPct: 2.75, spreadPct: '', ctf: '',

        hoa: {
          propertyValue: '',
          t1: { financing: '', mrtt: '', valuation: '', legal: '',
                tenureYears: '', sbrPct: 2.75, spreadPct: '' },
          t2: { financing: '', mrtt: '', valuation: '', legal: '',
                tenureYears: '', sbrPct: 2.75, spreadPct: '' }
        }
      },

      hfJoint: { A: emptyHFApplicant(), B: emptyHFApplicant() },
      cc: {

        product: 'VISA_PLATINUM', proposedLimit: '', useProposed: false,

        cards: []
      },
      hfPricing: {
        structured: { propertyValue: '', financing: '', mrtt: '', valuation: '',
                      legal: '', tenureYears: '', ceilingPct: 10, basePct: 2.75, spreadPct: '' },
        fixed: { propertyValue: '', financing: '', mrtt: '', valuation: '',
                 legal: '', tenureYears: '', ratePct: '' },
        puc: { propertyValue: '', financing: '', mrtt: '', valuation: '', legal: '',
               tenureYears: '', graceYears: '', ceilingPct: 10, basePct: 2.75, spreadPct: '' },

        homeOne: {
          propertyValue: '', sbrPct: 2.75, ceilingPct: 10,
          t1: { financing: '', renovation: '', mrtt: '', valuation: '', legal: '', tenureYears: '', spreadPct: '' },
          t2: { financing: '', renovation: '', mrtt: '', valuation: '', legal: '', tenureYears: '', spreadPct: '' }
        }
      }
    };
  }

  var state = defaultState();

  /* ---------------- import and reset ---------------- */
function importJSON(obj) {
    var fresh = defaultState();
    function merge(target, src) {
      Object.keys(src || {}).forEach(function (k) {
        if (src[k] !== null && typeof src[k] === 'object' && !Array.isArray(src[k])
            && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
          merge(target[k], src[k]);
        } else {
          target[k] = src[k];
        }
      });
    }
    merge(fresh, obj);

    while (fresh.income.bizman.months.length < 12) {
      fresh.income.bizman.months.push(emptyBizMonth());
    }

    ['A', 'B'].forEach(function (k) {
      var a = fresh.hfJoint[k];
      while (a.months.length < 6) a.months.push(emptyIncomeMonth());
      while (a.bizman.months.length < 12) a.bizman.months.push(emptyBizMonth());
    });
    state = fresh;
    window.App.state = state;
    return state;
  }

  function resetState() {
    state = defaultState();
    window.App.state = state;
    return state;
  }

  window.App = window.App || {};
  window.App.state = state;
  window.App.defaultState = defaultState;
  window.App.importJSON = importJSON;
  window.App.resetState = resetState;
})();
