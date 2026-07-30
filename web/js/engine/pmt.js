/* ============================================================
   pmt.js - shared amortisation math (HF pricing + HF DSR)
   Source: 02_Financing_Calculator_V10.txt section 10,
           03_Home_Financing_Manual_DSR.txt section 6
   ============================================================ */
(function () {
  'use strict';
  window.Engine = window.Engine || {};

  /** Excel-compatible PMT. Returns payment per period (negative for +pv). */
  function PMT(rate, nper, pv) {
    if (!nper) return 0;
    if (rate === 0) return -pv / nper;
    var f = Math.pow(1 + rate, nper);
    return -pv * rate * f / (f - 1);
  }

  /** Monthly amortising instalment = ROUND(PMT(annual/12, years*12, -amount), 0) */
  function monthlyInstalment(annualRate, years, amount) {
    if (!amount || !years) return 0;
    return Math.round(PMT(annualRate / 12, years * 12, -amount));
  }

  /** Islamic selling price = ROUND(PMT(...) * years*12, 0)  (total payable) */
  function sellingPrice(annualRate, years, amount) {
    if (!amount || !years) return 0;
    return Math.round(PMT(annualRate / 12, years * 12, -amount) * years * 12);
  }

  /** Personal Financing flat-rate instalment:
      (principal + principal*rate*years) / months
      Source: 04_PF_CCRIS_DSR_Evaluation_Report.txt section 5 */
  function flatInstalment(principal, annualRate, tenureMonths) {
    if (!principal || !tenureMonths) return 0;
    var years = tenureMonths / 12;
    return (principal + (principal * annualRate * years)) / tenureMonths;
  }

  Engine.PMT = PMT;
  Engine.monthlyInstalment = monthlyInstalment;
  Engine.sellingPrice = sellingPrice;
  Engine.flatInstalment = flatInstalment;
})();
