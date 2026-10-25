/* ============================================================
   creditLimit.js - Credit Card limit & eligibility (CC-only)
   Source: credit_card.txt section 5 (creditLimit.ts port)
   ============================================================ */
(function () {
  'use strict';
  window.Engine = window.Engine || {};

  function CFG() { return window.Engine.CONFIG.cc; }

  // BOTH = apply for Platinum AND Signature on ONE shared limit. The limit,
  // instalment and DSR are computed once (never two). To qualify for both the
  // applicant must clear the higher bar, so BOTH takes Signature's RM4,000
  // floor and still respects the Platinum salary cap - the conservative mix.
  function cardMin(product) {
    return (product === 'VISA_SIGNATURE' || product === 'BOTH')
      ? CFG().minSignature : CFG().minPlatinum;
  }

  /** Multiplier from Experian iScore risk-grade bands. null = not eligible.
      Band CUTOFFS stay fixed (they define the card risk grades); the
      multiplier per grade is configurable. */
  function multiplierFromIScore(iScore) {
    var s = parseFloat(iScore);
    var m = CFG().multipliers;
    if (!isFinite(s) || s < CFG().minScore) return null; // below the card cut-off
    if (s <= 619) return m.RG5;
    if (s <= 634) return m.RG6;
    if (s <= 649) return m.RG7;
    if (s <= 664) return m.RG8;
    if (s <= 679) return m.RG9;
    return m.RG10;            // 680+
  }

  /** Credit-card Risk Grade label from the Experian iScore. NOTE: this is
      the CARD scorecard grade (RG5-RG10 eligible), which is NOT the same
      banding as the PF/iScore risk grade in ndiPricing.js. Returns null
      when the score is missing/invalid. */
  function cardRiskGrade(iScore) {
    var s = parseFloat(iScore);
    if (!isFinite(s) || s < 51) return null;
    if (s < 605) return 'RG1-RG4';   // 51-604: below the card cut-off
    if (s <= 619) return 'RG5';
    if (s <= 634) return 'RG6';
    if (s <= 649) return 'RG7';
    if (s <= 664) return 'RG8';
    if (s <= 679) return 'RG9';
    return 'RG10';                    // 680+
  }

  /** CC DSR threshold (%) by gross income band. */
  function ccDsrThreshold(grossIncome) {
    var c = CFG();
    if (grossIncome < c.dsrMidMin) return c.dsrLow;
    if (grossIncome <= c.dsrHighMin) return c.dsrMid;
    return c.dsrHigh;
  }

  /**
   * Full limit computation.
   * Returns { multiplier, rawMaxLimit, maxCreditLimit, isEligibleByLimit,
   *           monthlyInstallment, cardMin, cardMax }
   */
  function calculateMaxCreditLimit(grossIncome, iScore, product) {
    var multiplier = multiplierFromIScore(iScore);
    var roundedGross = Math.floor((grossIncome || 0) / 100) * 100;
    var rawMaxLimit = multiplier
      ? Math.floor(roundedGross * multiplier / 1000) * 1000 : 0;

    // Salary cap: Visa Platinum (and BOTH, which includes Platinum),
    // gross RM2,000-RM3,000
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

  /** Instalment/eligibility for an officer-proposed limit. */
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
