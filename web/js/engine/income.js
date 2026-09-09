/* ============================================================
   income.js - shared income engine (NORMAL manual / EPF / BIZMAN)
   Source: credit_card.txt section 4 (canonical per master build
   command section 5); mirrors HF spec 03 section 5 pro-rating.
   ============================================================ */
(function () {
  'use strict';
  window.Engine = window.Engine || {};

  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[,\s%]/g, '')); return isFinite(n) ? n : 0; }
  function CFG() { return window.Engine.CONFIG.income; }
  function sum(arr) { return arr.reduce(function (a, b) { return a + num(b); }, 0); }
  function avgNonZero(arr) {
    var nz = arr.map(num).filter(function (v) { return v > 0; });
    return nz.length ? sum(nz) / nz.length : 0;
  }

  /**
   * NORMAL customer, manual payslip mode (6 months x 8 components).
   * months: array of { basic, fixedAllowance, other, commission, ot,
   *                    epf, pcb, socso }
   * Excel master "PF DSR Cal" rows 86-87 / 113-122:
   *   Basic  C87 = MAX of 6 months
   *   Fixed  D87 = AVERAGEIF(>0)
   *   Other  F87 = MAX of 6 months
   *   Comm   G87 = (sum/6) * 60%
   *   OT     H87 = AVERAGEIF(>0) at 100%
   *   EPF/PCB/Socso: commission present -> sum/6, else AVERAGEIF(>0);
   *   all three then pro-rated by (C86+D86+G87)/(C86+D86+G86).
   */
  function calcNormalManual(months) {
    var m = months || [];
    var get = function (k) { return m.map(function (r) { return num(r && r[k]); }); };
    var basics = get('basic'), fixed = get('fixedAllowance'), others = get('other');
    var comms = get('commission'), ots = get('ot');
    var epfs = get('epf'), pcbs = get('pcb'), socsos = get('socso');

    var basicRecog = Math.max.apply(null, basics.concat([0]));   // C87 = MAX
    var avgFixed = avgNonZero(fixed);                            // D87
    var avgOther = Math.max.apply(null, others.concat([0]));     // F87 = MAX
    var totalComm = sum(comms);                                  // G85
    var avgComm = totalComm / 6;                                 // G86
    var average60Comm = avgComm * (CFG().commissionPct / 100);   // G87
    var avgOT = avgNonZero(ots);                                 // H87 (100%)

    // I86/J86/K86: /6 when commission exists, else average of non-zero
    var avgEPF = totalComm === 0 ? avgNonZero(epfs) : sum(epfs) / 6;
    var avgPCBRaw = totalComm === 0 ? avgNonZero(pcbs) : sum(pcbs) / 6;
    var avgSocsoRaw = totalComm === 0 ? avgNonZero(socsos) : sum(socsos) / 6;

    // I87/J87/K87: pro-rated to the 60%-commission haircut (IFERROR -> 0)
    var denom = basicRecog + avgFixed + avgComm;
    var ratio = denom > 0 ? (basicRecog + avgFixed + average60Comm) / denom : 0;
    var average60EPF = avgEPF * ratio;
    var avgPCB = avgPCBRaw * ratio;
    var avgSocso = avgSocsoRaw * ratio;

    var grossIncome = basicRecog + avgFixed + avgOther + average60Comm + avgOT; // C118
    var netIncome = grossIncome - average60EPF - avgPCB - avgSocso;             // C122

    return {
      basicRecog: basicRecog, avgFixed: avgFixed, avgOther: avgOther,
      avgComm: avgComm, avgOT: avgOT,
      average60Comm: average60Comm,
      avgEPF: avgEPF, average60EPF: average60EPF,
      avgPCB: avgPCB, avgSocso: avgSocso,
      grossIncome: grossIncome, netIncome: netIncome
    };
  }

  // Fraction of the variable EPF component recognised as income (official
  // "EPF Income Calculation" workbook E6 = 0.6). A policy constant - never a
  // user input, never shown in the UI - but tunable via admin/settings.html.
  function epfVariableRecognition() { return CFG().epfVariablePct / 100; }

  /**
   * NORMAL customer, EPF/KWSP statement mode.
   * carumanAhli: up to 12 monthly employee-contribution amounts.
   * Mirrors the "EPF Income Calculation" workbook exactly:
   *   1. monthly income = employee contribution / rate
   *   2. sort ascending, drop the TOP 2 data points
   *   3. fixed component  = average of the lowest 6 non-zero months (E18)
   *   4. variable component = avg of all non-zero months - fixed (E20)
   *   5. gross = fixed + 60% x variable   (E21, haircut hardcoded)
   */
  function calcEPFIncome(carumanAhli, epfRatePct, deductions) {
    var rate = (num(epfRatePct) || CFG().epfDefaultRatePct) / 100;
    var d = deductions || {};

    var monthly = (carumanAhli || []).map(num).map(function (c) {
      return rate > 0 ? c / rate : 0;
    });
    var sortedAsc = monthly.slice().sort(function (a, b) { return a - b; });
    var trimmed = sortedAsc.slice(0, Math.max(0, sortedAsc.length - 2)); // drop TOP 2
    var nonZero = trimmed.filter(function (v) { return v > 0; });

    var fixedCount = Math.min(6, nonZero.length);
    var fixedIncome = fixedCount
      ? sum(nonZero.slice(0, fixedCount)) / fixedCount : 0;   // lowest N (E18)
    var avgAllNonZero = nonZero.length ? sum(nonZero) / nonZero.length : 0;
    var variableRaw = Math.max(0, avgAllNonZero - fixedIncome);           // E20
    // `variableIncome` is the RECOGNISED variable (already 60%), so the UI
    // tiles reconcile (fixed + variable = gross) without ever exposing the
    // haircut factor. E21: gross = fixed + 60% x raw variable.
    var variableIncome = epfVariableRecognition() * variableRaw;
    var grossIncome = fixedIncome + variableIncome;
    var totalDeductions = num(d.epf) + num(d.pcb) + num(d.socso) + num(d.other);
    var netIncome = grossIncome - totalDeductions;

    // Income classification (EPF.png step): the earner is treated as a fixed
    // earner when the variable component is small relative to the fixed one -
    // variableRaw / fixed <= 25% -> "Fixed Income", else "Variable Income".
    var typeRatio = fixedIncome > 0 ? variableRaw / fixedIncome : 0;
    var incomeType = typeRatio <= CFG().incomeTypeRatioPct / 100
      ? 'Fixed Income' : 'Variable Income';

    return {
      monthlyIncomes: monthly,
      fixedIncome: fixedIncome, variableIncome: variableIncome,
      variableRaw: variableRaw, incomeType: incomeType, typeRatio: typeRatio,
      avgAllNonZero: avgAllNonZero,
      grossIncome: grossIncome, netIncome: netIncome,
      totalDeductions: totalDeductions
    };
  }

  /**
   * BIZMAN income - Excel master "PF DSR Cal" rows 96-122:
   *   C111 = sum of TWELVE months total credit / 12 (always /12)
   *   F111 = C111 x profit margin % x shareholding %
   *   I111 = avg latest 2y ITR / 12 ; J111 = 25% ; K111 = I111+J111
   *   Gross C113 = MIN(K111, F111); if that MIN is 0 -> MAX(F111, K111)
   *   Net   C122 = Gross - EPF(0) - Tax Deduction (G111) - Socso (K87)
   * data: { months: [{bank1,bank2} x12], profitMarginPct,
   *         shareholdingPct, avgITRAnnual, taxDeduction, socso }
   */
  function calcBizman(data) {
    var d = data || {};
    var months = d.months || [];
    var totals = months.map(function (r) { return num(r && r.bank1) + num(r && r.bank2); });
    var bizAvgCredit = sum(totals) / 12;                          // C111
    var monthlyBusinessIncome = bizAvgCredit
      * (num(d.profitMarginPct) / 100) * (num(d.shareholdingPct) / 100);

    var personalTaxReturn = num(d.avgITRAnnual) / 12;
    var variationAcceptable = personalTaxReturn * (CFG().bizmanVariationPct / 100);
    var monthlyPersonalIncome = personalTaxReturn + variationAcceptable;
    var variance = monthlyBusinessIncome > 0
      ? monthlyPersonalIncome / monthlyBusinessIncome : 0;

    // C113: take the LOWER of the two when both exist
    var lower = Math.min(monthlyPersonalIncome, monthlyBusinessIncome);
    var grossIncome = lower === 0
      ? Math.max(monthlyPersonalIncome, monthlyBusinessIncome) : lower;
    var netIncome = grossIncome - num(d.taxDeduction) - num(d.socso);

    return {
      totalsPerMonth: totals, bizAvgCredit: bizAvgCredit,
      monthlyBusinessIncome: monthlyBusinessIncome,
      personalTaxReturn: personalTaxReturn,
      variationAcceptable: variationAcceptable,
      monthlyPersonalIncome: monthlyPersonalIncome,
      variance: variance,
      grossIncome: grossIncome, netIncome: netIncome
    };
  }

  /**
   * BIZMAN income - HF master "HF (â€¦)" sheet row 111 (differs from PF):
   *   C111 = avg of SIX months total credit (C97..C102)/6
   *   F111 = C111 x profit margin % x shareholding %
   *   I111 = H111/12 ; J111 = IF(F111>I111, I111*25%, 0) ; K111 = I111+J111
   *   G111 = Tax Deduction (LHDN) input, used as the PCB line on Summary
   */
  function calcBizmanHF(data) {
    var d = data || {};
    var months = d.months || [];
    var totals = months.map(function (r) { return num(r && r.bank1) + num(r && r.bank2); });
    var bizAvgCredit = sum(totals.slice(0, 6)) / 6;               // C111 (HF: /6)
    var monthlyBusinessIncome = bizAvgCredit
      * (num(d.profitMarginPct) / 100) * (num(d.shareholdingPct) / 100);
    var personalTaxReturn = num(d.avgITRAnnual) / 12;             // I111
    var variationAcceptable = monthlyBusinessIncome > personalTaxReturn
      ? personalTaxReturn * (CFG().bizmanVariationPct / 100) : 0; // J111
    var monthlyPersonalIncome = personalTaxReturn + variationAcceptable; // K111
    var variance = monthlyBusinessIncome > 0
      ? monthlyPersonalIncome / monthlyBusinessIncome : 0;        // L111
    return {
      totalsPerMonth: totals, bizAvgCredit: bizAvgCredit,
      monthlyBusinessIncome: monthlyBusinessIncome,
      personalTaxReturn: personalTaxReturn,
      variationAcceptable: variationAcceptable,
      monthlyPersonalIncome: monthlyPersonalIncome,
      variance: variance,
      taxDeduction: num(d.taxDeduction)                           // G111
    };
  }

  /** Excel Summary rows 78-83: each income month cell is the SUM across
      the single + joint applicant sheets; the MAX/AVERAGEIF/60% rules
      then run on the summed months. */
  function sumIncomeMonths(monthsList) {
    var keys = ['basic', 'fixedAllowance', 'other', 'commission', 'ot',
                'epf', 'pcb', 'socso'];
    var out = [];
    for (var i = 0; i < 6; i++) {
      var row = {};
      keys.forEach(function (k) {
        row[k] = (monthsList || []).reduce(function (a, months) {
          return a + num(months && months[i] && months[i][k]);
        }, 0);
      });
      out.push(row);
    }
    return out;
  }

  /**
   * HF combined income (Excel Summary rows 139-148):
   *   Basic  C139 = C87 + K111   (K111 = SUM of applicants' K111)
   *   Gross  C144 = C139 + D87 + F87 + G87 + H87
   *   EPF    C145 = BIZMAN ? 0 : I87
   *   PCB    C146 = BIZMAN ? G111 (SUM of tax deductions) : J87
   *   Socso  C147 = K87
   *   Net    C148 = C144 - C145 - C146 - C147
   * applicants: [{ months: [6 x incomeMonth], bizman: {...} }]
   */
  function calcHFCombinedIncome(applicants, customerType) {
    var list = applicants || [];
    var combinedMonths = sumIncomeMonths(list.map(function (a) { return a.months; }));
    var ind = calcNormalManual(combinedMonths);
    var bizPer = list.map(function (a) { return calcBizmanHF(a.bizman); });
    var k111 = bizPer.reduce(function (a, b) { return a + b.monthlyPersonalIncome; }, 0);
    var g111 = bizPer.reduce(function (a, b) { return a + b.taxDeduction; }, 0);
    var isBiz = customerType === 'BIZMAN';

    var basic = ind.basicRecog + k111;                                   // C139
    var gross = basic + ind.avgFixed + ind.avgOther
      + ind.average60Comm + ind.avgOT;                                   // C144
    var epf = isBiz ? 0 : ind.average60EPF;                              // C145
    var pcb = isBiz ? g111 : ind.avgPCB;                                 // C146
    var socso = ind.avgSocso;                                            // C147
    var net = gross - epf - pcb - socso;                                 // C148

    return {
      individual: ind, bizPerApplicant: bizPer,
      k111: k111, g111: g111,
      basic: basic,
      fixedAllowance: ind.avgFixed, otherIncome: ind.avgOther,
      commission: ind.average60Comm, ot: ind.avgOT,
      epf: epf, pcb: pcb, socso: socso,
      grossIncome: gross, netIncome: net
    };
  }

  /**
   * Unified HF combined income - each applicant may be NORMAL (payslip months
   * OR an EPF statement) or BIZMAN, mixed freely within one joint application.
   * Each applicant object carries its OWN resolved contribution:
   *   months    - payslip months (empty unless NORMAL + manual)
   *   epfIncome - calcEPFIncome result (present only for NORMAL + EPF)
   *   bizman    - business block (zeroed unless BIZMAN)
   * so the three streams simply sum. This generalises calcHFCombinedIncome
   * (all-normal or all-bizman) and combineHFIncome (EPF) - each of those is a
   * special case, so every parity figure is unchanged.
   *   basic C139 = payslip basic + EPF fixed + bizman personal (K111)
   *   PCB   C146 = payslip PCB + bizman tax (G111)
   *   EPF   C145 = payslip EPF + EPF-statement deductions
   */
  function calcHFIncomeMixed(applicants) {
    var list = applicants || [];
    var jind = calcNormalManual(sumIncomeMonths(list.map(function (a) { return a.months; })));

    var eFixed = 0, eVar = 0, eGross = 0, eDed = 0;
    list.forEach(function (a) {
      if (!a.epfIncome) return;
      eFixed += a.epfIncome.fixedIncome; eVar += a.epfIncome.variableIncome;
      eGross += a.epfIncome.grossIncome; eDed += a.epfIncome.totalDeductions;
    });
    var bizPer = list.map(function (a) { return calcBizmanHF(a.bizman); });
    var k111 = bizPer.reduce(function (s, b) { return s + b.monthlyPersonalIncome; }, 0);
    var g111 = bizPer.reduce(function (s, b) { return s + b.taxDeduction; }, 0);

    var basic = jind.basicRecog + eFixed + k111;
    var otherIncome = jind.avgOther + eVar;
    var gross = jind.grossIncome + eGross + k111;
    var epf = jind.average60EPF + eDed;
    var pcb = jind.avgPCB + g111;
    var socso = jind.avgSocso;
    var net = gross - epf - pcb - socso;
    return {
      individual: jind, bizPerApplicant: bizPer, k111: k111, g111: g111,
      basic: basic, fixedAllowance: jind.avgFixed, otherIncome: otherIncome,
      commission: jind.average60Comm, ot: jind.avgOT,
      epf: epf, pcb: pcb, socso: socso,
      grossIncome: gross, netIncome: net
    };
  }

  Engine.avgNonZero = avgNonZero;
  Engine.calcNormalManual = calcNormalManual;
  Engine.calcEPFIncome = calcEPFIncome;
  Engine.calcBizman = calcBizman;
  Engine.calcBizmanHF = calcBizmanHF;
  Engine.sumIncomeMonths = sumIncomeMonths;
  Engine.calcHFCombinedIncome = calcHFCombinedIncome;
  Engine.calcHFIncomeMixed = calcHFIncomeMixed;
})();
