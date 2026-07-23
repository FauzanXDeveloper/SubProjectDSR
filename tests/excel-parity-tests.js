/* ============================================================
   excel-parity-tests.js
   Parity check: system engine vs the PF master Excel
   "CCRIS DSR EVALUATION REPORT 2025 23122025.xlsm".
   Excel-expected values below are computed cell-by-cell from the
   workbook formulas (PF DSR Cal rows 15-134, List!D:E, List!A28:B32).

   CCRIS test data = real Experian report NOORUL A'NIAH BINTI NIDZIR
   (Order 216600484, 2025-11-12).

   Run with:  node tests/excel-parity-tests.js
   ============================================================ */
(function (global) {
  'use strict';

  if (typeof window === 'undefined') {
    global.window = global;
    var path = require('path');
    ['../js/engine/config.js', '../js/engine/pmt.js', '../js/engine/facilityRates.js',
     '../js/engine/ccrisLine.js', '../js/engine/income.js',
     '../js/engine/dsrThresholds.js', '../data/ndiPricing.js'
    ].forEach(function (f) { require(path.join(__dirname, f)); });
  }
  var E = window.Engine;

  var rows = [];
  function cmp(section, name, excel, system) {
    var match;
    if (typeof excel === 'number' && typeof system === 'number') {
      match = Math.abs(excel - system) <= 0.01;
    } else {
      match = excel === system;
    }
    rows.push({ section: section, name: name, excel: excel, system: system, match: match });
  }
  function r2(v) { return Math.round(v * 100) / 100; }

  /* ============================================================
     1. CCRIS COMMITMENTS - NOORUL A'NIAH (Experian 2025-11-12)
        Excel rule (col L): rate-1 facilities -> commitment = CCRIS
        instalment (col J); JOINT -> J/2; OVRDRAFT -> 0.77529% x limit.
     ============================================================ */
  (function () {
    var ccris = [
      { facility: 'PCPASCAR', capacity: 'OWN', collateral: 'MOTOR V (JPJ)',
        outstanding: 49584, limit: 38000, commitmentPerCCRIS: 622, override: '', floating: 'NO' },
      { facility: 'PELNFNCE', capacity: 'OWN', collateral: '',
        outstanding: 35560, limit: 40000, commitmentPerCCRIS: 760, override: '', floating: 'NO' },
      { facility: 'OTLNFNCE', capacity: 'OWN', collateral: 'CLEAN',
        outstanding: 75043, limit: 80000, commitmentPerCCRIS: 881, override: '', floating: 'NO' }
    ];
    var t = E.totalCommitments(ccris, 'TYPE B');
    // Excel L55: 622 + 760 + 881
    cmp('CCRIS (Noorul)', 'Total CCRIS commitment L55', 2263, r2(t.total));
    // Excel G125 unsecured sum: needs facility IN unsecured list AND
    // collateral = "CLEAN". Only OTLNFNCE qualifies (PELNFNCE has blank
    // collateral in the report, so Excel does NOT count it).
    cmp('CCRIS (Noorul)', 'Unsecured CCRIS commitment (CLEAN only)', 881, r2(t.unsecuredTotal));
    // Non-bank BNPL instalments (NLCI section) are NOT CCRIS banking rows;
    // in the Excel they can only enter via "Other Commitment" (col K).
    var bnpl = [68.92, 4.67, 6.89, 8.01, 9.58, 3.69, 4.49, 8.22, 8.38, 11.76, 8.37, 12.56, 13.70, 7.19]
      .reduce(function (a, b) { return a + b; }, 0);
    cmp('CCRIS (Noorul)', 'BNPL other-commitment total (info)', 176.43, r2(bnpl));
  })();

  /* ============================================================
     2. CRDTCARD treatment (workbook is set to TYPE B in P12)
        Excel L = MAX(O,P):
          TYPE B: O = 5% x OUTSTANDING (floor RM50), P = 0
                  -> L = 5% x outstanding, min RM50
          else  : O = same, P = 5% x LIMIT -> L = MAX(O, P)
     ============================================================ */
  (function () {
    // workbook's own row 15: outstanding 2806, limit 3000 -> Excel L15 = 140.30
    var b1 = E.lineCommitment({ facility: 'CRDTCARD', capacity: 'OWN',
      outstanding: 2806, limit: 3000, commitmentPerCCRIS: 0, override: '' }, 'TYPE B');
    cmp('CRDTCARD', 'TYPE B: 5% of outstanding (2806/3000)', 140.30, r2(b1.commitment));
    var b2 = E.lineCommitment({ facility: 'CRDTCARD', capacity: 'OWN',
      outstanding: 400, limit: 5000, commitmentPerCCRIS: 0, override: '' }, 'TYPE B');
    cmp('CRDTCARD', 'TYPE B: RM50 floor (400/5000)', 50, r2(b2.commitment));
    // non-TYPE-B: Excel takes MAX(5% outstanding floored, 5% limit)
    var a1 = E.lineCommitment({ facility: 'CRDTCARD', capacity: 'OWN',
      outstanding: 2806, limit: 3000, commitmentPerCCRIS: 0, override: '' }, 'TYPE A');
    cmp('CRDTCARD', 'TYPE A: MAX(5% out, 5% limit) (2806/3000)', 150, r2(a1.commitment));
  })();

  /* ============================================================
     3. INCOME FOR NORMAL (PF DSR Cal rows 77-87 / 113-122)
        Excel recognition:
          Basic          C87 = MAX of 6 months
          Fixed Allow.   D87 = AVERAGEIF(>0)
          Other Income   F87 = MAX of 6 months
          Commission     G87 = (sum/6) x 60%
          OT             H87 = AVERAGEIF(>0)  (100%, not 60%)
          EPF/PCB/Socso: if commission > 0 -> sum/6, then ALL THREE
            pro-rated by (C86+D86+G87)/(C86+D86+G86);
            if no commission -> AVERAGEIF(>0), ratio = 1.
          Gross C118 = C87+D87+F87+G87+H87
          Net   C122 = Gross - EPF' - PCB' - Socso'
     ============================================================ */
  (function () {
    var months = [
      { basic: 4000, fixedAllowance: 300, other: 200, commission: 500, ot: 100, epf: 473, pcb: 150, socso: 19.75 },
      { basic: 4000, fixedAllowance: 300, other: 0,   commission: 600, ot: 120, epf: 473, pcb: 150, socso: 19.75 },
      { basic: 4000, fixedAllowance: 300, other: 150, commission: 400, ot: 0,   epf: 473, pcb: 150, socso: 19.75 },
      { basic: 4000, fixedAllowance: 300, other: 0,   commission: 700, ot: 80,  epf: 473, pcb: 150, socso: 19.75 },
      { basic: 4000, fixedAllowance: 300, other: 100, commission: 500, ot: 90,  epf: 473, pcb: 150, socso: 19.75 },
      { basic: 4000, fixedAllowance: 300, other: 250, commission: 300, ot: 110, epf: 473, pcb: 150, socso: 19.75 }
    ];
    var inc = E.calcNormalManual(months);

    // Excel cell-by-cell:
    // C87=4000, D87=300, F87=MAX=250, G86=500, G87=300, H87=avg(100,120,80,90,110)=100
    // ratio=(4000+300+300)/(4000+300+500)=4600/4800
    var ratio = 4600 / 4800;
    var exEPF = 473 * ratio, exPCB = 150 * ratio, exSoc = 19.75 * ratio;
    var exGross = 4000 + 300 + 250 + 300 + 100;              // 4950
    var exNet = exGross - exEPF - exPCB - exSoc;             // 4334.03

    cmp('NORMAL income', 'Basic (MAX)', 4000, r2(inc.basicRecog));
    cmp('NORMAL income', 'Fixed allowance (avg>0)', 300, r2(inc.avgFixed));
    cmp('NORMAL income', 'Other income (Excel=MAX)', 250, r2(inc.avgOther));
    cmp('NORMAL income', 'Commission @60%', 300, r2(inc.average60Comm));
    cmp('NORMAL income', 'OT (Excel=avg>0 @100%)', 100, r2(inc.avgOT));
    cmp('NORMAL income', 'EPF pro-rated', r2(exEPF), r2(inc.average60EPF));
    cmp('NORMAL income', 'PCB (Excel pro-rates)', r2(exPCB), r2(inc.avgPCB));
    cmp('NORMAL income', 'Socso (Excel pro-rates)', r2(exSoc), r2(inc.avgSocso));
    cmp('NORMAL income', 'Gross income C118', r2(exGross), r2(inc.grossIncome));
    cmp('NORMAL income', 'Net income C122', r2(exNet), r2(inc.netIncome));

    // 3b. Full PF flow with Noorul CCRIS commitments (2263) + new PF
    //     RM20,000 @ 8% flat, 60 months.
    var inst = E.flatInstalment(20000, 0.08, 60);
    cmp('PF flow', 'Flat instalment G119', r2((20000 + 20000 * 0.08 * 5) / 60), r2(inst));
    var newCommit = 2263 + inst;
    var dsr = newCommit / exNet;
    // Excel H123 TYPE B: gross<10000 -> threshold 70%, NO NDI floor.
    cmp('PF flow', 'New DSR (Excel basis net 4334.03)', r2(dsr * 100),
      r2((newCommit / inc.netIncome) * 100));
    var v = E.pfVerdict(exGross, 'TYPE B', dsr, exNet - newCommit);
    // Excel: 62.98% <= 70% -> OK (Excel has no NDI>=1500 gate in H123)
    cmp('PF flow', 'Verdict @62.98% TYPE B (Excel=OK)', 'OK', v.verdict);
  })();

  /* ============================================================
     4. INCOME FOR BIZMAN (PF DSR Cal rows 96-122)
        Excel:
          C111 = sum of TWELVE months total credit / 12
          F111 = C111 x profit margin % x shareholding %
          I111 = (avg latest 2y ITR) / 12 ; J111 = 25% ; K111 = I+J
          Basic C113 = MIN(K111, F111); if that is 0 -> MAX(F111, K111)
          EPF C119 = 0 ; PCB C120 = G111 (LHDN tax) ; Socso C121 = K87
          Net C122 = Gross - 0 - Tax - Socso
     ============================================================ */
  (function () {
    var m12 = [];
    for (var i = 0; i < 12; i++) m12.push({ bank1: 30000, bank2: 10000 });
    var d = { months: m12, profitMarginPct: 20, shareholdingPct: 50,
              avgITRAnnual: 42000, taxDeduction: 200 };
    var r = E.calcBizman(d);

    // Excel: C111 = 480000/12 = 40000 ; F111 = 40000*20%*50% = 4000
    cmp('BIZMAN income', 'Avg monthly credit C111 (12-mth avg)', 40000, r2(r.bizAvgCredit));
    cmp('BIZMAN income', 'Monthly business income F111', 4000, r2(r.monthlyBusinessIncome));
    // I111 = 3500, K111 = 4375
    cmp('BIZMAN income', 'Monthly personal income K111', 4375, r2(r.monthlyPersonalIncome));
    // Excel C113 = MIN(4375, 4000) = 4000 (takes the LOWER when both exist)
    cmp('BIZMAN income', 'Gross C113 (Excel=MIN of both)', 4000, r2(r.grossIncome));
    // Excel C122 = 4000 - 0 - 200 - 0 = 3800
    cmp('BIZMAN income', 'Net C122', 3800, r2(r.netIncome));
  })();

  /* ============================================================
     5. ELIGIBILITY GATE (Excel H113)
        Excel gates on GROSS INCOME (C118), not the amount:
          income < 3000            -> NOT ELIGIBLE
          income >= 5000           -> OK
          3000 <= income < 5000    -> amount must be <= risk-grade
                                      limit (List!BC:BD) else EXCEED LIMIT
     ============================================================ */
  (function () {
    // income 2500 requesting 20000: Excel = NOT ELIGIBLE (income band)
    cmp('Eligibility', 'Income 2500, amount 20000 (Excel=NOT ELIGIBLE)',
      'NOT ELIGIBLE', E.pfEligibilityGate(2500, 20000, null));
    // income 6000 requesting 2500: Excel = OK (income >= 5000)
    cmp('Eligibility', 'Income 6000, amount 2500 (Excel=OK)',
      'OK', E.pfEligibilityGate(6000, 2500, null));
    // income 4000 (band 3000-4999), amount above grade limit -> EXCEED LIMIT
    cmp('Eligibility', 'Income 4000, amount 20000 > grade max 15000 (Excel=EXCEED LIMIT)',
      'EXCEED LIMIT', E.pfEligibilityGate(4000, 20000, 15000));
  })();

  /* ============================================================
     6. STRESS TEST factors (List!A28:B32, floating lines only):
        PROPERTIES +5% | CLEAN +0.892857% | MOTOR V (JPJ) +1.654412%
        UNIT TRUST +2.083333%
     Excel T17:
       =IF(S17="YES",(L17*IFNA(IF(F17=List!$D$3,0,
          VLOOKUP(E17,List!$A$28:$B$32,2,0)),0))+L17,L17)
     List!D3 is the BLANK cell above the facility list (the CRDTCARD
     label is missing there; only its 0.05 rate survives at E3), so the
     zero-branch fires for a BLANK facility - not for credit cards.
     ============================================================ */
  (function () {
    // Excel T: CLEAN floating 881 -> 881 * (1 + 0.0089286) = 888.87
    cmp('Stress test', 'Floating CLEAN line 881',
      r2(881 * (1 + 0.008928571428571428)),
      r2(E.stressCommitment(881, true, 0.008928571428571428)));

    // F = List!D3 (blank) -> factor 0, i.e. an empty row takes no uplift
    cmp('Stress test', 'Blank facility -> factor 0', 0,
      E.stressFactorFor({ facility: '', collateral: 'PROPERTIES' }));

    // a floating CRDTCARD line DOES take its collateral uplift
    cmp('Stress test', 'CRDTCARD CLEAN -> 0.892857%', r2(0.008928571428571428 * 100),
      r2(E.stressFactorFor({ facility: 'CRDTCARD', collateral: 'CLEAN' }) * 100));
    cmp('Stress test', 'Floating CRDTCARD 178 -> 179.59', 179.59,
      r2(E.stressCommitment(178, true,
        E.stressFactorFor({ facility: 'CRDTCARD', collateral: 'CLEAN' }))));

    // collateral outside List!A28:B32 -> IFNA(...,0)
    cmp('Stress test', 'FIN.ASSTS not in table -> 0', 0,
      E.stressFactorFor({ facility: 'CRDTCARD', collateral: 'FIN.ASSTS' }));

    // non-floating lines are never uplifted (T = L)
    cmp('Stress test', 'Non-floating PROPERTIES line = L', 934,
      r2(E.stressCommitment(934, false, 0.05)));
  })();

  /* ============================================================
     6b. KNOWN DIFF - credit card with ZERO outstanding.
     Both masters (PF L17 / HF L15) spell out AND(F="CRDTCARD",G=0)->0
     but bury it in a branch the outer IF(F="CRDTCARD",MAX(O:P),...)
     makes unreachable, so the Excel still bills TYPE A 5% of LIMIT on a
     card with nothing drawn (O=0, P=H*5% -> MAX=H*5%). We follow the
     stated intent instead and return 0. TYPE B already agrees (P=0).
     ============================================================ */
  (function () {
    var zero = { facility: 'CRDTCARD', capacity: 'OWN', collateral: 'CLEAN',
                 outstanding: 0, limit: 6000, commitmentPerCCRIS: 0, override: '' };
    cmp('CRDTCARD O/S=0', 'TYPE B (agrees with Excel)', 0,
      r2(E.lineCommitment(zero, 'TYPE B').commitment));
    // zero O/S wins even with no limit at all, and card commitment is 5% of O/S
    cmp('CRDTCARD O/S=0', 'no limit either -> 0', 0,
      r2(E.lineCommitment({ facility: 'CRDTCARD', outstanding: 0, limit: 0,
                            override: '' }, 'TYPE B').commitment));
    cmp('CRDTCARD', '5% of O/S (8,548 -> 427.40)', 427.40,
      r2(E.lineCommitment({ facility: 'CRDTCARD', outstanding: 8548, limit: 12000,
                            override: '' }, 'TYPE B').commitment));
    cmp('CRDTCARD O/S=0', 'TYPE A (Excel computes 300 - intentional diff)', 0,
      r2(E.lineCommitment(zero, 'TYPE A').commitment));
    cmp('CRDTCARD O/S=0', 'HF TYPE A (intentional diff)', 0,
      r2(E.lineCommitment(zero, 'TYPE A', 'HF').commitment));
    // an override still wins over the zero-outstanding rule
    cmp('CRDTCARD O/S=0', 'Override still applies', 120,
      r2(E.lineCommitment({ facility: 'CRDTCARD', outstanding: 0, limit: 6000,
                            override: 120 }, 'TYPE A').commitment));
    // RM50 floor still applies once something IS drawn (Excel O: G*5%>0)
    cmp('CRDTCARD O/S=425', 'TYPE B keeps RM50 floor', 50,
      r2(E.lineCommitment({ facility: 'CRDTCARD', capacity: 'OWN', collateral: 'CLEAN',
                            outstanding: 425, limit: 6000, override: '' }, 'TYPE B').commitment));
    cmp('CRDTCARD O/S=425', 'TYPE A = MAX(50, 5% limit) = 300', 300,
      r2(E.lineCommitment({ facility: 'CRDTCARD', capacity: 'OWN', collateral: 'CLEAN',
                            outstanding: 425, limit: 6000, override: '' }, 'TYPE A').commitment));
  })();

  /* ============================================================
     7. NDI PROFIT-RATE PRICING (Excel G115/H115 + List matrices)
        Reference case = user's Excel screenshot 2026-07-09:
        gross 5,000 | amount 50,000 | tenure 96 mths | risk rating 6
        -> Flat 13.50%, EPR 21.13%, instalment 1,083.17, product OTHERS
     ============================================================ */
  (function () {
    // iScore 613 (Noorul's report) -> risk grade 6 per the legend table
    cmp('NDI pricing', 'Risk grade from iScore 613', 6, E.riskGradeFromIScore(613));
    var r = E.lookupPFRates(5000, 50000, 96, 6);
    cmp('NDI pricing', 'Product for 50,000 (Excel=OTHERS)', 'OTHERS', r.product);
    cmp('NDI pricing', 'Flat rate % (Excel=13.50)', 13.50, r2(r.flat * 100));
    cmp('NDI pricing', 'EPR % (Excel=21.13)', 21.13, r2(r.epr * 100));
    cmp('NDI pricing', 'Instalment G119 (Excel=1,083.17)', 1083.17,
      r2(E.flatInstalment(50000, r.flat, 96)));
    // Micro classification (List!CO:CP): 10,000 -> MICRO 1; 10,500 -> MICRO 2;
    // micro pricing only when gross income >= 5,000
    cmp('NDI pricing', 'Product 10,000 @income 6,000', 'MICRO 1',
      E.classifyPFProduct(10000, 6000));
    cmp('NDI pricing', 'Product 10,500 @income 6,000', 'MICRO 2',
      E.classifyPFProduct(10500, 6000));
    cmp('NDI pricing', 'Product 10,000 @income 4,000 (income<5k -> OTHERS)',
      'OTHERS', E.classifyPFProduct(10000, 4000));
    // Micro 1, risk 6, 36 months -> flat 0.07180444 (List!BY9)
    var m1 = E.lookupPFRates(6000, 10000, 36, 6);
    cmp('NDI pricing', 'Micro 1 flat rate 36 mths risk 6', 7.18, r2(m1.flat * 100));
    // Tenure not whole years -> NA like Excel exact MATCH
    var nx = E.lookupPFRates(5000, 50000, 90, 6);
    cmp('NDI pricing', 'Tenure 90 mths (not whole years) -> NA', null, nx.flat);
    // Max financing by risk grade (List!BC4:BD10) for income 3,000-4,999
    cmp('NDI pricing', 'Grade-6 max financing (Excel=30,000)', 30000,
      E.NDI_PRICING.gradeMaxByRisk[6]);
  })();

  /* ---------- report ---------- */
  var out = [], section = '';
  rows.forEach(function (r) {
    if (r.section !== section) { section = r.section; out.push('', '== ' + section + ' =='); }
    out.push((r.match ? '  MATCH ' : '  DIFF  ') + r.name +
      '  | Excel: ' + r.excel + '  | System: ' + r.system);
  });
  var diffs = rows.filter(function (r) { return !r.match; });
  out.push('', rows.length + ' comparisons, ' + diffs.length + ' DIFFER from the Excel master.');
  console.log(out.join('\n'));
  if (typeof process !== 'undefined' && process.exit) process.exit(0);
})(typeof globalThis !== 'undefined' ? globalThis : this);
