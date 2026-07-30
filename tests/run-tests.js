/* ============================================================
   run-tests.js - unit checks against the "DUMMY DATA TO TEST"
   sections of the four spec files. Run with:  node tests/run-tests.js
   (The same checks run in the browser via tests/tests.html.)
   ============================================================ */
(function (global) {
  'use strict';

  // Node shim: engine files attach to window
  if (typeof window === 'undefined') {
    global.window = global;
    var path = require('path');
    var files = [
      '../web/js/engine/config.js',
      '../web/js/engine/pmt.js', '../web/js/engine/age.js', '../web/js/engine/facilityRates.js',
      '../web/js/engine/ccrisLine.js', '../web/js/engine/income.js', '../web/js/engine/creditLimit.js',
      '../web/js/engine/dsrThresholds.js', '../web/js/engine/hfPricing.js',
      '../web/js/engine/pdfExtractor.js', '../web/data/ndiPricing.js'
    ];
    files.forEach(function (f) { require(path.join(__dirname, f)); });
  }

  var E = window.Engine;
  var results = [];
  function check(name, actual, expected, tol) {
    tol = tol == null ? 0.01 : tol;
    var pass;
    if (typeof expected === 'number') pass = Math.abs(actual - expected) <= tol;
    else pass = actual === expected;
    results.push({ name: name, actual: actual, expected: expected, pass: pass });
  }

  /* ---- 01 V5 dummy data: Property 500000, Fin 450000, MRTT 10000,
          Valuation 1500, Legal 4000, Tenure 30, BR 4.25%, Ceiling 10% ---- */
  (function () {
    var fec = 1500 + 4000;
    check('V5 FEC', fec, 5500);
    var totalFin = 450000 + 10000 + fec;
    check('V5 Total Financing', totalFin, 465500);
    check('V5 Instalment @ eff 4.25%', E.monthlyInstalment(0.0425, 30, 465500), 2290, 1);
    check('V5 Instalment @ ceiling 10%', E.monthlyInstalment(0.10, 30, 465500), 4085, 1);
    check('V5 Selling price', E.sellingPrice(0.10, 30, 465500), 4085 * 360, 400);
    check('V5 MRTT MOF 2% within 5%', (10000 / 500000) <= 0.05, true);
  })();

  /* ---- 02 V10 dummy data: Property 600000, Fin 540000, MRTT 12000,
          Val 1500, Legal 4500, Tenure 30, Base 4.0 + Spread 0.5, Ceiling 10 ---- */
  (function () {
    var r = E.hfStructured({
      propertyValue: 600000, financing: 540000, mrtt: 12000,
      valuation: 1500, legal: 4500, tenureYears: 30,
      ceilingRate: 0.10, baseRate: 0.04, spread: 0.005
    });
    check('V10 FEC', r.fec, 6000);
    check('V10 Total Financing', r.totalFinancing, 558000);
    check('V10 Total MOF', r.totalMOF, 0.93, 0.001);
    check('V10 Instalment @ eff 4.5%', r.instalmentEffective, 2827, 1);
    check('V10 Instalment @ ceiling', r.instalmentCeiling, 4896, 1);
    check('V10 Selling price', r.sellingPrice, 4896 * 360, 400);
    check('V10 MRTT+FEC ratio', r.mrttFecRatio, 0.03, 0.0001);
    check('V10 note', r.note, 'MRTT + FEC within 5%');
  })();

  /* ---- 02b Home One Account (V10 sheet) parity ----
     Property 120000; SBR 2.75%, Ceiling 10% (shared).
     T1: fin 34440, reno 20000, mrtt 5000, val 950, legal 2000, tenure 28, spread 1.3%
     T2: fin 94000, reno 0,     mrtt 5000, val 500, legal 0,    tenure 10, spread 1.7%
     (T2 FEC 500 keyed via valuation, matching Excel F26=500) ---- */
  (function () {
    var r = E.hfHomeOne({
      propertyValue: 120000, sbr: 0.0275, ceiling: 0.10,
      t1: { financing: 34440, renovation: 20000, mrtt: 5000, valuation: 950, legal: 2000, tenureYears: 28, spread: 0.013 },
      t2: { financing: 94000, renovation: 0, mrtt: 5000, valuation: 500, legal: 0, tenureYears: 10, spread: 0.017 }
    });
    check('HOA T1 FEC', r.t1.fec, 2950);
    check('HOA T1 Total Financing', r.t1.totalFinancing, 62390);
    check('HOA T2 Total Financing', r.t2.totalFinancing, 99500);
    check('HOA Total Financing', r.totals.totalFinancing, 161890);
    check('HOA T1 Original MOF', r.t1.origMOF, 0.453667, 0.0001);
    check('HOA Total MRTT MOF (H36)', r.totals.mrttMOF, 0.112083, 0.0001);
    check('HOA Total MOF', r.totals.totalMOF, 1.349083, 0.0001);
    check('HOA T1 instalment @ ceiling', r.t1.instalmentCeiling, 554, 1);
    check('HOA T2 instalment @ ceiling', r.t2.instalmentCeiling, 1315, 1);
    check('HOA Total instalment @ ceiling', r.totals.instalmentCeiling, 1869, 1);
    check('HOA T1 selling @ ceiling', r.t1.sellingPriceCeiling, 186143, 2);
    check('HOA T2 selling @ ceiling', r.t2.sellingPriceCeiling, 157788, 2);
    check('HOA T1 instalment @ effective', r.t1.instalmentEffective, 311, 1);
    check('HOA T2 instalment @ effective', r.t2.instalmentEffective, 1029, 1);
    check('HOA Total instalment @ effective', r.totals.instalmentEffective, 1340, 1);
    check('HOA blended rate', r.blendedRate, 0.0429585, 0.00001);
    check('HOA note', r.note, 'MRTT + FEC exceeded 5%');
  })();

  /* ---- Payslip parser (two-column Earnings | Deductions layout) ---- */
  (function () {
    // build a row from [str, x] pairs (text is items joined left-to-right)
    function R(pairs) {
      var items = pairs.map(function (p) { return { str: p[0], x: p[1] }; });
      return { items: items, text: items.map(function (it) { return it.str; }).join(' ') };
    }
    var rows = [
      R([['PAYSLIP', 5], ['FOR', 40], ['JUN', 70], ['2025', 95]]),
      R([['BASIC', 10], ['SALARY', 40], ['5,000.00', 120], ['EPF', 220], ['550.00', 300]]),
      R([['FIXED', 10], ['ALLOWANCE', 40], ['800.00', 120], ['SOCSO', 220], ['19.75', 300]]),
      R([['OVERTIME', 10], ['250.00', 120], ['PCB', 220], ['120.00', 300]]),
      R([['COMMISSION', 10], ['1,200.00', 120]]),
      R([['TRANSPORT', 10], ['ALLOWANCE', 40], ['300.00', 120]]),
      R([['BONUS', 10], ['400.00', 120]]),
      R([['NET', 10], ['PAY', 40], ['8,000.00', 120]])   // aggregate -> skipped
    ];
    var p = E.parsePayslipRows(rows);
    check('Payslip basic', p.basic, 5000);
    check('Payslip fixed allowance (sum)', p.fixedAllowance, 1100);   // 800 + 300
    check('Payslip OT', p.ot, 250);
    check('Payslip commission', p.commission, 1200);
    check('Payslip other (bonus)', p.other, 400);
    check('Payslip EPF (employee col)', p.epf, 550);
    check('Payslip SOCSO', p.socso, 19.75);
    check('Payslip PCB', p.pcb, 120);
    check('Payslip NET skipped (not basic)', p.basic !== 8000, true);
    check('Payslip month label', p.monthLabel, 'JUN-25');

    // employer EPF line must NOT override the employee figure
    var rows2 = [
      R([['EPF', 10], ['EMPLOYER', 60], ['660.00', 200]]),
      R([['EPF', 10], ['420.00', 200]])
    ];
    var p2 = E.parsePayslipRows(rows2);
    check('Payslip EPF ignores employer line', p2.epf, 420);

    check('Payslip empty detector', E.payslipEmpty(E.parsePayslipRows([R([['HELLO', 10]])])), true);
  })();

  /* ---- EPF statement identity (cross-checked against Experian) ----
     Rows mirror the real myEPF layout: the confidential banner heads the
     page, the member name follows, then the KWSP/IC block. ---- */
  (function () {
    function R(pairs) {
      var items = pairs.map(function (p) { return { str: p[0], x: p[1] }; });
      return { items: items, text: items.map(function (it) { return it.str; }).join(' ') };
    }
    function head(name) {
      return [
        R([['SULIT DAN PERSENDIRIAN', 30]]),
        R([[name, 30]]),
        R([['MYP 202/3 98', 30]]),
        R([['JALAN BAKRI', 30]]),
        R([['PENYATA AHLI TAHUN 2026', 238]]),
        R([['No. Ahli KWSP', 32], [': 22492046', 150]]),
        R([['No. Kad Pengenalan', 32], [': 950513015742', 150]])
      ];
    }
    var malay = E.parseEPFRows(head('SITI ATIKA BINTI YAAKOB'));
    check('EPF name (BINTI)', malay.name, 'SITI ATIKA BINTI YAAKOB');
    check('EPF IC', malay.ic, '950513015742');

    // no BIN/BINTI/A-L marker: the "SULIT DAN PERSENDIRIAN" banner must not
    // be taken as the member name (it would fail the Experian identity check)
    var chinese = E.parseEPFRows(head('TAN AH KOW'));
    check('EPF name (no BIN/BINTI marker)', chinese.name, 'TAN AH KOW');
    var indian = E.parseEPFRows(head('RAJESH A/L KUMAR'));
    check('EPF name (A/L marker)', indian.name, 'RAJESH A/L KUMAR');

    // contribution rows: two postings in one month are summed; the
    // withdrawal rows ("Pengeluaran Akaun Fleksibel 18/03/2026 -200.00")
    // must not be read as a month
    var contrib = E.parseEPFRows([
      R([['Jan-26', 33], ['Caruman - IWS', 93], ['13/01/2026', 281],
         ['16.00', 398], ['14.00', 479], ['30.00', 559]]),
      R([['Jan-26', 33], ['Caruman', 93], ['14/01/2026', 281],
         ['795.00', 394], ['583.00', 474], ['1,378.00', 548]]),
      R([['Feb-26', 33], ['Caruman', 93], ['14/02/2026', 281],
         ['660.00', 394], ['484.00', 474], ['1,144.00', 548]]),
      R([['JUMLAH (RM)', 33], ['7,128.00', 548]]),
      R([['Pengeluaran Akaun Fleksibel', 33], ['18/03/2026', 297], ['-200.00', 552]])
    ]);
    check('EPF months parsed', contrib.months.length, 2);
    check('EPF same-month rows summed (ahli)', contrib.months[0].employee, 597);
    check('EPF same-month rows summed (majikan)', contrib.months[0].employer, 811);
    check('EPF month label', contrib.months[1].label, 'Feb-26');
    check('EPF withdrawal row ignored', contrib.months[1].employee, 484);
  })();

  /* ---- EPF statements attached ONE AT A TIME (iPad) must land on the
          same 12 months as dropping both files together ---- */
  (function () {
    function mk(year, labels) {
      return { months: labels.map(function (l, i) {
        return { label: l + '-' + String(year).slice(-2), monthIndex: i, year: year,
                 employer: 0, employee: 100 + i, total: 0 };
      }) };
    }
    var y2025 = mk(2025, ['Jan','Feb','Mac','Apr','Mei','Jun','Jul','Ogs','Sep','Okt','Nov','Dis']);
    var y2026 = mk(2026, ['Jan','Feb','Mac','Apr','Mei','Jun']);

    var together = E.mergeEPFMonths([y2025, y2026]);
    // one at a time: 2026 first, then 2025 merged against what is already held
    var step1 = E.mergeEPFMonths([{ months: [] }, y2026]);
    var step2 = E.mergeEPFMonths([{ months: step1 }, y2025]);
    var key = function (a) { return a.map(function (m) { return m.label + ':' + m.employee; }).join('|'); };

    check('EPF append: both at once = 12 months', together.length, 12);
    check('EPF append: 2026 first gives 6', step1.length, 6);
    check('EPF append: then 2025 gives 12', step2.length, 12);
    check('EPF append: one-by-one == both-at-once', key(step2), key(together));
    check('EPF append: window ends at latest month', step2[11].label, 'Jun-26');
    check('EPF append: window starts 12 back', step2[0].label, 'Jul-25');
    // re-attaching the same file must not double up
    var again = E.mergeEPFMonths([{ months: step2 }, y2026]);
    check('EPF append: re-drop is idempotent', key(again), key(step2));
  })();

  /* ---- DSR is reported to 2 dp; thresholds stay whole ---- */
  (function () {
    check('DSR 2dp', E.formatPct(0.6512345, 2), '65.12%');
    check('DSR 2dp rounds', E.formatPct(0.654321, 2), '65.43%');
    check('DSR 2dp keeps trailing zeros', E.formatPct(0.65, 2), '65.00%');
    check('DSR threshold stays whole', E.formatPct(0.65, 0), '65%');
  })();

  /* ---- Experian CCRIS: BOTH CrediTrack text flavours ----
     Real rows lifted from two live reports. One PDF emits clean text runs
     ("HSLNFNCE", "OWN", "OUTSTANDING CREDIT"); the other sprays stray
     spaces inside the words ("NHE DFNCE", "OW N", "OUTS TANDING CRE DIT").
     Both must parse identically, and the CREDIT APPLICATION table that
     follows the totals must never leak in as a debt line. ---- */
  (function () {
    function R(pairs) {
      var items = pairs.map(function (p) { return { str: p[0], x: p[1] }; });
      return { items: items, text: items.map(function (it) { return it.str; }).join(' ') };
    }

    // A) spaced flavour (EXPERIAN SITI ATIKA.pdf)
    var spaced = E.parseExperianRows([
      R([['Name Of Subject', 109], ['SITI ATIKA BINTI YAAKOB', 188]]),
      R([['New IC No', 109], ['950513-01-5742', 188]]),
      R([['i-SCORE', 109], ['563', 227]]),
      R([['DETAILED', 109], ['CREDIT REPORT (BANKING', 144], ['ACCOUNTS)', 234]]),
      R([['OUTS TANDING CRE DIT', 107]]),
      R([['1', 107], ['08/02/2021', 115], ['OW N', 147], ['OT H', 165], ['27,051.00', 305]]),
      R([['O', 139], ['NHE DFNCE', 186], ['22,175.00', 216], ['31/05/2026', 268],
         ['178.00', 305], ['MT H', 325], ['CLE A N', 354], ['30', 387], ['29', 396]]),
      R([['3', 107], ['28/11/2025', 115], ['OW N', 147], ['CB', 165], ['5,000.00', 305], ['CLE A N', 354]]),
      R([['O', 139], ['P E LNFNCE', 186], ['2,753.00', 216], ['31/05/2026', 268],
         ['513.00', 305], ['MT H', 325], ['0', 387], ['1', 396]]),
      R([['TOTAL', 186], ['OUTS TANDING', 186], ['24,928.00', 216], ['TOTAL', 268], ['32,051.00', 305]]),
      R([['CRE DIT AP P LICATION', 107]]),
      R([['1', 107], ['29/11/2025', 115], ['A', 139], ['OW N', 147], ['CB', 165],
         ['P E LNFNCE', 186], ['0', 216], ['5,000.00', 305]])
    ]);
    check('CCRIS spaced: i-SCORE', spaced.iScore, 563);
    check('CCRIS spaced: record count', spaced.records.length, 2);
    check('CCRIS spaced: facility code', spaced.records[0].facility, 'NHEDFNCE');
    check('CCRIS spaced: outstanding', spaced.records[0].outstanding, 22175);
    check('CCRIS spaced: limit from parent', spaced.records[0].limit, 27051);
    check('CCRIS spaced: instalment', spaced.records[0].commitmentPerCCRIS, 178);
    check('CCRIS spaced: capacity', spaced.records[0].capacity, 'OWN');
    check('CCRIS spaced: collateral', spaced.records[0].collateral, 'CLEAN');
    check('CCRIS spaced: conduct digits not money', spaced.records[1].facility, 'PELNFNCE');
    check('CCRIS spaced: credit application excluded', spaced.records.length, 2);

    // C) one item, SAME facility on several lines (e.g. 2 card lines on the
    //    same date): never summed - each line shows on its own. The item's
    //    single shared limit stays on the first line so TYPE A cannot charge
    //    5% of the same limit twice.
    var multi = E.parseExperianRows([
      R([['DETAILED CREDIT REPORT (BANKING ACCOUNTS)', 47]]),
      R([['OUTSTANDING CREDIT', 45]]),
      R([['1', 45], ['22/10/2019', 58], ['OWN', 99], ['CB', 124],
         ['12,000.00', 290], ['CLEAN', 358]]),
      R([['O', 87], ['CRDTCARD', 149], ['8,548.00', 190], ['31/05/2026', 248],
         ['427.40', 290], ['MTH', 324], ['0', 406]]),
      R([['O', 87], ['CRDTCARD', 149], ['2,902.00', 190], ['31/05/2026', 248],
         ['145.10', 290], ['MTH', 324], ['0', 406]])
    ]);
    check('CCRIS same-date lines not summed', multi.records.length, 2);
    check('CCRIS line 1 outstanding kept', multi.records[0].outstanding, 8548);
    check('CCRIS line 2 outstanding kept', multi.records[1].outstanding, 2902);
    check('CCRIS line 1 instalment kept', multi.records[0].commitmentPerCCRIS, 427.40);
    check('CCRIS line 2 instalment kept', multi.records[1].commitmentPerCCRIS, 145.10);
    check('CCRIS shared limit on first line', multi.records[0].limit, 12000);
    check('CCRIS shared limit not repeated', multi.records[1].limit, 0);
    check('CCRIS both lines same item no', multi.records[1].no, multi.records[0].no);
    check('CCRIS both lines same date', multi.records[1].date, '22/10/2019');
    // TYPE A must charge the shared limit once: 5% of 12,000 + 5% of 2,902
    check('CCRIS split TYPE A total (limit charged once)',
      E.totalCommitments(multi.records, 'TYPE A').total, 745.10);
    // TYPE B ignores limit entirely: 5% of each outstanding
    check('CCRIS split TYPE B total',
      E.totalCommitments(multi.records, 'TYPE B').total, 572.50);

    // B) clean flavour (NADIAH BINTI ZAINUDDIN.pdf) - must not regress
    var clean = E.parseExperianRows([
      R([['DETAILED CREDIT REPORT (BANKING ACCOUNTS)', 47]]),
      R([['OUTSTANDING CREDIT', 45]]),
      R([['2', 45], ['01/06/2017', 58], ['JOINT', 99], ['CB', 124],
         ['544,920.00', 290], ['PROPERTIES', 358]]),
      R([['O', 87], ['HSLNFNCE', 149], ['514,430.00', 190], ['31/10/2025', 248],
         ['2,523.00', 290], ['MTH', 324], ['0', 406]]),
      // "MOTOR V" is a collateral label, not a facility: parent row only
      R([['3', 45], ['09/08/2017', 58], ['OWN', 99], ['CB', 124],
         ['115,800.00', 290], ['MOTOR V', 358], ['(JPJ)', 358]]),
      R([['O', 87], ['PCPASCAR', 149], ['32,716.00', 190], ['31/10/2025', 248],
         ['1,346.00', 290], ['MTH', 324], ['0', 406]])
    ]);
    check('CCRIS clean: record count', clean.records.length, 2);
    check('CCRIS clean: JOINT capacity', clean.records[0].capacity, 'JOINT');
    check('CCRIS clean: PROPERTIES collateral', clean.records[0].collateral, 'PROPERTIES');
    check('CCRIS clean: instalment', clean.records[0].commitmentPerCCRIS, 2523);
    check('CCRIS clean: MOTOR V not a facility', clean.records[1].facility, 'PCPASCAR');
    check('CCRIS clean: MOTOR V collateral', clean.records[1].collateral, 'MOTOR V (JPJ)');
    check('CCRIS clean: limit from parent', clean.records[1].limit, 115800);
  })();

  /* ---- 03 HF DSR dummy data ---- */
  (function () {
    // CRDTCARD outstanding 10000 limit 20000, TYPE A:
    // Excel L = MAX(5% outstanding, 5% limit) = MAX(500, 1000) = 1000
    var l1 = E.lineCommitment({ facility: 'CRDTCARD', outstanding: 10000, limit: 20000,
      capacity: 'OWN', commitmentPerCCRIS: 0, override: '' }, 'TYPE A');
    check('HF CCRIS line1 CRDTCARD', l1.commitment, 1000);
    // HSLNFNCE instalment 1200 OWN -> 1200
    var l2 = E.lineCommitment({ facility: 'HSLNFNCE', outstanding: 200000, limit: 250000,
      capacity: 'OWN', commitmentPerCCRIS: 1200, override: '' }, 'TYPE A');
    check('HF CCRIS line2 HSLNFNCE', l2.commitment, 1200);
    // instalment: 466500 @ 4.5% 30y ~ 2363
    var inst = E.monthlyInstalment(0.045, 30, 466500);
    check('HF new instalment', inst, 2363, 2);
    // commission recognition: 1000*60% = 600, gross 7100
    var months = [];
    for (var i = 0; i < 6; i++) {
      months.push({ basic: 6000, fixedAllowance: 500, other: 0, commission: 1000,
        ot: 0, epf: 660, pcb: 200, socso: 25 });
    }
    var inc = E.calcNormalManual(months);
    check('HF income basic recog', inc.basicRecog, 6000);
    check('HF income commission @60%', inc.average60Comm, 600);
    check('HF gross income', inc.grossIncome, 7100);
    // EPF pro-rated: 660 * (6000+500+600)/(6000+500+1000) = 660*7100/7500 = 624.8
    check('HF EPF pro-rated', inc.average60EPF, 624.8, 0.1);
    // threshold: income 7100 (>=5000) -> 80%
    check('HF threshold @7100', E.hfThreshold(7100, 'NORMAL'), 0.80);
    check('HF threshold @2500 fail', E.hfThreshold(2500, 'NORMAL'), 0);
    check('HF verdict OK', E.hfVerdict(7100, 'NORMAL', 0.65).verdict, 'OK');
    check('HF verdict burst', E.hfVerdict(7100, 'NORMAL', 0.85).verdict, 'DSR BURST');
    // age from IC 900101145523 -> currentYear - 1990 (birthday 1 Jan always passed)
    check('Age from IC 900101...', E.calculateAgeFromIC('900101145523'),
      new Date().getFullYear() - 1990);
    // joint: J/2
    var lj = E.lineCommitment({ facility: 'OTLNFNCE', capacity: 'JOINT',
      commitmentPerCCRIS: 800, outstanding: 1, limit: 1, override: '' }, 'TYPE A');
    check('Joint non-card J/2', lj.commitment, 400);
    // overdraft on LIMIT
    var lo = E.lineCommitment({ facility: 'OVRDRAFT', capacity: 'OWN',
      commitmentPerCCRIS: 0, outstanding: 5000, limit: 100000, override: '' }, 'TYPE A');
    check('Overdraft 0.77529% of limit', lo.commitment, 775.29, 0.01);
    // override wins
    var lov = E.lineCommitment({ facility: 'CRDTCARD', outstanding: 10000, limit: 20000,
      capacity: 'OWN', commitmentPerCCRIS: 0, override: 123 }, 'TYPE A');
    check('Override wins', lov.commitment, 123);
  })();

  /* ---- 04 PF dummy data: NORMAL TYPE B, IC 880515085566 ---- */
  (function () {
    var months = [];
    for (var i = 0; i < 6; i++) {
      months.push({ basic: 8000, fixedAllowance: 0, other: 0, commission: 2000,
        ot: 0, epf: 880, pcb: 300, socso: 25 });
    }
    var inc = E.calcNormalManual(months);
    check('PF gross 9200', inc.grossIncome, 9200);
    // Excel master: EPF/PCB/Socso all pro-rated by 9200/10000 when
    // commission exists: EPF 809.6, PCB 276, Socso 23
    check('PF net (EPF/PCB/Socso pro-rated)', inc.netIncome, 9200 - 809.6 - 276 - 23, 0.1);
    // CRDTCARD out 6000 limit 12000: Excel TYPE B = 5% x outstanding = 300;
    // non-TYPE-B = MAX(5% outstanding, 5% limit) = 600
    var l1 = E.lineCommitment({ facility: 'CRDTCARD', outstanding: 6000, limit: 12000,
      capacity: 'OWN', commitmentPerCCRIS: 0, override: '' }, 'TYPE B');
    check('PF CRDTCARD TYPE B outstanding basis', l1.commitment, 300);
    var l1a = E.lineCommitment({ facility: 'CRDTCARD', outstanding: 6000, limit: 12000,
      capacity: 'OWN', commitmentPerCCRIS: 0, override: '' }, 'TYPE A');
    check('PF CRDTCARD TYPE A max basis', l1a.commitment, 600);
    // flat instalment: (50000 + 50000*0.08*5)/60 = 1166.67
    check('PF flat instalment', E.flatInstalment(50000, 0.08, 60), 1166.67, 0.01);
    // DSR 2966.67/7995 = 37.1% -> TYPE B <10000 -> 70% -> OK
    var v = E.pfVerdict(9200, 'TYPE B', 2966.67 / 7995, 7995 - 2966.67);
    check('PF verdict OK', v.verdict, 'OK');
    check('PF TYPE B threshold <10000', v.threshold, 0.70);
    check('PF TYPE A threshold', E.pfThreshold(9200, 'TYPE A').threshold, 0.60);
    // eligibility gates (Excel H113: bands on gross income)
    check('PF gate income <3000', E.pfEligibilityGate(2500, 20000, null), 'NOT ELIGIBLE');
    check('PF gate income >=5000', E.pfEligibilityGate(9200, 50000, null), 'OK');
    check('PF gate 3000-4999 exceed', E.pfEligibilityGate(4000, 20000, 15000), 'EXCEED LIMIT');
    // stress: floating line commitment 1000 @ factor 0.02 -> 1020
    check('PF stress buffer', E.stressCommitment(1000, true, 0.02), 1020);
    check('PF no stress when fixed', E.stressCommitment(1000, false, 0.02), 1000);
    // age IC 880515085566 -> thisYear - 1988 (if 15 May passed)
    var expected = new Date().getFullYear() - 1988
      - (new Date() < new Date(new Date().getFullYear(), 4, 15) ? 1 : 0);
    check('Age from IC 880515...', E.calculateAgeFromIC('880515085566'), expected);
  })();

  /* ---- credit_card.txt section 5 credit-limit engine ---- */
  (function () {
    check('CC multiplier 610 -> x3', E.multiplierFromIScore(610), 3);
    check('CC multiplier 680 -> x8', E.multiplierFromIScore(680), 8);
    check('CC multiplier 500 -> null', E.multiplierFromIScore(500), null);
    var r = E.calculateMaxCreditLimit(9200, 700, 'VISA_PLATINUM');
    // floor(9200/100)*100 = 9200 ; floor(9200*8/1000)*1000 = 73000
    check('CC raw max limit', r.maxCreditLimit, 73000);
    check('CC card instalment 1%', r.monthlyInstallment, 730);
    check('CC eligible by limit', r.isEligibleByLimit, true);
    // Platinum salary cap 2000-3000
    var r2 = E.calculateMaxCreditLimit(2500, 700, 'VISA_PLATINUM');
    check('CC Platinum salary cap', r2.maxCreditLimit, Math.min(Math.floor(2500 * 8 / 1000) * 1000, 5000));
    check('CC DSR threshold bands', E.ccDsrThreshold(4999), 60);
    check('CC DSR threshold 10k', E.ccDsrThreshold(10000), 70);
    check('CC DSR threshold >10k', E.ccDsrThreshold(10001), 75);
    // BT repayment floor
    check('BT repayment floor RM50', E.btRepayment(500), 50);
    check('BT repayment 5%', E.btRepayment(10000), 500);
  })();

  /* ---- EPF statement algorithm (commandepf.txt shape) ---- */
  (function () {
    // 12 months caruman ahli 550 (=> 5000 income), two bonus months higher
    var months = [550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 990, 1100];
    var r = E.calcEPFIncome(months, 11, { epf: 550, pcb: 100, socso: 25, other: 0 });
    // drop top 2 (9000,10000) -> all remaining 5000 -> fixed 5000, variable 0
    check('EPF fixed income', r.fixedIncome, 5000, 0.5);
    check('EPF gross', r.grossIncome, 5000, 0.5);
    check('EPF net', r.netIncome, 5000 - 675, 0.5);

    // Official "EPF Income Calculation" workbook worked example (E9:Q9):
    //   fixed 19,500 | variable(raw) 2,388.89 | gross = 19,500 + 60% x 2,388.89
    var ex = [2750, 1760, 1980, 2200, 7700, 2200, 2200, 2530, 0, 3300, 3520, 2750];
    var re = E.calcEPFIncome(ex, 11, {});
    check('EPF workbook: fixed component (E18)', re.fixedIncome, 19500, 0.01);
    check('EPF workbook: recognised variable (60% of E20)', re.variableIncome, 0.6 * 2388.8889, 0.01);
    check('EPF workbook: gross (E21 = fixed + 60% var)', re.grossIncome, 20933.3333, 0.01);
    // tiles reconcile: fixed + recognised variable == gross
    check('EPF tiles reconcile', re.fixedIncome + re.variableIncome, re.grossIncome, 0.001);
  })();

  /* ---- Bizman (Excel master: 12 months / 12, gross = MIN of both) ---- */
  (function () {
    var m12 = [];
    for (var i = 0; i < 12; i++) m12.push({ bank1: 20000, bank2: 10000 });
    var d = { months: m12, profitMarginPct: 10, shareholdingPct: 100,
              avgITRAnnual: 0, taxDeduction: 0, socso: 0 };
    var r = E.calcBizman(d);
    check('Bizman avg credit (12-mth)', r.bizAvgCredit, 30000);
    check('Bizman business income', r.monthlyBusinessIncome, 3000);
    check('Bizman gross (no ITR)', r.grossIncome, 3000);
    d.avgITRAnnual = 60000; // 5000/mo + 25% = 6250; MIN(6250, 3000) = 3000
    var r2 = E.calcBizman(d);
    check('Bizman gross (MIN of both)', r2.grossIncome, 3000);
    d.months = m12.map(function () { return { bank1: 0, bank2: 0 }; });
    var r3 = E.calcBizman(d); // business 0 -> MAX rule -> ITR income
    check('Bizman gross (ITR only)', r3.grossIncome, 6250);
  })();

  /* ---- unsecured cap + MUM ---- */
  check('Unsecured cap 7000', E.unsecuredCap(7000), 0.65);
  check('Unsecured cap 12000', E.unsecuredCap(12000), 0.70);
  check('MUM 12000 -> 13', E.maxUnsecuredMultiplier(12000), 13);

  /* ---- report ---- */
  var failed = results.filter(function (r) { return !r.pass; });
  var lines = results.map(function (r) {
    return (r.pass ? 'PASS' : 'FAIL') + '  ' + r.name +
      (r.pass ? '' : '   expected=' + r.expected + ' actual=' + r.actual);
  });
  lines.push('');
  lines.push(results.length + ' checks, ' + failed.length + ' failed.');

  if (typeof document !== 'undefined' && document.getElementById('test-output')) {
    document.getElementById('test-output').textContent = lines.join('\n');
  }
  if (typeof console !== 'undefined') console.log(lines.join('\n'));
  if (typeof process !== 'undefined' && process.exit) process.exit(failed.length ? 1 : 0);
})(typeof globalThis !== 'undefined' ? globalThis : this);
