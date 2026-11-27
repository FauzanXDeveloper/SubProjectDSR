/* ---------------- credit limit ---------------- */

(function () {
  'use strict';
  window.Engine = window.Engine || {};

  function CFG() { return window.Engine.CONFIG.cc; }

  function cardMin(product) {
    return (product === 'VISA_SIGNATURE' || product === 'BOTH')
      ? CFG().minSignature : CFG().minPlatinum;
  }

  function multiplierFromIScore(iScore) {
    var s = parseFloat(iScore);
    var m = CFG().multipliers;
    if (!isFinite(s) || s < CFG().minScore) return null;
    if (s <= 619) return m.RG5;
    if (s <= 634) return m.RG6;
    if (s <= 649) return m.RG7;
    if (s <= 664) return m.RG8;
    if (s <= 679) return m.RG9;
    return m.RG10;
  }

  function cardRiskGrade(iScore) {
    var s = parseFloat(iScore);
    if (!isFinite(s) || s < 51) return null;
    if (s < 605) return 'RG1-RG4';
    if (s <= 619) return 'RG5';
    if (s <= 634) return 'RG6';
    if (s <= 649) return 'RG7';
    if (s <= 664) return 'RG8';
    if (s <= 679) return 'RG9';
    return 'RG10';
  }

  function ccDsrThreshold(grossIncome) {
    var c = CFG();
    if (grossIncome < c.dsrMidMin) return c.dsrLow;
    if (grossIncome <= c.dsrHighMin) return c.dsrMid;
    return c.dsrHigh;
  }

  function calculateMaxCreditLimit(grossIncome, iScore, product) {
    var multiplier = multiplierFromIScore(iScore);
    var roundedGross = Math.floor((grossIncome || 0) / 100) * 100;
    var rawMaxLimit = multiplier
      ? Math.floor(roundedGross * multiplier / 1000) * 1000 : 0;

    var sc = CFG().salaryCap;
    var capped = rawMaxLimit;
    if ((product === 'VISA_PLATINUM' || product === 'BOTH')
        && grossIncome >= sc.minIncome && grossIncome <= sc.maxIncome) {
      capped = Math.min(rawMaxLimit, grossIncome * sc.multiplier);
    }

    var maxCreditLimit = Math.min(capped, CFG().cardMax);
    var min = cardMin(product);
    var isEligibleByLimit = multiplier !== null && maxCreditLimit >= min;
    var monthlyInstallment = Math.ceil(maxCreditLimit * (CFG().instalmentPct / 100));

    return {
      multiplier: multiplier,
      rawMaxLimit: rawMaxLimit,
      maxCreditLimit: maxCreditLimit,
      isEligibleByLimit: isEligibleByLimit,
      monthlyInstallment: monthlyInstallment,
      cardMin: min,
      cardMax: CFG().cardMax
    };
  }

  function evaluateProposedLimit(proposedLimit, product) {
    var limit = parseFloat(String(proposedLimit == null ? '' : proposedLimit).replace(/[,\s%]/g, '')) || 0;
    var min = cardMin(product);
    return {
      maxCreditLimit: limit,
      monthlyInstallment: Math.ceil(limit * (CFG().instalmentPct / 100)),
      isEligibleByLimit: limit >= min && limit <= CFG().cardMax,
      cardMin: min,
      cardMax: CFG().cardMax
    };
  }
  Engine.cardMin = cardMin;
  Engine.multiplierFromIScore = multiplierFromIScore;
  Engine.cardRiskGrade = cardRiskGrade;
  Engine.ccDsrThreshold = ccDsrThreshold;
  Engine.calculateMaxCreditLimit = calculateMaxCreditLimit;
  Engine.evaluateProposedLimit = evaluateProposedLimit;
})();
