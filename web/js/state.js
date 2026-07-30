/* ============================================================
   state.js - shared in-memory session state + JSON export/import
   One CCRIS + income intake feeds every product panel (the whole
   point of the combo modes). No server, no cookies - session can
   be saved to a .json file and reloaded by dropping it back in.
   ============================================================ */
(function () {
  'use strict';

  function emptyIncomeMonth() {
    return { basic: '', fixedAllowance: '', fixedAllowanceDesc: '', other: '',
             commission: '', ot: '', epf: '', pcb: '', socso: '' };
  }
  function emptyBizMonth() { return { bank1: '', bank2: '' }; }

  /** HF joint applicant (Excel 'HF (Joint Applicant A/B)' sheet):
      own CCRIS extraction + 6-month income + bizman block. */
  function emptyHFApplicant() {
    return {
      enabled: false,
      name: '', ic: '', iScore: '', reportDate: '',
      ccris: [], bt: [],
      // a joint applicant carries their OWN customer type - a home joint can
      // mix a NORMAL main with a BIZMAN joint (chosen in the income section)
      type: 'NORMAL',                  // NORMAL | BIZMAN
      // income can be keyed by month (MANUAL) or parsed from the applicant's
      // own EPF/KWSP statement (EPF) - mirrors the main applicant's income
      incomeMode: 'MANUAL',            // MANUAL | EPF
      epf: {
        months: [],                     // [{label, employee}] - visible grid
        parsedMonths: [],               // [{label, monthIndex, year, employee}]
        epfRatePct: 11,
        deductions: { epf: '', pcb: '', socso: '', other: '' }
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

  function defaultState() {
    return {
      version: 1,
      savedAt: null,
      customer: {
        name: '', ic: '', type: 'NORMAL', segment: '',
        cardType: 'TYPE A'   // TYPE A / TYPE B (CC limit treatment + PF thresholds)
      },
      iScore: '',
      reportDate: '',
      ccris: [],             // shared CCRIS record rows (see ccrisLine.js shape)
      // balance-transfer / settlement rows:
      //  type 'BT'    = CC balance transfer (repayment auto = 5% of outstanding, min RM50)
      //  type 'SETTLE'= facility to settle (monthly repayment entered manually)
      bt: [],
      income: {
        normalMode: 'MANUAL',            // MANUAL | EPF
        manualMonths: [emptyIncomeMonth(), emptyIncomeMonth(), emptyIncomeMonth(),
                       emptyIncomeMonth(), emptyIncomeMonth(), emptyIncomeMonth()],
        epf: {
          months: [],                     // [{label, employee}] - the visible grid
          // Every month parsed from a dropped statement, keeping year +
          // monthIndex so a statement dropped LATER merges with the earlier
          // ones instead of replacing them (iPad users attach one file at a
          // time). Not shown - the grid above is rebuilt from this.
          parsedMonths: [],               // [{label, monthIndex, year, employee, ...}]
          epfRatePct: 11,
          deductions: { epf: '', pcb: '', socso: '', other: '' }
        },
        bizman: {
          // Excel master uses TWELVE months of total credit (rows 97-108)
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
        // Single-PF path (PF standalone and PF+CC) - unchanged.
        amount: '', tenureMonths: '',
        deviationPct: '',  // Profit Rate Deviation/Others (%) - Excel G116
        // PF+HF only: one personal-financing application per applicant, each
        // scored on THAT applicant's personal income + iScore.
        apps: []   // [{ applicant: 'MAIN'|'A'|'B', amount, tenureMonths, deviationPct }]
      },
      hf: {
        // Excel Summary C11 dropdown: HOME FINANCING | HOME ONE ACCOUNT
        product: 'HOME FINANCING',
        propertyValue: '', financing: '', mrtt: '', valuation: '', legal: '',
        tenureYears: '', sbrPct: 2.75, spreadPct: '', ctf: '',
        // HOME ONE ACCOUNT (Summary cols J/K): one property value,
        // two parallel term financings
        hoa: {
          propertyValue: '',
          t1: { financing: '', mrtt: '', valuation: '', legal: '',
                tenureYears: '', sbrPct: 2.75, spreadPct: '' },
          t2: { financing: '', mrtt: '', valuation: '', legal: '',
                tenureYears: '', sbrPct: 2.75, spreadPct: '' }
        }
      },
      // HF joint applicants (Excel sheets 'HF (Joint Applicant A/B)')
      hfJoint: { A: emptyHFApplicant(), B: emptyHFApplicant() },
      cc: {
        // Single-card path (CC standalone and PF+CC) - unchanged.
        product: 'VISA_PLATINUM', proposedLimit: '', useProposed: false,
        // HF+CC only: one application per applicant. Each card is assigned to
        // an applicant and scored on THEIR personal income + iScore.
        cards: []   // [{ applicant: 'MAIN'|'A'|'B', product, proposedLimit, useProposed }]
      },
      hfPricing: {
        structured: { propertyValue: '', financing: '', mrtt: '', valuation: '',
                      legal: '', tenureYears: '', ceilingPct: 10, basePct: 2.75, spreadPct: '' },
        fixed: { propertyValue: '', financing: '', mrtt: '', valuation: '',
                 legal: '', tenureYears: '', ratePct: '' },
        puc: { propertyValue: '', financing: '', mrtt: '', valuation: '', legal: '',
               tenureYears: '', graceYears: '', ceilingPct: 10, basePct: 2.75, spreadPct: '' },
        // Home One Account: SBR + Ceiling shared; everything else per term
        // (Excel V10 'Home One Account' sheet, columns D / F / H)
        homeOne: {
          propertyValue: '', sbrPct: 2.75, ceilingPct: 10,
          t1: { financing: '', renovation: '', mrtt: '', valuation: '', legal: '', tenureYears: '', spreadPct: '' },
          t2: { financing: '', renovation: '', mrtt: '', valuation: '', legal: '', tenureYears: '', spreadPct: '' }
        }
      },
      signoff: {
        makerName: '', makerId: '', makerDate: '',
        checkerName: '', checkerId: '', checkerDate: '',
        makerSignature: '', checkerSignature: ''   // dataURL images
      }
    };
  }

  var state = defaultState();

  function exportJSON() {
    state.savedAt = new Date().toISOString();
    var name = (state.customer.name || 'session').replace(/[^\w-]+/g, '_');
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'DSR_' + name + '_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  /** Merge an imported session over a fresh default (tolerates older files). */
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
    // older sessions saved only 6 bizman months - pad to the Excel's 12
    while (fresh.income.bizman.months.length < 12) {
      fresh.income.bizman.months.push(emptyBizMonth());
    }
    // pad HF joint applicant month arrays (older / partial sessions)
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
  window.App.exportJSON = exportJSON;
  window.App.importJSON = importJSON;
  window.App.resetState = resetState;
})();
