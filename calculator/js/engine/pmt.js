/* ---------------- amortisation ---------------- */

(function () {
  'use strict';
  window.Engine = window.Engine || {};

  function PMT(rate, nper, pv) {
    if (!nper) return 0;
    if (rate === 0) return -pv / nper;
    var f = Math.pow(1 + rate, nper);
    return -pv * rate * f / (f - 1);
  }

  function monthlyInstalment(annualRate, years, amount) {
    if (!amount || !years) return 0;
    return Math.round(PMT(annualRate / 12, years * 12, -amount));
  }

  function sellingPrice(annualRate, years, amount) {
    if (!amount || !years) return 0;
    return Math.round(PMT(annualRate / 12, years * 12, -amount) * years * 12);
  }

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
