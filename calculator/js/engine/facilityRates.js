/* ---------------- facility rates ---------------- */

(function () {
  'use strict';
  window.Engine = window.Engine || {};

  function CFG() { return window.Engine.CONFIG.ccris; }

  var OD_FACILITIES = { OVRDRAFT: 1, TEMPOVDT: 1 };

  function facilityFactor(code) {
    var c = String(code || '').toUpperCase().trim();
    if (c === 'CRDTCARD') return CFG().cardRatePct / 100;
    if (Object.prototype.hasOwnProperty.call(OD_FACILITIES, c)) return CFG().odRatePct / 100;
    var map = CFG().facilityFactors || {};
    if (Object.prototype.hasOwnProperty.call(map, c)) return map[c];
    return 1;
  }

  var UNSECURED_FACILITIES = {
    CRDTCARD: 1, OTLNFNCE: 1, OVRDRAFT: 1, PELNFNCE: 1,
    RVVGCRDT: 1, STLNFNCE: 1, NHEDFNCE: 1, PELNFNSA: 1
  };
  function isUnsecuredLine(row) {
    var f = String(row.facility || '').toUpperCase().trim();
    var col = String(row.collateral || '').toUpperCase().trim();
    return col === 'CLEAN' &&
      Object.prototype.hasOwnProperty.call(UNSECURED_FACILITIES, f);
  }

  function isBtEligibleLine(row) {
    var f = String(row.facility || '').toUpperCase().trim();
    return Object.prototype.hasOwnProperty.call(UNSECURED_FACILITIES, f);
  }

  function stressFactorFor(row) {
    if (!String(row.facility || '').trim()) return 0;
    var col = String(row.collateral || '').toUpperCase().replace(/\s+/g, ' ').trim();
    var map = CFG().stressFactors || {};
    return Object.prototype.hasOwnProperty.call(map, col) ? map[col] / 100 : 0;
  }

  Engine.FACILITY_LIST = [
    'CRDTCARD', 'HLFNNNPS', 'HLFNPRSR', 'HRPCNSCG', 'HRPCSCGD', 'HSLNFNCE',
    'ISPJTFNG', 'ISPWNBKG', 'MICROFNCE', 'OHRPCREC', 'OTLNFNCE', 'OVRDRAFT',
    'PCPASCAR', 'PELNFNCE', 'RVVGCRDT', 'SHMARGIN', 'SOFTLN', 'STLNFNCE',
    'TEMPOVDT', 'NHEDFNCE', 'PELNFNSA', 'OTHER'
  ];

  Engine.OD_FACILITIES = OD_FACILITIES;
  Engine.facilityFactor = facilityFactor;
  Engine.isUnsecuredLine = isUnsecuredLine;
  Engine.isBtEligibleLine = isBtEligibleLine;
  Engine.stressFactorFor = stressFactorFor;
})();
