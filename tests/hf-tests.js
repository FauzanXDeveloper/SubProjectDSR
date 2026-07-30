/* ============================================================
   hf-tests.js - HF (Home Financing Manual DSR.xlsm) parity checks:
   single + joint applicants, HOME FINANCING and HOME ONE ACCOUNT.
   Expected values computed independently from the Excel formulas
   (Summary + per-applicant sheets, workbook read 2026-07-12).
   Run with:  node tests/hf-tests.js
   ============================================================ */
(function (global) {
  'use strict';

  if (typeof window === 'undefined') {
    global.window = global;
    var path = require('path');
    ['../web/js/engine/config.js',
     '../web/js/engine/pmt.js', '../web/js/engine/age.js', '../web/js/engine/facilityRates.js',
     '../web/js/engine/ccrisLine.js', '../web/js/engine/income.js', '../web/js/engine/creditLimit.js',
     '../web/js/engine/dsrThresholds.js', '../web/js/engine/hfPricing.js', '../web/js/engine/hfSummary.js',
     '../web/data/ndiPricing.js'
    ].forEach(function (f) { require(path.join(__dirname, f)); });
  }

  var E = window.Engine;
  var results = [];
  function check(name, actual, expected, tol) {
    tol = tol == null ? 0.01 : tol;
    var pass = typeof expected === 'number'
      ? Math.abs(actual - expected) <= tol : actual === expected;
    results.push({ name: name, actual: actual, expected: expected, pass: pass });
  }

  function months6(m) {
    var out = [];
    for (var i = 0; i < 6; i++) {
      out.push({
        basic: m.basic || 0, fixedAllowance: m.fixedAllowance || 0, other: m.other || 0,
        commission: (m.commissionByMonth ? m.commissionByMonth[i] : m.commission) || 0,
        ot: m.ot || 0, epf: m.epf || 0, pcb: m.pcb || 0, socso: m.socso || 0
      });
    }
    return out;
  }
  var emptyBiz = { months: [], profitMarginPct: '', shareholdingPct: 100,
                   avgITRAnnual: '', taxDeduction: '' };

  /* ---- HF credit-card rule (Excel O15/P15): TYPE keyed off combined
          gross C144; TYPE B = 5% outstanding with NO RM50 floor ---- */
  (function () {
    var row = { facility: 'CRDTCARD', outstanding: 800, limit: 10000,
                capacity: 'OWN', commitmentPerCCRIS: 0, override: '' };
    check('HF CRDTCARD TYPE B no RM50 floor', E.lineCommitment(row, 'TYPE B', 'HF').commitment, 40);
    check('HF CRDTCARD TYPE A floor + limit', E.lineCommitment(row, 'TYPE A', 'HF').commitment, 500);
    check('PF CRDTCARD TYPE B keeps floor (unchanged)', E.lineCommitment(row, 'TYPE B').commitment, 50);
    var od = { facility: 'OVRDRAFT', outstanding: 20000, limit: 50000,
               capacity: 'OWN', commitmentPerCCRIS: 0, override: '' };
    check('HF OVRDRAFT on limit', E.lineCommitment(od, 'TYPE B', 'HF').commitment, 387.645, 0.001);
    var jt = { facility: 'HSLNFNCE', outstanding: 100000, limit: 0,
               capacity: 'JOINT', commitmentPerCCRIS: 1000, override: '' };
    check('HF JOINT housing = J/2', E.lineCommitment(jt, 'TYPE B', 'HF').commitment, 500);
  })();

  /* ---- BIZMAN HF block (row 111): 6-month avg, conditional 25% ---- */
  (function () {
    var biz = { months: [], profitMarginPct: 20, shareholdingPct: 100,
                avgITRAnnual: 48000, taxDeduction: 500 };
    for (var i = 0; i < 12; i++) biz.months.push({ bank1: i < 6 ? 30000 : 0, bank2: 0 });
    var r = E.calcBizmanHF(biz);
    check('BizHF C111 (6-mth avg)', r.bizAvgCredit, 30000);
    check('BizHF F111', r.monthlyBusinessIncome, 6000);
    check('BizHF J111 (F>I -> 25%)', r.variationAcceptable, 1000);
    check('BizHF K111', r.monthlyPersonalIncome, 5000);
    var biz2 = { months: biz.months, profitMarginPct: 20, shareholdingPct: 100,
                 avgITRAnnual: 96000, taxDeduction: 500 };
    var r2 = E.calcBizmanHF(biz2);
    check('BizHF J111 = 0 when F<=I', r2.variationAcceptable, 0);
    check('BizHF K111 = I111 when F<=I', r2.monthlyPersonalIncome, 8000);
  })();

  /* ---- Scenario 1: single applicant, NORMAL, HOME FINANCING
          (spec section 10 dummy data) ---- */
  (function () {
    var main = {
      key: 'MAIN', label: 'Main Applicant',
      months: months6({ basic: 6000, fixedAllowance: 500, commission: 1000,
                        epf: 660, pcb: 200, socso: 25 }),
      bizman: emptyBiz,
      ccris: [
        { facility: 'CRDTCARD', capacity: 'OWN', outstanding: 10000, limit: 20000,
          commitmentPerCCRIS: 0, override: '' },
        { facility: 'HSLNFNCE', capacity: 'OWN', outstanding: 200000, limit: 0,
          commitmentPerCCRIS: 1200, override: '' }
      ],
      bt: []
    };
    var r = E.computeHFSummary({
      applicants: [main], customerType: 'NORMAL', product: 'HOME FINANCING',
      hf: { propertyValue: 500000, financing: 450000, mrtt: 10000,
            valuation: 1500, legal: 5000, tenureYears: 30, sbrPct: 4.0, spreadPct: 0.5 },
      ctf: 0
    });
    check('S1 gross C144', r.income.grossIncome, 7100);
    check('S1 net C148', r.income.netIncome, 6262.2);
    check('S1 TYPE (C144>=5000)', r.hfType, 'TYPE B');
    check('S1 CC commitment via L55 (TYPE B 500 + 1200)', r.totalCommitment, 1700);
    check('S1 FEC', r.fec, 6500);
    check('S1 Total Financing', r.totalFinancing, 466500);
    check('S1 MOF', r.totalMOF, 0.933, 0.0001);
    check('S1 Instalment G153', r.instalment, 2364);
    check('S1 New Commitment G160', r.newCommitment, 4064);
    check('S1 New DSR G162', r.newDSR, 0.648973, 0.0001);
    check('S1 Threshold (>=5000 -> 80%)', r.threshold, 0.80);
    check('S1 Verdict H162', r.verdict, 'OK');
  })();

  /* ---- Scenario 2: JOINT (main + A), NORMAL, HOME ONE ACCOUNT.
          Income months are summed across applicants BEFORE the
          MAX / AVERAGEIF / 60% rules (Summary rows 78-87). ---- */
  (function () {
    var main = {
      key: 'MAIN', label: 'Main Applicant',
      months: months6({ basic: 6000, fixedAllowance: 500, commission: 1000,
                        epf: 660, pcb: 200, socso: 25 }),
      bizman: emptyBiz,
      ccris: [
        { facility: 'CRDTCARD', capacity: 'OWN', outstanding: 10000, limit: 20000,
          commitmentPerCCRIS: 0, override: '' },
        { facility: 'HSLNFNCE', capacity: 'OWN', outstanding: 200000, limit: 0,
          commitmentPerCCRIS: 1200, override: '' }
      ],
      bt: [{ type: 'SETTLE', description: 'PF settle', outstanding: 0, repayment: 300 }]
    };
    var jointA = {
      key: 'A', label: 'Joint Applicant A',
      months: months6({ basic: 3000, commissionByMonth: [500, 0, 0, 0, 0, 0],
                        epf: 330, pcb: 50, socso: 20 }),
      bizman: emptyBiz,
      ccris: [
        { facility: 'OVRDRAFT', capacity: 'OWN', outstanding: 20000, limit: 50000,
          commitmentPerCCRIS: 0, override: '' },
        { facility: 'HSLNFNCE', capacity: 'JOINT', outstanding: 100000, limit: 0,
          commitmentPerCCRIS: 1000, override: '' },
        { facility: 'CRDTCARD', capacity: 'OWN', outstanding: 800, limit: 10000,
          commitmentPerCCRIS: 0, override: '' }
      ],
      bt: []
    };
    var r = E.computeHFSummary({
      applicants: [main, jointA], customerType: 'NORMAL', product: 'HOME ONE ACCOUNT',
      hoa: {
        propertyValue: 800000,
        t1: { financing: 400000, mrtt: 5000, valuation: 1000, legal: 3000,
              tenureYears: 25, sbrPct: 3.0, spreadPct: 0.5 },
        t2: { financing: 200000, mrtt: 0, valuation: 500, legal: 1500,
              tenureYears: 10, sbrPct: 3.0, spreadPct: 1.0 }
      },
      ctf: 0
    });
    check('S2 combined gross C144', r.income.grossIncome, 10150);
    check('S2 combined commission @60%', r.income.commission, 650);
    check('S2 combined net C148', r.income.netIncome, 8917.6142, 0.001);
    check('S2 Joint A L55 (387.645+500+40)', r.perApplicant[1].l55, 927.645, 0.001);
    check('S2 Summary L55', r.totalCommitment, 2627.645, 0.001);
    check('S2 Summary L56', r.btTotal, 300);
    check('S2 Summary L57', r.grandTotal, 2327.645, 0.001);
    check('S2 T1 total financing J147', r.term1.totalFinancing, 409000);
    check('S2 T2 total financing K147', r.term2.totalFinancing, 202000);
    check('S2 T1 instalment J153', r.term1.instalment, 2048);
    check('S2 T2 instalment K153', r.term2.instalment, 2045);
    check('S2 total instalment L153', r.instalment, 4093);
    check('S2 full-tenure T2 K155 (term-1 tenure)', r.fullTenure2, 1066);
    check('S2 MOF L148', r.totalMOF, 0.76375, 0.0001);
    check('S2 New Commitment G160', r.newCommitment, 6420.645, 0.001);
    check('S2 New DSR G162', r.newDSR, 0.719996, 0.0001);
    check('S2 Verdict (80% >= 72%)', r.verdict, 'OK');
  })();

  /* ---- Scenario 3: BIZMAN single, HOME FINANCING.
          Basic C139 = C87 + K111; PCB line = G111 tax deduction ---- */
  (function () {
    var biz = { months: [], profitMarginPct: 20, shareholdingPct: 100,
                avgITRAnnual: 48000, taxDeduction: 500 };
    for (var i = 0; i < 12; i++) biz.months.push({ bank1: i < 6 ? 30000 : 0, bank2: 0 });
    var main = { key: 'MAIN', label: 'Main Applicant',
                 months: months6({}), bizman: biz, ccris: [], bt: [] };
    var r = E.computeHFSummary({
      applicants: [main], customerType: 'BIZMAN', product: 'HOME FINANCING',
      hf: { propertyValue: 200000, financing: 100000, mrtt: 0, valuation: 0,
            legal: 0, tenureYears: 10, sbrPct: 4.0, spreadPct: 0 },
      ctf: 0
    });
    check('S3 gross C144 (= K111)', r.income.grossIncome, 5000);
    check('S3 EPF C145 = 0 (BIZMAN)', r.income.epf, 0);
    check('S3 PCB C146 = G111 tax', r.income.pcb, 500);
    check('S3 net C148', r.income.netIncome, 4500);
    check('S3 instalment', r.instalment, 1012);
    check('S3 New DSR', r.newDSR, 0.224889, 0.0001);
    check('S3 Threshold BIZMAN >=5000 -> 80%', r.threshold, 0.80);
    check('S3 Verdict', r.verdict, 'OK');
  })();

  /* ---- Verdict edge cases (H162 + threshold tables) ---- */
  (function () {
    var poor = { key: 'MAIN', label: 'Main',
                 months: months6({ basic: 2500 }), bizman: emptyBiz, ccris: [], bt: [] };
    var r = E.computeHFSummary({
      applicants: [poor], customerType: 'NORMAL', product: 'HOME FINANCING',
      hf: { propertyValue: 100000, financing: 50000, mrtt: 0, valuation: 0,
            legal: 0, tenureYears: 10, sbrPct: 4.0, spreadPct: 0 },
      ctf: 0
    });
    check('Edge: gross<3000 -> threshold 0 -> DSR BURST', r.verdict, 'DSR BURST');
    var r2 = E.computeHFSummary({
      applicants: [poor], customerType: 'NORMAL', product: 'HOME FINANCING',
      hf: {}, ctf: 0
    });
    check('Edge: no financing -> DSR 0 -> blank verdict', r2.verdict, '');
    // CTF replaces the instalment (G160)
    var mid = { key: 'MAIN', label: 'Main',
                months: months6({ basic: 6000 }), bizman: emptyBiz, ccris: [], bt: [] };
    var r3 = E.computeHFSummary({
      applicants: [mid], customerType: 'NORMAL', product: 'HOME FINANCING',
      hf: { propertyValue: 500000, financing: 400000, mrtt: 0, valuation: 0,
            legal: 0, tenureYears: 30, sbrPct: 4.0, spreadPct: 0.5 },
      ctf: 1500
    });
    check('Edge: CTF replaces instalment in G160', r3.newCommitment, 1500);
    // HF BT repayment D62 = outstanding x 5% with NO RM50 floor (PF/CC keep it)
    var btApp = { key: 'MAIN', label: 'Main',
      months: months6({ basic: 6000 }), bizman: emptyBiz,
      ccris: [{ facility: 'HSLNFNCE', capacity: 'OWN', outstanding: 0, limit: 0,
                commitmentPerCCRIS: 1200, override: '' }],
      bt: [{ type: 'BT', description: '', outstanding: 500, repayment: '' }] };
    var r4 = E.computeHFSummary({
      applicants: [btApp], customerType: 'NORMAL', product: 'HOME FINANCING',
      hf: {}, ctf: 0
    });
    check('Edge: HF BT 5% no floor (L56)', r4.btTotal, 25);
    check('Edge: L57 after BT', r4.grandTotal, 1175);
  })();

  /* ---- Per-applicant EPF income (main or joint on a KWSP statement) ---- */
  (function () {
    var emptyBiz2 = { months: [], profitMarginPct: '', shareholdingPct: 100, avgITRAnnual: '', taxDeduction: '' };
    // one applicant's recognised EPF income, computed the same way the UI does
    function epfInc(caruman, rate) {
      return E.calcEPFIncome(caruman, rate, { epf: '', pcb: '', socso: '', other: '' });
    }
    var caruman = [330, 330, 330, 396, 704, 363, 363, 363, 484, 484, 484, 597];
    var solo = epfInc(caruman, 11);

    // MAIN on EPF, no joints -> combined gross == that applicant's EPF gross
    var mainEPF = { key: 'MAIN', label: 'Main', months: months6({}), bizman: emptyBiz2,
                    ccris: [], bt: [], epfIncome: solo };
    var rMain = E.computeHFSummary({ applicants: [mainEPF], customerType: 'NORMAL',
      product: 'HOME FINANCING', hf: {}, ctf: 0 });
    check('EPF main-only: combined gross = solo EPF gross', rMain.income.grossIncome, solo.grossIncome, 0.01);

    // MAIN manual + JOINT on EPF -> gross = manual basic + joint EPF gross
    var mainManual = { key: 'MAIN', label: 'Main', months: months6({ basic: 4000 }),
                       bizman: emptyBiz2, ccris: [], bt: [] };
    var jointEPF = { key: 'A', label: 'Joint A', months: months6({}), bizman: emptyBiz2,
                     ccris: [], bt: [], epfIncome: solo };
    var rMix = E.computeHFSummary({ applicants: [mainManual, jointEPF], customerType: 'NORMAL',
      product: 'HOME FINANCING', hf: {}, ctf: 0 });
    check('EPF joint: combined gross = main basic + joint EPF gross',
      rMix.income.grossIncome, 4000 + solo.grossIncome, 0.01);

    // BOTH on EPF -> gross = 2x the solo EPF gross
    var bothA = { key: 'MAIN', label: 'Main', months: months6({}), bizman: emptyBiz2,
                  ccris: [], bt: [], epfIncome: solo };
    var bothB = { key: 'A', label: 'Joint A', months: months6({}), bizman: emptyBiz2,
                  ccris: [], bt: [], epfIncome: solo };
    var rBoth = E.computeHFSummary({ applicants: [bothA, bothB], customerType: 'NORMAL',
      product: 'HOME FINANCING', hf: {}, ctf: 0 });
    check('EPF both applicants: combined gross = 2x solo', rBoth.income.grossIncome, solo.grossIncome * 2, 0.02);

    // No EPF anywhere -> unchanged manual path (regression guard)
    var rManual = E.computeHFSummary({ applicants: [mainManual], customerType: 'NORMAL',
      product: 'HOME FINANCING', hf: {}, ctf: 0 });
    check('No EPF: manual path unchanged (gross = basic)', rManual.income.grossIncome, 4000, 0.01);
  })();

  /* ---- MIXED joint: NORMAL main (payslip) + BIZMAN joint (business) ---- */
  (function () {
    var emptyBiz3 = { months: [], profitMarginPct: '', shareholdingPct: 100, avgITRAnnual: '', taxDeduction: '' };
    // NORMAL main: payslip basic 5000
    var main = { key: 'MAIN', label: 'Main', months: months6({ basic: 5000 }),
                 bizman: emptyBiz3, ccris: [], bt: [] };
    // BIZMAN joint: 6 months credit 30000 each, margin 20%, shareholding 100%,
    // ITR 60000/yr, tax 300/mth -> business block only (empty months)
    var biz = { months: [], profitMarginPct: 20, shareholdingPct: 100,
                avgITRAnnual: 60000, taxDeduction: 300 };
    for (var i = 0; i < 6; i++) biz.months.push({ bank1: 30000, bank2: 0 });
    var joint = { key: 'A', label: 'Joint A', months: months6({}), bizman: biz, ccris: [], bt: [] };

    // independent expected values from the engine parts
    var mainInc = E.calcNormalManual(months6({ basic: 5000 }));
    var bizHF = E.calcBizmanHF(biz);
    var rMix = E.computeHFSummary({ applicants: [main, joint], customerType: 'NORMAL',
      product: 'HOME FINANCING', hf: {}, ctf: 0 });

    // combined gross = payslip gross (main) + business personal income K111 (joint)
    check('Mixed: gross = main payslip + joint K111',
      rMix.income.grossIncome, mainInc.grossIncome + bizHF.monthlyPersonalIncome, 0.01);
    // combined PCB = main payslip PCB (0) + joint tax deduction G111 (300)
    check('Mixed: PCB = main PCB + joint tax', rMix.income.pcb, mainInc.avgPCB + bizHF.taxDeduction, 0.01);
    // EPF = main payslip EPF only (bizman has none)
    check('Mixed: EPF = main payslip EPF', rMix.income.epf, mainInc.average60EPF, 0.01);
    check('Mixed: net = gross - epf - pcb - socso',
      rMix.income.netIncome,
      rMix.income.grossIncome - rMix.income.epf - rMix.income.pcb - rMix.income.socso, 0.01);
  })();

  /* ---- report ---- */
  var passed = results.filter(function (r) { return r.pass; }).length;
  var lines = results.map(function (r) {
    return (r.pass ? 'PASS  ' : 'FAIL  ') + r.name +
      (r.pass ? '' : '   expected=' + r.expected + ' actual=' + r.actual);
  });
  lines.push('');
  lines.push('HF tests: ' + passed + '/' + results.length + ' passed');
  if (typeof document !== 'undefined' && document.getElementById('out')) {
    document.getElementById('out').textContent = lines.join('\n');
  } else if (typeof console !== 'undefined') {
    console.log(lines.join('\n'));
    if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
