/*
  Payslip parser tests for the standalone calculator engine.
  Run with: node tests/payslip-tests.js
  Fixtures are anonymised layout rows; no real customer document is stored.
*/
(function (global) {
  'use strict';
  if (typeof window === 'undefined') {
    global.window = global;
    var path = require('path');
    [
      '../calculator/js/engine/config.js',
      '../calculator/js/engine/pmt.js', '../calculator/js/engine/age.js',
      '../calculator/js/engine/facilityRates.js', '../calculator/js/engine/ccrisLine.js',
      '../calculator/js/engine/income.js', '../calculator/js/engine/creditLimit.js',
      '../calculator/js/engine/dsrThresholds.js', '../calculator/js/engine/hfPricing.js',
      '../calculator/js/engine/hfSummary.js', '../calculator/js/engine/pdfExtractor.js',
      '../calculator/data/ndiPricing.js'
    ].forEach(function (f) { require(path.join(__dirname, f)); });
  }

  var E = window.Engine, results = [];
  function check(name, actual, expected, tol) {
    tol = tol == null ? 0.01 : tol;
    var pass = typeof expected === 'number'
      ? Math.abs(actual - expected) <= tol : actual === expected;
    results.push({ name: name, actual: actual, expected: expected, pass: pass });
  }
  function R(y, pairs) {
    var items = pairs.map(function (p) { return { str: p[0], x: p[1] }; });
    return { page: 1, y: y, items: items,
      text: items.map(function (it) { return it.str; }).join(' ') };
  }

  // Synthetic side-by-side earnings/deductions layout. Basic Salary
  // includes a rate (42.50) and actual amount (5,240.00); statutory table
  // repeats SOCSO as an aggregate and must not be counted as a payslip row.
  var rows = [
    R(900, [['Employee Name : Sample Employee', 24]]),
    R(870, [['I/C No. : 900101011234', 24]]),
    R(840, [['Payroll Period : Apr 2025 (Month End)', 24]]),
    R(800, [['Earning(s)', 24], ['MYR', 550], ['Deduction(s)', 620], ['MYR', 1140]]),
    R(760, [['Basic Salary', 24], ['42.50', 300], ['5,240.00', 480], ['Employee EPF', 620], ['576.40', 1140]]),
    R(745, [['Special Duty', 24], ['120.00', 480]]),
    // Unknown deduction labels are still classified by their Deductions column.
    R(730, [['SKBBK', 620], ['31.25', 1140]]),
    R(700, [['Employee SOCSO', 620], ['24.50', 1140]]),
    R(670, [['Employee EIS', 620], ['9.00', 1140]]),
    R(630, [['Gross Earning', 24], ['5,360.00', 550], ['Total Deduction', 620], ['641.15', 1140]]),
    R(600, [['Net Pay', 620], ['4,718.85', 1140]]),
    R(400, [['Statutory (MYR)', 24]]),
    R(380, [['Current Month', 120], ['Year to Date (YTD)', 700]]),
    R(370, [['EE', 24], ['EPF', 100], ['576.40', 160], ['SOCSO', 220], ['55.50', 280], ['EIS', 340], ['9.00', 400]])
  ];
  var p = E.parsePayslipRows(rows);
  var rec = E.payslipReconciliation(p);
  check('Payslip period', p.monthLabel, 'APR-25');
  check('Payslip employee name', p.employeeName, 'Sample Employee');
  check('Payslip employee IC', p.ic, '900101011234');
  check('Payslip selects salary amount, not rate', p.basic, 5240);
  check('Unrecognized earning maps to Other Income', p.other, 120);
  check('Payslip employee EPF', p.epf, 576.40);
  check('Payslip SOCSO detail wins over repeated statutory amount', p.socso, 24.50);
  check('Payslip EIS extracted separately', p.eis, 9.00);
  check('Unknown employee deduction goes to Other deductions', p.otherDeduction, 31.25);
  check('Payslip printed total deduction', p.totalDeduction, 641.15);
  check('Payslip printed net', p.netPay, 4718.85);
  check('Employee deductions sum', rec.employeeDeductions, 641.15);
  check('Calculated net matches payslip net', rec.expectedNet, 4718.85);
  check('Payslip reconciles', rec.reconciles, true);

  var months = [
    { basic: 5240, fixedAllowance: 0, fixedAllowanceDesc: '', other: 0, commission: 0, ot: 0,
      epf: 576.40, pcb: 0, socso: 33.50, otherDeduction: 31.25 },
    {}, {}, {}, {}, {}
  ];
  var income = E.calcNormalManual(months);
  check('Other employee deductions reduce net income', income.netIncome, 4598.85);
  check('Other deduction recognized monthly', income.avgOtherDeduction, 31.25);

  var mismatch = E.payslipReconciliation({ basic: 5240, epf: 576.40, pcb: 0,
    socso: 24.50, eis: 9, otherDeduction: 31.25,
    grossPay: 5240, netPay: 4660, totalDeduction: 641.15 });
  check('Mismatch is flagged', mismatch.reconciles, false);
  check('Mismatch reports missing amount', mismatch.netDifference, -61.15);
  var offsetErrors = E.payslipReconciliation({ basic: 5200, epf: 536.40, pcb: 0,
    socso: 24.50, eis: 9, otherDeduction: 31.25,
    grossPay: 5240, netPay: 4598.85, totalDeduction: 641.15 });
  check('Equal-and-opposite OCR misses still fail gross check', offsetErrors.reconciles, false);
  check('Gross extraction difference is reported', offsetErrors.grossDifference, -40);
  var noNet = E.payslipReconciliation({ basic: 5240, epf: 576.40, pcb: 0,
    socso: 24.50, eis: 9, otherDeduction: 31.25, grossPay: 5240 });
  check('No printed net is not marked reconciled', noNet.reconciles, false);

  // A stacked layout places Deductions below Earnings instead of beside it.
  var stacked = E.parsePayslipRows([
    R(800, [['Earnings', 24]]),
    R(770, [['Basic Salary', 24], ['5,000.00', 350]]),
    R(650, [['Deductions', 24]]),
    R(620, [['EPF', 24], ['550.00', 350]]),
    R(590, [['Staff Club', 24], ['20.00', 350]]),
    R(500, [['Gross Earnings', 24], ['5,000.00', 350]]),
    R(470, [['Total Deductions', 24], ['570.00', 350]]),
    R(440, [['Net Pay', 24], ['4,430.00', 350]])
  ]);
  check('Stacked layout basic income', stacked.basic, 5000);
  check('Stacked layout known deduction', stacked.epf, 550);
  check('Stacked layout unknown deduction', stacked.otherDeduction, 20);
  check('Stacked layout net reconciles', E.payslipReconciliation(stacked).reconciles, true);

  // myEPF statement recognition is based on document contents, not filename.
  var epfRows = [
    R(900, [['SULIT DAN PERSENDIRIAN', 24]]),
    R(870, [['SAMPLE EMPLOYEE BIN TEST', 24]]),
    R(840, [['No. Ahli KWSP', 24], ['12345678', 200], ['No. Kad Pengenalan', 500], ['900101011234', 700]]),
    R(800, [['PENYATA AHLI TAHUN 2026', 24]]),
    R(700, [['CARUMAN SEMASA', 24]]),
    R(650, [['Jan-26', 24], ['Caruman - IWS', 110], ['15/01/2026', 300], ['390.00', 600], ['330.00', 800], ['720.00', 1000]]),
    R(620, [['Ogs-26', 24], ['Caruman', 110], ['06/08/2026', 300], ['646.00', 600], ['418.00', 800], ['1,064.00', 1000]]),
    R(580, [['JUMLAH (RM)', 24], ['7,927.00', 1000]])
  ];
  var epfParsed = E.parseEPFRows(epfRows);
  check('EPF detected from document text', E.isEPFStatementRows(epfRows), true);
  check('EPF statement month rows found', epfParsed.months.length, 2);
  check('EPF January employee contribution', epfParsed.months[0].employee, 330);
  check('EPF August employee contribution', epfParsed.months[1].employee, 418);

  var failed = results.filter(function (r) { return !r.pass; });
  results.forEach(function (r) {
    console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name +
      (r.pass ? '' : ' expected=' + r.expected + ' actual=' + r.actual));
  });
  console.log('\nPayslip tests: ' + results.length + ' checks, ' + failed.length + ' failed.');
  if (typeof process !== 'undefined' && process.exit) process.exit(failed.length ? 1 : 0);
})(typeof globalThis !== 'undefined' ? globalThis : this);
