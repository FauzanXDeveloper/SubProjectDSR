/* ---------------- income engines ---------------- */

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

  function calcNormalManual(months) {
    var m = months || [];
    var get = function (k) { return m.map(function (r) { return num(r && r[k]); }); };
    var basics = get('basic'), fixed = get('fixedAllowance'), others = get('other');
    var comms = get('commission'), ots = get('ot');
    var epfs = get('epf'), pcbs = get('pcb'), socsos = get('socso');
    var otherDeductions = get('otherDeduction');

    var basicRecog = Math.max.apply(null, basics.concat([0]));
    var avgFixed = avgNonZero(fixed);
    var avgOther = Math.max.apply(null, others.concat([0]));
    var totalComm = sum(comms);
    var avgComm = totalComm / 6;
    var average60Comm = avgComm * (CFG().commissionPct / 100);
    var avgOT = avgNonZero(ots);

    var avgEPF = totalComm === 0 ? avgNonZero(epfs) : sum(epfs) / 6;
    var avgPCBRaw = totalComm === 0 ? avgNonZero(pcbs) : sum(pcbs) / 6;
    var avgSocsoRaw = totalComm === 0 ? avgNonZero(socsos) : sum(socsos) / 6;

    var avgOtherDeduction = avgNonZero(otherDeductions);

    var denom = basicRecog + avgFixed + avgComm;
    var ratio = denom > 0 ? (basicRecog + avgFixed + average60Comm) / denom : 0;
    var average60EPF = avgEPF * ratio;
    var avgPCB = avgPCBRaw * ratio;
    var avgSocso = avgSocsoRaw * ratio;

    var grossIncome = basicRecog + avgFixed + avgOther + average60Comm + avgOT;
    var netIncome = grossIncome - average60EPF - avgPCB - avgSocso - avgOtherDeduction;

    return {
      basicRecog: basicRecog, avgFixed: avgFixed, avgOther: avgOther,
      avgComm: avgComm, avgOT: avgOT,
      average60Comm: average60Comm,
      avgEPF: avgEPF, average60EPF: average60EPF,
      avgPCB: avgPCB, avgSocso: avgSocso, avgOtherDeduction: avgOtherDeduction,
      grossIncome: grossIncome, netIncome: netIncome
    };
  }

  function epfVariableRecognition() { return CFG().epfVariablePct / 100; }

  function calcEPFIncome(carumanAhli, epfRatePct, deductions) {
    var rate = (num(epfRatePct) || CFG().epfDefaultRatePct) / 100;
    var d = deductions || {};

    var monthly = (carumanAhli || []).map(num).map(function (c) {
      return rate > 0 ? c / rate : 0;
    });
    var sortedAsc = monthly.slice().sort(function (a, b) { return a - b; });
    var trimmed = sortedAsc.slice(0, Math.max(0, sortedAsc.length - 2));
    var nonZero = trimmed.filter(function (v) { return v > 0; });

    var fixedCount = Math.min(6, nonZero.length);
    var fixedIncome = fixedCount
      ? sum(nonZero.slice(0, fixedCount)) / fixedCount : 0;
    var avgAllNonZero = nonZero.length ? sum(nonZero) / nonZero.length : 0;
    var variableRaw = Math.max(0, avgAllNonZero - fixedIncome);

    var variableIncome = epfVariableRecognition() * variableRaw;
    var grossIncome = fixedIncome + variableIncome;
    var totalDeductions = num(d.epf) + num(d.pcb) + num(d.socso) + num(d.other);
    var netIncome = grossIncome - totalDeductions;

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

  function calcBizman(data) {
    var d = data || {};
    var months = d.months || [];
    var totals = months.map(function (r) { return num(r && r.bank1) + num(r && r.bank2); });
    var bizAvgCredit = sum(totals) / 12;
    var monthlyBusinessIncome = bizAvgCredit
      * (num(d.profitMarginPct) / 100) * (num(d.shareholdingPct) / 100);

    var personalTaxReturn = num(d.avgITRAnnual) / 12;
    var variationAcceptable = personalTaxReturn * (CFG().bizmanVariationPct / 100);
    var monthlyPersonalIncome = personalTaxReturn + variationAcceptable;
    var variance = monthlyBusinessIncome > 0
      ? monthlyPersonalIncome / monthlyBusinessIncome : 0;

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

  function calcBizmanHF(data) {
    var d = data || {};
    var months = d.months || [];
    var totals = months.map(function (r) { return num(r && r.bank1) + num(r && r.bank2); });
    var bizAvgCredit = sum(totals.slice(0, 6)) / 6;
    var monthlyBusinessIncome = bizAvgCredit
      * (num(d.profitMarginPct) / 100) * (num(d.shareholdingPct) / 100);
    var personalTaxReturn = num(d.avgITRAnnual) / 12;
    var variationAcceptable = monthlyBusinessIncome > personalTaxReturn
      ? personalTaxReturn * (CFG().bizmanVariationPct / 100) : 0;
    var monthlyPersonalIncome = personalTaxReturn + variationAcceptable;
    var variance = monthlyBusinessIncome > 0
      ? monthlyPersonalIncome / monthlyBusinessIncome : 0;
    return {
      totalsPerMonth: totals, bizAvgCredit: bizAvgCredit,
      monthlyBusinessIncome: monthlyBusinessIncome,
      personalTaxReturn: personalTaxReturn,
      variationAcceptable: variationAcceptable,
      monthlyPersonalIncome: monthlyPersonalIncome,
      variance: variance,
      taxDeduction: num(d.taxDeduction)
    };
  }

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

  function calcHFCombinedIncome(applicants, customerType) {
    var list = applicants || [];
    var combinedMonths = sumIncomeMonths(list.map(function (a) { return a.months; }));
    var ind = calcNormalManual(combinedMonths);
    var bizPer = list.map(function (a) { return calcBizmanHF(a.bizman); });
    var k111 = bizPer.reduce(function (a, b) { return a + b.monthlyPersonalIncome; }, 0);
    var g111 = bizPer.reduce(function (a, b) { return a + b.taxDeduction; }, 0);
    var isBiz = customerType === 'BIZMAN';

    var basic = ind.basicRecog + k111;
    var gross = basic + ind.avgFixed + ind.avgOther
      + ind.average60Comm + ind.avgOT;
    var epf = isBiz ? 0 : ind.average60EPF;
    var pcb = isBiz ? g111 : ind.avgPCB;
    var socso = ind.avgSocso;
    var net = gross - epf - pcb - socso;

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
